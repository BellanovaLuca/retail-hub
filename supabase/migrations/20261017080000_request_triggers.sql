-- Richieste approvate: correzioni dalla verifica QA.
-- - uno scambio non crea turni sovrapposti (chi riceve un turno non deve averne già uno quel giorno)
--   e segnala il conflitto se il nuovo turno cade in un giorno di assenza;
-- - un'indisponibilità "solo in una fascia oraria" non blocca la giornata intera (hours valorizzato);
-- - le ferie confermate a planning dall'admin non vengono sovrascritte da una richiesta approvata
--   (solo le righe nate da richieste o "da confermare");
-- - la revoca di un'approvazione toglie anche il segnale di conflitto dai turni.

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
    -- (un permesso di poche ore non annulla il turno: si segnala comunque).
    update public.shifts s
       set conflict = true
     where s.profile_id = new.profile_id
       and s.date between new.start_date and new.end_date
       and (new.recurring_weekdays is null or cardinality(new.recurring_weekdays) = 0
            or extract(isodow from s.date)::smallint = any (new.recurring_weekdays));

  elsif new.type = 'scambio_turno' then
    if old.status <> 'peer_accepted' then
      raise exception 'Lo scambio va prima accettato dal collega';
    end if;
    -- Lo scambio lavora sulle giornate (persona + data), non sugli id: gli id dei turni
    -- cambiano quando l'admin riscrive una giornata dopo la pubblicazione.
    select array_agg(id) into v_ids_a from public.shifts
     where profile_id = new.profile_id and date = new.start_date;
    if v_ids_a is null then
      raise exception 'Turni dello scambio non trovati: il turno di chi chiede non c''è più';
    end if;
    if new.target_date is not null then
      select array_agg(id) into v_ids_b from public.shifts
       where profile_id = new.target_profile_id and date = new.target_date;
      if v_ids_b is null then
        raise exception 'Turni dello scambio non trovati: il turno del collega non c''è più';
      end if;
    end if;

    -- Chi riceve un turno non deve averne già uno quel giorno (a parte quello che cede).
    if new.target_date is distinct from new.start_date and exists (
      select 1 from public.shifts
       where profile_id = new.target_profile_id and date = new.start_date
    ) then
      raise exception 'Il collega ha già un turno il %', to_char(new.start_date, 'DD/MM');
    end if;
    if new.target_date is not null and new.target_date <> new.start_date and exists (
      select 1 from public.shifts
       where profile_id = new.profile_id and date = new.target_date
    ) then
      raise exception 'Chi chiede lo scambio ha già un turno il %', to_char(new.target_date, 'DD/MM');
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

    -- Un turno ricevuto in un giorno di assenza a giornata intera resta segnalato.
    update public.shifts s
       set conflict = true
     where s.id = any (coalesce(v_ids_a, '{}') || coalesce(v_ids_b, '{}'))
       and exists (
         select 1 from public.leaves l
          where l.profile_id = s.profile_id and l.date = s.date and l.hours is null
       );
  end if;

  return new;
end;
$$;

-- Se una richiesta approvata viene poi rifiutata/annullata, le ferie nate da lei spariscono
-- e i turni di quei giorni non sono più "in conflitto" (salvo altre assenze).
create or replace function public.revoke_request_leaves()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'approved' and new.status in ('rejected', 'cancelled') then
    delete from public.leaves where request_id = new.id;
    update public.shifts s
       set conflict = false
     where s.profile_id = new.profile_id
       and s.date between new.start_date and new.end_date
       and not exists (
         select 1 from public.leaves l where l.profile_id = s.profile_id and l.date = s.date
       );
  end if;
  return new;
end;
$$;
