-- Le viste pubbliche devono servire anche il server (service role: cron dei promemoria e delle
-- responsabilità), che non ha auth.uid(): la guardia "auth.uid() is not null" lo escludeva e il
-- promemoria delle 19:30 non partiva mai. La guardia ora è is_staff(): service role, oppure un
-- utente con profilo attivo (un account auth senza profilo o disattivato non legge nulla).
-- Al service role (server) le assenze altrui non sono mascherate: servono ai promemoria.

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.role() = 'service_role'
      or exists (
        select 1 from public.profiles p where p.id = auth.uid() and p.active
      );
$$;

revoke execute on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated, service_role;

create or replace view public.published_weeks
with (security_barrier = true)
as
select w.id, w.week_start, w.status, w.version, w.published_at, w.note
from public.schedule_weeks w
where w.status = 'published' and public.is_staff();

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
    else null
  end as template_code,
  case
    when s.profile_id = auth.uid() or public.is_admin() or auth.role() = 'service_role' or not coalesce(s.is_absence, false)
      then s.template_label
    when upper(s.template_code) = 'F' then 'Ferie'
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
where public.is_staff();

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
where public.is_staff();

create or replace view public.store_weekly_totals
with (security_barrier = true)
as
select
  (date_trunc('week', d.date))::date as week_start,
  d.kpi_id,
  sum(d.value) as total
from public.daily_entries d
where public.is_staff()
group by 1, 2;
