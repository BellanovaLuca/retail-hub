-- Correzioni dell'area admin (migrazione 20261126010000_admin_fixes):
-- note riservate in una tabella solo admin, sostituzione atomica dei turni di una giornata,
-- turni futuri tolti alla disattivazione, set di regole predefinito, guardia sullo stato delle
-- richieste.

begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000001a0'),
  ('00000000-0000-0000-0000-0000000001e1'),
  ('00000000-0000-0000-0000-0000000001e2');

insert into public.profiles (id, first_name, last_name, display_name, employee_code, role) values
  ('00000000-0000-0000-0000-0000000001a0', 'Ada', 'Admin', 'Ada', 'ADM-101', 'admin'),
  ('00000000-0000-0000-0000-0000000001e1', 'Elia', 'Uno', 'Elia', 'CRD-101', 'employee'),
  ('00000000-0000-0000-0000-0000000001e2', 'Emma', 'Due', 'Emma', 'CRD-102', 'employee');

-- Dati preparati come service role (nessun utente).
insert into public.profile_admin_notes (profile_id, notes) values
  ('00000000-0000-0000-0000-0000000001e1', 'nota riservata su Elia');

insert into public.shift_templates (id, code, label, start_time, end_time, break_minutes, is_absence) values
  ('00000000-0000-0000-0000-000000001701', 'ZZ', 'Turno di prova', '10:00', '19:00', 60, false);

-- Settimana passata (pubblicata), settimana "di oggi" 2027-03-01 (pubblicata), settimana futura (bozza).
insert into public.schedule_weeks (id, week_start, status, published_shifts) values
  ('00000000-0000-0000-0000-000000001b01', '2027-02-22', 'published',
   '[{"id": "00000000-0000-0000-0000-000000001c01", "profile_id": "00000000-0000-0000-0000-0000000001e1",
      "date": "2027-02-24", "start_time": "10:00", "end_time": "14:00", "break_minutes": 0,
      "is_absence": false, "is_back_office": false, "changed": false}]'),
  ('00000000-0000-0000-0000-000000001b02', '2027-03-01', 'published',
   '[{"id": "00000000-0000-0000-0000-000000001c02", "profile_id": "00000000-0000-0000-0000-0000000001e1",
      "date": "2027-03-02", "start_time": "10:00", "end_time": "14:00", "break_minutes": 0,
      "is_absence": false, "is_back_office": false, "changed": false},
     {"id": "00000000-0000-0000-0000-000000001c03", "profile_id": "00000000-0000-0000-0000-0000000001e1",
      "date": "2027-03-05", "start_time": "10:00", "end_time": "14:00", "break_minutes": 0,
      "is_absence": false, "is_back_office": false, "changed": false},
     {"id": "00000000-0000-0000-0000-000000001c04", "profile_id": "00000000-0000-0000-0000-0000000001e2",
      "date": "2027-03-05", "start_time": "15:00", "end_time": "20:00", "break_minutes": 0,
      "is_absence": false, "is_back_office": false, "changed": false}]'),
  ('00000000-0000-0000-0000-000000001b03', '2027-03-08', 'draft', '[]');

insert into public.shifts (id, week_id, profile_id, date, start_time, end_time, break_minutes, note) values
  ('00000000-0000-0000-0000-000000001c01', '00000000-0000-0000-0000-000000001b01', '00000000-0000-0000-0000-0000000001e1', '2027-02-24', '10:00', '14:00', 0, null),
  ('00000000-0000-0000-0000-000000001c02', '00000000-0000-0000-0000-000000001b02', '00000000-0000-0000-0000-0000000001e1', '2027-03-02', '10:00', '14:00', 0, null),
  ('00000000-0000-0000-0000-000000001c03', '00000000-0000-0000-0000-000000001b02', '00000000-0000-0000-0000-0000000001e1', '2027-03-05', '10:00', '14:00', 30, 'inventario'),
  ('00000000-0000-0000-0000-000000001c04', '00000000-0000-0000-0000-000000001b02', '00000000-0000-0000-0000-0000000001e2', '2027-03-05', '15:00', '20:00', 0, null),
  ('00000000-0000-0000-0000-000000001c05', '00000000-0000-0000-0000-000000001b03', '00000000-0000-0000-0000-0000000001e1', '2027-03-09', '10:00', '19:00', 60, null);

-- Emma è in ferie (giornata intera) il 4 marzo e ha un permesso di 2 ore il 6.
insert into public.leaves (profile_id, date, type, hours) values
  ('00000000-0000-0000-0000-0000000001e2', '2027-03-04', 'ferie', null),
  ('00000000-0000-0000-0000-0000000001e2', '2027-03-06', 'permesso', 2);

