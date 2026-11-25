-- Gruppo settimanale in vigore per attività (funzione responsibility_week_teams): una riga per
-- attività, l'ultima assegnazione fino alla settimana richiesta; rispetta la RLS.

begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000001a1'),
  ('00000000-0000-0000-0000-0000000001e1');
insert into public.profiles (id, first_name, last_name, display_name, employee_code, role) values
  ('00000000-0000-0000-0000-0000000001a1', 'Ada', 'Admin', 'Ada T', 'TST-A01', 'admin'),
  ('00000000-0000-0000-0000-0000000001e1', 'Elio', 'Uno', 'Elio T', 'TST-E01', 'employee');

insert into public.responsibilities (id, title) values
  ('00000000-0000-0000-0000-000000001f01', 'Vetrine test'),
  ('00000000-0000-0000-0000-000000001f02', 'Cassa test');
insert into public.responsibility_week_assignments (responsibility_id, week_start, profile_ids) values
  ('00000000-0000-0000-0000-000000001f01', '2026-11-02', '{00000000-0000-0000-0000-0000000001a1}'),
  ('00000000-0000-0000-0000-000000001f01', '2026-11-16', '{00000000-0000-0000-0000-0000000001e1}'),
  ('00000000-0000-0000-0000-000000001f01', '2026-12-07', '{}'),
  ('00000000-0000-0000-0000-000000001f02', '2026-11-23', '{00000000-0000-0000-0000-0000000001e1}');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000001e1', true);

do $$
declare
  j jsonb;
  r jsonb;
begin
  -- Settimana del 9 novembre: vale ancora quella del 2; l'altra attività non ha assegnazioni.
  j := public.responsibility_week_teams('2026-11-09');
  select e into r from jsonb_array_elements(j) e
   where e ->> 'responsibility_id' = '00000000-0000-0000-0000-000000001f01';
  if r ->> 'week_start' <> '2026-11-02' or r -> 'profile_ids' <> '["00000000-0000-0000-0000-0000000001a1"]'::jsonb then
    raise exception 'FALLITO: settimana 9/11 → %', r;
  end if;
  if exists (select 1 from jsonb_array_elements(j) e
              where e ->> 'responsibility_id' = '00000000-0000-0000-0000-000000001f02') then
    raise exception 'FALLITO: assegnazione futura restituita in anticipo';
  end if;

  -- Settimana del 23: una riga per attività, ciascuna con l'ultima assegnazione.
  j := public.responsibility_week_teams('2026-11-23');
  if (select count(*) from jsonb_array_elements(j) e
       where e ->> 'responsibility_id' like '00000000-0000-0000-0000-000000001f0%') <> 2 then
    raise exception 'FALLITO: attese 2 righe, una per attività: %', j;
  end if;
  select e into r from jsonb_array_elements(j) e
   where e ->> 'responsibility_id' = '00000000-0000-0000-0000-000000001f01';
  if r ->> 'week_start' <> '2026-11-16' then
    raise exception 'FALLITO: settimana 23/11 → %', r;
  end if;

  -- Un'assegnazione vuota (nessuno) è una scelta esplicita e vale.
  j := public.responsibility_week_teams('2026-12-14');
  select e into r from jsonb_array_elements(j) e
   where e ->> 'responsibility_id' = '00000000-0000-0000-0000-000000001f01';
  if r -> 'profile_ids' <> '[]'::jsonb then
    raise exception 'FALLITO: assegnazione vuota non rispettata: %', r;
  end if;
end;
$$;

-- Giorni per persona (person_days): si spunta solo nei propri giorni.
reset role;
insert into public.responsibilities (id, title, schedule_days) values
  ('00000000-0000-0000-0000-000000001f03', 'Giorni test', '{1,2,3,4,5,6}');
insert into public.responsibility_week_assignments
  (responsibility_id, week_start, profile_ids, person_days) values
  -- Elio solo lunedì e mercoledì (2026-11-23 è lunedì).
  ('00000000-0000-0000-0000-000000001f03', '2026-11-23',
   '{00000000-0000-0000-0000-0000000001e1}',
   '{"00000000-0000-0000-0000-0000000001e1": [1, 3]}'),
  -- Dalla settimana dopo: assegnato senza giorni indicati (righe vecchie) → giorni dell'attività.
  ('00000000-0000-0000-0000-000000001f03', '2026-11-30',
   '{00000000-0000-0000-0000-0000000001e1}', '{}');

do $$
declare
  elio constant uuid := '00000000-0000-0000-0000-0000000001e1';
  ada constant uuid := '00000000-0000-0000-0000-0000000001a1';
  resp constant uuid := '00000000-0000-0000-0000-000000001f03';
  j jsonb;
begin
  if not public.is_responsibility_assignee_on(resp, elio, '2026-11-23') then
    raise exception 'FALLITO: lunedì è un giorno di Elio';
  end if;
  if public.is_responsibility_assignee_on(resp, elio, '2026-11-24') then
    raise exception 'FALLITO: martedì non è un giorno di Elio';
  end if;
  if not public.is_responsibility_assignee_on(resp, elio, '2026-11-25') then
    raise exception 'FALLITO: mercoledì è un giorno di Elio';
  end if;
  if public.is_responsibility_assignee_on(resp, ada, '2026-11-23') then
    raise exception 'FALLITO: Ada non è assegnata';
  end if;
  -- Settimana seguente, senza giorni indicati: valgono i giorni dell'attività (lun–sab).
  if not public.is_responsibility_assignee_on(resp, elio, '2026-12-01') then
    raise exception 'FALLITO: senza giorni indicati valgono quelli dell''attività';
  end if;
  if public.is_responsibility_assignee_on(resp, elio, '2026-12-06') then
    raise exception 'FALLITO: la domenica non è prevista dall''attività';
  end if;

  j := public.responsibility_week_teams('2026-11-23');
  if (select e -> 'person_days' -> elio::text from jsonb_array_elements(j) e
       where e ->> 'responsibility_id' = resp::text) <> '[1, 3]'::jsonb then
    raise exception 'FALLITO: person_days non restituito: %', j;
  end if;
end;
$$;

-- La forma è controllata: person_days deve essere un oggetto.
do $$
begin
  begin
    update public.responsibility_week_assignments set person_days = '[1]'::jsonb
     where responsibility_id = '00000000-0000-0000-0000-000000001f03';
    raise exception 'FALLITO: person_days accetta un array';
  exception when check_violation then null;
  end;
end;
$$;

-- Eliminando la persona spariscono anche i suoi giorni.
delete from auth.users where id = '00000000-0000-0000-0000-0000000001e1';
do $$
begin
  if exists (select 1 from public.responsibility_week_assignments
              where person_days ? '00000000-0000-0000-0000-0000000001e1'
                 or '00000000-0000-0000-0000-0000000001e1' = any (profile_ids)) then
    raise exception 'FALLITO: la persona eliminata resta nelle assegnazioni';
  end if;
end;
$$;

rollback;
