-- Irrobustimento di piattaforma (20261126020000): un account senza profilo attivo non legge né
-- scrive nulla; blocco dei tentativi di accesso atomico; vincoli su richieste, numeri, note e
-- sottoscrizioni push; stato delle esecuzioni dei job.

begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-0000000000e1'),
  ('00000000-0000-0000-0000-0000000000e2'),
  ('00000000-0000-0000-0000-0000000000ff'); -- account di accesso senza profilo

insert into public.profiles (id, first_name, last_name, display_name, employee_code, role, active) values
  ('00000000-0000-0000-0000-00000000000a', 'Anna', 'Admin', 'Anna', 'ADM-001', 'admin', true),
  ('00000000-0000-0000-0000-0000000000e1', 'Elena', 'Attiva', 'Elena', 'CRD-001', 'employee', true),
  ('00000000-0000-0000-0000-0000000000e2', 'Dario', 'Disattivato', 'Dario', 'CRD-002', 'employee', false);
-- Utenti di prova con il primo accesso completato (lo richiede is_staff()).
update public.profiles set must_change_pin = false, privacy_accepted_at = coalesce(privacy_accepted_at, now())
 where must_change_pin or privacy_accepted_at is null;

-- Dati preparati come service role: ce n'è per tutti, anche propri della persona disattivata.
insert into public.announcements (title, body_md, audience) values ('Per tutti', 'testo', 'all');
insert into public.store_weekly_targets (week_start, total_hours) values ('2026-11-23', 300);
insert into public.responsibilities (id, title, schedule_days) values
  ('00000000-0000-0000-0000-000000000f01', 'Montaggi', '{1,2,3,4,5,6,7}');
insert into public.responsibility_assignees (responsibility_id, profile_id, role) values
  ('00000000-0000-0000-0000-000000000f01', '00000000-0000-0000-0000-0000000000e2', 'owner');
insert into public.notifications (profile_id, kind, title) values
  ('00000000-0000-0000-0000-0000000000e1', 'announcement', 'Per Elena'),
  ('00000000-0000-0000-0000-0000000000e2', 'announcement', 'Per Dario');
insert into public.requests (profile_id, type, start_date, end_date, message) values
  ('00000000-0000-0000-0000-0000000000e2', 'permesso', '2026-12-01', '2026-12-01', 'visita');
insert into public.leaves (profile_id, date, type) values
  ('00000000-0000-0000-0000-0000000000e2', '2026-12-02', 'ferie');
insert into public.push_subscriptions (profile_id, endpoint, keys) values
  ('00000000-0000-0000-0000-0000000000e2', 'https://fcm.googleapis.com/fcm/send/dario', '{}');
insert into public.performance_periods (id, year, label) values
  ('00000000-0000-0000-0000-000000000901', 2099, 'Performance 2099');
insert into public.performance_goals (profile_id, period_id, pillar, slot, title, published) values
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-000000000901', 'achievement', 1, 'Obiettivo', true);
insert into public.kpi_definitions (id, code, label) values
  ('00000000-0000-0000-0000-000000000801', 'TEST_KPI', 'Voce di prova');
insert into public.daily_entries (profile_id, date, kpi_id, value) values
  ('00000000-0000-0000-0000-0000000000e2', public.today_rome(), '00000000-0000-0000-0000-000000000801', 3);
update public.store_settings set share_individual_monitoring = true;

-- Nessuna policy di lettura aperta a chiunque abbia un JWT.
do $$
declare
  n int;
begin
  select count(*) into n from pg_policies where schemaname = 'public' and qual = 'true';
  if n <> 0 then raise exception 'FALLITO: restano % policy con using (true)', n; end if;
  select count(*) into n
    from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relrowsecurity
     and not exists (
       select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = c.relname
          and p.policyname = 'solo profili attivi' and p.permissive = 'RESTRICTIVE'
     );
  if n <> 0 then raise exception 'FALLITO: % tabelle senza la policy «solo profili attivi»', n; end if;
end;
$$;

-- Conta le righe visibili in ogni tabella e vista di public con il ruolo corrente.
create function pg_temp.visible_rows() returns table (rel text, n bigint)
language plpgsql as $$
declare
  r record;
