-- Irrobustimento di piattaforma, accesso e RLS (audit del 25 novembre).
--  1. Blocco dei tentativi di accesso atomico (controllo + registrazione in un passo).
--  2. cron_runs con stato: un job in errore o in timeout non resta «eseguito».
--  3. RLS: un account senza profilo attivo non legge né scrive nulla.
--  4. Richieste, numeri del giorno, note e sottoscrizioni push: vincoli allineati all'app.
--  5. Storage: gli allegati delle richieste sono di sola lettura per chi li ha caricati.

-- ---------------------------------------------------------------------------
-- 1. Tentativi di accesso
-- ---------------------------------------------------------------------------

-- Prima la route leggeva i tentativi, verificava il PIN e solo dopo registrava l'errore:
-- N richieste in parallelo passavano tutte il controllo. Ora controllo e registrazione sono
-- un'unica operazione sotto un lock per codice (e per IP): il tentativo nasce «fallito» e la
-- route lo segna riuscito solo dopo l'accesso.
--  * per codice: contano i falliti dopo l'ultimo accesso riuscito con quel codice;
--  * per IP: un fallito smette di contare solo se LO STESSO codice è poi entrato (un accesso
--    riuscito con un altro codice non azzera i tentativi fatti sui colleghi).
-- Soglie e finestra arrivano da lib/auth/lockout.ts. Restituisce { attempt_id, locked_until }:
-- l'id del tentativo registrato, oppure fino a quando l'accesso è bloccato.
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
  v_since timestamptz;
  v_last_success timestamptz;
  v_trigger timestamptz;
  v_id uuid;
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
  v_since := clock_timestamp() - v_window;

  select max(a.at) into v_last_success
    from public.login_attempts a
   where a.employee_code = p_code and a.success and a.at > v_since;

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
  values (p_code, p_ip, false, clock_timestamp())
  returning id into v_id;
  return jsonb_build_object('attempt_id', v_id, 'locked_until', null);
end;
$$;

revoke all on function public.login_attempt_begin(text, text, int, int, int)
  from public, anon, authenticated;
grant execute on function public.login_attempt_begin(text, text, int, int, int) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Esecuzioni dei job pianificati
-- ---------------------------------------------------------------------------

-- running = in corso (se resta così per minuti, la funzione è stata interrotta: si ritenta);
-- failed = errore (si ritenta fino al numero massimo di tentativi); done = eseguito.
alter table public.cron_runs
  add column status text not null default 'done'
    check (status in ('running', 'done', 'failed')),
  add column attempts int not null default 1 check (attempts >= 1);

-- ---------------------------------------------------------------------------
-- 3. RLS: serve un profilo attivo
-- ---------------------------------------------------------------------------

-- Le policy «lettura autenticati» erano `using (true)`: bastava un JWT valido, anche di un
-- account senza profilo o disattivato (fino alla scadenza del token).
do $$
declare
  p record;
begin
  for p in
    select tablename, policyname
      from pg_policies
     where schemaname = 'public' and cmd = 'SELECT' and qual = 'true'
  loop
    execute format(
      'alter policy %I on public.%I using ((select public.is_staff()))',
      p.policyname, p.tablename);
  end loop;
end;
$$;

-- Difesa comune a tutte le tabelle: qualunque altra policy (righe proprie, destinatari…)
-- vale solo per chi ha un profilo attivo. Il service role non passa da RLS.
do $$
declare
  t record;
begin
  for t in
    select c.relname
      from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relrowsecurity
  loop
    execute format(
      'create policy "solo profili attivi" on public.%I as restrictive for all to authenticated
         using ((select public.is_staff())) with check ((select public.is_staff()))',
      t.relname);
  end loop;
end;
$$;

