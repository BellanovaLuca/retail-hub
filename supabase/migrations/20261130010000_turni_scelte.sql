-- Turni, richieste e orari: scelte del titolare del 29/11/2026.
--
-- A. Scambio di turno: il collega accetta degli orari precisi. Se dopo l'accettazione il turno di
--    chi chiede o quello del collega cambia, lo scambio non si approva: la richiesta torna «in
--    attesa» e il collega deve accettare di nuovo. `requests.swap_signature` è la firma degli
--    orari (turni con orario del foglio) delle due giornate, scritta quando il collega accetta.
-- B. Griglia del negozio: si vedono tutte le presenze e le assenze dei colleghi, anche di poche
--    ore. `leaves_public` espone le ore dell'assenza (null = giornata intera): mai il motivo, il
--    tipo o la nota. Il riposo scritto nel foglio turni si vede come «Riposo» (non è un motivo).

-- ---------------------------------------------------------------------------
-- A. Firma degli orari dello scambio
-- ---------------------------------------------------------------------------

alter table public.requests add column swap_signature text;
comment on column public.requests.swap_signature is
  'Scambio di turno: orari delle due giornate quando il collega ha accettato (null = non accettato, o accettato prima che esistesse la firma).';

-- "<orari di chi chiede>|<orari del collega>", ogni parte "HH:MM-HH:MM,HH:MM-HH:MM" in ordine
-- d'inizio; vuota se quel giorno non ci sono turni con orario (o se il collega non cede nulla).
-- Legge la tabella dei turni di lavoro (solo admin): la usano respond_to_swap e il trigger, che
-- sono security definer. Non è chiamabile via API.
create or replace function public.swap_signature(
  p_profile_id uuid, p_date date, p_target_profile_id uuid, p_target_date date
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
           select string_agg(to_char(s.start_time, 'HH24:MI') || '-' || to_char(s.end_time, 'HH24:MI'),
                             ',' order by s.start_time)
             from public.shifts s
            where s.profile_id = p_profile_id and s.date = p_date and s.start_time is not null
         ), '')
      || '|'
      || case when p_target_date is null then '' else coalesce((
           select string_agg(to_char(s.start_time, 'HH24:MI') || '-' || to_char(s.end_time, 'HH24:MI'),
                             ',' order by s.start_time)
             from public.shifts s
            where s.profile_id = p_target_profile_id and s.date = p_target_date
              and s.start_time is not null
         ), '') end;
$$;
revoke execute on function public.swap_signature(uuid, date, uuid, date)
  from public, anon, authenticated;