begin
  for r in
    select c.relname from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v')
     order by 1
  loop
    rel := r.relname;
    begin
      execute format('select count(*) from public.%I', r.relname) into n;
    exception when insufficient_privilege then
      n := 0; -- nemmeno il permesso di interrogarla
    end;
    return next;
  end loop;
end;
$$;

-- ---- account senza profilo: non legge nulla, da nessuna tabella o vista ----
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ff', true);
do $$
declare
  leaked text;
begin
  select string_agg(format('%s (%s)', v.rel, v.n), ', ') into leaked
    from pg_temp.visible_rows() v where v.n > 0;
  if leaked is not null then
    raise exception 'FALLITO: un account senza profilo legge: %', leaked;
  end if;
end;
$$;
reset role;

-- ---- account disattivato (token non ancora scaduto): come sopra, nemmeno i propri dati ----
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e2', true);
do $$
declare
  leaked text;
  n int;
begin
  select string_agg(format('%s (%s)', v.rel, v.n), ', ') into leaked
    from pg_temp.visible_rows() v where v.n > 0;
  if leaked is not null then
    raise exception 'FALLITO: un account disattivato legge: %', leaked;
  end if;
  -- …e non scrive: né inserimenti né modifiche alle proprie righe.
  begin
    insert into public.push_subscriptions (profile_id, endpoint, keys)
    values (auth.uid(), 'https://fcm.googleapis.com/fcm/send/nuova', '{}');
    raise exception 'FALLITO: un account disattivato registra una sottoscrizione push';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.requests (profile_id, type, start_date, end_date)
    values (auth.uid(), 'permesso', '2026-12-05', '2026-12-05');
    raise exception 'FALLITO: un account disattivato crea una richiesta';
  exception when insufficient_privilege then null;
  end;
  update public.notifications set read_at = now() where profile_id = auth.uid();
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLITO: un account disattivato modifica le sue notifiche'; end if;
  delete from public.push_subscriptions where profile_id = auth.uid();
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLITO: un account disattivato elimina righe'; end if;
end;
$$;
reset role;

-- ---- dipendente attivo: tutto come prima ----
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
do $$
declare
  n int;
