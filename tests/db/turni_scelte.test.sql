-- Scelte del 29/11/2026 (migrazione 20261130010000_turni_scelte):
-- A. lo scambio accettato dal collega porta la firma degli orari: se il turno cambia dopo
--    l'accettazione l'approvazione è rifiutata, e dopo una nuova accettazione passa;
-- B. leaves_public espone le ore dell'assenza (mai il motivo) e resta di sola lettura; il riposo
--    dei colleghi si vede come «Riposo», le altre assenze restano «Ferie»/«Assente».

begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000004a0'),
  ('00000000-0000-0000-0000-0000000004e1'),
  ('00000000-0000-0000-0000-0000000004e2');

insert into public.profiles
  (id, first_name, last_name, display_name, employee_code, role, must_change_pin, privacy_accepted_at)
values
  ('00000000-0000-0000-0000-0000000004a0', 'Ada', 'Admin', 'Ada S', 'ADM-401', 'admin', false, now()),
  ('00000000-0000-0000-0000-0000000004e1', 'Anna', 'Uno', 'Anna S', 'CRD-401', 'employee', false, now()),
  ('00000000-0000-0000-0000-0000000004e2', 'Bruno', 'Due', 'Bruno S', 'CRD-402', 'employee', false, now());

-- Settimana pubblicata: nell'istantanea Bruno ha un riposo (R), una malattia (MA) con nota e un
-- turno di lavoro.
insert into public.schedule_weeks (id, week_start, status, version, published_shifts) values
  ('00000000-0000-0000-0000-000000004b01', '2027-07-05', 'published', 1, '[
    {"id": "00000000-0000-0000-0000-000000004d01", "profile_id": "00000000-0000-0000-0000-0000000004e2",
     "date": "2027-07-05", "start_time": null, "end_time": null, "break_minutes": 0,
     "template_code": "R", "template_label": "Riposo settimanale", "is_absence": true,
     "zone": null, "is_back_office": false, "department_id": null, "note": "recupero", "changed": false},
    {"id": "00000000-0000-0000-0000-000000004d02", "profile_id": "00000000-0000-0000-0000-0000000004e2",
     "date": "2027-07-06", "start_time": null, "end_time": null, "break_minutes": 0,
     "template_code": "MA", "template_label": "Malattia", "is_absence": true,
     "zone": null, "is_back_office": false, "department_id": null, "note": "certificato", "changed": false},
    {"id": "00000000-0000-0000-0000-000000004d03", "profile_id": "00000000-0000-0000-0000-0000000004e2",
     "date": "2027-07-07", "start_time": "10:00", "end_time": "19:00", "break_minutes": 60,
     "template_code": null, "template_label": null, "is_absence": false,
     "zone": "vista", "is_back_office": false, "department_id": null, "note": null, "changed": false}
  ]'::jsonb);

insert into public.shifts (id, week_id, profile_id, date, start_time, end_time) values
  -- lunedì 5: turno di Anna (scambio a senso unico verso Bruno)
  ('00000000-0000-0000-0000-000000004c01', '00000000-0000-0000-0000-000000004b01',
   '00000000-0000-0000-0000-0000000004e1', '2027-07-05', '10:00', '14:00'),
  -- martedì 6 Anna, mercoledì 7 Bruno (spezzato): scambio dei due turni
  ('00000000-0000-0000-0000-000000004c02', '00000000-0000-0000-0000-000000004b01',
   '00000000-0000-0000-0000-0000000004e1', '2027-07-06', '10:00', '14:00'),
  ('00000000-0000-0000-0000-000000004c03', '00000000-0000-0000-0000-000000004b01',
   '00000000-0000-0000-0000-0000000004e2', '2027-07-07', '14:00', '18:00'),
  ('00000000-0000-0000-0000-000000004c04', '00000000-0000-0000-0000-000000004b01',
   '00000000-0000-0000-0000-0000000004e2', '2027-07-07', '09:00', '13:00'),
  -- giovedì 8: turno di Anna in uno scambio accettato prima che esistesse la firma
  ('00000000-0000-0000-0000-000000004c05', '00000000-0000-0000-0000-000000004b01',
   '00000000-0000-0000-0000-0000000004e1', '2027-07-08', '10:00', '14:00'),
  -- venerdì 9: turno di Anna in uno scambio che Bruno rifiuta
  ('00000000-0000-0000-0000-000000004c06', '00000000-0000-0000-0000-000000004b01',
   '00000000-0000-0000-0000-0000000004e1', '2027-07-09', '10:00', '14:00');

insert into public.requests
  (id, profile_id, type, start_date, end_date, target_profile_id, target_date, status)
