-- Turni, ferie e richieste: correzioni dall'audit del 28–29/11/2026.
--
-- 1. Scambio di turno: contano solo i turni con orario. Una riga di assenza scritta nel foglio
--    (R, F…) non è «il turno da scambiare» e non impedisce a chi riceve di prendere il turno:
--    viene sostituita da quello ricevuto, come quando l'admin scrive un orario sopra una R.
--    Il segnale di conflitto dei turni passati di mano si ricalcola sul nuovo titolare.
-- 2. Approvando un'assenza si segnalano in conflitto solo i turni con orario: un riposo o una F
--    scritti nel foglio non sono turni «in conflitto con l'assenza».
-- 3. refresh_shift_conflicts: riallinea il segnale di conflitto delle giornate indicate alle
--    assenze a giornata intera (serve al foglio Ferie, che scrive e toglie assenze a mano).
-- 4. Avvisi ignorati: un avviso che riguarda una persona si ignora solo per quella persona
--    (rule_overrides.profile_id; null = come prima, vale per tutti).

-- ---------------------------------------------------------------------------
-- 1–2. Effetti delle richieste approvate
-- ---------------------------------------------------------------------------

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

-- Le righe di assenza (senza orario) segnalate finora in conflitto dall'approvazione.
update public.shifts set conflict = false where start_time is null and conflict;

-- ---------------------------------------------------------------------------
-- 3. Segnale di conflitto riallineato alle assenze (foglio Ferie)
-- ---------------------------------------------------------------------------

-- p_days: [{ "profile_id", "date" }] giornate in cui un'assenza a giornata intera è stata
-- aggiunta, tolta o trasformata a mano. In ognuna i turni con orario risultano in conflitto se
-- c'è un'assenza a giornata intera, altrimenti no. Restituisce quanti turni sono cambiati.
create or replace function public.refresh_shift_conflicts(p_days jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'Operazione riservata ai responsabili' using errcode = '42501';
  end if;
  if p_days is null or jsonb_typeof(p_days) <> 'array' then
    raise exception 'Dati mancanti' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_days) as d (profile_id uuid, date date)
     where d.profile_id is null or d.date is null
  ) then
    raise exception 'Dati mancanti' using errcode = '22023';
  end if;

  update public.shifts s
     set conflict = (s.start_time is not null and d.full_day)
    from (
      select distinct x.profile_id, x.date,
             exists (
               select 1 from public.leaves l
                where l.profile_id = x.profile_id and l.date = x.date and l.hours is null
             ) as full_day
        from jsonb_to_recordset(p_days) as x (profile_id uuid, date date)
    ) d
   where s.profile_id = d.profile_id and s.date = d.date
     and s.conflict is distinct from (s.start_time is not null and d.full_day);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.refresh_shift_conflicts(jsonb) from public, anon;
grant execute on function public.refresh_shift_conflicts(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Avvisi ignorati per persona
-- ---------------------------------------------------------------------------

-- null = l'avviso ignorato vale per tutti (regole di negozio, e gli avvisi ignorati finora).
alter table public.rule_overrides
  add column profile_id uuid references public.profiles (id) on delete cascade;

drop index public.rule_overrides_key;
create unique index rule_overrides_key on public.rule_overrides (
  week_id, rule_id, coalesce(date, '1970-01-01'::date),
  coalesce(profile_id, '00000000-0000-0000-0000-000000000000'::uuid)
);
