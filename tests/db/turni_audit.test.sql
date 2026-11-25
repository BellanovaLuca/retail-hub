-- Turni, ferie e richieste dopo l'audit (migrazione 20261129040000_turni_audit):
-- lo scambio guarda solo i turni con orario (il riposo di chi riceve non lo blocca, un riposo non
-- si «scambia»), l'approvazione di un'assenza non segnala in conflitto le righe di assenza,
-- refresh_shift_conflicts riallinea il conflitto alle assenze, gli avvisi si ignorano per persona.

begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000003a0'),
  ('00000000-0000-0000-0000-0000000003e1'),
  ('00000000-0000-0000-0000-0000000003e2');

insert into public.profiles
  (id, first_name, last_name, display_name, employee_code, role, must_change_pin, privacy_accepted_at)
values
  ('00000000-0000-0000-0000-0000000003a0', 'Ada', 'Admin', 'Ada', 'ADM-301', 'admin', false, now()),
  ('00000000-0000-0000-0000-0000000003e1', 'Anna', 'Uno', 'Anna', 'CRD-301', 'employee', false, now()),
  ('00000000-0000-0000-0000-0000000003e2', 'Bruno', 'Due', 'Bruno', 'CRD-302', 'employee', false, now());

insert into public.shift_templates (id, code, label, is_absence) values
  ('00000000-0000-0000-0000-000000003701', 'ZQ', 'Riposo di prova (audit)', true);

insert into public.schedule_weeks (id, week_start, status) values
  ('00000000-0000-0000-0000-000000003b01', '2027-06-07', 'draft');

insert into public.shifts
  (id, week_id, profile_id, date, template_id, start_time, end_time, conflict)
