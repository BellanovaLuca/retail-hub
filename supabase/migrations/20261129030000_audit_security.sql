-- Correzioni dell'audit del 28/11/2026 (sicurezza del database).

-- ---------------------------------------------------------------------------
-- 1. Il primo accesso vale anche per il database
-- ---------------------------------------------------------------------------
-- Finora «PIN provvisorio da cambiare» e «informativa da accettare» li controllava solo l'app:
-- con il token appena ottenuto si poteva interrogare direttamente l'API. Ora chi non ha
-- completato il primo accesso legge solo il proprio profilo (serve alla pagina del primo
-- accesso); tutto il resto richiede is_staff(), che comprende il primo accesso. Vale anche per
-- chi è appena stato promosso admin (deve prima scegliere il PIN da admin).

create or replace function public.is_active_account()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.role() = 'service_role'
      or (
        public.session_fresh()
        and exists (select 1 from public.profiles p where p.id = auth.uid() and p.active)
      );
$$;
revoke execute on function public.is_active_account() from public, anon;
grant execute on function public.is_active_account() to authenticated, service_role;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.role() = 'service_role'
      or (
        public.session_fresh()
        and exists (
          select 1 from public.profiles p
           where p.id = auth.uid()
             and p.active
             and not p.must_change_pin
             and p.privacy_accepted_at is not null
        )
      );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.session_fresh()
     and exists (
       select 1
       from public.profiles p
       where p.id = auth.uid()
         and p.role = 'admin'
         and p.active
         and not p.must_change_pin
         and p.privacy_accepted_at is not null
     );
$$;

alter policy "solo profili attivi" on public.profiles
  using ((select public.is_active_account()))
  with check ((select public.is_active_account()));

-- ---------------------------------------------------------------------------
-- 2. Funzioni dei dipendenti: serve un profilo attivo
-- ---------------------------------------------------------------------------
-- Sono security definer (non passano dalla RLS): un account disattivato con il token ancora
-- valido poteva ancora annullare richieste, rispondere agli scambi, chiudere attività.

