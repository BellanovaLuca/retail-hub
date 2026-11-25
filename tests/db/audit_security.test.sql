-- Correzioni dell'audit del 28/11/2026: primo accesso nel database, funzioni dei dipendenti,
-- letture/notifiche, privilegi, limiti sui dati, tentativi di accesso.

begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000004a1'),
  ('00000000-0000-0000-0000-0000000004e1'),
  ('00000000-0000-0000-0000-0000000004e2'),
  ('00000000-0000-0000-0000-0000000004e3'),
  ('00000000-0000-0000-0000-0000000004a2');
insert into public.profiles
  (id, first_name, last_name, display_name, employee_code, role, must_change_pin, privacy_accepted_at, active)
values
  ('00000000-0000-0000-0000-0000000004a1', 'Ada', 'Admin', 'Ada Q', 'TST-Q01', 'admin', false, now(), true),
  ('00000000-0000-0000-0000-0000000004e1', 'Elio', 'Uno', 'Elio Q', 'TST-Q02', 'employee', false, now(), true),
  -- e2: PIN provvisorio ancora da cambiare.
  ('00000000-0000-0000-0000-0000000004e2', 'Nuovo', 'Due', 'Nuovo Q', 'TST-Q03', 'employee', true, null, true),
  -- e3: disattivato.
  ('00000000-0000-0000-0000-0000000004e3', 'Ex', 'Tre', 'Ex Q', 'TST-Q04', 'employee', false, now(), false),
  -- a2: promosso admin, deve ancora scegliere il PIN da admin.
  ('00000000-0000-0000-0000-0000000004a2', 'Promo', 'Admin', 'Promo Q', 'TST-Q05', 'admin', true, now(), true);

insert into public.requests (id, profile_id, type, start_date, end_date, status) values
  ('00000000-0000-0000-0000-000000004901', '00000000-0000-0000-0000-0000000004e3', 'ferie',
   '2030-01-07', '2030-01-08', 'pending');