insert into public.planning_rule_sets (id, name, is_default) values
  ('00000000-0000-0000-0000-000000001d01', 'Set di prova A', false),
  ('00000000-0000-0000-0000-000000001d02', 'Set di prova B', false);
update public.planning_rule_sets set is_default = false where is_default;
update public.planning_rule_sets set is_default = true where id = '00000000-0000-0000-0000-000000001d01';

insert into public.requests (id, profile_id, type, start_date, end_date) values
  ('00000000-0000-0000-0000-000000001f01', '00000000-0000-0000-0000-0000000001e1', 'ferie', '2027-04-05', '2027-04-06');

-- La colonna sul profilo non esiste più.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles' and column_name = 'admin_notes'
  ) then
    raise exception 'FALLITO: profiles.admin_notes esiste ancora';
  end if;
end;
$$;

-- ---- dipendente e1 ---------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000001e1', true);

do $$
declare
  n int;
  refused boolean;
begin
  -- Note riservate: il dipendente non legge né scrive quelle su di sé.
  select count(*) into n from public.profile_admin_notes;
  if n <> 0 then raise exception 'FALLITO: il dipendente legge le note riservate su di sé'; end if;
  if (select to_jsonb(p) ? 'admin_notes' from public.profiles p where p.id = auth.uid()) then
    raise exception 'FALLITO: il profilo espone ancora admin_notes';
  end if;
  refused := false;
  begin
    insert into public.profile_admin_notes (profile_id, notes) values (auth.uid(), 'me la scrivo da solo')
      on conflict (profile_id) do update set notes = excluded.notes;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'FALLITO: il dipendente scrive le note riservate'; end if;
  update public.profile_admin_notes set notes = 'cambiata';
  delete from public.profile_admin_notes;

  -- Le RPC dell'area admin rifiutano chi non è admin.
  refused := false;
  begin
    perform public.replace_shift_days('00000000-0000-0000-0000-000000001b02',
      '[{"profile_id": "00000000-0000-0000-0000-0000000001e1", "date": "2027-03-02"}]', '[]');
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'FALLITO: un dipendente usa replace_shift_days'; end if;

  refused := false;
  begin
    perform public.remove_future_shifts('00000000-0000-0000-0000-0000000001e2', '2027-03-01');
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'FALLITO: un dipendente usa remove_future_shifts'; end if;

  refused := false;
  begin
    perform public.set_default_rule_set('00000000-0000-0000-0000-000000001d02');
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'FALLITO: un dipendente usa set_default_rule_set'; end if;
end;
$$;

-- Il dipendente annulla la propria richiesta (serve più sotto per la guardia sullo stato).
select public.cancel_request('00000000-0000-0000-0000-000000001f01');

-- ---- admin -------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000001a0', true);

do $$
declare
  n int;
  failed boolean;
  r record;
