-- Foglio turni e richieste (migrazione 20261127010000_turni_richieste):
-- celle scrivibili nei giorni di assenza (il turno resta "in conflitto"), rimozione dell'assenza
-- di una giornata con remove_leave_days, revoca di un'intera richiesta approvata, eliminazione di
-- una richiesta approvata che lascia le assenze nel calendario.

begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000002a0'),
  ('00000000-0000-0000-0000-0000000002e1'),
  ('00000000-0000-0000-0000-0000000002e2');

insert into public.profiles (id, first_name, last_name, display_name, employee_code, role) values
  ('00000000-0000-0000-0000-0000000002a0', 'Aldo', 'Admin', 'Aldo', 'ADM-201', 'admin'),
  ('00000000-0000-0000-0000-0000000002e1', 'Elsa', 'Uno', 'Elsa', 'CRD-201', 'employee'),
  ('00000000-0000-0000-0000-0000000002e2', 'Enzo', 'Due', 'Enzo', 'CRD-202', 'employee');

insert into public.shift_templates (id, code, label, is_absence) values
  ('00000000-0000-0000-0000-000000002701', 'ZR', 'Riposo di prova', true);

insert into public.schedule_weeks (id, week_start, status) values
  ('00000000-0000-0000-0000-000000002b01', '2027-05-03', 'draft');

-- Elsa ha già un turno mercoledì 5 e chiede ferie da martedì 4 a giovedì 6.
insert into public.shifts (id, week_id, profile_id, date, start_time, end_time, break_minutes) values
  ('00000000-0000-0000-0000-000000002c01', '00000000-0000-0000-0000-000000002b01',
   '00000000-0000-0000-0000-0000000002e1', '2027-05-05', '10:00', '19:00', 60);

insert into public.requests (id, profile_id, type, start_date, end_date) values
  ('00000000-0000-0000-0000-000000002f01', '00000000-0000-0000-0000-0000000002e1', 'ferie', '2027-05-04', '2027-05-06'),
  ('00000000-0000-0000-0000-000000002f02', '00000000-0000-0000-0000-0000000002e2', 'giorno_libero', '2027-05-07', '2027-05-07'),
  ('00000000-0000-0000-0000-000000002f03', '00000000-0000-0000-0000-0000000002e2', 'malattia', '2027-05-03', '2027-05-04');

-- Enzo ha anche un permesso di 2 ore inserito a mano dall'admin sabato 8.
insert into public.leaves (profile_id, date, type, hours) values
  ('00000000-0000-0000-0000-0000000002e2', '2027-05-08', 'permesso', 2);

-- ---- admin: approvazioni --------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000002a0', true);

update public.requests set status = 'approved', decided_by = auth.uid(), decided_at = now()
 where id in ('00000000-0000-0000-0000-000000002f01', '00000000-0000-0000-0000-000000002f02',
              '00000000-0000-0000-0000-000000002f03')
   and status = 'pending';

-- ---- dipendente: non toglie assenze ------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000002e1', true);

do $$
declare
  n int;
  refused boolean := false;
begin
  begin
    perform public.remove_leave_days(
      '[{"profile_id": "00000000-0000-0000-0000-0000000002e1", "date": "2027-05-04"}]');
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'FALLITO: un dipendente usa remove_leave_days'; end if;

  -- Neanche direttamente: le assenze le scrivono solo gli admin (RLS).
  delete from public.leaves where profile_id = auth.uid();
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLITO: un dipendente elimina le proprie assenze'; end if;
end;
$$;

-- ---- admin ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000002a0', true);

do $$
declare
  n int;
  failed boolean;
  r record;
