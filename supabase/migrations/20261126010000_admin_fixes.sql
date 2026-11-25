-- Correzioni dell'area admin dopo la revisione di sicurezza e correttezza (26/11/2026).
--
-- 1. Note riservate sul dipendente in una tabella a parte, solo admin: la colonna
--    profiles.admin_notes era leggibile dall'interessato (la policy di profiles è per riga).
-- 2. replace_shift_days: sostituisce i turni di una o più giornate in un'unica transazione
--    (prima: delete e insert separati, una giornata alla volta).
-- 3. remove_future_shifts: alla disattivazione di un account toglie i turni da una data in poi,
--    anche dalle istantanee già pubblicate.
-- 4. set_default_rule_set: cambio del set di regole predefinito in un'unica transazione.

-- ---------------------------------------------------------------------------
-- 1. Note riservate degli admin
-- ---------------------------------------------------------------------------

create table public.profile_admin_notes (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Copia dei dati esistenti prima di creare il trigger del registro: lo spostamento non è una
-- modifica fatta da qualcuno.
insert into public.profile_admin_notes (profile_id, notes)
select p.id, p.admin_notes
from public.profiles p
where nullif(btrim(p.admin_notes), '') is not null;

alter table public.profiles drop column admin_notes;

create trigger set_updated_at before update on public.profile_admin_notes
  for each row execute function public.set_updated_at();
create trigger audit after insert or update or delete on public.profile_admin_notes
  for each row execute function public.audit_row();

alter table public.profile_admin_notes enable row level security;
create policy "profile_admin_notes: solo admin" on public.profile_admin_notes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.profile_admin_notes from anon;

-- ---------------------------------------------------------------------------
-- 2. Turni: sostituzione atomica delle giornate
-- ---------------------------------------------------------------------------

-- p_days: [{ "profile_id", "date" }] giornate da riscrivere (anche solo da svuotare).
-- p_rows: [{ "profile_id", "date", "template_id", "start_time", "end_time", "break_minutes",
--            "working_as_department_id", "zone", "is_back_office", "note" }] nuovi turni.
-- Il segnale di conflitto con un'assenza a giornata intera si calcola qui.
create or replace function public.replace_shift_days(p_week_id uuid, p_days jsonb, p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_week_start date;
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'Operazione riservata ai responsabili' using errcode = '42501';
  end if;
  select w.week_start into v_week_start from public.schedule_weeks w where w.id = p_week_id;
  if v_week_start is null then
    raise exception 'Settimana non trovata' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(coalesce(p_days, '[]'::jsonb)) as d (profile_id uuid, date date)
     where d.profile_id is null or d.date is null
        or d.date < v_week_start or d.date > v_week_start + 6
  ) then
    raise exception 'Giorno fuori dalla settimana' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as r (profile_id uuid, date date)
     where not exists (
       select 1 from jsonb_to_recordset(coalesce(p_days, '[]'::jsonb)) as d (profile_id uuid, date date)
        where d.profile_id = r.profile_id and d.date = r.date
     )
  ) then
    raise exception 'Turno fuori dalle giornate da riscrivere' using errcode = '22023';
  end if;

  delete from public.shifts s
   using jsonb_to_recordset(coalesce(p_days, '[]'::jsonb)) as d (profile_id uuid, date date)
   where s.profile_id = d.profile_id and s.date = d.date;

  insert into public.shifts (
    week_id, profile_id, date, template_id, start_time, end_time, break_minutes,
    working_as_department_id, zone, is_back_office, note, conflict
  )
  select
    p_week_id, r.profile_id, r.date, r.template_id, r.start_time, r.end_time,
    coalesce(r.break_minutes, 0), r.working_as_department_id, r.zone, r.is_back_office, r.note,
    r.start_time is not null and exists (
      select 1 from public.leaves l
       where l.profile_id = r.profile_id and l.date = r.date and l.hours is null
    )
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as r (
    profile_id uuid, date date, template_id uuid, start_time time, end_time time,
    break_minutes int, working_as_department_id uuid, zone text, is_back_office boolean, note text
  );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Disattivazione: via i turni da una data in poi, anche dagli orari pubblicati
-- ---------------------------------------------------------------------------

create or replace function public.remove_future_shifts(p_profile_id uuid, p_from date)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_shifts integer;
  v_weeks integer;
begin
  if not public.is_admin() then
    raise exception 'Operazione riservata ai responsabili' using errcode = '42501';
  end if;
  if p_profile_id is null or p_from is null then
    raise exception 'Dati mancanti' using errcode = '22023';
  end if;

  delete from public.shifts s where s.profile_id = p_profile_id and s.date >= p_from;
  get diagnostics v_shifts = row_count;

  update public.schedule_weeks w
     set published_shifts = coalesce(
       (
         select jsonb_agg(t.e order by t.ord)
           from jsonb_array_elements(w.published_shifts) with ordinality as t (e, ord)
          where not (t.e ->> 'profile_id' = p_profile_id::text and (t.e ->> 'date')::date >= p_from)
       ),
       '[]'::jsonb
     )
   where w.week_start + 6 >= p_from
     and exists (
       select 1 from jsonb_array_elements(w.published_shifts) as e
        where e ->> 'profile_id' = p_profile_id::text and (e ->> 'date')::date >= p_from
     );
  get diagnostics v_weeks = row_count;

  return jsonb_build_object('shifts', v_shifts, 'weeks', v_weeks);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Set di regole predefinito
-- ---------------------------------------------------------------------------

create or replace function public.set_default_rule_set(p_rule_set_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Operazione riservata ai responsabili' using errcode = '42501';
  end if;
  if not exists (select 1 from public.planning_rule_sets s where s.id = p_rule_set_id) then
    raise exception 'Set di regole non trovato' using errcode = '22023';
  end if;
  update public.planning_rule_sets set is_default = false where is_default and id <> p_rule_set_id;
  update public.planning_rule_sets set is_default = true where id = p_rule_set_id and not is_default;
end;
$$;

revoke execute on function public.replace_shift_days(uuid, jsonb, jsonb),
  public.remove_future_shifts(uuid, date), public.set_default_rule_set(uuid) from public, anon;
grant execute on function public.replace_shift_days(uuid, jsonb, jsonb),
  public.remove_future_shifts(uuid, date), public.set_default_rule_set(uuid) to authenticated;
