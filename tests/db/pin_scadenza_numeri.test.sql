-- Numeri del giorno solo sulle voci del proprio foglio; pin_issued_at non modificabile da sé.

begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000006a1'),
  ('00000000-0000-0000-0000-0000000006e1'),
  ('00000000-0000-0000-0000-0000000006e2');
insert into public.profiles
  (id, first_name, last_name, display_name, employee_code, role, home_zone, must_change_pin, privacy_accepted_at)
values
  ('00000000-0000-0000-0000-0000000006a1', 'Ada', 'Admin', 'Ada N', 'TST-N01', 'admin', 'vista', false, now()),
  ('00000000-0000-0000-0000-0000000006e1', 'Vera', 'Vista', 'Vera N', 'TST-N02', 'employee', 'vista', false, now()),
  ('00000000-0000-0000-0000-0000000006e2', 'Sara', 'Sole', 'Sara N', 'TST-N03', 'employee', 'sole', false, now());

-- Tre voci: una del gruppo Vista, una del gruppo Sole, una fuori da ogni gruppo.
insert into public.kpi_definitions (id, code, label) values
  ('00000000-0000-0000-0000-000000006b01', 'TST_VISTA', 'Voce Vista di prova'),
  ('00000000-0000-0000-0000-000000006b02', 'TST_SOLE', 'Voce Sole di prova'),
  ('00000000-0000-0000-0000-000000006b03', 'TST_ALTRA', 'Voce senza gruppo');
insert into public.kpi_set_items (set_id, kpi_id, sort_order)
select s.id, '00000000-0000-0000-0000-000000006b01', 900 from public.kpi_sets s where s.name = 'Vista';
insert into public.kpi_set_items (set_id, kpi_id, sort_order)
select s.id, '00000000-0000-0000-0000-000000006b02', 900 from public.kpi_sets s where s.name = 'Sole';
-- Obiettivo misto: a Sara, questa settimana, anche la voce Vista.
insert into public.weekly_targets (profile_id, kpi_id, week_start, target) values
  ('00000000-0000-0000-0000-0000000006e2', '00000000-0000-0000-0000-000000006b01',
   date_trunc('week', public.today_rome())::date, 3);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Vera (Vista).
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000006e1', true);
do $$
begin
  insert into public.daily_entries (profile_id, kpi_id, date, value)
  values (auth.uid(), '00000000-0000-0000-0000-000000006b01', public.today_rome(), 2);
  begin
    insert into public.daily_entries (profile_id, kpi_id, date, value)
    values (auth.uid(), '00000000-0000-0000-0000-000000006b02', public.today_rome(), 2);
    raise exception 'FALLITO: numeri su una voce dell''altra area senza obiettivo';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.daily_entries (profile_id, kpi_id, date, value)
    values (auth.uid(), '00000000-0000-0000-0000-000000006b03', public.today_rome(), 2);
    raise exception 'FALLITO: numeri su una voce fuori da ogni foglio';
  exception when insufficient_privilege then null;
  end;
  -- Non si sposta una riga valida su una voce non propria.
  begin
    update public.daily_entries set kpi_id = '00000000-0000-0000-0000-000000006b03'
     where profile_id = auth.uid() and kpi_id = '00000000-0000-0000-0000-000000006b01';
    raise exception 'FALLITO: riga spostata su una voce non propria';
  exception when insufficient_privilege then null;
  end;
  update public.daily_entries set value = 5
   where profile_id = auth.uid() and kpi_id = '00000000-0000-0000-0000-000000006b01';

  -- La scadenza del PIN non la cambia l'interessato.
  begin
    update public.profiles set pin_issued_at = now() where id = auth.uid();
    raise exception 'FALLITO: pin_issued_at modificato dal dipendente';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- Sara (Sole): la sua voce e quella dell'obiettivo misto.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000006e2', true);
do $$
begin
  insert into public.daily_entries (profile_id, kpi_id, date, value)
  values (auth.uid(), '00000000-0000-0000-0000-000000006b02', public.today_rome(), 1),
         (auth.uid(), '00000000-0000-0000-0000-000000006b01', public.today_rome(), 1);
end;
$$;

-- Con voci personalizzate vale solo l'elenco personale (più gli obiettivi della settimana).
reset role;
insert into public.profile_kpis (profile_id, kpi_id, sort_order) values
  ('00000000-0000-0000-0000-0000000006e1', '00000000-0000-0000-0000-000000006b03', 1);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000006e1', true);
do $$
begin
  insert into public.daily_entries (profile_id, kpi_id, date, value)
  values (auth.uid(), '00000000-0000-0000-0000-000000006b03', public.today_rome(), 4);
  begin
    insert into public.daily_entries (profile_id, kpi_id, date, value)
    values (auth.uid(), '00000000-0000-0000-0000-000000006b01', public.today_rome() - 1, 4);
    raise exception 'FALLITO: voce del gruppo usata da chi ha un elenco personale';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- L'admin può correggere qualunque voce.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000006a1', true);
insert into public.daily_entries (profile_id, kpi_id, date, value)
values ('00000000-0000-0000-0000-0000000006e2', '00000000-0000-0000-0000-000000006b03', public.today_rome(), 9);

rollback;