begin
  -- Approvazione: tre giorni di ferie per Elsa, il turno che c'era è segnalato.
  select count(*) into n from public.leaves
   where request_id = '00000000-0000-0000-0000-000000002f01' and source = 'request';
  if n <> 3 then raise exception 'FALLITO: attese 3 assenze dalla richiesta approvata, trovate %', n; end if;
  if not (select conflict from public.shifts where id = '00000000-0000-0000-0000-000000002c01') then
    raise exception 'FALLITO: il turno nel giorno di ferie non è segnalato in conflitto';
  end if;

  -- La cella di un giorno di assenza si scrive come le altre: il turno entra, in conflitto.
  n := public.replace_shift_days('00000000-0000-0000-0000-000000002b01',
    '[{"profile_id": "00000000-0000-0000-0000-0000000002e1", "date": "2027-05-04"},
      {"profile_id": "00000000-0000-0000-0000-0000000002e1", "date": "2027-05-06"},
      {"profile_id": "00000000-0000-0000-0000-0000000002e2", "date": "2027-05-08"}]',
    '[{"profile_id": "00000000-0000-0000-0000-0000000002e1", "date": "2027-05-04",
       "start_time": "09:00", "end_time": "13:00", "break_minutes": 0},
      {"profile_id": "00000000-0000-0000-0000-0000000002e1", "date": "2027-05-06",
       "template_id": "00000000-0000-0000-0000-000000002701"},
      {"profile_id": "00000000-0000-0000-0000-0000000002e2", "date": "2027-05-08",
       "start_time": "10:00", "end_time": "14:00", "break_minutes": 0}]');
  if n <> 3 then raise exception 'FALLITO: replace_shift_days ha scritto % turni invece di 3', n; end if;
  if not (select conflict from public.shifts
           where profile_id = '00000000-0000-0000-0000-0000000002e1' and date = '2027-05-04') then
    raise exception 'FALLITO: il turno scritto sopra le ferie non è segnalato in conflitto';
  end if;
  -- Un riposo (assenza, senza orario) scritto sopra le ferie non è un conflitto.
  if (select conflict from public.shifts
       where profile_id = '00000000-0000-0000-0000-0000000002e1' and date = '2027-05-06') then
    raise exception 'FALLITO: un riposo scritto sopra le ferie risulta in conflitto';
  end if;
  -- Un permesso di poche ore non segnala il turno.
  if (select conflict from public.shifts
       where profile_id = '00000000-0000-0000-0000-0000000002e2' and date = '2027-05-08') then
    raise exception 'FALLITO: il turno in un giorno di permesso a ore risulta in conflitto';
  end if;

  -- Dati non validi: errore e nessuna modifica.
  failed := false;
  begin
    perform public.remove_leave_days(null);
  exception when others then failed := true;
  end;
  if not failed then raise exception 'FALLITO: remove_leave_days accetta null'; end if;
  failed := false;
  begin
    perform public.remove_leave_days('{"profile_id": "00000000-0000-0000-0000-0000000002e1"}');
  exception when others then failed := true;
  end;
  if not failed then raise exception 'FALLITO: remove_leave_days accetta un oggetto invece di un elenco'; end if;
  failed := false;
  begin
    perform public.remove_leave_days(
      '[{"profile_id": "00000000-0000-0000-0000-0000000002e1", "date": "2027-05-04"},
        {"profile_id": "00000000-0000-0000-0000-0000000002e1"}]');
  exception when others then failed := true;
  end;
  if not failed then raise exception 'FALLITO: remove_leave_days accetta una giornata senza data'; end if;
  select count(*) into n from public.leaves where request_id = '00000000-0000-0000-0000-000000002f01';
  if n <> 3 then raise exception 'FALLITO: una chiamata non valida ha tolto delle assenze'; end if;

  -- «Togli l'assenza di questo giorno»: via le ferie di martedì 4, il turno non è più in conflitto.
  n := public.remove_leave_days(
    '[{"profile_id": "00000000-0000-0000-0000-0000000002e1", "date": "2027-05-04"}]');
  if n <> 1 then raise exception 'FALLITO: remove_leave_days ha tolto % assenze invece di 1', n; end if;
  if exists (select 1 from public.leaves
              where profile_id = '00000000-0000-0000-0000-0000000002e1' and date = '2027-05-04') then
    raise exception 'FALLITO: l''assenza del giorno è ancora lì';
  end if;
  select * into r from public.shifts
   where profile_id = '00000000-0000-0000-0000-0000000002e1' and date = '2027-05-04';
  if r.id is null or r.conflict or r.start_time <> '09:00' then
    raise exception 'FALLITO: dopo aver tolto l''assenza il turno è sparito o è ancora in conflitto';
  end if;
  -- Gli altri giorni della richiesta restano: assenze, conflitto di mercoledì, stato approvato.
  select count(*) into n from public.leaves where request_id = '00000000-0000-0000-0000-000000002f01';
  if n <> 2 then raise exception 'FALLITO: sono sparite anche le assenze degli altri giorni'; end if;
  if not (select conflict from public.shifts where id = '00000000-0000-0000-0000-000000002c01') then
    raise exception 'FALLITO: è sparito il conflitto di un giorno non toccato';
  end if;
  if (select status from public.requests where id = '00000000-0000-0000-0000-000000002f01') <> 'approved' then
    raise exception 'FALLITO: togliere un giorno ha cambiato lo stato della richiesta';
  end if;

  -- Giornata senza assenza: non toglie nulla.
  n := public.remove_leave_days(
    '[{"profile_id": "00000000-0000-0000-0000-0000000002e1", "date": "2027-05-04"},
      {"profile_id": "00000000-0000-0000-0000-0000000002e2", "date": "2027-05-09"}]');
  if n <> 0 then raise exception 'FALLITO: remove_leave_days ha tolto assenze che non c''erano'; end if;

  -- Più giornate insieme, di persone diverse (anche il permesso a ore inserito a mano).
  n := public.remove_leave_days(
    '[{"profile_id": "00000000-0000-0000-0000-0000000002e2", "date": "2027-05-03"},
      {"profile_id": "00000000-0000-0000-0000-0000000002e2", "date": "2027-05-08"}]');
  if n <> 2 then raise exception 'FALLITO: attese 2 assenze tolte, tolte %', n; end if;
  select count(*) into n from public.leaves where request_id = '00000000-0000-0000-0000-000000002f03';
  if n <> 1 then raise exception 'FALLITO: della malattia doveva restare un giorno, ne restano %', n; end if;

  -- «Togli tutta la richiesta»: l'approvazione torna "rifiutata" (guardia sullo stato, come
  -- nell'app) e il trigger toglie le assenze rimaste e il conflitto di mercoledì.
  update public.requests
     set status = 'rejected', decided_by = auth.uid(), decided_at = now(),
         decision_note = 'Tolta dal foglio turni'
   where id = '00000000-0000-0000-0000-000000002f01' and status = 'approved';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLITO: la richiesta approvata non è stata revocata'; end if;
  if exists (select 1 from public.leaves where request_id = '00000000-0000-0000-0000-000000002f01') then
    raise exception 'FALLITO: dopo la revoca restano assenze della richiesta';
  end if;
  if exists (select 1 from public.leaves
              where profile_id = '00000000-0000-0000-0000-0000000002e1'
                and date between '2027-05-04' and '2027-05-06') then
    raise exception 'FALLITO: dopo la revoca Elsa risulta ancora assente';
  end if;
  if (select conflict from public.shifts where id = '00000000-0000-0000-0000-000000002c01') then
    raise exception 'FALLITO: dopo la revoca il turno è ancora in conflitto';
  end if;
  -- Il turno scritto dall'admin e il riposo restano.
  select count(*) into n from public.shifts
   where profile_id = '00000000-0000-0000-0000-0000000002e1' and date between '2027-05-04' and '2027-05-06';
  if n <> 3 then raise exception 'FALLITO: la revoca ha toccato i turni (ne restano %)', n; end if;
  -- Una seconda revoca non fa nulla (la richiesta non è più approvata).
  update public.requests set status = 'rejected'
   where id = '00000000-0000-0000-0000-000000002f01' and status = 'approved';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLITO: la revoca è stata applicata due volte'; end if;

  -- Eliminare una richiesta approvata NON toglie l'assenza che ha creato: resta nel calendario,
  -- senza più il riferimento alla richiesta.
  delete from public.requests
   where id = '00000000-0000-0000-0000-000000002f02' and status in ('approved', 'rejected', 'peer_declined', 'cancelled');
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLITO: la richiesta approvata non è stata eliminata'; end if;
  select * into r from public.leaves
   where profile_id = '00000000-0000-0000-0000-0000000002e2' and date = '2027-05-07';
  if r.id is null then raise exception 'FALLITO: eliminando la richiesta è sparita l''assenza'; end if;
  if r.request_id is not null or r.source <> 'request' then
    raise exception 'FALLITO: l''assenza rimasta punta ancora alla richiesta eliminata';
  end if;
  -- … e si toglie comunque dal foglio turni.
  n := public.remove_leave_days(
    '[{"profile_id": "00000000-0000-0000-0000-0000000002e2", "date": "2027-05-07"}]');
  if n <> 1 then raise exception 'FALLITO: l''assenza rimasta senza richiesta non si toglie'; end if;

  -- Una richiesta in attesa non rientra nell'eliminazione delle richieste decise.
  insert into public.requests (id, profile_id, type, start_date, end_date) values
    ('00000000-0000-0000-0000-000000002f04', '00000000-0000-0000-0000-0000000002e2', 'ferie', '2027-06-01', '2027-06-02');
  delete from public.requests
   where id = '00000000-0000-0000-0000-000000002f04' and status in ('approved', 'rejected', 'peer_declined', 'cancelled');
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLITO: è stata eliminata una richiesta in attesa'; end if;
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
    perform public.remove_leave_days('[]');
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'FALLITO: anon può chiamare remove_leave_days'; end if;
end;
$$;

reset role;
rollback;