begin
  -- Le note sono rimaste intatte (update/delete del dipendente non hanno toccato righe) e l'admin le legge.
  select count(*) into n from public.profile_admin_notes where notes = 'nota riservata su Elia';
  if n <> 1 then raise exception 'FALLITO: l''admin non legge le note riservate (o sono state alterate)'; end if;

  -- Decisione con guardia sullo stato (come decideRequests): una richiesta annullata non si approva.
  update public.requests set status = 'approved', decided_by = auth.uid(), decided_at = now()
   where id = '00000000-0000-0000-0000-000000001f01' and status = 'pending';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLITO: la richiesta annullata è stata approvata'; end if;
  if exists (select 1 from public.leaves where request_id = '00000000-0000-0000-0000-000000001f01') then
    raise exception 'FALLITO: una richiesta annullata ha creato ferie';
  end if;

  -- replace_shift_days: giorno fuori dalla settimana → errore e nessuna modifica.
  failed := false;
  begin
    perform public.replace_shift_days('00000000-0000-0000-0000-000000001b02',
      '[{"profile_id": "00000000-0000-0000-0000-0000000001e1", "date": "2027-03-05"},
        {"profile_id": "00000000-0000-0000-0000-0000000001e1", "date": "2027-03-09"}]', '[]');
  exception when others then failed := true;
  end;
  if not failed then raise exception 'FALLITO: replace_shift_days accetta un giorno fuori dalla settimana'; end if;

  -- Inserimento che fallisce (turno rapido inesistente): la cancellazione viene annullata con lui.
  failed := false;
  begin
    perform public.replace_shift_days('00000000-0000-0000-0000-000000001b02',
      '[{"profile_id": "00000000-0000-0000-0000-0000000001e1", "date": "2027-03-05"}]',
      '[{"profile_id": "00000000-0000-0000-0000-0000000001e1", "date": "2027-03-05",
         "template_id": "00000000-0000-0000-0000-00000000dead", "start_time": "09:00", "end_time": "13:00"}]');
  exception when others then failed := true;
  end;
  if not failed then raise exception 'FALLITO: replace_shift_days ha accettato un turno rapido inesistente'; end if;
  select * into r from public.shifts
   where profile_id = '00000000-0000-0000-0000-0000000001e1' and date = '2027-03-05';
  if r.id is null or r.start_time <> '10:00' or r.break_minutes <> 30 or r.note <> 'inventario' then
    raise exception 'FALLITO: un salvataggio non riuscito ha fatto perdere il turno che c''era';
  end if;

  -- Righe per una giornata non dichiarata tra quelle da riscrivere → errore.
  failed := false;
  begin
    perform public.replace_shift_days('00000000-0000-0000-0000-000000001b02',
      '[{"profile_id": "00000000-0000-0000-0000-0000000001e1", "date": "2027-03-05"}]',
      '[{"profile_id": "00000000-0000-0000-0000-0000000001e2", "date": "2027-03-05",
         "start_time": "09:00", "end_time": "13:00"}]');
  exception when others then failed := true;
  end;
  if not failed then raise exception 'FALLITO: replace_shift_days scrive una giornata non dichiarata'; end if;

  -- Sostituzione riuscita: più giornate insieme, spezzato, conflitto con le ferie a giornata intera.
  n := public.replace_shift_days('00000000-0000-0000-0000-000000001b02',
    '[{"profile_id": "00000000-0000-0000-0000-0000000001e1", "date": "2027-03-05"},
      {"profile_id": "00000000-0000-0000-0000-0000000001e2", "date": "2027-03-04"},
      {"profile_id": "00000000-0000-0000-0000-0000000001e2", "date": "2027-03-05"},
      {"profile_id": "00000000-0000-0000-0000-0000000001e2", "date": "2027-03-06"}]',
    '[{"profile_id": "00000000-0000-0000-0000-0000000001e1", "date": "2027-03-05",
       "start_time": "10:00", "end_time": "13:00", "break_minutes": 0, "zone": "vista"},
      {"profile_id": "00000000-0000-0000-0000-0000000001e1", "date": "2027-03-05",
       "start_time": "14:00", "end_time": "19:00", "break_minutes": 30, "zone": "vista", "note": "pomeriggio"},
      {"profile_id": "00000000-0000-0000-0000-0000000001e2", "date": "2027-03-04",
       "template_id": "00000000-0000-0000-0000-000000001701", "start_time": "10:00", "end_time": "19:00", "break_minutes": 60},
      {"profile_id": "00000000-0000-0000-0000-0000000001e2", "date": "2027-03-06",
       "start_time": "10:00", "end_time": "19:00"}]');
  if n <> 4 then raise exception 'FALLITO: replace_shift_days ha inserito % righe (attese 4)', n; end if;
  select count(*) into n from public.shifts
   where profile_id = '00000000-0000-0000-0000-0000000001e1' and date = '2027-03-05';
  if n <> 2 then raise exception 'FALLITO: lo spezzato di Elia ha % pezzi (attesi 2)', n; end if;
  if not exists (
    select 1 from public.shifts
     where profile_id = '00000000-0000-0000-0000-0000000001e1' and date = '2027-03-05'
       and start_time = '14:00' and break_minutes = 30 and note = 'pomeriggio' and zone = 'vista'
       and week_id = '00000000-0000-0000-0000-000000001b02'
  ) then
    raise exception 'FALLITO: il pezzo del pomeriggio non ha pausa, nota, area o settimana giusti';
  end if;
  -- Giornata svuotata (dichiarata ma senza righe).
  if exists (select 1 from public.shifts where profile_id = '00000000-0000-0000-0000-0000000001e2' and date = '2027-03-05') then
    raise exception 'FALLITO: la giornata da svuotare ha ancora turni';
  end if;
  -- Ferie a giornata intera → conflitto; permesso a ore → nessun conflitto.
  if not (select conflict from public.shifts where profile_id = '00000000-0000-0000-0000-0000000001e2' and date = '2027-03-04') then
    raise exception 'FALLITO: turno in un giorno di ferie non segnalato come conflitto';
  end if;
  if (select conflict from public.shifts where profile_id = '00000000-0000-0000-0000-0000000001e2' and date = '2027-03-06') then
    raise exception 'FALLITO: un permesso di qualche ora segnala il conflitto';
  end if;

  -- remove_future_shifts ("oggi" = 3 marzo): via i turni di Elia dal 3 in poi, anche dagli orari pubblicati.
  r := null;
  select (j ->> 'shifts')::int as shifts, (j ->> 'weeks')::int as weeks into r
    from public.remove_future_shifts('00000000-0000-0000-0000-0000000001e1', '2027-03-03') as j;
  if r.shifts <> 3 or r.weeks <> 1 then
    raise exception 'FALLITO: remove_future_shifts ha tolto % turni in % settimane (attesi 3 e 1)', r.shifts, r.weeks;
  end if;
  select count(*) into n from public.shifts where profile_id = '00000000-0000-0000-0000-0000000001e1';
  if n <> 2 then raise exception 'FALLITO: a Elia restano % turni (attesi i 2 già passati)', n; end if;
  if exists (select 1 from public.shifts where profile_id = '00000000-0000-0000-0000-0000000001e1' and date >= '2027-03-03') then
    raise exception 'FALLITO: restano turni futuri della persona disattivata';
  end if;
  -- Istantanee: la settimana passata resta com'era; in quella in corso resta solo il giorno già passato.
  select jsonb_array_length(published_shifts) into n from public.schedule_weeks where id = '00000000-0000-0000-0000-000000001b01';
  if n <> 1 then raise exception 'FALLITO: toccata l''istantanea di una settimana passata'; end if;
  if exists (
    select 1 from public.schedule_weeks w, jsonb_array_elements(w.published_shifts) e
     where e ->> 'profile_id' = '00000000-0000-0000-0000-0000000001e1' and (e ->> 'date')::date >= '2027-03-03'
  ) then
    raise exception 'FALLITO: la persona disattivata è ancora negli orari pubblicati futuri';
  end if;
  select jsonb_array_length(published_shifts) into n from public.schedule_weeks where id = '00000000-0000-0000-0000-000000001b02';
  if n <> 2 then raise exception 'FALLITO: l''istantanea in corso ha % turni (attesi 2: Elia il 2 marzo, Emma il 5)', n; end if;
  -- I turni dei colleghi non si toccano.
  select count(*) into n from public.shifts where profile_id = '00000000-0000-0000-0000-0000000001e2';
  if n <> 2 then raise exception 'FALLITO: remove_future_shifts ha toccato i turni di un collega'; end if;
  -- Ogni turno tolto è nel registro a nome dell'admin.
  select count(*) into n from public.audit_log
   where entity = 'shifts' and action = 'delete' and actor_id = auth.uid()
     and diff ->> 'profile_id' = '00000000-0000-0000-0000-0000000001e1'
     and (diff ->> 'date')::date >= '2027-03-03';
  if n < 3 then raise exception 'FALLITO: i turni tolti alla disattivazione non sono nel registro (% righe)', n; end if;

  -- set_default_rule_set: un set inesistente non lascia il negozio senza predefinito.
  failed := false;
  begin
    perform public.set_default_rule_set('00000000-0000-0000-0000-00000000dead');
  exception when others then failed := true;
  end;
  if not failed then raise exception 'FALLITO: set_default_rule_set accetta un set inesistente'; end if;
  if not (select is_default from public.planning_rule_sets where id = '00000000-0000-0000-0000-000000001d01') then
    raise exception 'FALLITO: dopo un set inesistente non c''è più il predefinito';
  end if;
  perform public.set_default_rule_set('00000000-0000-0000-0000-000000001d02');
  select count(*) into n from public.planning_rule_sets where is_default;
  if n <> 1 or not (select is_default from public.planning_rule_sets where id = '00000000-0000-0000-0000-000000001d02') then
    raise exception 'FALLITO: il set predefinito non è stato spostato (% predefiniti)', n;
  end if;
  -- Richiamata sullo stesso set non fa danni.
  perform public.set_default_rule_set('00000000-0000-0000-0000-000000001d02');

  -- Le note riservate si scrivono dall'admin e finiscono nel registro.
  insert into public.profile_admin_notes (profile_id, notes)
  values ('00000000-0000-0000-0000-0000000001e2', 'nota su Emma');
  if not exists (
    select 1 from public.audit_log
     where entity = 'profile_admin_notes' and action = 'insert'
       and entity_id = '00000000-0000-0000-0000-0000000001e2' and actor_id = auth.uid()
  ) then
    raise exception 'FALLITO: la nota riservata non è nel registro';
  end if;
end;
$$;

-- ---- anonimo: niente note, niente RPC ---------------------------------------
set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);
do $$
declare
  refused boolean := false;
begin
  begin
    perform 1 from public.profile_admin_notes;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'FALLITO: anon può interrogare profile_admin_notes'; end if;
  refused := false;
  begin
    perform public.set_default_rule_set('00000000-0000-0000-0000-000000001d01');
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'FALLITO: anon può chiamare set_default_rule_set'; end if;
end;
$$;

reset role;
rollback;
