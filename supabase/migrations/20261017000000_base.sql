-- Milestone 1 · Fondamenta
-- Tabelle di base (reparti, profili, impostazioni, turni rapidi, festività),
-- helper is_admin(), registro modifiche, tentativi di accesso, notifiche.
-- Le tabelle delle milestone successive arrivano in migrazioni separate.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Utility
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reparti
-- ---------------------------------------------------------------------------

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Profili
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  display_name text not null,
  employee_code text not null,
  role text not null default 'employee' check (role in ('admin', 'employee')),
  weekly_hours numeric(4, 1),
  short_label text,
  home_zone text not null default 'vista' check (home_zone in ('vista', 'sole', 'jolly')),
  counts_for_coverage boolean not null default true,
  color text,
  email text,
  phone text,
  avatar_url text,
  must_change_pin boolean not null default true,
  privacy_accepted_at timestamptz,
  active boolean not null default true,
  sort_order int not null default 0,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_employee_code_format check (employee_code ~ '^[A-Z0-9][A-Z0-9-]{1,19}$')
);

-- Nome visualizzato univoco senza distinzione di maiuscole: "Francy" e "francy" sono la stessa persona.
create unique index profiles_display_name_key on public.profiles (lower(display_name));
create unique index profiles_employee_code_key on public.profiles (employee_code);

create table public.profile_departments (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  department_id uuid not null references public.departments (id),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (profile_id, department_id)
);

-- Al massimo un reparto principale per persona (l'"almeno uno" lo garantisce l'app).
create unique index profile_departments_one_primary
  on public.profile_departments (profile_id)
  where is_primary;

-- ---------------------------------------------------------------------------
-- Helper di sicurezza
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.active
  );
$$;

-- Un dipendente può modificare solo email, telefono e foto del proprio profilo.
create or replace function public.profiles_guard_self_update()
returns trigger
language plpgsql
as $$
begin
  if public.is_admin() or auth.uid() is null then
    return new;
  end if;
  if (to_jsonb(new) - array['email', 'phone', 'avatar_url', 'updated_at'])
     is distinct from (to_jsonb(old) - array['email', 'phone', 'avatar_url', 'updated_at']) then
    raise exception 'Puoi modificare solo email, telefono e foto del tuo profilo'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Impostazioni del negozio (riga singola)
-- ---------------------------------------------------------------------------

create table public.store_settings (
  id boolean primary key default true check (id),
  store_name text not null default 'Salmoiraghi & Viganò — Piazza Cordusio',
  -- { "1": {"open":"10:00","close":"20:00"}, ..., "7": {...} } con 1 = lunedì; null = chiuso
  opening_hours jsonb not null default '{
    "1": {"open": "10:00", "close": "20:00"},
    "2": {"open": "10:00", "close": "20:00"},
    "3": {"open": "10:00", "close": "20:00"},
    "4": {"open": "10:00", "close": "20:00"},
    "5": {"open": "10:00", "close": "20:00"},
    "6": {"open": "10:00", "close": "20:00"},
    "7": {"open": "10:30", "close": "20:00"}
  }'::jsonb,
  request_notice_days int not null default 7,
  logo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Turni rapidi
-- ---------------------------------------------------------------------------

create table public.shift_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  start_time time,
  end_time time,
  break_minutes int not null default 0 check (break_minutes >= 0),
  is_absence boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shift_templates_times check (
    (is_absence and start_time is null and end_time is null)
    or (not is_absence and start_time is not null and end_time is not null and end_time > start_time)
  )
);

-- ---------------------------------------------------------------------------
-- Festività e chiusure
-- ---------------------------------------------------------------------------

