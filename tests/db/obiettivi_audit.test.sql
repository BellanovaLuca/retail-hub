-- Audit obiettivi/responsabilità (migrazione 20261129050000):
--  - remove_from_responsibilities: alla disattivazione la persona esce dalle assegnazioni dalla
--    settimana indicata in poi (le settimane passate restano com'erano);
--  - store_weekly_assigned: somma degli obiettivi per voce, senza dati per persona.

begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000005a1'),
  ('00000000-0000-0000-0000-0000000005e1'),
  ('00000000-0000-0000-0000-0000000005e2');
insert into public.profiles
  (id, first_name, last_name, display_name, employee_code, role, must_change_pin, privacy_accepted_at)
values
  ('00000000-0000-0000-0000-0000000005a1', 'Ada', 'Admin', 'Ada O', 'TST-O01', 'admin', false, now()),
  ('00000000-0000-0000-0000-0000000005e1', 'Elio', 'Uno', 'Elio O', 'TST-O02', 'employee', false, now()),
  ('00000000-0000-0000-0000-0000000005e2', 'Lia', 'Due', 'Lia O', 'TST-O03', 'employee', false, now());
-- Utenti di prova con il primo accesso completato (lo richiede is_staff()).
update public.profiles set must_change_pin = false, privacy_accepted_at = coalesce(privacy_accepted_at, now())
 where must_change_pin or privacy_accepted_at is null;

insert into public.responsibilities (id, title) values
  ('00000000-0000-0000-0000-000000005f01', 'Vetrine audit'),
  ('00000000-0000-0000-0000-000000005f02', 'Cassa audit'),
  ('00000000-0000-0000-0000-000000005f03', 'Scheda audit');
insert into public.responsibility_week_assignments
  (responsibility_id, week_start, profile_ids, person_days) values
  -- In vigore il 23/11, ripresa dal 2/11: Elio lun–mer, Lia gio.
  ('00000000-0000-0000-0000-000000005f01', '2026-11-02',
   '{00000000-0000-0000-0000-0000000005e1,00000000-0000-0000-0000-0000000005e2}',
   '{"00000000-0000-0000-0000-0000000005e1": [1, 2, 3], "00000000-0000-0000-0000-0000000005e2": [4]}'),
  -- Settimana futura già preparata, solo Elio.
  ('00000000-0000-0000-0000-000000005f01', '2026-12-07',
   '{00000000-0000-0000-0000-0000000005e1}',
   '{"00000000-0000-0000-0000-0000000005e1": [1]}'),
  -- Riga della settimana stessa.
  ('00000000-0000-0000-0000-000000005f02', '2026-11-23',
   '{00000000-0000-0000-0000-0000000005e1}',
   '{"00000000-0000-0000-0000-0000000005e1": [5]}');
insert into public.responsibility_assignees (responsibility_id, profile_id, role, sort_order) values
  ('00000000-0000-0000-0000-000000005f03', '00000000-0000-0000-0000-0000000005e1', 'owner', 0),
  ('00000000-0000-0000-0000-000000005f03', '00000000-0000-0000-0000-0000000005e2', 'support', 1);

insert into public.kpi_definitions (id, code, label) values
  ('00000000-0000-0000-0000-000000005c01', 'TST_AUDIT_A', 'Voce audit A'),
  ('00000000-0000-0000-0000-000000005c02', 'TST_AUDIT_B', 'Voce audit B');
insert into public.weekly_targets (profile_id, week_start, kpi_id, target) values
  ('00000000-0000-0000-0000-0000000005e1', '2026-11-23', '00000000-0000-0000-0000-000000005c01', 3),
  ('00000000-0000-0000-0000-0000000005e2', '2026-11-23', '00000000-0000-0000-0000-000000005c01', 4.5),
  ('00000000-0000-0000-0000-0000000005e2', '2026-11-23', '00000000-0000-0000-0000-000000005c02', 2),
  ('00000000-0000-0000-0000-0000000005e2', '2026-11-30', '00000000-0000-0000-0000-000000005c02', 9);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Un dipendente: non può togliere nessuno dalle responsabilità; legge solo le somme.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000005e1', true);
do $$
declare
  j jsonb;
begin
  begin
    perform public.remove_from_responsibilities('00000000-0000-0000-0000-0000000005e2', '2026-11-23');
    raise exception 'FALLITO: un dipendente ha tolto un collega dalle responsabilità';
  exception when insufficient_privilege then null;
  end;

  j := public.store_weekly_assigned('2026-11-23');
  if not (j ? '00000000-0000-0000-0000-000000005c01' and j ? '00000000-0000-0000-0000-000000005c02') then
    raise exception 'FALLITO: attese le due voci con obiettivi assegnati: %', j;
  end if;
  if (j ->> '00000000-0000-0000-0000-000000005c01')::numeric <> 7.5
     or (j ->> '00000000-0000-0000-0000-000000005c02')::numeric <> 2 then
    raise exception 'FALLITO: somme inattese (attese 7,5 e 2): %', j;
  end if;
  -- Gli obiettivi dei colleghi restano illeggibili: solo i propri.
  if (select count(*) from public.weekly_targets
       where profile_id = '00000000-0000-0000-0000-0000000005e2') <> 0 then
    raise exception 'FALLITO: un dipendente legge gli obiettivi di un collega';
  end if;
end;
$$;

-- Senza un profilo attivo la somma non esce.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000005ff', true);
do $$
begin
  if public.store_weekly_assigned('2026-11-23') <> '{}'::jsonb then
    raise exception 'FALLITO: somme degli obiettivi visibili senza profilo';
  end if;
end;
$$;

-- L'admin toglie Elio dalla settimana del 23/11 in poi.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000005a1', true);
do $$
declare
  r record;
  j jsonb;
