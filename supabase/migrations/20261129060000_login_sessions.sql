-- Registro delle sessioni aperte con il PIN (audit del 28/11/2026).
--
-- Con un token valido si può parlare direttamente con Supabase Auth: cambiare la password e
-- aprire sessioni nuove senza passare da /api/auth/pin (quindi senza blocco dei tentativi e
-- ripartendo ogni volta con 30 giorni). L'app registra qui ogni sessione aperta dal proprio
-- accesso; la migrazione seguente fa valere per il database SOLO le sessioni registrate.
-- Togliere una riga chiude subito quella sessione (uscita da tutti i dispositivi, reset del PIN).

create table public.login_sessions (
  session_id uuid primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index login_sessions_profile_idx on public.login_sessions (profile_id);

alter table public.login_sessions enable row level security;
-- Nessuna policy permissiva: la tabella la usa solo il server (service role).
create policy "solo profili attivi" on public.login_sessions as restrictive for all to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
revoke all on public.login_sessions from public, anon, authenticated;
grant all on public.login_sessions to service_role;

-- Le sessioni già aperte restano valide.
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