begin
  select count(*) into n from public.departments;
  if n = 0 then raise exception 'FALLITO: il dipendente attivo non legge i reparti'; end if;
  select count(*) into n from public.announcements;
  if n = 0 then raise exception 'FALLITO: il dipendente attivo non legge la comunicazione per tutti'; end if;
  select count(*) into n from public.store_weekly_targets;
  if n = 0 then raise exception 'FALLITO: il dipendente attivo non legge gli obiettivi del negozio'; end if;
  select count(*) into n from public.responsibilities;
  if n = 0 then raise exception 'FALLITO: il dipendente attivo non legge le responsabilità'; end if;
  select count(*) into n from public.profiles;
  if n <> 1 then raise exception 'FALLITO: il dipendente attivo non legge il proprio profilo'; end if;
  select count(*) into n from public.notifications;
  if n <> 1 then raise exception 'FALLITO: il dipendente attivo vede % notifiche (attesa 1)', n; end if;
  select count(*) into n from public.monitoring_weekly_by_person;
  if n = 0 then raise exception 'FALLITO: monitoraggio condiviso non leggibile dal dipendente attivo'; end if;

  -- Richieste: nascono senza esito e con un allegato nella propria cartella.
  insert into public.requests (profile_id, type, start_date, end_date, attachment_path)
  values (auth.uid(), 'malattia', '2026-12-03', '2026-12-03',
          '00000000-0000-0000-0000-0000000000e1/certificato.pdf');
  begin
    insert into public.requests (profile_id, type, start_date, end_date, decision_note)
    values (auth.uid(), 'permesso', '2026-12-04', '2026-12-04', 'approvata dal responsabile');
    raise exception 'FALLITO: una richiesta nasce con la nota della decisione';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.requests (profile_id, type, start_date, end_date, decided_at)
    values (auth.uid(), 'permesso', '2026-12-04', '2026-12-04', now());
    raise exception 'FALLITO: una richiesta nasce con la data della decisione';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.requests (profile_id, type, start_date, end_date, attachment_path)
    values (auth.uid(), 'malattia', '2026-12-04', '2026-12-04', 'announcements/abc/regolamento.pdf');
    raise exception 'FALLITO: una richiesta punta a un allegato fuori dalla propria cartella';
  exception when check_violation then null;
  end;
  begin
    insert into public.requests (profile_id, type, start_date, end_date, attachment_path)
    values (auth.uid(), 'malattia', '2026-12-04', '2026-12-04',
            '00000000-0000-0000-0000-0000000000e2/certificato.pdf');
    raise exception 'FALLITO: una richiesta punta all''allegato di un collega';
  exception when check_violation then null;
  end;

  -- Numeri del giorno e nota: stessi limiti dell'app.
  insert into public.daily_entries (profile_id, date, kpi_id, value)
  values (auth.uid(), public.today_rome(), '00000000-0000-0000-0000-000000000801', 99999);
  begin
    update public.daily_entries set value = 100000 where profile_id = auth.uid();
    raise exception 'FALLITO: numero del giorno oltre 99999';
  exception when check_violation then null;
  end;
  insert into public.employee_week_notes (profile_id, week_start, body)
  values (auth.uid(), '2026-11-23', repeat('a', 4000));
  begin
    update public.employee_week_notes set body = repeat('a', 4001) where profile_id = auth.uid();
    raise exception 'FALLITO: nota della settimana oltre 4000 caratteri';
  exception when check_violation then null;
  end;

  -- Sottoscrizioni push: solo https, lunghezza limitata.
  insert into public.push_subscriptions (profile_id, endpoint, keys)
  values (auth.uid(), 'https://web.push.apple.com/abc', '{}');
  begin
    insert into public.push_subscriptions (profile_id, endpoint, keys)
    values (auth.uid(), 'http://fcm.googleapis.com/fcm/send/x', '{}');
    raise exception 'FALLITO: sottoscrizione push non https';
  exception when check_violation then null;
  end;
  begin
    insert into public.push_subscriptions (profile_id, endpoint, keys)
    values (auth.uid(), 'https://fcm.googleapis.com/' || repeat('x', 1000), '{}');
    raise exception 'FALLITO: sottoscrizione push troppo lunga';
  exception when check_violation then null;
  end;

  -- Funzioni riservate al server.
  begin
    perform public.login_attempt_begin('CRD-001', '10.0.0.1', 5, 20, 15);
    raise exception 'FALLITO: un dipendente chiama login_attempt_begin';
  exception when insufficient_privilege then null;
  end;
  if has_function_privilege('authenticated', 'public.forget_profile_in_week_assignments()', 'execute')
     or has_function_privilege('anon', 'public.forget_profile_in_week_assignments()', 'execute') then
    raise exception 'FALLITO: forget_profile_in_week_assignments è eseguibile dall''API';
  end if;
end;
$$;
reset role;

-- ---- blocco dei tentativi di accesso (service role) ----
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);
do $$
declare
  g jsonb;
  i int;
