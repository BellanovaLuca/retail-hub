-- Privacy (§3, §14), dopo la verifica dei criteri di accettazione:
-- - il motivo delle assenze altrui (malattia, permesso…) e le note dei turni non escono più
--   dall'istantanea pubblicata: i colleghi vedono solo "Ferie" o "Assente";
-- - l'istantanea grezza (schedule_weeks.published_shifts) la leggono solo gli admin: i dipendenti
--   leggono la testata della settimana dalla vista published_weeks;
-- - le viste rispondono solo agli utenti autenticati anche se un grant ad anon sfuggisse;
-- - is_announcement_recipient non rivela i destinatari di altri.

-- ---------------------------------------------------------------------------
-- Settimane: tabella solo admin, testata pubblicata per tutti
-- ---------------------------------------------------------------------------

alter policy "schedule_weeks: pubblicate o admin" on public.schedule_weeks using (public.is_admin());

create view public.published_weeks
with (security_barrier = true)
as
select w.id, w.week_start, w.status, w.version, w.published_at, w.note
from public.schedule_weeks w
where w.status = 'published' and auth.uid() is not null;

-- ---------------------------------------------------------------------------
-- Turni pubblicati: dettaglio pieno solo per sé e per gli admin
-- ---------------------------------------------------------------------------

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
    when s.profile_id = auth.uid() or public.is_admin() or not coalesce(s.is_absence, false)
      then s.template_code
    when upper(s.template_code) = 'F' then 'F'
    else null
  end as template_code,
  case
    when s.profile_id = auth.uid() or public.is_admin() or not coalesce(s.is_absence, false)
      then s.template_label
    when upper(s.template_code) = 'F' then 'Ferie'
    else 'Assente'
  end as template_label,
  s.is_absence,
  s.zone,
  s.is_back_office,
  s.department_id,
  case when s.profile_id = auth.uid() or public.is_admin() then s.note end as note,
  s.changed
from public.schedule_weeks w
cross join lateral jsonb_to_recordset(w.published_shifts) as s (
  id uuid, profile_id uuid, date date, start_time time, end_time time, break_minutes int,
  template_code text, template_label text, is_absence boolean, zone text,
  is_back_office boolean, department_id uuid, note text, changed boolean
)
where w.status = 'published' and auth.uid() is not null;

revoke all on public.published_shifts, public.published_weeks from anon, public;
grant select on public.published_shifts, public.published_weeks to authenticated;

-- ---------------------------------------------------------------------------
-- Le altre viste: solo con una sessione
-- ---------------------------------------------------------------------------

create or replace view public.public_profiles
with (security_barrier = true)
as
select
  p.id,
  p.display_name,
  p.short_label,
  p.color,
  p.avatar_url,
  p.home_zone,
  p.active,
  p.sort_order,
  (
    select pd.department_id
    from public.profile_departments pd
    where pd.profile_id = p.id and pd.is_primary
  ) as primary_department_id,
  coalesce(
    (
      select array_agg(pd.department_id order by d.sort_order)
      from public.profile_departments pd
      join public.departments d on d.id = pd.department_id
      where pd.profile_id = p.id
    ),
    '{}'::uuid[]
  ) as department_ids
from public.profiles p
where auth.uid() is not null;

create or replace view public.leaves_public
with (security_barrier = true)
as
select
  l.profile_id,
  l.date,
  l.status,
  l.source,
  case when l.type = 'ferie' then 'ferie' else 'assente' end as kind
from public.leaves l
where auth.uid() is not null;

create or replace view public.store_weekly_totals
with (security_barrier = true)
as
select
  (date_trunc('week', d.date))::date as week_start,
  d.kpi_id,
  sum(d.value) as total
from public.daily_entries d
where auth.uid() is not null
group by 1, 2;

-- ---------------------------------------------------------------------------
-- Destinatari delle comunicazioni: solo per sé (o admin)
-- ---------------------------------------------------------------------------

create or replace function public.is_announcement_recipient(a public.announcements, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (uid = auth.uid() or public.is_admin()) and case a.audience
    when 'all' then true
    when 'people' then uid = any (a.profile_ids)
    when 'department' then exists (
      select 1 from public.profile_departments pd
      where pd.profile_id = uid and pd.department_id = any (a.department_ids)
    )
    else false
  end;
$$;
