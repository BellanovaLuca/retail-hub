-- Foglio turni: togliere un'assenza direttamente dalla giornata (richiesta del 27/11/2026).
--
-- Le celle dei giorni di assenza ora si scrivono come le altre (il turno scritto sopra resta
-- segnalato "in conflitto" da replace_shift_days). Dal foglio l'admin può anche togliere
-- l'assenza di una o più giornate: questa funzione elimina le righe di `leaves` e azzera il
-- segnale di conflitto dei turni di quelle giornate, in un'unica transazione.
--
-- La revoca di un'intera richiesta approvata resta quella di sempre: stato → 'rejected' e il
-- trigger revoke_request_leaves toglie tutte le sue assenze.

-- p_days: [{ "profile_id", "date" }] giornate da cui togliere l'assenza.
-- Restituisce quante assenze sono state tolte.
create or replace function public.remove_leave_days(p_days jsonb)
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

  delete from public.leaves l
   using jsonb_to_recordset(p_days) as d (profile_id uuid, date date)
   where l.profile_id = d.profile_id and l.date = d.date;
  get diagnostics v_count = row_count;

  -- Senza più assenza in quel giorno (una sola per persona e giorno) il turno non è in conflitto.
  update public.shifts s
     set conflict = false
    from jsonb_to_recordset(p_days) as d (profile_id uuid, date date)
   where s.profile_id = d.profile_id and s.date = d.date and s.conflict;

  return v_count;
end;
$$;

revoke execute on function public.remove_leave_days(jsonb) from public, anon;
grant execute on function public.remove_leave_days(jsonb) to authenticated;
