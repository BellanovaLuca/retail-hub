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
insert into public.schedule_weeks (id, week_start, status) values
  ('00000000-0000-0000-0000-000000000b01', '2026-10-12', 'published'),
  ('00000000-0000-0000-0000-000000000b02', '2026-10-19', 'draft');

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

-- ---- dipendente e1 ---------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);

do $$
declare
  n int;
begin
  -- Turni: solo settimane pubblicate (anche quelli dei colleghi), mai le bozze.
  select count(*) into n from public.shifts;
  if n <> 2 then raise exception 'FALLITO: il dipendente vede % turni (attesi 2 pubblicati)', n; end if;
  select count(*) into n from public.schedule_weeks;
  if n <> 1 then raise exception 'FALLITO: il dipendente vede settimane in bozza'; end if;

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
insert into public.requests (id, profile_id, type, start_date, end_date, shift_id, target_profile_id, target_shift_id)
values ('00000000-0000-0000-0000-000000000d03', '00000000-0000-0000-0000-0000000000e1', 'scambio_turno',
        '2026-10-14', '2026-10-14', '00000000-0000-0000-0000-000000000c01',
        '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-000000000c02');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e2', true);
select public.respond_to_swap('00000000-0000-0000-0000-000000000d03', true);

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
