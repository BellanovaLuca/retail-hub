-- Valgono solo le sessioni aperte dall'accesso dell'app (tabella login_sessions).
--
-- DA APPLICARE DOPO il rilascio del codice che registra le sessioni: chi entra con la versione
-- precedente dell'app non verrebbe registrato. Le sessioni aperte nel frattempo si recuperano qui.

do $$
begin
  if to_regclass('auth.sessions') is not null then
    execute $q$
      insert into public.login_sessions (session_id, profile_id, created_at)
      select s.id, s.user_id, s.created_at
        from auth.sessions s
        join public.profiles p on p.id = s.user_id
      on conflict (session_id) do nothing
    $q$;
  end if;
end;
$$;

-- Sessione valida: accesso con il PIN da meno di 30 giorni E sessione registrata dall'app.
-- Un token senza `session_id` non viene da Supabase Auth (service role, prove): non si blocca.
create or replace function public.session_fresh()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
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
     and (
       coalesce(c.claims ->> 'session_id', '') = ''
       or exists (
         select 1 from public.login_sessions s
          where s.profile_id = auth.uid()
            and s.session_id::text = c.claims ->> 'session_id'
       )
     )
    from (
      select nullif(current_setting('request.jwt.claims', true), '')::jsonb as claims
    ) c;
$$;
revoke execute on function public.session_fresh() from public, anon;
grant execute on function public.session_fresh() to authenticated, service_role;
