-- RLS e trigger del dominio (§3, §5, §14): con la sessione di un dipendente
-- non si leggono dati riservati altrui né turni in bozza; le richieste
-- approvate producono ferie e scambi.

begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-0000000000e1'),
  ('00000000-0000-0000-0000-0000000000e2');

insert into public.profiles (id, first_name, last_name, display_name, employee_code, role) values
  ('00000000-0000-0000-0000-00000000000a', 'Anna', 'Admin', 'Anna', 'ADM-001', 'admin'),
  ('00000000-0000-0000-0000-0000000000e1', 'Francesca', 'Uno', 'Francesca', 'CRD-001', 'employee'),
  ('00000000-0000-0000-0000-0000000000e2', 'Francesca', 'Due', 'Francy', 'CRD-002', 'employee');

-- Dati preparati come service role (nessun utente).
insert into public.schedule_weeks (id, week_start, status, published_shifts) values
  ('00000000-0000-0000-0000-000000000b01', '2026-10-12', 'published',
   '[{"id": "00000000-0000-0000-0000-000000000c01", "profile_id": "00000000-0000-0000-0000-0000000000e1",
      "date": "2026-10-14", "start_time": "10:00", "end_time": "14:00", "break_minutes": 0,
      "is_absence": false, "is_back_office": false, "changed": false},
     {"id": "00000000-0000-0000-0000-000000000c04", "profile_id": "00000000-0000-0000-0000-0000000000e2",
      "date": "2026-10-15", "break_minutes": 0, "template_code": "MA", "template_label": "Malattia",
      "note": "visita medica", "is_absence": true, "is_back_office": false, "changed": false}]'),
  ('00000000-0000-0000-0000-000000000b02', '2026-10-19', 'draft',
   '[{"id": "00000000-0000-0000-0000-000000000c03", "profile_id": "00000000-0000-0000-0000-0000000000e1",
      "date": "2026-10-20", "start_time": "10:00", "end_time": "20:00", "break_minutes": 0,
      "is_absence": false, "is_back_office": false, "changed": false}]');

insert into public.shifts (id, week_id, profile_id, date, start_time, end_time) values
  ('00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-0000000000e1', '2026-10-14', '10:00', '14:00'),
  ('00000000-0000-0000-0000-000000000c02', '00000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-0000000000e2', '2026-10-14', '16:00', '20:00'),
  ('00000000-0000-0000-0000-000000000c03', '00000000-0000-0000-0000-000000000b02', '00000000-0000-0000-0000-0000000000e1', '2026-10-20', '10:00', '20:00');

insert into public.leaves (profile_id, date, type) values
  ('00000000-0000-0000-0000-0000000000e2', '2026-10-15', 'malattia'),
  ('00000000-0000-0000-0000-0000000000e2', '2026-10-16', 'ferie');

insert into public.requests (id, profile_id, type, start_date, end_date, message) values
  ('00000000-0000-0000-0000-000000000d02', '00000000-0000-0000-0000-0000000000e2', 'permesso', '2026-10-17', '2026-10-17', 'visita');

insert into public.performance_periods (id, year, label) values
  ('00000000-0000-0000-0000-000000000901', 2099, 'Performance 2099');
insert into public.performance_goals (profile_id, period_id, pillar, slot, title, private_note, published) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000901', 'achievement', 1, 'Lenti progressive', 'nota riservata', true),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000901', 'achievement', 2, 'Bozza', null, false),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-000000000901', 'leadership', 1, 'Altrui', null, true);

insert into public.responsibilities (id, title, schedule_days) values
  ('00000000-0000-0000-0000-000000000f01', 'Montaggi', '{1,2,3,4,5,6,7}'),
  ('00000000-0000-0000-0000-000000000f02', 'Magazzino', '{1,2,3,4,5,6,7}');
insert into public.responsibility_assignees (responsibility_id, profile_id, role) values
  ('00000000-0000-0000-0000-000000000f01', '00000000-0000-0000-0000-0000000000e1', 'owner'),
  ('00000000-0000-0000-0000-000000000f02', '00000000-0000-0000-0000-0000000000e2', 'owner');

insert into public.kpi_definitions (id, code, label) values
  ('00000000-0000-0000-0000-000000000801', 'TEST_KPI', 'Voce di prova');

