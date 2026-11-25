-- Responsabilità assegnate per persona E per giorno (richiesta di Alessandro del 27/11/2026).
--
-- L'assegnazione settimanale (responsibility_week_assignments) ora dice anche in quali giorni
-- della settimana ogni persona fa l'attività: person_days = { "<profile_id>": [1, 3, 5] }
-- (1 = lunedì … 7 = domenica). profile_ids resta l'elenco di chi ha almeno un giorno.
-- Una persona assegnata senza giorni indicati (righe nate prima di questa migrazione) vale per
-- tutti i giorni previsti dell'attività: le righe esistenti vengono completate così.

alter table public.responsibility_week_assignments
  add column person_days jsonb not null default '{}'::jsonb
    check (jsonb_typeof(person_days) = 'object');

update public.responsibility_week_assignments w
   set person_days = coalesce(
     (select jsonb_object_agg(pid::text, to_jsonb(r.schedule_days)) from unnest(w.profile_ids) as pid),
     '{}'::jsonb
   )
  from public.responsibilities r
 where r.id = w.responsibility_id
   and cardinality(w.profile_ids) > 0;

-- Una persona eliminata esce dalle assegnazioni, anche dai giorni.
create or replace function public.forget_profile_in_week_assignments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.responsibility_week_assignments
     set profile_ids = array_remove(profile_ids, old.id),
         person_days = person_days - old.id::text
   where old.id = any (profile_ids) or person_days ? old.id::text;
  return old;
end;
$$;
revoke execute on function public.forget_profile_in_week_assignments()
  from public, anon, authenticated;

-- Chi può spuntare l'attività in quella data: chi è assegnato in QUEL giorno nella settimana in
-- vigore (l'ultima assegnazione fino a quella data); senza assegnazioni settimanali valgono
-- responsabile e supporti della scheda.
create or replace function public.is_responsibility_assignee_on(
  p_responsibility_id uuid,
  uid uuid,
  p_date date
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.responsibilities r
    where r.id = p_responsibility_id
      and (
        r.all_staff
        or coalesce(
          (
            select case
                     when w.person_days ? uid::text
                       then (w.person_days -> uid::text) @> to_jsonb(extract(isodow from p_date)::int)
                     else uid = any (w.profile_ids)
                          and extract(isodow from p_date)::smallint = any (r.schedule_days)
                   end
              from public.responsibility_week_assignments w
             where w.responsibility_id = r.id and w.week_start <= p_date
             order by w.week_start desc
             limit 1
          ),
          exists (
            select 1 from public.responsibility_assignees ra
            where ra.responsibility_id = r.id and ra.profile_id = uid
          )
        )
      )
  );
$$;
revoke execute on function public.is_responsibility_assignee_on(uuid, uuid, date) from public, anon;
grant execute on function public.is_responsibility_assignee_on(uuid, uuid, date) to authenticated;

-- Assegnazione in vigore per ogni attività nella settimana indicata, con i giorni per persona.
create or replace function public.responsibility_week_teams(p_week date)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'responsibility_id', t.responsibility_id,
           'week_start', t.week_start,
           'profile_ids', to_jsonb(t.profile_ids),
           'person_days', t.person_days)), '[]'::jsonb)
    from (
      select distinct on (w.responsibility_id)
             w.responsibility_id, w.week_start, w.profile_ids, w.person_days
        from public.responsibility_week_assignments w
       where w.week_start <= p_week
       order by w.responsibility_id, w.week_start desc
    ) t;
$$;
revoke execute on function public.responsibility_week_teams(date) from public, anon;
grant execute on function public.responsibility_week_teams(date) to authenticated, service_role;