insert into public.announcements (id, title, body_md, category, audience, publish_at) values
  ('00000000-0000-0000-0000-000000004801', 'Per tutti', 'x', 'generale', 'all', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-000000004802', 'Altra', 'x', 'generale', 'all', now() - interval '1 hour');
insert into public.notifications (id, profile_id, kind, title) values
  ('00000000-0000-0000-0000-000000004701', '00000000-0000-0000-0000-0000000004e1', 'announcement', 'Per e1');
insert into public.responsibilities (id, title) values
  ('00000000-0000-0000-0000-000000004f01', 'Audit test');

-- 1. person_days coerente con profile_ids, giorni 1–7.
do $$
begin
  begin
    insert into public.responsibility_week_assignments (responsibility_id, week_start, profile_ids, person_days)
    values ('00000000-0000-0000-0000-000000004f01', '2030-01-07', '{}',
            '{"00000000-0000-0000-0000-0000000004e1": [1]}');
    raise exception 'FALLITO: giorni per una persona fuori dall''assegnazione';
  exception when check_violation then null;
  end;
  begin
    insert into public.responsibility_week_assignments (responsibility_id, week_start, profile_ids, person_days)
    values ('00000000-0000-0000-0000-000000004f01', '2030-01-07',
            '{00000000-0000-0000-0000-0000000004e1}',
            '{"00000000-0000-0000-0000-0000000004e1": [1, 9]}');
    raise exception 'FALLITO: giorno 9 accettato';
  exception when check_violation then null;
  end;
  begin
    insert into public.responsibility_week_assignments (responsibility_id, week_start, profile_ids, person_days)
    values ('00000000-0000-0000-0000-000000004f01', '2030-01-07',
            '{00000000-0000-0000-0000-0000000004e1}',
            '{"00000000-0000-0000-0000-0000000004e1": 3}');
    raise exception 'FALLITO: giorni non in forma di elenco';
  exception when check_violation then null;
  end;
  insert into public.responsibility_week_assignments (responsibility_id, week_start, profile_ids, person_days)
  values ('00000000-0000-0000-0000-000000004f01', '2030-01-07',
          '{00000000-0000-0000-0000-0000000004e1}',
          '{"00000000-0000-0000-0000-0000000004e1": [1, 3]}');
end;
$$;

-- 2. Limiti sui dati.
do $$
begin
  begin
    insert into public.requests (profile_id, type, start_date, end_date)
    values ('00000000-0000-0000-0000-0000000004e1', 'ferie', '2030-01-01', '9999-12-31');
    raise exception 'FALLITO: richiesta di durata illimitata';
  exception when check_violation then null;
  end;
  begin
    insert into public.requests (profile_id, type, start_date, end_date, attachment_path)
    values ('00000000-0000-0000-0000-0000000004e1', 'malattia', '2030-01-01', '2030-01-02',
            '00000000-0000-0000-0000-0000000004e1/../altro/file.pdf');
    raise exception 'FALLITO: allegato con «..» nel percorso';
  exception when check_violation then null;
  end;
  insert into public.requests (profile_id, type, start_date, end_date, attachment_path)
  values ('00000000-0000-0000-0000-0000000004e1', 'malattia', '2030-01-01', '2030-01-02',
          '00000000-0000-0000-0000-0000000004e1/certificato.v2.pdf');
  begin
    update public.profiles set avatar_url = 'javascript:alert(1)'
     where id = '00000000-0000-0000-0000-0000000004e1';
    raise exception 'FALLITO: avatar_url con schema non ammesso';
  exception when check_violation then null;
  end;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- 3. PIN provvisorio: si legge solo il proprio profilo.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000004e2', true);
do $$
begin
  if public.is_staff() or not public.is_active_account() then
    raise exception 'FALLITO: con il PIN provvisorio non si è ancora staff (ma l''account è attivo)';
  end if;
  if (select count(*) from public.profiles) <> 1 then
    raise exception 'FALLITO: con il PIN provvisorio si legge solo il proprio profilo';
  end if;
  if (select count(*) from public.public_profiles) <> 0
     or (select count(*) from public.responsibilities) <> 0
     or (select count(*) from public.announcements) <> 0 then
    raise exception 'FALLITO: con il PIN provvisorio non si leggono i dati del negozio';
  end if;
end;
$$;

-- Promosso admin con il PIN ancora da cambiare: nessun potere.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000004a2', true);
do $$
begin
  if public.is_admin() or public.is_staff() then
    raise exception 'FALLITO: admin senza primo accesso completato';
  end if;
  if (select count(*) from public.profiles) <> 1 then
    raise exception 'FALLITO: admin senza primo accesso legge altri profili';
  end if;
end;
$$;

-- 4. Account disattivato: le funzioni dei dipendenti non rispondono.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000004e3', true);
do $$
begin
  begin
    perform public.cancel_request('00000000-0000-0000-0000-000000004901');
    raise exception 'FALLITO: un account disattivato annulla una richiesta';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.set_extra_task_done(gen_random_uuid(), true);
    raise exception 'FALLITO: un account disattivato chiude un''attività';
  exception when insufficient_privilege then null;
  end;
  if public.is_responsibility_assignee_on(
       '00000000-0000-0000-0000-000000004f01', '00000000-0000-0000-0000-0000000004e1', '2030-01-07') then
    raise exception 'FALLITO: un account disattivato interroga le assegnazioni';
  end if;
end;
$$;

-- 5. Dipendente attivo.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000004e1', true);
do $$
declare
  v_ack timestamptz;
begin
  -- Le proprie assegnazioni sì, quelle degli altri no.
  if not public.is_responsibility_assignee_on(
       '00000000-0000-0000-0000-000000004f01', auth.uid(), '2030-01-07') then
    raise exception 'FALLITO: lunedì è un giorno di e1';
  end if;
  if public.is_responsibility_assignee_on(
       '00000000-0000-0000-0000-000000004f01', '00000000-0000-0000-0000-0000000004a1', '2030-01-07') then
    raise exception 'FALLITO: risposta sulle assegnazioni di un altro';
  end if;

  -- Presa visione: non si retrodata e non si sposta.
  insert into public.announcement_reads (announcement_id, profile_id, read_at)
  values ('00000000-0000-0000-0000-000000004801', auth.uid(), '2020-01-01');
  update public.announcement_reads set acknowledged_at = '2020-01-01'
   where announcement_id = '00000000-0000-0000-0000-000000004801' and profile_id = auth.uid();
  select acknowledged_at into v_ack from public.announcement_reads
   where announcement_id = '00000000-0000-0000-0000-000000004801' and profile_id = auth.uid();
  if v_ack is null or v_ack < now() - interval '1 minute' then
    raise exception 'FALLITO: conferma di lettura retrodatata (%)', v_ack;
  end if;
  if (select read_at from public.announcement_reads
       where announcement_id = '00000000-0000-0000-0000-000000004801' and profile_id = auth.uid())
     < now() - interval '1 minute' then
    raise exception 'FALLITO: lettura retrodatata';
  end if;
  begin
    update public.announcement_reads set announcement_id = '00000000-0000-0000-0000-000000004802'
     where announcement_id = '00000000-0000-0000-0000-000000004801' and profile_id = auth.uid();
    raise exception 'FALLITO: lettura spostata su un''altra comunicazione';
  exception when insufficient_privilege then null;
  end;

  -- Notifiche: solo «letta».
  update public.notifications set read_at = now() where id = '00000000-0000-0000-0000-000000004701';
  begin
    update public.notifications set title = 'x' where id = '00000000-0000-0000-0000-000000004701';
    raise exception 'FALLITO: un dipendente riscrive una notifica';
  exception when insufficient_privilege then null;
  end;

  -- TRUNCATE non passa dalla RLS: non deve essere concesso.
  begin
    truncate public.audit_log;
    raise exception 'FALLITO: un dipendente svuota il registro';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- 6. Senza accesso: nessun privilegio sulle tabelle.
reset role;
do $$
begin
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and grantee in ('anon', 'PUBLIC')
  ) then
    raise exception 'FALLITO: privilegi sulle tabelle per chi non ha fatto l''accesso';
  end if;
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and grantee = 'authenticated'
       and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')
  ) then
    raise exception 'FALLITO: TRUNCATE/REFERENCES/TRIGGER concessi agli utenti';
  end if;