create table public.holidays (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  label text not null,
  store_closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Notifiche in-app
-- ---------------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notifications_profile_unread on public.notifications (profile_id, created_at desc)
  where read_at is null;

-- ---------------------------------------------------------------------------
-- Tentativi di accesso (solo service role)
-- ---------------------------------------------------------------------------

create table public.login_attempts (
  id uuid primary key default gen_random_uuid(),
  employee_code text not null,
  ip text,
  at timestamptz not null default now(),
  success boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index login_attempts_code_at on public.login_attempts (employee_code, at desc);
create index login_attempts_ip_at on public.login_attempts (ip, at desc);

-- ---------------------------------------------------------------------------
-- Registro modifiche
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (action in ('insert', 'update', 'delete')),
  entity text not null,
  entity_id text,
  diff jsonb,
  at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index audit_log_at on public.audit_log (at desc);
create index audit_log_actor on public.audit_log (actor_id, at desc);
create index audit_log_entity on public.audit_log (entity, entity_id);

-- Registra le scritture degli admin. Le operazioni di sistema (service role,
-- trigger senza utente) sono registrate con actor_id null.
create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_diff jsonb;
  v_key text;
  v_id text;
begin
  if auth.uid() is not null and not public.is_admin() then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' then
    v_diff := '{}'::jsonb;
    for v_key in select jsonb_object_keys(v_new) loop
      if v_key <> 'updated_at' and (v_new -> v_key) is distinct from (v_old -> v_key) then
        v_diff := v_diff || jsonb_build_object(
          v_key, jsonb_build_object('before', v_old -> v_key, 'after', v_new -> v_key)
        );
      end if;
    end loop;
    if v_diff = '{}'::jsonb then
      return new;
    end if;
  else
    v_diff := coalesce(v_new, v_old);
  end if;

  v_id := coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'profile_id', v_old ->> 'profile_id');

  insert into public.audit_log (actor_id, action, entity, entity_id, diff)
  values (auth.uid(), lower(tg_op), tg_table_name, v_id, v_diff);

  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'departments', 'profiles', 'profile_departments', 'store_settings',
    'shift_templates', 'holidays', 'notifications', 'login_attempts', 'audit_log'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;

  foreach t in array array[
    'departments', 'profiles', 'profile_departments', 'store_settings',
    'shift_templates', 'holidays'
  ] loop
    execute format(
      'create trigger audit after insert or update or delete on public.%I
         for each row execute function public.audit_row()', t);
  end loop;
end;
$$;

create trigger profiles_guard_self_update
  before update on public.profiles
  for each row execute function public.profiles_guard_self_update();

-- ---------------------------------------------------------------------------
-- Viste pubbliche
-- ---------------------------------------------------------------------------

-- Quello che ogni collega può sapere di un altro: niente contratto, contatti o note.
create view public.public_profiles
with (security_barrier = true)
as
select
  p.id,
  p.display_name,
  p.short_label,
  p.color,
  p.avatar_url,
  p.home_zone,
  p.active,
  p.sort_order,
  (
    select pd.department_id
    from public.profile_departments pd
    where pd.profile_id = p.id and pd.is_primary
  ) as primary_department_id,
  coalesce(
    (
      select array_agg(pd.department_id order by d.sort_order)
      from public.profile_departments pd
      join public.departments d on d.id = pd.department_id
      where pd.profile_id = p.id
    ),
    '{}'::uuid[]
  ) as department_ids
from public.profiles p;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.profile_departments enable row level security;
alter table public.store_settings enable row level security;
alter table public.shift_templates enable row level security;
alter table public.holidays enable row level security;
alter table public.notifications enable row level security;
alter table public.login_attempts enable row level security;
alter table public.audit_log enable row level security;

-- Reparti, appartenenze, impostazioni, turni rapidi, festività: lettura per
-- tutti gli utenti autenticati, scrittura solo admin.
do $$
declare
  t text;
begin
  foreach t in array array[
    'departments', 'profile_departments', 'store_settings', 'shift_templates', 'holidays'
  ] loop
    execute format(
      'create policy "%1$s: lettura autenticati" on public.%1$I
         for select to authenticated using (true)', t);
    execute format(
      'create policy "%1$s: scrittura admin" on public.%1$I
         for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end;
$$;

create policy "profiles: lettura propria o admin" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy "profiles: modifica propria (solo contatti) o admin" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

create policy "profiles: inserimento admin" on public.profiles
  for insert to authenticated
  with check (public.is_admin());

create policy "profiles: eliminazione admin" on public.profiles
  for delete to authenticated
  using (public.is_admin());

create policy "notifications: lettura propria" on public.notifications
  for select to authenticated
  using (profile_id = auth.uid());

create policy "notifications: segna come letta" on public.notifications
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "notifications: inserimento admin" on public.notifications
  for insert to authenticated
  with check (public.is_admin());

create policy "audit_log: lettura admin" on public.audit_log
  for select to authenticated
  using (public.is_admin());

-- login_attempts: nessuna policy → accessibile solo al service role.

-- ---------------------------------------------------------------------------
-- Permessi
-- ---------------------------------------------------------------------------

revoke all on public.public_profiles from anon, public;
grant select on public.public_profiles to authenticated;

revoke all on public.login_attempts from anon, authenticated;
revoke all on public.audit_log from anon;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
