-- Richieste di Alessandro (25/11/2026).
--
-- 1. Responsabilità assegnate per SETTIMANA: l'admin vede l'elenco delle persone e spunta quali
--    attività farà ciascuno quella settimana. Un'attività può andare a una o più persone, tutte
--    alla pari: ogni giorno previsto la fa chi del gruppo è in turno.
--    Una settimana senza assegnazione propria prende quella dell'ultima settimana assegnata
--    (si ripete finché non si cambia); se un'attività non è mai stata assegnata per settimana
--    valgono responsabile e supporti "fissi" della sua scheda.
-- 2. Ognuno può eliminare le proprie notifiche ("Elimina tutte").

create table public.responsibility_week_assignments (
  responsibility_id uuid not null references public.responsibilities (id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  -- Persone assegnate quella settimana (vuoto = nessuno, scelta esplicita).
  profile_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (responsibility_id, week_start)
);

create trigger set_updated_at before update on public.responsibility_week_assignments
  for each row execute function public.set_updated_at();
create trigger audit after insert or update or delete on public.responsibility_week_assignments
  for each row execute function public.audit_row();

alter table public.responsibility_week_assignments enable row level security;
create policy "responsibility_week_assignments: lettura autenticati"
  on public.responsibility_week_assignments
  for select to authenticated using (true);
create policy "responsibility_week_assignments: scrittura admin"
  on public.responsibility_week_assignments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Una persona eliminata esce anche dalle assegnazioni settimanali.
create or replace function public.forget_profile_in_week_assignments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.responsibility_week_assignments
     set profile_ids = array_remove(profile_ids, old.id)
   where old.id = any (profile_ids);
  return old;
end;
$$;
create trigger forget_profile_in_week_assignments
  after delete on public.profiles
  for each row execute function public.forget_profile_in_week_assignments();

/**
 * Assegnati di un'attività nella settimana che contiene `p_date`: l'assegnazione di quella
 * settimana o, in mancanza, dell'ultima settimana precedente assegnata. NULL = mai assegnata per
 * settimana (valgono responsabile e supporti della scheda).
 */
create or replace function public.responsibility_week_team(p_responsibility_id uuid, p_date date)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select w.profile_ids
    from public.responsibility_week_assignments w
   where w.responsibility_id = p_responsibility_id
     and w.week_start <= p_date
   order by w.week_start desc
   limit 1;
$$;

/** Chi può spuntare l'attività in quella data: gli assegnati della settimana (o della scheda). */
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
        or case
          when public.responsibility_week_team(r.id, p_date) is not null
            then uid = any (public.responsibility_week_team(r.id, p_date))
          else exists (
            select 1 from public.responsibility_assignees ra
            where ra.responsibility_id = r.id and ra.profile_id = uid
          )
        end
      )
  );
$$;

revoke execute on function public.responsibility_week_team(uuid, date) from public, anon;
grant execute on function public.responsibility_week_team(uuid, date) to authenticated;
revoke execute on function public.is_responsibility_assignee_on(uuid, uuid, date) from public, anon;
grant execute on function public.is_responsibility_assignee_on(uuid, uuid, date) to authenticated;

drop policy "responsibility_checks: spunta assegnatari" on public.responsibility_checks;
create policy "responsibility_checks: spunta assegnatari" on public.responsibility_checks
  for insert to authenticated with check (
    public.is_admin() or (
      done_by = auth.uid()
      and date between public.today_rome() - 1 and public.today_rome()
      and public.is_responsibility_assignee_on(responsibility_id, auth.uid(), date)
    )
  );
drop policy "responsibility_checks: annulla assegnatari" on public.responsibility_checks;
create policy "responsibility_checks: annulla assegnatari" on public.responsibility_checks
  for delete to authenticated using (
    public.is_admin() or (
      date between public.today_rome() - 1 and public.today_rome()
      and public.is_responsibility_assignee_on(responsibility_id, auth.uid(), date)
    )
  );

-- Notifiche: ognuno può eliminare le proprie.
create policy "notifications: eliminazione propria" on public.notifications
  for delete to authenticated
  using (profile_id = auth.uid());
