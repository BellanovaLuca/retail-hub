-- Durata massima della sessione (§4): 30 giorni dall'accesso con il PIN.
--
-- Supabase Auth rinnova il token all'infinito: finora i «30 giorni» erano solo la durata del
-- cookie, che si allungava a ogni visita. Il momento dell'accesso sta nel token (claim `amr`:
-- metodo + istante, che i rinnovi non cambiano): oltre i 30 giorni il token non vale più per
-- nessuna tabella, anche se usato direttamente sulle API. L'app fa lo stesso controllo nel
-- middleware e rimanda all'accesso.

create or replace function public.session_fresh()
returns boolean
language sql
stable
set search_path = ''
as $$
  -- Senza istante dell'accesso nel token (service role, token privo di `amr`) non si blocca.
  select coalesce(
    (
      select min((e ->> 'timestamp')::numeric)
        from jsonb_array_elements(
               case when jsonb_typeof(c.claims -> 'amr') = 'array'
                    then c.claims -> 'amr' else '[]'::jsonb end
             ) e
       where jsonb_typeof(e) = 'object'
         and jsonb_typeof(e -> 'timestamp') = 'number'
         and e ->> 'method' is distinct from 'token_refresh'
    ) > extract(epoch from now()) - 30 * 86400,
    true
  )
    from (
      select nullif(current_setting('request.jwt.claims', true), '')::jsonb as claims
    ) c;
$$;
revoke execute on function public.session_fresh() from public, anon;
grant execute on function public.session_fresh() to authenticated, service_role;

-- is_staff() è la condizione comune a tutte le tabelle (policy restrittiva «solo profili
-- attivi»): con la sessione scaduta non si legge e non si scrive più nulla.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.role() = 'service_role'
      or (
        public.session_fresh()
        and exists (
          select 1 from public.profiles p where p.id = auth.uid() and p.active
        )
      );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.session_fresh()
     and exists (
       select 1
       from public.profiles p
       where p.id = auth.uid()
         and p.role = 'admin'
         and p.active
     );
$$;
