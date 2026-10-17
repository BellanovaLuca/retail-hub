-- Notifiche (§10): esecuzioni dei job pianificati e Realtime.

-- Ogni job pianificato si esegue al massimo una volta per chiave (es. "promemoria-giornata:2026-10-17"):
-- il dispatcher può essere chiamato più volte senza duplicare notifiche.
create table public.cron_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null,
  run_key text not null unique,
  result jsonb,
  ran_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.cron_runs enable row level security;
-- Nessuna policy: solo service role.
revoke all on public.cron_runs from anon, authenticated;

-- Realtime: campanella e editor turni condiviso (solo dove la publication esiste, cioè su Supabase).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
    alter publication supabase_realtime add table public.shifts;
  end if;
end;
$$;