values
  -- lunedì 7: Anna lavora, Bruno ha il riposo scritto nel foglio
  ('00000000-0000-0000-0000-000000003c01', '00000000-0000-0000-0000-000000003b01',
   '00000000-0000-0000-0000-0000000003e1', '2027-06-07', null, '10:00', '14:00', false),
  ('00000000-0000-0000-0000-000000003c02', '00000000-0000-0000-0000-000000003b01',
   '00000000-0000-0000-0000-0000000003e2', '2027-06-07', '00000000-0000-0000-0000-000000003701', null, null, false),
  -- martedì 8: ad Anna è rimasto solo un riposo (il turno pubblicato non c'è più)
  ('00000000-0000-0000-0000-000000003c03', '00000000-0000-0000-0000-000000003b01',
   '00000000-0000-0000-0000-0000000003e1', '2027-06-08', '00000000-0000-0000-0000-000000003701', null, null, false),
  -- mercoledì 9 turno, giovedì 10 riposo: Anna chiede ferie per i due giorni
  ('00000000-0000-0000-0000-000000003c04', '00000000-0000-0000-0000-000000003b01',
   '00000000-0000-0000-0000-0000000003e1', '2027-06-09', null, '10:00', '19:00', false),
  ('00000000-0000-0000-0000-000000003c05', '00000000-0000-0000-0000-000000003b01',
   '00000000-0000-0000-0000-0000000003e1', '2027-06-10', '00000000-0000-0000-0000-000000003701', null, null, false),
  -- venerdì 11: turno di Bruno (foglio Ferie)
  ('00000000-0000-0000-0000-000000003c06', '00000000-0000-0000-0000-000000003b01',
   '00000000-0000-0000-0000-0000000003e2', '2027-06-11', null, '10:00', '18:00', false),
  -- sabato 12: turno di Anna rimasto segnalato in conflitto, che passa a Bruno
  ('00000000-0000-0000-0000-000000003c07', '00000000-0000-0000-0000-000000003b01',
   '00000000-0000-0000-0000-0000000003e1', '2027-06-12', null, '10:00', '14:00', true);

insert into public.requests (id, profile_id, type, start_date, end_date, target_profile_id, status) values
  ('00000000-0000-0000-0000-000000003f01', '00000000-0000-0000-0000-0000000003e1', 'scambio_turno',
   '2027-06-07', '2027-06-07', '00000000-0000-0000-0000-0000000003e2', 'peer_accepted'),
  ('00000000-0000-0000-0000-000000003f02', '00000000-0000-0000-0000-0000000003e1', 'scambio_turno',
   '2027-06-08', '2027-06-08', '00000000-0000-0000-0000-0000000003e2', 'peer_accepted'),
  ('00000000-0000-0000-0000-000000003f03', '00000000-0000-0000-0000-0000000003e1', 'ferie',
   '2027-06-09', '2027-06-10', null, 'pending'),
  ('00000000-0000-0000-0000-000000003f04', '00000000-0000-0000-0000-0000000003e1', 'scambio_turno',
   '2027-06-12', '2027-06-12', '00000000-0000-0000-0000-0000000003e2', 'peer_accepted');

insert into public.planning_rule_sets (id, name) values
  ('00000000-0000-0000-0000-000000003d01', 'Set di prova (audit)');
insert into public.planning_rules (id, rule_set_id, name, type) values
  ('00000000-0000-0000-0000-000000003d02', '00000000-0000-0000-0000-000000003d01',
   'Ore di contratto (audit)', 'weekly_hours_deviation');

-- ---- dipendente: non riallinea i conflitti ------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000003e1', true);

do $$
declare
  refused boolean := false;
begin
  begin
    perform public.refresh_shift_conflicts(
      '[{"profile_id": "00000000-0000-0000-0000-0000000003e1", "date": "2027-06-09"}]');
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'FALLITO: un dipendente usa refresh_shift_conflicts'; end if;
end;
$$;

-- ---- admin ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000003a0', true);

do $$
declare
  n int;
  failed boolean;
begin
  -- Scambio verso chi ha il riposo scritto nel foglio: si approva, il riposo è sostituito.
  update public.requests set status = 'approved', decided_by = auth.uid(), decided_at = now()
   where id = '00000000-0000-0000-0000-000000003f01' and status = 'peer_accepted';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLITO: lo scambio verso chi ha un riposo non si approva'; end if;
  select count(*) into n from public.shifts
   where profile_id = '00000000-0000-0000-0000-0000000003e1' and date = '2027-06-07';
  if n <> 0 then raise exception 'FALLITO: ad Anna è rimasto qualcosa il giorno del turno ceduto'; end if;
  select count(*) into n from public.shifts
   where profile_id = '00000000-0000-0000-0000-0000000003e2' and date = '2027-06-07';
  if n <> 1 then raise exception 'FALLITO: Bruno ha % righe invece del solo turno ricevuto', n; end if;
  if (select start_time from public.shifts where id = '00000000-0000-0000-0000-000000003c01') <> '10:00'
     or (select profile_id from public.shifts where id = '00000000-0000-0000-0000-000000003c01')
        <> '00000000-0000-0000-0000-0000000003e2' then
    raise exception 'FALLITO: il turno di Anna non è passato a Bruno';
  end if;

  -- Un riposo non è un turno da cedere: lo scambio non si approva e nulla si sposta.
  failed := false;
  begin
    update public.requests set status = 'approved'
     where id = '00000000-0000-0000-0000-000000003f02' and status = 'peer_accepted';
  exception when others then
    if sqlerrm not like 'Turni dello scambio non trovati%' then raise; end if;
    failed := true;
  end;
  if not failed then raise exception 'FALLITO: è stato «scambiato» un riposo'; end if;
  if (select profile_id from public.shifts where id = '00000000-0000-0000-0000-000000003c03')
     <> '00000000-0000-0000-0000-0000000003e1' then
    raise exception 'FALLITO: il riposo di Anna è passato a Bruno';
  end if;

  -- Ferie approvate: in conflitto il turno con orario, non il riposo.
  update public.requests set status = 'approved', decided_by = auth.uid(), decided_at = now()
   where id = '00000000-0000-0000-0000-000000003f03' and status = 'pending';
  select count(*) into n from public.leaves where request_id = '00000000-0000-0000-0000-000000003f03';
  if n <> 2 then raise exception 'FALLITO: attese 2 assenze dalla richiesta, trovate %', n; end if;
  if not (select conflict from public.shifts where id = '00000000-0000-0000-0000-000000003c04') then
    raise exception 'FALLITO: il turno nel giorno di ferie non è segnalato in conflitto';
  end if;
  if (select conflict from public.shifts where id = '00000000-0000-0000-0000-000000003c05') then
    raise exception 'FALLITO: il riposo nel giorno di ferie risulta in conflitto';
  end if;

  -- Il conflitto segue il nuovo titolare: Bruno non ha assenze sabato 12.
  update public.requests set status = 'approved', decided_by = auth.uid(), decided_at = now()
   where id = '00000000-0000-0000-0000-000000003f04' and status = 'peer_accepted';
  if (select conflict from public.shifts where id = '00000000-0000-0000-0000-000000003c07') then
    raise exception 'FALLITO: il turno passato a Bruno è rimasto in conflitto';
  end if;

  -- Foglio Ferie: un'assenza a giornata intera scritta a mano accende il conflitto…
  insert into public.leaves (profile_id, date, type) values
    ('00000000-0000-0000-0000-0000000003e2', '2027-06-11', 'ferie');
  n := public.refresh_shift_conflicts(
    '[{"profile_id": "00000000-0000-0000-0000-0000000003e2", "date": "2027-06-11"},
      {"profile_id": "00000000-0000-0000-0000-0000000003e2", "date": "2027-06-11"}]');
  if n <> 1 or not (select conflict from public.shifts where id = '00000000-0000-0000-0000-000000003c06') then
    raise exception 'FALLITO: il turno sotto le ferie scritte a mano non è in conflitto (%).', n;
  end if;
  -- …un permesso di poche ore lo spegne, e una seconda chiamata non cambia nulla.
  update public.leaves set type = 'permesso', hours = 2
   where profile_id = '00000000-0000-0000-0000-0000000003e2' and date = '2027-06-11';
  n := public.refresh_shift_conflicts(
    '[{"profile_id": "00000000-0000-0000-0000-0000000003e2", "date": "2027-06-11"}]');
  if n <> 1 or (select conflict from public.shifts where id = '00000000-0000-0000-0000-000000003c06') then
    raise exception 'FALLITO: con un permesso a ore il turno è rimasto in conflitto (%).', n;
  end if;
  n := public.refresh_shift_conflicts(
    '[{"profile_id": "00000000-0000-0000-0000-0000000003e2", "date": "2027-06-11"}]');
  if n <> 0 then raise exception 'FALLITO: refresh_shift_conflicts ha riscritto % turni già a posto', n; end if;
  -- Non tocca le giornate non indicate.
  if not (select conflict from public.shifts where id = '00000000-0000-0000-0000-000000003c04') then
    raise exception 'FALLITO: refresh_shift_conflicts ha toccato una giornata non indicata';
  end if;
  failed := false;
  begin
    perform public.refresh_shift_conflicts('{"profile_id": "x"}');
  exception when others then failed := true;
  end;
  if not failed then raise exception 'FALLITO: refresh_shift_conflicts accetta un oggetto'; end if;

  -- Avvisi ignorati per persona: uno per Anna e uno per Bruno sulla stessa regola e settimana.
  insert into public.rule_overrides (week_id, rule_id, date, profile_id, note) values
    ('00000000-0000-0000-0000-000000003b01', '00000000-0000-0000-0000-000000003d02', null,
     '00000000-0000-0000-0000-0000000003e1', 'straordinario concordato'),
    ('00000000-0000-0000-0000-000000003b01', '00000000-0000-0000-0000-000000003d02', null,
     '00000000-0000-0000-0000-0000000003e2', 'part-time provvisorio');
  failed := false;
  begin
    insert into public.rule_overrides (week_id, rule_id, date, profile_id, note) values
      ('00000000-0000-0000-0000-000000003b01', '00000000-0000-0000-0000-000000003d02', null,
       '00000000-0000-0000-0000-0000000003e1', 'doppione');
  exception when unique_violation then failed := true;
  end;
  if not failed then raise exception 'FALLITO: lo stesso avviso ignorato due volte per la stessa persona'; end if;
  -- Senza persona (regole di negozio) resta uno per regola e giorno.
  insert into public.rule_overrides (week_id, rule_id, date, note) values
    ('00000000-0000-0000-0000-000000003b01', '00000000-0000-0000-0000-000000003d02', '2027-06-07', 'inventario');
  failed := false;
  begin
    insert into public.rule_overrides (week_id, rule_id, date, note) values
      ('00000000-0000-0000-0000-000000003b01', '00000000-0000-0000-0000-000000003d02', '2027-06-07', 'doppione');
  exception when unique_violation then failed := true;
  end;
  if not failed then raise exception 'FALLITO: lo stesso avviso di negozio ignorato due volte'; end if;
end;
$$;

-- ---- anonimo ---------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);
do $$
declare
  refused boolean := false;
begin
  begin
    perform public.refresh_shift_conflicts('[]');
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'FALLITO: anon può chiamare refresh_shift_conflicts'; end if;
end;
$$;

reset role;
rollback;
