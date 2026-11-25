-- Correzioni dell'audit su obiettivi e responsabilità (29/11/2026).
--
-- 1. Obiettivi: il foglio di ciascuno segue il gruppo di voci della sua area. Chi veniva creato
--    dall'interfaccia riceveva una copia personale delle voci (profile_kpis) uguale al gruppo, e
--    da quel momento il suo foglio non seguiva più il gruppo: le copie identiche si tolgono.
--    Restano solo le personalizzazioni vere (una voce in più o in meno, un'etichetta diversa,
--    una voce disattivata).
-- 2. Responsabilità: alla disattivazione di un account la persona esce dalle assegnazioni dalla
--    settimana indicata in poi (remove_from_responsibilities).
-- 3. Card «Negozio» dei dipendenti: somma degli obiettivi assegnati per voce nella settimana
--    (store_weekly_assigned), senza alcun dato per persona.

-- ---------------------------------------------------------------------------
-- 1. Copie personali delle voci identiche al gruppo dell'area
-- ---------------------------------------------------------------------------

-- Si cancella solo quando è certo che la copia non contiene nulla di personale: stesse voci del
-- gruppo (né una in più né una in meno), stessa etichetta e tutte attive. Nel dubbio resta.
delete from public.profile_kpis pk
 where pk.profile_id in (
   select p.id
     from public.profiles p
     join public.kpi_sets s
       on s.name = case when p.home_zone = 'sole' then 'Sole' else 'Vista' end
    where exists (select 1 from public.profile_kpis k where k.profile_id = p.id)
      and not exists (
        select 1
          from public.profile_kpis k
          left join public.kpi_set_items i on i.set_id = s.id and i.kpi_id = k.kpi_id
         where k.profile_id = p.id
           and (
             not k.active
             or i.kpi_id is null
             or nullif(btrim(k.label_override), '') is distinct from nullif(btrim(i.label_override), '')
           )
      )
      and not exists (
        select 1
          from public.kpi_set_items i
         where i.set_id = s.id
           and not exists (
             select 1 from public.profile_kpis k
              where k.profile_id = p.id and k.kpi_id = i.kpi_id
           )
      )
 );

-- ---------------------------------------------------------------------------
-- 2. Disattivazione: la persona esce dalle responsabilità dalla settimana in poi
-- ---------------------------------------------------------------------------

-- p_week = lunedì della settimana corrente. Le settimane passate restano com'erano (storico):
-- se l'assegnazione in vigore viene da una settimana precedente, si fissa una riga per p_week
-- senza la persona. Le righe di p_week e delle settimane seguenti vengono ripulite, e la persona
-- non è più responsabile o supporto nelle schede.
create or replace function public.remove_from_responsibilities(p_profile_id uuid, p_week date)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_weeks integer := 0;
  v_cards integer := 0;
  n integer;
begin
  if not public.is_admin() then
    raise exception 'Operazione riservata ai responsabili' using errcode = '42501';
  end if;
  if p_profile_id is null or p_week is null or extract(isodow from p_week) <> 1 then
    raise exception 'Dati non validi' using errcode = '22023';
  end if;

  insert into public.responsibility_week_assignments
    (responsibility_id, week_start, profile_ids, person_days)
  select t.responsibility_id,
         p_week,
         array_remove(t.profile_ids, p_profile_id),
         t.person_days - p_profile_id::text
    from (
      select distinct on (w.responsibility_id)
             w.responsibility_id, w.week_start, w.profile_ids, w.person_days
        from public.responsibility_week_assignments w
       where w.week_start <= p_week
       order by w.responsibility_id, w.week_start desc
    ) t
   where t.week_start < p_week
     and (p_profile_id = any (t.profile_ids) or t.person_days ? p_profile_id::text);
  get diagnostics n = row_count;
  v_weeks := v_weeks + n;

  update public.responsibility_week_assignments w
     set profile_ids = array_remove(w.profile_ids, p_profile_id),
         person_days = w.person_days - p_profile_id::text
   where w.week_start >= p_week
     and (p_profile_id = any (w.profile_ids) or w.person_days ? p_profile_id::text);
  get diagnostics n = row_count;
  v_weeks := v_weeks + n;

  delete from public.responsibility_assignees a where a.profile_id = p_profile_id;
  get diagnostics v_cards = row_count;

  return jsonb_build_object('weeks', v_weeks, 'cards', v_cards);
end;
$$;

revoke execute on function public.remove_from_responsibilities(uuid, date) from public, anon;
grant execute on function public.remove_from_responsibilities(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Obiettivi assegnati per voce (somma del negozio), visibili a tutto lo staff
-- ---------------------------------------------------------------------------

-- Solo la somma per voce e settimana: nessun dato per persona esce da qui (i singoli obiettivi
-- restano leggibili solo dall'interessato e dagli admin, RLS di weekly_targets).
create or replace function public.store_weekly_assigned(p_week date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  -- { "<voce>": somma }: un oggetto vuoto se non c'è nulla o chi chiede non è dello staff.
  select coalesce(jsonb_object_agg(s.kpi_id, s.total), '{}'::jsonb)
    from (
      select t.kpi_id, sum(t.target) as total
        from public.weekly_targets t
       where public.is_staff()
         and t.week_start = p_week
       group by t.kpi_id
    ) s;
$$;

revoke execute on function public.store_weekly_assigned(date) from public, anon;
grant execute on function public.store_weekly_assigned(date) to authenticated, service_role;
