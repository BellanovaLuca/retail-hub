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

rollback;