values
  ('00000000-0000-0000-0000-000000004f01', '00000000-0000-0000-0000-0000000004e1', 'scambio_turno',
   '2027-07-05', '2027-07-05', '00000000-0000-0000-0000-0000000004e2', null, 'pending'),
  ('00000000-0000-0000-0000-000000004f02', '00000000-0000-0000-0000-0000000004e1', 'scambio_turno',
   '2027-07-06', '2027-07-06', '00000000-0000-0000-0000-0000000004e2', '2027-07-07', 'pending'),
  ('00000000-0000-0000-0000-000000004f03', '00000000-0000-0000-0000-0000000004e1', 'scambio_turno',
   '2027-07-08', '2027-07-08', '00000000-0000-0000-0000-0000000004e2', null, 'peer_accepted'),
  ('00000000-0000-0000-0000-000000004f04', '00000000-0000-0000-0000-0000000004e1', 'scambio_turno',
   '2027-07-09', '2027-07-09', '00000000-0000-0000-0000-0000000004e2', null, 'pending');

-- Assenze di Bruno: un permesso di 2 ore con nota e un giorno intero di ferie.
insert into public.leaves (profile_id, date, type, hours, note) values
  ('00000000-0000-0000-0000-0000000004e2', '2027-07-08', 'permesso', 2, 'visita medica'),
  ('00000000-0000-0000-0000-0000000004e2', '2027-07-10', 'ferie', null, null);

-- ---- Bruno (il collega): accetta e rifiuta ---------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000004e2', true);

do $$
declare
  refused boolean := false;
begin
  perform public.respond_to_swap('00000000-0000-0000-0000-000000004f01', true);
  perform public.respond_to_swap('00000000-0000-0000-0000-000000004f02', true);
  perform public.respond_to_swap('00000000-0000-0000-0000-000000004f04', false);

  if (select swap_signature from public.requests where id = '00000000-0000-0000-0000-000000004f01')
     is distinct from '10:00-14:00|' then
    raise exception 'FALLITO: firma dello scambio a senso unico: %',
      (select swap_signature from public.requests where id = '00000000-0000-0000-0000-000000004f01');
  end if;
  -- I pezzi dello spezzato in ordine d'inizio, qualunque sia l'ordine delle righe.
  if (select swap_signature from public.requests where id = '00000000-0000-0000-0000-000000004f02')
     is distinct from '10:00-14:00|09:00-13:00,14:00-18:00' then
    raise exception 'FALLITO: firma dello scambio dei due turni: %',
      (select swap_signature from public.requests where id = '00000000-0000-0000-0000-000000004f02');
  end if;
  if (select status from public.requests where id = '00000000-0000-0000-0000-000000004f04') <> 'peer_declined'
     or (select swap_signature from public.requests where id = '00000000-0000-0000-0000-000000004f04') is not null then
    raise exception 'FALLITO: uno scambio rifiutato dal collega non deve avere firma';
  end if;

  -- La funzione di calcolo legge i turni di lavoro: non è chiamabile dai dipendenti.
  begin
    perform public.swap_signature('00000000-0000-0000-0000-0000000004e1', '2027-07-05', null, null);
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'FALLITO: un dipendente chiama swap_signature'; end if;
end;
$$;

-- ---- admin: approvazioni ---------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000004a0', true);

do $$
declare
  n int;
  failed boolean;
begin
  -- Il turno di Anna cambia dopo l'accettazione: l'approvazione è rifiutata, nulla si sposta.
  update public.shifts set start_time = '14:00', end_time = '20:00'
   where id = '00000000-0000-0000-0000-000000004c01';
  failed := false;
  begin
    update public.requests set status = 'approved', decided_by = auth.uid(), decided_at = now()
     where id = '00000000-0000-0000-0000-000000004f01' and status = 'peer_accepted';
  exception when others then
    if sqlerrm not like 'Il turno dello scambio è cambiato%' then raise; end if;
    failed := true;
  end;
  if not failed then raise exception 'FALLITO: approvato uno scambio con il turno cambiato'; end if;
  if (select status from public.requests where id = '00000000-0000-0000-0000-000000004f01') <> 'peer_accepted'
     or (select profile_id from public.shifts where id = '00000000-0000-0000-0000-000000004c01')
        <> '00000000-0000-0000-0000-0000000004e1' then
    raise exception 'FALLITO: l''approvazione rifiutata ha lasciato tracce';
  end if;

  -- L'area admin riporta la richiesta in attesa del collega, senza firma.
  update public.requests set status = 'pending', swap_signature = null
   where id = '00000000-0000-0000-0000-000000004f01' and status = 'peer_accepted';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLITO: la richiesta non torna in attesa'; end if;

  -- Firma invariata: lo scambio dei due turni si approva e i turni passano di mano.
  update public.requests set status = 'approved', decided_by = auth.uid(), decided_at = now()
   where id = '00000000-0000-0000-0000-000000004f02' and status = 'peer_accepted';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLITO: lo scambio con la firma invariata non si approva'; end if;
  if (select profile_id from public.shifts where id = '00000000-0000-0000-0000-000000004c02')
       <> '00000000-0000-0000-0000-0000000004e2'
     or (select count(*) from public.shifts
          where profile_id = '00000000-0000-0000-0000-0000000004e1' and date = '2027-07-07') <> 2 then
    raise exception 'FALLITO: i turni dello scambio approvato non sono passati di mano';
  end if;

  -- Accettato prima che esistesse la firma (null): si approva come prima, anche se il turno
  -- nel frattempo è cambiato.
  update public.shifts set end_time = '15:00' where id = '00000000-0000-0000-0000-000000004c05';
  update public.requests set status = 'approved', decided_by = auth.uid(), decided_at = now()
   where id = '00000000-0000-0000-0000-000000004f03' and status = 'peer_accepted';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLITO: lo scambio senza firma non si approva'; end if;