begin
  -- Per codice: 5 tentativi passano (e nascono falliti), il sesto è bloccato per 15 minuti.
  for i in 1..5 loop
    g := public.login_attempt_begin('CRD-009', '10.0.0.9', 5, 20, 15);
    if g ->> 'attempt_id' is null then raise exception 'FALLITO: tentativo % bloccato troppo presto', i; end if;
  end loop;
  g := public.login_attempt_begin('CRD-009', '10.0.0.9', 5, 20, 15);
  if g ->> 'attempt_id' is not null or g ->> 'locked_until' is null then
    raise exception 'FALLITO: il sesto tentativo non è bloccato (%)', g;
  end if;
  if (g ->> 'locked_until')::timestamptz not between now() + interval '14 minutes' and now() + interval '15 minutes 5 seconds' then
    raise exception 'FALLITO: durata del blocco inattesa (%)', g ->> 'locked_until';
  end if;
  if (select count(*) from public.login_attempts where employee_code = 'CRD-009') <> 5 then
    raise exception 'FALLITO: un tentativo bloccato è stato registrato';
  end if;
  -- Lo stesso codice da un altro IP resta bloccato; un altro codice dallo stesso IP no.
  if public.login_attempt_begin('CRD-009', '10.0.0.77', 5, 20, 15) ->> 'attempt_id' is not null then
    raise exception 'FALLITO: cambiando IP si aggira il blocco per codice';
  end if;

  -- L'accesso riuscito azzera il conteggio del codice.
  for i in 1..4 loop
    g := public.login_attempt_begin('CRD-010', '10.0.1.1', 5, 20, 15);
  end loop;
  g := public.login_attempt_begin('CRD-010', '10.0.1.1', 5, 20, 15);
  update public.login_attempts set success = true where id = (g ->> 'attempt_id')::uuid;
  for i in 1..5 loop
    g := public.login_attempt_begin('CRD-010', '10.0.1.1', 5, 20, 15);
    if g ->> 'attempt_id' is null then raise exception 'FALLITO: il successo non ha azzerato il codice'; end if;
  end loop;

  -- Per IP (soglia 3 per brevità): l'accesso riuscito con un ALTRO codice non azzera i falliti
  -- fatti sui colleghi dallo stesso IP…
  perform public.login_attempt_begin('CRD-021', '10.0.2.2', 5, 3, 15);
  perform public.login_attempt_begin('CRD-022', '10.0.2.2', 5, 3, 15);
  g := public.login_attempt_begin('CRD-020', '10.0.2.2', 5, 3, 15);
  update public.login_attempts set success = true where id = (g ->> 'attempt_id')::uuid;
  g := public.login_attempt_begin('CRD-023', '10.0.2.2', 5, 3, 15);
  if g ->> 'attempt_id' is null then raise exception 'FALLITO: IP bloccato con soli 2 falliti'; end if;
  g := public.login_attempt_begin('CRD-020', '10.0.2.2', 5, 3, 15);
  if g ->> 'attempt_id' is not null then
    raise exception 'FALLITO: un accesso riuscito con un altro codice ha azzerato i falliti dell''IP';
  end if;
  -- …mentre chi sbaglia e poi entra con lo STESSO codice non pesa sull'IP del negozio.
  perform public.login_attempt_begin('CRD-031', '10.0.3.3', 5, 3, 15);
  perform public.login_attempt_begin('CRD-031', '10.0.3.3', 5, 3, 15);
  g := public.login_attempt_begin('CRD-031', '10.0.3.3', 5, 3, 15);
  update public.login_attempts set success = true where id = (g ->> 'attempt_id')::uuid;
  g := public.login_attempt_begin('CRD-032', '10.0.3.3', 5, 3, 15);
  if g ->> 'attempt_id' is null then
    raise exception 'FALLITO: gli errori poi corretti dallo stesso codice bloccano l''IP';
  end if;

  -- I falliti fuori finestra non contano.
  insert into public.login_attempts (employee_code, ip, success, at)
  select 'CRD-040', '10.0.4.4', false, now() - interval '16 minutes' from generate_series(1, 5);
  if public.login_attempt_begin('CRD-040', '10.0.4.4', 5, 20, 15) ->> 'attempt_id' is null then
    raise exception 'FALLITO: contano i tentativi fuori finestra';
  end if;
end;
$$;

-- ---- esecuzioni dei job: stato e tentativi ----
do $$
declare
  r public.cron_runs;
begin
  insert into public.cron_runs (job, run_key) values ('vecchio', 'vecchio:2026-11-25') returning * into r;
  if r.status <> 'done' or r.attempts <> 1 then
    raise exception 'FALLITO: valori predefiniti di cron_runs inattesi (%, %)', r.status, r.attempts;
  end if;
  insert into public.cron_runs (job, run_key, status) values ('nuovo', 'nuovo:2026-11-26', 'running');
  begin
    insert into public.cron_runs (job, run_key, status) values ('x', 'x:1', 'boh');
    raise exception 'FALLITO: stato non previsto accettato';
  exception when check_violation then null;
  end;
end;
$$;
reset role;

rollback;