-- ---- service role (cron e server): le viste pubbliche rispondono senza auth.uid() ----
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);
do $$
declare
  n int;
begin
  select count(*) into n from public.published_shifts;
  if n <> 2 then raise exception 'FALLITO: il service role vede % turni pubblicati (attesi 2)', n; end if;
  select count(*) into n from public.public_profiles;
  if n <> 3 then raise exception 'FALLITO: il service role vede % profili pubblici (attesi 3)', n; end if;
  -- Al service role il dettaglio delle assenze non è mascherato (serve ai promemoria).
  if not exists (select 1 from public.published_shifts where template_label = 'Malattia') then
    raise exception 'FALLITO: il service role non vede il motivo delle assenze';
  end if;
end;
$$;
reset role;

-- ---- utente auth senza profilo: niente viste pubbliche ----
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ff', true);
do $$
declare
  n int;
begin
  select count(*) into n from public.published_shifts;
  if n <> 0 then raise exception 'FALLITO: un utente senza profilo vede % turni pubblicati', n; end if;
  select count(*) into n from public.public_profiles;
  if n <> 0 then raise exception 'FALLITO: un utente senza profilo vede % profili', n; end if;
end;
$$;
reset role;

-- ---- dipendente e1 ---------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);

do $$
declare
  n int;
begin
  -- Turni: la tabella di lavoro è solo admin; si legge l'istantanea pubblicata.
  select count(*) into n from public.shifts;
  if n <> 0 then raise exception 'FALLITO: il dipendente legge la tabella di lavoro dei turni (% righe)', n; end if;
  select count(*) into n from public.published_shifts;
  if n <> 2 then raise exception 'FALLITO: il dipendente vede % turni pubblicati (attesi 2)', n; end if;
  -- L'assenza di un collega appare come "Assente": niente motivo, niente nota.
  if exists (
    select 1 from public.published_shifts
    where profile_id <> auth.uid()
      and (template_label is distinct from 'Assente' or template_code is not null or note is not null)
  ) then
    raise exception 'FALLITO: published_shifts espone il motivo o la nota dell''assenza altrui';
  end if;
  -- L'istantanea grezza resta agli admin; la testata pubblicata è per tutti.
  select count(*) into n from public.schedule_weeks;
  if n <> 0 then raise exception 'FALLITO: il dipendente legge schedule_weeks (% righe)', n; end if;
  select count(*) into n from public.published_weeks;
  if n <> 1 then raise exception 'FALLITO: published_weeks mostra % settimane (attesa 1)', n; end if;

  -- Ferie: tabella completa solo proprie; vista pubblica senza motivo.
  select count(*) into n from public.leaves;
  if n <> 0 then raise exception 'FALLITO: il dipendente legge le assenze altrui'; end if;
  select count(*) into n from public.leaves_public where kind = 'assente';
  if n <> 1 then raise exception 'FALLITO: la malattia altrui non appare come "assente"'; end if;
  if exists (select 1 from public.leaves_public where kind not in ('ferie', 'assente')) then
    raise exception 'FALLITO: leaves_public espone il motivo';
  end if;

  -- Richieste altrui invisibili.
  select count(*) into n from public.requests;
  if n <> 0 then raise exception 'FALLITO: il dipendente legge richieste altrui'; end if;

  -- Una richiesta propria si crea solo "in attesa" e a proprio nome.
  insert into public.requests (profile_id, type, start_date, end_date)
  values (auth.uid(), 'ferie', '2026-11-02', '2026-11-03');
  begin
    insert into public.requests (profile_id, type, start_date, end_date, status)
    values (auth.uid(), 'ferie', '2026-11-09', '2026-11-09', 'approved');
    raise exception 'FALLITO: il dipendente si approva una richiesta';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.requests (profile_id, type, start_date, end_date)
    values ('00000000-0000-0000-0000-0000000000e2', 'ferie', '2026-11-09', '2026-11-09');
    raise exception 'FALLITO: il dipendente crea richieste a nome di altri';
  exception when insufficient_privilege then null;
  end;

  -- Performance: niente tabella, solo la vista delle proprie pubblicate.
  begin
    select count(*) into n from public.performance_goals;
    if n <> 0 then raise exception 'FALLITO: il dipendente legge performance_goals (% righe)', n; end if;
  exception when insufficient_privilege then null;
  end;
  select count(*) into n from public.my_performance_goals;
  if n <> 1 then raise exception 'FALLITO: my_performance_goals mostra % righe (attesa 1)', n; end if;

  -- Responsabilità: spunta solo le proprie, oggi o ieri.
  insert into public.responsibility_checks (responsibility_id, date, done_by)
  values ('00000000-0000-0000-0000-000000000f01', public.today_rome(), auth.uid());
  begin
    insert into public.responsibility_checks (responsibility_id, date, done_by)
    values ('00000000-0000-0000-0000-000000000f02', public.today_rome(), auth.uid());
    raise exception 'FALLITO: spunta su una responsabilità non propria';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.responsibility_checks (responsibility_id, date, done_by)
    values ('00000000-0000-0000-0000-000000000f01', public.today_rome() - 5, auth.uid());
    raise exception 'FALLITO: spunta di 5 giorni fa';
  exception when insufficient_privilege then null;
  end;

  -- Numeri giornalieri: propri, fino a 7 giorni fa, mai nel futuro.
  insert into public.daily_entries (profile_id, date, kpi_id, value)
  values (auth.uid(), public.today_rome(), '00000000-0000-0000-0000-000000000801', 3);
  begin
    insert into public.daily_entries (profile_id, date, kpi_id, value)
    values (auth.uid(), public.today_rome() + 1, '00000000-0000-0000-0000-000000000801', 1);
    raise exception 'FALLITO: numeri per una data futura';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.daily_entries (profile_id, date, kpi_id, value)
    values ('00000000-0000-0000-0000-0000000000e2', public.today_rome(), '00000000-0000-0000-0000-000000000801', 1);
    raise exception 'FALLITO: numeri a nome di un collega';
  exception when insufficient_privilege then null;
  end;

  -- I totali del negozio sono visibili; i numeri per persona altrui no (interruttore spento).
  select count(*) into n from public.store_weekly_totals;
  if n <> 1 then raise exception 'FALLITO: totali negozio non visibili'; end if;