end;
$$;

-- ---- Bruno accetta di nuovo; poi l'admin approva ------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000004e2', true);
select public.respond_to_swap('00000000-0000-0000-0000-000000004f01', true);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000004a0', true);
do $$
declare
  n int;
begin
  if (select swap_signature from public.requests where id = '00000000-0000-0000-0000-000000004f01')
     is distinct from '14:00-20:00|' then
    raise exception 'FALLITO: la nuova accettazione non ha salvato la firma dei nuovi orari';
  end if;
  update public.requests set status = 'approved', decided_by = auth.uid(), decided_at = now()
   where id = '00000000-0000-0000-0000-000000004f01' and status = 'peer_accepted';
  get diagnostics n = row_count;
  if n <> 1 or (select profile_id from public.shifts where id = '00000000-0000-0000-0000-000000004c01')
                 <> '00000000-0000-0000-0000-0000000004e2' then
    raise exception 'FALLITO: dopo la nuova accettazione lo scambio non si approva';
  end if;
end;
$$;

-- ---- Anna (una collega): cosa vede di Bruno ----------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000004e1', true);

do $$
declare
  r record;
begin
  -- Assenza di poche ore: "assente" e le ore, niente altro.
  select kind, hours into r from public.leaves_public
   where profile_id = '00000000-0000-0000-0000-0000000004e2' and date = '2027-07-08';
  if r.kind is distinct from 'assente' or r.hours is distinct from 2 then
    raise exception 'FALLITO: il permesso di 2 ore del collega si vede come % / %', r.kind, r.hours;
  end if;
  select kind, hours into r from public.leaves_public
   where profile_id = '00000000-0000-0000-0000-0000000004e2' and date = '2027-07-10';
  if r.kind is distinct from 'ferie' or r.hours is not null then
    raise exception 'FALLITO: le ferie a giornata intera del collega si vedono come % / %', r.kind, r.hours;
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'leaves_public'
       and column_name in ('type', 'note', 'request_id')
  ) then
    raise exception 'FALLITO: leaves_public espone il motivo dell''assenza';
  end if;
  -- Sola lettura.
  begin
    update public.leaves_public set hours = null where profile_id = '00000000-0000-0000-0000-0000000004e2';
    raise exception 'FALLITO: un dipendente scrive in leaves_public';
  exception when insufficient_privilege then null;
  end;
  if has_table_privilege('authenticated', 'public.published_shifts', 'INSERT, UPDATE, DELETE')
     or has_table_privilege('anon', 'public.published_shifts', 'SELECT') then
    raise exception 'FALLITO: published_shifts ha privilegi in più dopo essere stata ricreata';
  end if;

  -- Riposo del collega: «Riposo»; la malattia resta «Assente»; mai la nota.
  select template_code, template_label, note into r from public.published_shifts
   where id = '00000000-0000-0000-0000-000000004d01';
  if r.template_code is distinct from 'R' or r.template_label is distinct from 'Riposo' or r.note is not null then
    raise exception 'FALLITO: il riposo del collega si vede come % / % / %', r.template_code, r.template_label, r.note;
  end if;
  select template_code, template_label, note into r from public.published_shifts
   where id = '00000000-0000-0000-0000-000000004d02';
  if r.template_code is not null or r.template_label is distinct from 'Assente' or r.note is not null then
    raise exception 'FALLITO: la malattia del collega si vede come % / % / %', r.template_code, r.template_label, r.note;
  end if;
end;
$$;

-- ---- Bruno: le proprie assenze restano complete -------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000004e2', true);
do $$
declare
  r record;
begin
  select template_label, note into r from public.published_shifts
   where id = '00000000-0000-0000-0000-000000004d02';
  if r.template_label is distinct from 'Malattia' or r.note is distinct from 'certificato' then
    raise exception 'FALLITO: l''interessato non vede la propria assenza per intero';
  end if;
  select template_label into r from public.published_shifts
   where id = '00000000-0000-0000-0000-000000004d01';
  if r.template_label is distinct from 'Riposo settimanale' then
    raise exception 'FALLITO: l''interessato non vede l''etichetta del proprio riposo';
  end if;
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
    perform public.swap_signature('00000000-0000-0000-0000-0000000004e1', '2027-07-05', null, null);
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'FALLITO: anon chiama swap_signature'; end if;
  refused := false;
  begin
    perform 1 from public.leaves_public limit 1;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'FALLITO: anon legge leaves_public'; end if;
end;
$$;

reset role;
rollback;