create or replace function public.is_announcement_recipient(a public.announcements, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_staff() and (uid = auth.uid() or public.is_admin()) and case a.audience
    when 'all' then true
    when 'people' then uid = any (a.profile_ids)
    when 'department' then exists (
      select 1 from public.profile_departments pd
      where pd.profile_id = uid and pd.department_id = any (a.department_ids)
    )
    else false
  end;
$$;

-- Le due viste che non passavano ancora da is_staff() (le altre: 20261017070000).
create or replace view public.my_performance_goals
with (security_barrier = true)
as
select
  g.id, g.profile_id, g.period_id, g.pillar, g.slot, g.title, g.objective, g.comment,
  g.progress, g.employee_note, g.published_at, g.updated_at
from public.performance_goals g
where public.is_staff() and g.profile_id = auth.uid() and g.published;

create or replace view public.monitoring_weekly_by_person
with (security_barrier = true)
as
select
  (date_trunc('week', d.date))::date as week_start,
  d.profile_id,
  d.kpi_id,
  sum(d.value) as total
from public.daily_entries d
where public.is_staff()
  and (
    public.is_admin()
    or d.profile_id = auth.uid()
    or (select s.share_individual_monitoring from public.store_settings s limit 1)
  )
group by 1, 2, 3;

-- Funzione di trigger: nessuno deve poterla chiamare dall'API.
revoke execute on function public.forget_profile_in_week_assignments()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Vincoli allineati all'app
-- ---------------------------------------------------------------------------

-- Una richiesta nasce senza esito: né nota né data della decisione.
alter policy "requests: inserimento proprio" on public.requests
  with check (
    profile_id = auth.uid()
    and status = 'pending'
    and decided_by is null
    and decided_at is null
    and decision_note is null
  );

-- I vincoli nascono `not valid` (valgono subito per le righe nuove e modificate) e si
-- convalidano se i dati esistenti li rispettano: altrimenti resta un avviso e si convalidano
-- a mano dopo aver sistemato le righe (alter table … validate constraint …).
alter table public.requests
  add constraint requests_attachment_path_own
  check (attachment_path is null or starts_with(attachment_path, profile_id::text || '/'))
  not valid;

alter table public.daily_entries
  add constraint daily_entries_value_max check (value <= 99999) not valid;

alter table public.employee_week_notes
  add constraint employee_week_notes_body_length check (char_length(body) <= 4000) not valid;

alter table public.push_subscriptions
  add constraint push_subscriptions_endpoint_https
  check (endpoint ~ '^https://[^/]' and char_length(endpoint) <= 1000) not valid;

do $$
declare
  c record;
begin
  for c in
    select * from (values
      ('requests', 'requests_attachment_path_own'),
      ('daily_entries', 'daily_entries_value_max'),
      ('employee_week_notes', 'employee_week_notes_body_length'),
      ('push_subscriptions', 'push_subscriptions_endpoint_https')
    ) as v (tbl, con)
  loop
    begin
      execute format('alter table public.%I validate constraint %I', c.tbl, c.con);
    exception when check_violation then
      raise warning 'Vincolo % su % non convalidato: ci sono righe esistenti che lo violano.',
        c.con, c.tbl;
    end;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Storage (solo su Supabase: in locale lo schema non esiste)
-- ---------------------------------------------------------------------------

do $do$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'Schema storage assente: policy dei bucket non aggiornate.';
    return;
  end if;

  -- Gli allegati delle richieste li carica il server (service role) nella cartella della
  -- persona: lei li può solo leggere, non sostituire o cancellare dopo l'invio.
  execute 'drop policy if exists "storage: file propri" on storage.objects';
  execute 'drop policy if exists "storage: foto propria" on storage.objects';
  execute 'drop policy if exists "storage: lettura allegati propri" on storage.objects';

  execute $p$
    create policy "storage: foto propria" on storage.objects
      for all to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
             and public.is_staff())
      with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
                  and public.is_staff())
  $p$;

  execute $p$
    create policy "storage: lettura allegati propri" on storage.objects
      for select to authenticated
      using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text
             and public.is_staff())
  $p$;

  -- Logo e foto: anche qui serve un profilo attivo.
  execute $p$
    alter policy "storage: lettura avatar e branding" on storage.objects
      using ((bucket_id in ('avatars', 'branding') and public.is_staff()) or public.is_admin())
  $p$;
end;
$do$;