-- Il collega accetta o rifiuta uno scambio proposto a lui. Accettando si salva la firma degli
-- orari che sta accettando; rifiutando (o quando la richiesta torna in attesa) la firma è null.
create or replace function public.respond_to_swap(p_request_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'Account non attivo' using errcode = '42501';
  end if;
  update public.requests r
     set status = case when p_accept then 'peer_accepted' else 'peer_declined' end,
         swap_signature = case when p_accept then
           public.swap_signature(r.profile_id, r.start_date, r.target_profile_id, r.target_date)
         end
   where r.id = p_request_id
     and r.type = 'scambio_turno'
     and r.target_profile_id = auth.uid()
     and r.status = 'pending';
  if not found then
    raise exception 'Scambio non disponibile' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function public.respond_to_swap(uuid, boolean) from public, anon;
grant execute on function public.respond_to_swap(uuid, boolean) to authenticated;

-- Effetti delle richieste approvate: come in 20261129040000_turni_audit, più il controllo della
-- firma dello scambio.
create or replace function public.apply_approved_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
  v_day date;
  v_hours numeric;
  v_note text;
  v_a public.shifts;
  v_b public.shifts;
  v_ids_a uuid[];
  v_ids_b uuid[];
begin
  if new.status <> 'approved' or old.status = 'approved' then
    return new;
  end if;

  if new.type in ('ferie', 'permesso', 'malattia', 'giorno_libero', 'indisponibilita') then
    v_type := case new.type
      when 'ferie' then 'ferie'
      when 'permesso' then 'permesso'
      when 'malattia' then 'malattia'
      else 'altro'
    end;
    -- Ore dell'assenza: quelle del permesso, oppure la fascia oraria indicata (indisponibilità
    -- "solo in una fascia"): così la giornata non viene bloccata per intero.
    v_hours := case
      when new.type = 'permesso' then new.hours
      when new.start_time is not null and new.end_time is not null
        then round(extract(epoch from (new.end_time - new.start_time)) / 3600, 1)
    end;
    v_note := case
      when new.type <> 'permesso' and new.start_time is not null and new.end_time is not null
        then to_char(new.start_time, 'HH24:MI') || '–' || to_char(new.end_time, 'HH24:MI')
    end;
    for v_day in select generate_series(new.start_date, new.end_date, interval '1 day')::date loop
      if new.recurring_weekdays is not null and cardinality(new.recurring_weekdays) > 0
         and not (extract(isodow from v_day)::smallint = any (new.recurring_weekdays)) then
        continue;
      end if;
      insert into public.leaves (profile_id, date, type, hours, status, source, request_id, note)
      values (new.profile_id, v_day, v_type, v_hours, 'confirmed', 'request', new.id, v_note)
      on conflict (profile_id, date) do update
        set type = excluded.type, hours = excluded.hours, status = 'confirmed',
            source = 'request', request_id = excluded.request_id, note = excluded.note
        where public.leaves.source = 'request' or public.leaves.status = 'tentative';
    end loop;

    -- I turni già presenti in quei giorni vanno segnalati come "in conflitto"
    -- (un permesso di poche ore non annulla il turno: si segnala comunque). Solo i turni con
    -- orario: un riposo o un'altra assenza scritta nel foglio non è in conflitto con l'assenza.
    update public.shifts s
       set conflict = true
     where s.profile_id = new.profile_id
       and s.start_time is not null
       and s.date between new.start_date and new.end_date
       and (new.recurring_weekdays is null or cardinality(new.recurring_weekdays) = 0
            or extract(isodow from s.date)::smallint = any (new.recurring_weekdays));

  elsif new.type = 'scambio_turno' then
    if old.status <> 'peer_accepted' then
      raise exception 'Lo scambio va prima accettato dal collega';
    end if;
    -- Il collega ha accettato QUESTI orari: se da allora uno dei due turni è cambiato lo scambio
    -- non si approva (l'area admin riporta la richiesta in attesa del collega). Le richieste
    -- accettate prima di questa regola non hanno firma e si approvano come prima.
    if new.swap_signature is not null
       and new.swap_signature is distinct from public.swap_signature(
             new.profile_id, new.start_date, new.target_profile_id, new.target_date) then
      raise exception 'Il turno dello scambio è cambiato dopo l''accettazione del collega: deve accettare di nuovo';
    end if;
    -- Lo scambio lavora sulle giornate (persona + data), non sugli id: gli id dei turni
    -- cambiano quando l'admin riscrive una giornata dopo la pubblicazione. Si scambiano solo i
    -- turni con orario: una riga di assenza (R, F…) non è un turno da cedere.
    select array_agg(id) into v_ids_a from public.shifts
     where profile_id = new.profile_id and date = new.start_date and start_time is not null;
    if v_ids_a is null then
      raise exception 'Turni dello scambio non trovati: il turno di chi chiede non c''è più';
    end if;
    if new.target_date is not null then
      select array_agg(id) into v_ids_b from public.shifts
       where profile_id = new.target_profile_id and date = new.target_date
         and start_time is not null;
      if v_ids_b is null then
        raise exception 'Turni dello scambio non trovati: il turno del collega non c''è più';
      end if;
    end if;

    -- Chi riceve un turno non deve averne già uno quel giorno (a parte quello che cede).
    if new.target_date is distinct from new.start_date and exists (
      select 1 from public.shifts
       where profile_id = new.target_profile_id and date = new.start_date
         and start_time is not null
    ) then
      raise exception 'Il collega ha già un turno il %', to_char(new.start_date, 'DD/MM');
    end if;
    if new.target_date is not null and new.target_date <> new.start_date and exists (
      select 1 from public.shifts
       where profile_id = new.profile_id and date = new.target_date
         and start_time is not null
    ) then
      raise exception 'Chi chiede lo scambio ha già un turno il %', to_char(new.target_date, 'DD/MM');
    end if;

    -- Il riposo (o un'altra assenza scritta nel foglio) di chi riceve un turno viene sostituito
    -- dal turno ricevuto, come quando l'admin scrive un orario sopra quella cella.
    delete from public.shifts
     where profile_id = new.target_profile_id and date = new.start_date and start_time is null;
    if new.target_date is not null then
      delete from public.shifts
       where profile_id = new.profile_id and date = new.target_date and start_time is null;
    end if;

    set constraints public.shifts_profile_date_start deferred;

    for v_a in select * from public.shifts where id = any (v_ids_a) loop
      update public.shifts set profile_id = new.target_profile_id where id = v_a.id;
      insert into public.shift_changes (shift_id, profile_id, date, before, after, changed_by)
      values (v_a.id, new.profile_id, v_a.date, to_jsonb(v_a), null, auth.uid()),
             (v_a.id, new.target_profile_id, v_a.date, null, to_jsonb(v_a), auth.uid());
    end loop;
    if v_ids_b is not null then
      for v_b in select * from public.shifts where id = any (v_ids_b) loop
        update public.shifts set profile_id = new.profile_id where id = v_b.id;
        insert into public.shift_changes (shift_id, profile_id, date, before, after, changed_by)
        values (v_b.id, new.target_profile_id, v_b.date, to_jsonb(v_b), null, auth.uid()),
               (v_b.id, new.profile_id, v_b.date, null, to_jsonb(v_b), auth.uid());
      end loop;
    end if;

    -- Il segnale di conflitto segue il nuovo titolare: resta (o compare) solo se chi ha ricevuto
    -- il turno ha un'assenza a giornata intera quel giorno.
    update public.shifts s
       set conflict = exists (
         select 1 from public.leaves l
          where l.profile_id = s.profile_id and l.date = s.date and l.hours is null
       )
     where s.id = any (coalesce(v_ids_a, '{}') || coalesce(v_ids_b, '{}'));
  end if;

  return new;
end;
$$;

-- Le funzioni dei trigger non vanno chiamate via API (il trigger scatta comunque).
revoke execute on function public.apply_approved_request() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- B. Assenze di poche ore e riposi nella griglia del negozio
-- ---------------------------------------------------------------------------

-- Planning ferie per tutti: "ferie" o "assente" e le ore (null = giornata intera). Mai il motivo.
create or replace view public.leaves_public
with (security_barrier = true)
as
select
  l.profile_id,
  l.date,
  l.status,
  l.source,
  case when l.type = 'ferie' then 'ferie' else 'assente' end as kind,
  l.hours
from public.leaves l
where public.is_staff();

-- Turni pubblicati: come prima, ma il riposo (turno rapido «R») dei colleghi si vede come
-- «Riposo» invece che come un'assenza generica. Ogni altra assenza resta «Ferie» o «Assente».
create or replace view public.published_shifts
with (security_barrier = true)
as
select
  w.id as week_id,
  w.week_start,
  w.version,
  s.id,
  s.profile_id,
  s.date,
  s.start_time,
  s.end_time,
  s.break_minutes,
  case
    when s.profile_id = auth.uid() or public.is_admin() or auth.role() = 'service_role' or not coalesce(s.is_absence, false)
      then s.template_code
    when upper(s.template_code) = 'F' then 'F'
    when upper(s.template_code) = 'R' then 'R'
    else null
  end as template_code,
  case
    when s.profile_id = auth.uid() or public.is_admin() or auth.role() = 'service_role' or not coalesce(s.is_absence, false)
      then s.template_label
    when upper(s.template_code) = 'F' then 'Ferie'
    when upper(s.template_code) = 'R' then 'Riposo'
    else 'Assente'
  end as template_label,
  s.is_absence,
  s.zone,
  s.is_back_office,
  s.department_id,
  case when s.profile_id = auth.uid() or public.is_admin() or auth.role() = 'service_role' then s.note end as note,
  s.changed
from public.schedule_weeks w
cross join lateral jsonb_to_recordset(w.published_shifts) as s (
  id uuid, profile_id uuid, date date, start_time time, end_time time, break_minutes int,
  template_code text, template_label text, is_absence boolean, zone text,
  is_back_office boolean, department_id uuid, note text, changed boolean
)
where w.status = 'published' and public.is_staff();

-- Le viste restano di SOLA LETTURA (vedi 20261129020000_views_read_only).
revoke all on public.leaves_public, public.published_shifts
  from public, anon, authenticated, service_role;
grant select on public.leaves_public, public.published_shifts to authenticated, service_role;
