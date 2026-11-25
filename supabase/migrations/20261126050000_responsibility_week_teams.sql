-- Gruppo settimanale in vigore per ogni attività nella settimana indicata: un elemento per
-- attività (l'ultima assegnazione con week_start <= p_week), come
-- [{ "responsibility_id", "week_start", "profile_ids": [...] }].
-- Evita di leggere dal client tutto lo storico delle assegnazioni, che con gli anni supererebbe
-- il limite di righe dell'API. Security invoker: vale la RLS della tabella.
create or replace function public.responsibility_week_teams(p_week date)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'responsibility_id', t.responsibility_id,
           'week_start', t.week_start,
           'profile_ids', to_jsonb(t.profile_ids))), '[]'::jsonb)
    from (
      select distinct on (w.responsibility_id)
             w.responsibility_id, w.week_start, w.profile_ids
        from public.responsibility_week_assignments w
       where w.week_start <= p_week
       order by w.responsibility_id, w.week_start desc
    ) t;
$$;

revoke execute on function public.responsibility_week_teams(date) from public, anon;
grant execute on function public.responsibility_week_teams(date) to authenticated, service_role;