create or replace function public.cancel_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'Account non attivo' using errcode = '42501';
  end if;
  update public.requests
     set status = 'cancelled'
   where id = p_request_id
     and profile_id = auth.uid()
     and status in ('pending', 'peer_accepted', 'peer_declined');
  if not found then
    raise exception 'Richiesta non annullabile' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.respond_to_swap(p_request_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'Account non attivo' using errcode = '42501';
  end if;
  update public.requests
     set status = case when p_accept then 'peer_accepted' else 'peer_declined' end
   where id = p_request_id
     and type = 'scambio_turno'
     and target_profile_id = auth.uid()
     and status = 'pending';
  if not found then
    raise exception 'Scambio non disponibile' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.set_performance_note(p_goal_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'Account non attivo' using errcode = '42501';
  end if;
  update public.performance_goals
     set employee_note = nullif(trim(left(p_note, 4000)), '')
   where id = p_goal_id and profile_id = auth.uid() and published;
  if not found then
    raise exception 'Obiettivo non disponibile' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.set_extra_task_done(p_task_id uuid, p_done boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'Account non attivo' using errcode = '42501';
  end if;
  if not public.is_admin() and not exists (
    select 1 from public.extra_task_assignees a where a.task_id = p_task_id and a.profile_id = auth.uid()
  ) then
    raise exception 'Non sei assegnatario di questa attività' using errcode = '42501';
  end if;
  update public.extra_tasks
     set status = case when p_done then 'done' else 'open' end,
         done_by = case when p_done then auth.uid() end,
         done_at = case when p_done then now() end
   where id = p_task_id and status <> 'cancelled';
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Responsabilità: chi è assegnato lo può chiedere solo lo staff, per sé (o un admin)
-- ---------------------------------------------------------------------------

create or replace function public.is_responsibility_assignee_on(
  p_responsibility_id uuid,
  uid uuid,
  p_date date
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_staff()
     and (uid = auth.uid() or public.is_admin() or auth.role() = 'service_role')
     and exists (
    select 1 from public.responsibilities r
    where r.id = p_responsibility_id
      and (
        r.all_staff
        or coalesce(
          (
            select case
                     when w.person_days ? uid::text
                       then (w.person_days -> uid::text) @> to_jsonb(extract(isodow from p_date)::int)
                     else uid = any (w.profile_ids)
                          and extract(isodow from p_date)::smallint = any (r.schedule_days)
                   end
              from public.responsibility_week_assignments w
             where w.responsibility_id = r.id and w.week_start <= p_date
             order by w.week_start desc
             limit 1
          ),
          exists (
            select 1 from public.responsibility_assignees ra
            where ra.responsibility_id = r.id and ra.profile_id = uid
          )
        )
      )
  );
$$;

-- Funzioni rimaste dalle versioni precedenti, non più usate da policy né dall'app.
drop function if exists public.responsibility_week_team(uuid, date);
drop function if exists public.is_responsibility_assignee(uuid, uuid);

-- I giorni per persona devono essere coerenti: solo persone dell'assegnazione, solo giorni 1–7.
create or replace function public.person_days_valid(p_profile_ids uuid[], p_person_days jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_person_days) = 'object'
     and not exists (
       select 1
         from jsonb_each(p_person_days) e
        where not (e.key = any (select x::text from unnest(p_profile_ids) x))
           or jsonb_typeof(e.value) <> 'array'
           or exists (
                select 1 from jsonb_array_elements(e.value) d
                 where jsonb_typeof(d) <> 'number' or d::text not in ('1', '2', '3', '4', '5', '6', '7')
              )
     );
$$;
revoke execute on function public.person_days_valid(uuid[], jsonb) from public, anon;
grant execute on function public.person_days_valid(uuid[], jsonb) to authenticated, service_role;

alter table public.responsibility_week_assignments
  add constraint responsibility_week_assignments_person_days_valid
    check (public.person_days_valid(profile_ids, person_days));

-- ---------------------------------------------------------------------------
-- 4. Letture e notifiche: si cambia solo ciò che serve
-- ---------------------------------------------------------------------------

-- La presa visione non si sposta su un'altra comunicazione né si retrodata.
create or replace function public.announcement_reads_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.read_at := now();
    if new.acknowledged_at is not null then
      new.acknowledged_at := now();
    end if;
    return new;
  end if;
  if new.announcement_id <> old.announcement_id or new.profile_id <> old.profile_id then
    raise exception 'La lettura non si può spostare' using errcode = '42501';
  end if;
  new.read_at := old.read_at;
  if old.acknowledged_at is not null then
    new.acknowledged_at := old.acknowledged_at;
  elsif new.acknowledged_at is not null then
    new.acknowledged_at := now();
  end if;
  return new;
end;
$$;
revoke execute on function public.announcement_reads_guard() from public, anon, authenticated;

create trigger announcement_reads_guard
  before insert or update on public.announcement_reads
  for each row execute function public.announcement_reads_guard();

-- Delle proprie notifiche si cambia solo «letta».
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Privilegi sulle tabelle
-- ---------------------------------------------------------------------------
-- TRUNCATE non passa dalla RLS; chi non ha fatto l'accesso non ha motivo di avere privilegi.

revoke truncate, references, trigger on all tables in schema public from authenticated;
revoke all on all tables in schema public from anon, public;
alter default privileges in schema public revoke all on tables from anon, public;
alter default privileges in schema public revoke truncate, references, trigger on tables from authenticated;

-- ---------------------------------------------------------------------------
-- 6. Registro modifiche: chi ha fatto la modifica resta scritto
-- ---------------------------------------------------------------------------
-- actor_id si svuota se il profilo viene eliminato: si conserva anche il nome al momento.

alter table public.audit_log add column actor_label text;

create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_diff jsonb;
  v_key text;
  v_id text;
  v_label text;
begin
  if auth.uid() is not null and not public.is_admin() then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' then
    v_diff := '{}'::jsonb;
    for v_key in select jsonb_object_keys(v_new) loop
      if v_key <> 'updated_at' and (v_new -> v_key) is distinct from (v_old -> v_key) then
        v_diff := v_diff || jsonb_build_object(
          v_key, jsonb_build_object('before', v_old -> v_key, 'after', v_new -> v_key)
        );
      end if;
    end loop;
    if v_diff = '{}'::jsonb then
      return new;
    end if;
  else
    v_diff := coalesce(v_new, v_old);
  end if;

  v_id := coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'profile_id', v_old ->> 'profile_id');

  if auth.uid() is not null then
    select p.display_name || ' (' || p.employee_code || ')' into v_label
      from public.profiles p where p.id = auth.uid();
  end if;

  insert into public.audit_log (actor_id, actor_label, action, entity, entity_id, diff)
  values (auth.uid(), v_label, lower(tg_op), tg_table_name, v_id, v_diff);

  return coalesce(new, old);
end;
$$;

update public.audit_log a
   set actor_label = p.display_name || ' (' || p.employee_code || ')'
  from public.profiles p
 where p.id = a.actor_id and a.actor_label is null;

-- ---------------------------------------------------------------------------
-- 7. Limiti sui dati scritti dai dipendenti (valgono per le righe nuove)
-- ---------------------------------------------------------------------------

alter table public.requests
  add constraint requests_range_max check (end_date - start_date <= 366) not valid,
  add constraint requests_message_length check (message is null or char_length(message) <= 4000) not valid,
  -- Niente «..», «.» o segmenti vuoti nel percorso dell'allegato.
  add constraint requests_attachment_path_plain
    check (attachment_path is null or attachment_path !~ '(^|/)\.{0,2}(/|$)') not valid;

alter table public.profiles
  add constraint profiles_avatar_url_safe
    check (avatar_url is null or avatar_url ~ '^(https://|[0-9a-f-]{36}/)') not valid;

alter table public.responsibility_checks
  add constraint responsibility_checks_note_length
    check (note is null or char_length(note) <= 1000) not valid;

alter table public.performance_goals
  add constraint performance_goals_employee_note_length
    check (employee_note is null or char_length(employee_note) <= 4000) not valid;

-- ---------------------------------------------------------------------------
-- 8. Foto profilo: solo immagini
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('storage.buckets') is not null then
    update storage.buckets
       set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
     where id = 'avatars';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Tentativi di accesso: tetto nelle 24 ore e segnale di blocco
-- ---------------------------------------------------------------------------
-- Con 5 errori ogni 15 minuti si potevano provare 480 PIN al giorno per codice. Ora, oltre al
-- blocco di 15 minuti, un codice che accumula 4 volte la soglia di errori in 24 ore (senza un
-- accesso riuscito in mezzo) resta bloccato finché quegli errori non escono dalle 24 ore.
-- `reached_limit` dice che QUESTO tentativo, se sbagliato, fa scattare il blocco: l'app avvisa
-- gli admin.

create or replace function public.login_attempt_begin(
  p_code text,
  p_ip text,
  p_max_code int,
  p_max_ip int,
  p_minutes int
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window interval := make_interval(mins => p_minutes);
  v_day constant interval := interval '24 hours';
  v_max_day constant int := p_max_code * 4;
  v_now timestamptz;
  v_since timestamptz;
  v_last_success timestamptz;
  v_trigger timestamptz;
  v_id uuid;
  v_recent int;
  v_daily int;
begin
  if p_code is null or p_max_code < 1 or p_max_ip < 1 or p_minutes < 1 then
    raise exception 'Parametri non validi' using errcode = '22023';
  end if;

  -- Sempre nello stesso ordine (codice, poi IP): niente deadlock tra richieste concorrenti.
  perform pg_advisory_xact_lock(hashtextextended('login:code:' || p_code, 0));
  if p_ip is not null then
    perform pg_advisory_xact_lock(hashtextextended('login:ip:' || p_ip, 0));
  end if;
  -- Dopo l'attesa del lock: now() sarebbe l'inizio della transazione.
  v_now := clock_timestamp();
  v_since := v_now - v_window;

  select max(a.at) into v_last_success
    from public.login_attempts a
   where a.employee_code = p_code and a.success and a.at > v_now - v_day;

  -- Tetto nelle 24 ore: si sblocca quando il più vecchio degli ultimi errori esce dalla finestra.
  select a.at into v_trigger
    from public.login_attempts a
   where a.employee_code = p_code and not a.success and a.at > v_now - v_day
     and (v_last_success is null or a.at > v_last_success)
   order by a.at desc
  offset v_max_day - 1 limit 1;
  if v_trigger is not null then
    return jsonb_build_object('attempt_id', null, 'locked_until', v_trigger + v_day);
  end if;

  select a.at into v_trigger
    from public.login_attempts a
   where a.employee_code = p_code and not a.success and a.at > v_since
     and (v_last_success is null or a.at > v_last_success)
   order by a.at desc
  offset p_max_code - 1 limit 1;

  if v_trigger is null and p_ip is not null then
    select a.at into v_trigger
      from public.login_attempts a
     where a.ip = p_ip and not a.success and a.at > v_since
       and not exists (
         select 1 from public.login_attempts s
          where s.employee_code = a.employee_code and s.success and s.at > a.at
       )
     order by a.at desc
    offset p_max_ip - 1 limit 1;
  end if;

  if v_trigger is not null then
    return jsonb_build_object('attempt_id', null, 'locked_until', v_trigger + v_window);
  end if;

  insert into public.login_attempts (employee_code, ip, success, at)
  values (p_code, p_ip, false, v_now)
  returning id into v_id;

  select count(*) filter (where a.at > v_since), count(*)
    into v_recent, v_daily
    from public.login_attempts a
   where a.employee_code = p_code and not a.success and a.at > v_now - v_day
     and (v_last_success is null or a.at > v_last_success);

  return jsonb_build_object(
    'attempt_id', v_id,
    'locked_until', null,
    'reached_limit', v_recent = p_max_code or v_daily = v_max_day
  );
end;
$$;

revoke all on function public.login_attempt_begin(text, text, int, int, int)
  from public, anon, authenticated;
grant execute on function public.login_attempt_begin(text, text, int, int, int) to service_role;
