-- Le viste sono di SOLA LETTURA (audit del 28/11/2026).
--
-- Supabase dà di default tutti i privilegi su tabelle e viste ad `authenticated`; le migrazioni
-- precedenti revocavano solo da `anon`/`public`. Le viste a tabella singola (public_profiles,
-- leaves_public, published_weeks, my_performance_goals) sono aggiornabili in automatico e, non
-- essendo `security_invoker`, scrivono con i diritti del proprietario SENZA passare dalla RLS
-- della tabella: un dipendente poteva modificare o cancellare profili, assenze, settimane
-- pubblicate e valutazioni. Da qui in poi su ogni vista resta solo SELECT.

do $$
declare
  v record;
begin
  for v in
    select c.relname
      from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')
  loop
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', v.relname);
    execute format('grant select on public.%I to authenticated, service_role', v.relname);
  end loop;
end;
$$;