end;
$$;

-- 7. Registro: resta scritto chi ha fatto la modifica.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000004a1', true);
update public.responsibilities set title = 'Audit test 2' where id = '00000000-0000-0000-0000-000000004f01';
reset role;
do $$
begin
  if (select actor_label from public.audit_log
       where entity = 'responsibilities' and entity_id = '00000000-0000-0000-0000-000000004f01'
         and action = 'update') is distinct from 'Ada Q (TST-Q01)' then
    raise exception 'FALLITO: nome di chi ha modificato non registrato';
  end if;
end;
$$;

-- 8. Tentativi di accesso: segnale di blocco e tetto nelle 24 ore.
do $$
declare
  j jsonb;
  i int;
begin
  for i in 1..4 loop
    j := public.login_attempt_begin('TST-LOCK', '203.0.113.9', 5, 20, 15);
    if j ->> 'attempt_id' is null or (j ->> 'reached_limit')::boolean then
      raise exception 'FALLITO: tentativo % → %', i, j;
    end if;
  end loop;
  j := public.login_attempt_begin('TST-LOCK', '203.0.113.9', 5, 20, 15);
  if not (j ->> 'reached_limit')::boolean then
    raise exception 'FALLITO: il quinto errore deve segnalare il blocco: %', j;
  end if;
  j := public.login_attempt_begin('TST-LOCK', '203.0.113.9', 5, 20, 15);
  if j ->> 'locked_until' is null then
    raise exception 'FALLITO: al sesto tentativo il codice è bloccato: %', j;
  end if;

  -- 20 errori sparsi nelle ultime 20 ore (mai 5 in 15 minuti): tetto giornaliero.
  insert into public.login_attempts (employee_code, ip, success, at)
  select 'TST-DAY', null, false, now() - make_interval(hours => g) from generate_series(1, 20) g;
  j := public.login_attempt_begin('TST-DAY', null, 5, 20, 15);
  if j ->> 'locked_until' is null
     or (j ->> 'locked_until')::timestamptz < now() + interval '3 hours' then
    raise exception 'FALLITO: tetto delle 24 ore non applicato: %', j;
  end if;
  -- Un accesso riuscito azzera il conteggio.
  insert into public.login_attempts (employee_code, ip, success, at) values ('TST-DAY', null, true, now());
  j := public.login_attempt_begin('TST-DAY', null, 5, 20, 15);
  if j ->> 'attempt_id' is null then
    raise exception 'FALLITO: dopo un accesso riuscito si riparte da zero: %', j;
  end if;
end;
$$;

rollback;