end;
$$;

-- ---- admin: approva il permesso di e2 → righe in leaves -------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);

update public.requests set status = 'approved', decided_by = auth.uid(), decided_at = now()
 where id = '00000000-0000-0000-0000-000000000d02';

do $$
begin
  if not exists (
    select 1 from public.leaves
    where profile_id = '00000000-0000-0000-0000-0000000000e2' and date = '2026-10-17'
      and type = 'permesso' and source = 'request'
  ) then
    raise exception 'FALLITO: il permesso approvato non è finito nel planning';
  end if;
end;
$$;

-- ---- scambio: e1 propone a e2, e2 accetta, admin approva ------------------
insert into public.requests (id, profile_id, type, start_date, end_date, shift_id, target_profile_id, target_shift_id, target_date)
values ('00000000-0000-0000-0000-000000000d03', '00000000-0000-0000-0000-0000000000e1', 'scambio_turno',
        '2026-10-14', '2026-10-14', '00000000-0000-0000-0000-000000000c01',
        '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-000000000c02', '2026-10-14');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e2', true);
select public.respond_to_swap('00000000-0000-0000-0000-000000000d03', true);

do $$
begin
  -- La diretta interessata vede il proprio motivo e la propria nota.
  if not exists (
    select 1 from public.published_shifts
    where profile_id = auth.uid() and template_label = 'Malattia' and note = 'visita medica'
  ) then
    raise exception 'FALLITO: la dipendente non vede il dettaglio della propria assenza';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
update public.requests set status = 'approved' where id = '00000000-0000-0000-0000-000000000d03';

do $$
begin
  if (select profile_id from public.shifts where id = '00000000-0000-0000-0000-000000000c01')
     <> '00000000-0000-0000-0000-0000000000e2'
  or (select profile_id from public.shifts where id = '00000000-0000-0000-0000-000000000c02')
     <> '00000000-0000-0000-0000-0000000000e1' then
    raise exception 'FALLITO: lo scambio approvato non ha scambiato i turni';
  end if;
  if (select count(*) from public.shift_changes) <> 4 then
    raise exception 'FALLITO: lo scambio non ha registrato le modifiche';
  end if;
end;
$$;

rollback;
