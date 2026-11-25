-- Scelte del 29/11/2026 sui punti rimasti aperti dell'audit.

-- ---------------------------------------------------------------------------
-- 1. Il PIN provvisorio scade
-- ---------------------------------------------------------------------------
-- pin_issued_at = quando è stato generato il PIN provvisorio in vigore (creazione del
-- dipendente o «Genera nuovo PIN»); null quando la persona ha un PIN scelto da lei. L'app
-- rifiuta l'accesso con un PIN provvisorio più vecchio di 7 giorni (lib/auth/pin.ts): serve
-- che un admin ne generi uno nuovo. La colonna non è tra quelle che il dipendente può
-- modificare (trigger profiles_guard_self_update).

alter table public.profiles add column pin_issued_at timestamptz;

-- Chi non è mai entrato ha un PIN provvisorio: i 7 giorni partono da adesso.
update public.profiles
   set pin_issued_at = now()
 where must_change_pin and privacy_accepted_at is null;

-- ---------------------------------------------------------------------------
-- 2. Numeri del giorno: solo le voci del proprio foglio
-- ---------------------------------------------------------------------------
-- La RLS di daily_entries controlla persona e giorno, non la voce: scrivendo direttamente
-- sull'API un dipendente poteva inserire numeri su voci che non sono nel suo foglio (e che
-- finiscono nei totali del negozio). Stessa regola dell'app: le voci personalizzate della
-- persona se ne ha, altrimenti quelle del gruppo della sua area, più le voci con un suo
-- obiettivo in quella settimana (obiettivi misti). Gli admin e il server non sono limitati.

create or replace function public.daily_entries_sheet_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowed boolean;
begin
  if auth.uid() is null or auth.role() = 'service_role' or public.is_admin() then
    return new;
  end if;

  select
    exists (
      select 1 from public.weekly_targets t
       where t.profile_id = new.profile_id
         and t.kpi_id = new.kpi_id
         and t.week_start = date_trunc('week', new.date)::date
    )
    or (
      exists (select 1 from public.kpi_definitions d where d.id = new.kpi_id and d.active)
      and case
        when exists (select 1 from public.profile_kpis k where k.profile_id = new.profile_id)
          then exists (
            select 1 from public.profile_kpis k
             where k.profile_id = new.profile_id and k.kpi_id = new.kpi_id and k.active
          )
        else exists (
          select 1
            from public.kpi_set_items i
            join public.kpi_sets s on s.id = i.set_id
            join public.profiles p on p.id = new.profile_id
           where i.kpi_id = new.kpi_id
             and s.name = case when p.home_zone = 'sole' then 'Sole' else 'Vista' end
        )
      end
    )
    into v_allowed;

  if not v_allowed then
    raise exception 'La voce non è nel foglio di questa persona' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.daily_entries_sheet_guard() from public, anon, authenticated;

create trigger daily_entries_sheet_guard
  before insert or update of kpi_id, profile_id, date, value on public.daily_entries
  for each row execute function public.daily_entries_sheet_guard();