begin
  begin
    perform public.remove_from_responsibilities('00000000-0000-0000-0000-0000000005e1', '2026-11-24');
    raise exception 'FALLITO: accettata una data che non è un lunedì';
  exception when invalid_parameter_value then null;
  end;

  j := public.remove_from_responsibilities('00000000-0000-0000-0000-0000000005e1', '2026-11-23');
  if (j ->> 'weeks')::int <> 3 or (j ->> 'cards')::int <> 1 then
    raise exception 'FALLITO: esito inatteso %', j;
  end if;

  -- La riga passata resta com'era (storico).
  select * into r from public.responsibility_week_assignments
   where responsibility_id = '00000000-0000-0000-0000-000000005f01' and week_start = '2026-11-02';
  if not ('00000000-0000-0000-0000-0000000005e1' = any (r.profile_ids))
     or not (r.person_days ? '00000000-0000-0000-0000-0000000005e1') then
    raise exception 'FALLITO: la settimana passata è stata modificata';
  end if;

  -- Per la settimana del 23 nasce una riga senza Elio, con Lia e i suoi giorni.
  select * into r from public.responsibility_week_assignments
   where responsibility_id = '00000000-0000-0000-0000-000000005f01' and week_start = '2026-11-23';
  if r.profile_ids <> '{00000000-0000-0000-0000-0000000005e2}'::uuid[]
     or r.person_days <> '{"00000000-0000-0000-0000-0000000005e2": [4]}'::jsonb then
    raise exception 'FALLITO: riga della settimana corrente = % / %', r.profile_ids, r.person_days;
  end if;

  -- Riga della settimana e righe future: ripulite.
  if exists (
    select 1 from public.responsibility_week_assignments w
     where w.week_start >= '2026-11-23'
       and ('00000000-0000-0000-0000-0000000005e1' = any (w.profile_ids)
            or w.person_days ? '00000000-0000-0000-0000-0000000005e1')
  ) then
    raise exception 'FALLITO: la persona è ancora assegnata dalla settimana in poi';
  end if;

  -- Schede: non è più responsabile; il collega resta supporto.
  if exists (select 1 from public.responsibility_assignees
              where profile_id = '00000000-0000-0000-0000-0000000005e1') then
    raise exception 'FALLITO: la persona è ancora nelle schede';
  end if;
  if not exists (select 1 from public.responsibility_assignees
                  where profile_id = '00000000-0000-0000-0000-0000000005e2') then
    raise exception 'FALLITO: tolto anche il collega dalle schede';
  end if;

  -- Ripetere non cambia nulla.
  j := public.remove_from_responsibilities('00000000-0000-0000-0000-0000000005e1', '2026-11-23');
  if (j ->> 'weeks')::int <> 0 or (j ->> 'cards')::int <> 0 then
    raise exception 'FALLITO: la seconda chiamata ha modificato qualcosa: %', j;
  end if;
end;
$$;

rollback;
