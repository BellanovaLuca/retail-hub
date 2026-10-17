-- Schema di dominio: turni, ferie, richieste, comunicazioni, responsabilità,
-- obiettivi individuali, performance, regole di pianificazione, notifiche push.
-- RLS attivo su tutte le tabelle; le transizioni che un dipendente può fare
-- sui dati condivisi passano da funzioni security definer con controlli espliciti.

-- ---------------------------------------------------------------------------
-- Helper
-- ---------------------------------------------------------------------------

create or replace function public.today_rome()
returns date
language sql
stable
as $$
  select (now() at time zone 'Europe/Rome')::date;
$$;

-- ---------------------------------------------------------------------------
-- Estensioni a tabelle esistenti
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column ical_token text not null default encode(gen_random_bytes(18), 'hex'),
  add column notification_prefs jsonb not null default
    '{"push": true, "email": false, "shift_reminder": false}'::jsonb;
create unique index profiles_ical_token_key on public.profiles (ical_token);

alter table public.store_settings
  add column leave_thresholds jsonb not null default '{}'::jsonb,       -- { "<department_id>": 2 }
  add column share_individual_monitoring boolean not null default false; -- tabelle per persona del Monitoraggio visibili a tutti

-- Eccezioni all'orario di apertura per singoli giorni (apertura straordinaria, chiusura anticipata…)
create table public.opening_exceptions (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  open_time time,
  close_time time,                       -- entrambi null = negozio chiuso
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((open_time is null) = (close_time is null)),
  check (close_time is null or close_time > open_time)
);

-- ---------------------------------------------------------------------------
-- Regole di pianificazione (§7.3)
-- ---------------------------------------------------------------------------

create table public.planning_rule_sets (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index planning_rule_sets_one_default on public.planning_rule_sets (is_default) where is_default;

create table public.planning_rules (
  id uuid primary key default gen_random_uuid(),
  rule_set_id uuid not null references public.planning_rule_sets (id) on delete cascade,
  name text not null,
  type text not null,
  params jsonb not null default '{}'::jsonb,
  days smallint[] not null default '{}',
  time_windows jsonb not null default '[]'::jsonb,
  valid_from date,
  valid_to date,
  severity text not null default 'warning' check (severity in ('warning', 'info')),
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index planning_rules_set on public.planning_rules (rule_set_id, sort_order);

create table public.planning_variables (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]*$'),
  label text not null,
  value numeric not null,
  unit text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Turni
-- ---------------------------------------------------------------------------

create table public.schedule_weeks (
  id uuid primary key default gen_random_uuid(),
  week_start date not null unique check (extract(isodow from week_start) = 1),
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  published_by uuid references public.profiles (id) on delete set null,
  version int not null default 0,
  note text,
  rule_set_id uuid references public.planning_rule_sets (id) on delete set null,
  -- Istantanea dell'ultima pubblicazione: è quello che vedono i dipendenti. Le modifiche
  -- successive dell'admin restano invisibili finché non si ripubblica.
  -- [{ id, profile_id, date, start_time, end_time, break_minutes, template_code, template_label,
  --    is_absence, zone, is_back_office, department_id, note, changed }]
  published_shifts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.schedule_weeks (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  template_id uuid references public.shift_templates (id) on delete set null,
  start_time time,
  end_time time,
  break_minutes int not null default 0 check (break_minutes >= 0),
  working_as_department_id uuid references public.departments (id) on delete set null,
  zone text check (zone in ('vista', 'sole')),
  is_back_office boolean,               -- null = valore predefinito del profilo
  note text,
  conflict boolean not null default false, -- in conflitto con ferie/assenze approvate
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((start_time is null) = (end_time is null)),
  check (end_time is null or end_time > start_time),
  check (start_time is not null or template_id is not null),
  -- Ammette i turni spezzati; differibile per poter scambiare due turni nella stessa transazione.
  constraint shifts_profile_date_start unique nulls not distinct (profile_id, date, start_time)
    deferrable initially immediate
);
create index shifts_week on public.shifts (week_id);
create index shifts_date on public.shifts (date);

create table public.shift_changes (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  before jsonb,
  after jsonb,
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now(),
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shift_changes_profile on public.shift_changes (profile_id, changed_at desc);

-- Modelli di settimana ("Applica un modello")
create table public.schedule_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  -- [{ "profile_id", "weekday": 1..7, "template_id", "start_time", "end_time", "break_minutes", "zone", "is_back_office", "working_as_department_id" }]
  shifts jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.rule_overrides (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.schedule_weeks (id) on delete cascade,
  rule_id uuid not null references public.planning_rules (id) on delete cascade,
  date date,                              -- null = tutta la settimana
  note text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index rule_overrides_key on public.rule_overrides (week_id, rule_id, coalesce(date, '1970-01-01'::date));

-- ---------------------------------------------------------------------------
-- Ferie e assenze
-- ---------------------------------------------------------------------------

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('ferie', 'permesso', 'cambio_turno', 'scambio_turno',
                                     'giorno_libero', 'indisponibilita', 'malattia', 'altro')),
  start_date date not null,
  end_date date not null,
  start_time time,
  end_time time,
  hours numeric(4, 1),
  recurring_weekdays smallint[],         -- indisponibilità ricorrente (1 = lunedì)
  shift_id uuid references public.shifts (id) on delete set null,          -- il mio turno (cambio/scambio)
  target_profile_id uuid references public.profiles (id) on delete set null, -- collega (scambio)
  target_shift_id uuid references public.shifts (id) on delete set null,
  target_date date,                      -- giorno del turno del collega (scambio)
  message text,
  attachment_path text,
  status text not null default 'pending' check (status in ('pending', 'peer_accepted', 'peer_declined',
                                                          'approved', 'rejected', 'cancelled')),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (type <> 'scambio_turno' or target_profile_id is not null)
);
create index requests_profile on public.requests (profile_id, created_at desc);
create index requests_status on public.requests (status, created_at desc);
create index requests_target on public.requests (target_profile_id) where target_profile_id is not null;

create table public.request_comments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index request_comments_request on public.request_comments (request_id, created_at);

create table public.leaves (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  type text not null default 'ferie' check (type in ('ferie', 'permesso', 'malattia', 'altro')),
  hours numeric(4, 1),
  status text not null default 'confirmed' check (status in ('tentative', 'confirmed')),
  source text not null default 'planning' check (source in ('planning', 'request')),
  request_id uuid references public.requests (id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, date)
);
create index leaves_date on public.leaves (date);

-- ---------------------------------------------------------------------------
-- Comunicazioni
-- ---------------------------------------------------------------------------

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body_md text not null default '',
  category text not null default 'generale'
    check (category in ('generale', 'turni', 'ferie', 'vendite', 'formazione', 'urgente')),
  audience text not null default 'all' check (audience in ('all', 'department', 'people')),
  department_ids uuid[] not null default '{}',
  profile_ids uuid[] not null default '{}',
  pinned boolean not null default false,
  requires_ack boolean not null default false,
  attachments jsonb not null default '[]'::jsonb,  -- [{ "path", "name", "size" }]
  publish_at timestamptz not null default now(),
  expires_at timestamptz,
  author_id uuid references public.profiles (id) on delete set null,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index announcements_publish on public.announcements (publish_at desc);

create table public.announcement_reads (
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  read_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (announcement_id, profile_id)
);

create or replace function public.is_announcement_recipient(a public.announcements, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case a.audience
    when 'all' then true
    when 'people' then uid = any (a.profile_ids)
    when 'department' then exists (
      select 1 from public.profile_departments pd
      where pd.profile_id = uid and pd.department_id = any (a.department_ids)
    )
    else false
  end;
$$;

-- ---------------------------------------------------------------------------
-- Responsabilità (§8.4)
-- ---------------------------------------------------------------------------

create table public.responsibilities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description_md text not null default '',
  schedule_days smallint[] not null default '{1,2,3,4,5,6,7}',
  all_staff boolean not null default false,
  attachments jsonb not null default '[]'::jsonb,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.responsibility_assignees (
  responsibility_id uuid not null references public.responsibilities (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner', 'support')),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (responsibility_id, profile_id)
);
create unique index responsibility_one_owner on public.responsibility_assignees (responsibility_id) where role = 'owner';

create table public.responsibility_checks (
  id uuid primary key default gen_random_uuid(),
  responsibility_id uuid not null references public.responsibilities (id) on delete cascade,
  date date not null,
  done_by uuid references public.profiles (id) on delete set null,
  done_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (responsibility_id, date)
);

create table public.extra_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description_md text not null default '',
  due_date date,
  created_by uuid references public.profiles (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  done_by uuid references public.profiles (id) on delete set null,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.extra_task_assignees (
  task_id uuid not null references public.extra_tasks (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (task_id, profile_id)
);

create or replace function public.is_responsibility_assignee(p_responsibility_id uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.responsibilities r
    where r.id = p_responsibility_id
      and (r.all_staff or exists (
        select 1 from public.responsibility_assignees ra
        where ra.responsibility_id = r.id and ra.profile_id = uid
      ))
  );
$$;

-- ---------------------------------------------------------------------------
-- Obiettivi individuali (§8.3)
-- ---------------------------------------------------------------------------

create table public.kpi_definitions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z][A-Z0-9_]*$'),
  label text not null,
  description text,
  default_target_rule jsonb,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.kpi_sets (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.kpi_set_items (
  set_id uuid not null references public.kpi_sets (id) on delete cascade,
  kpi_id uuid not null references public.kpi_definitions (id) on delete cascade,
  label_override text,                   -- es. "Pz sole x ADV" nel gruppo Vista
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (set_id, kpi_id)
);

create table public.profile_kpis (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kpi_id uuid not null references public.kpi_definitions (id) on delete cascade,
  label_override text,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (profile_id, kpi_id)
);

create table public.store_weekly_targets (
  id uuid primary key default gen_random_uuid(),
  week_start date not null unique check (extract(isodow from week_start) = 1),
  total_hours numeric,
  vista_value_eur numeric,
  vista_avg_price numeric,
  vista_wo int,
  sole_pieces int,
  sole_value_eur numeric,
  sole_avg_price numeric,
  notes text,
  confirmed_at timestamptz,
  best_performer_id uuid references public.profiles (id) on delete set null,
  best_performer_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.weekly_targets (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  week_start date not null,
  kpi_id uuid not null references public.kpi_definitions (id) on delete cascade,
  target numeric not null,
  overridden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, week_start, kpi_id)
);

create table public.daily_entries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  kpi_id uuid not null references public.kpi_definitions (id) on delete cascade,
  value numeric not null default 0 check (value >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, date, kpi_id)
);
create index daily_entries_date on public.daily_entries (date);

create table public.weekly_comments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  week_start date not null,
  kpi_id uuid references public.kpi_definitions (id) on delete cascade,
  body text not null default '',
  author_id uuid references public.profiles (id) on delete set null,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index weekly_comments_key
  on public.weekly_comments (profile_id, week_start, coalesce(kpi_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table public.employee_week_notes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  week_start date not null,
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, week_start)
);

-- ---------------------------------------------------------------------------
-- Performance annuale
-- ---------------------------------------------------------------------------

create table public.performance_periods (
  id uuid primary key default gen_random_uuid(),
  year int not null unique,
  label text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.performance_goals (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  period_id uuid not null references public.performance_periods (id) on delete cascade,
  pillar text not null check (pillar in ('achievement', 'leadership')),
  slot smallint not null check (slot between 1 and 3),
  title text not null default '',
  objective text not null default '',
  comment text,
  progress text check (progress in ('non_iniziato', 'in_corso', 'raggiunto', 'non_raggiunto')),
  employee_note text,
  private_note text,
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, period_id, pillar, slot)
);

-- ---------------------------------------------------------------------------
-- Notifiche push
-- ---------------------------------------------------------------------------

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Trigger: updated_at e registro modifiche
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'opening_exceptions', 'planning_rule_sets', 'planning_rules', 'planning_variables',
    'schedule_weeks', 'shifts', 'shift_changes', 'schedule_templates', 'rule_overrides',
    'requests', 'request_comments', 'leaves', 'announcements', 'announcement_reads',
    'responsibilities', 'responsibility_assignees', 'responsibility_checks', 'extra_tasks',
    'extra_task_assignees', 'kpi_definitions', 'kpi_sets', 'kpi_set_items', 'profile_kpis',
    'store_weekly_targets', 'weekly_targets', 'daily_entries', 'weekly_comments',
    'employee_week_notes', 'performance_periods', 'performance_goals', 'push_subscriptions'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;

  -- Solo le tabelle che scrivono gli admin finiscono nel registro (audit_row ignora i non admin).
  foreach t in array array[
    'opening_exceptions', 'planning_rule_sets', 'planning_rules', 'planning_variables',
    'schedule_weeks', 'shifts', 'schedule_templates', 'rule_overrides', 'requests', 'leaves',
    'announcements', 'responsibilities', 'responsibility_assignees', 'responsibility_checks',
    'extra_tasks', 'extra_task_assignees', 'kpi_definitions', 'kpi_sets', 'kpi_set_items',
    'profile_kpis', 'store_weekly_targets', 'weekly_targets', 'daily_entries', 'weekly_comments',
    'performance_periods', 'performance_goals'
  ] loop
    execute format(
      'create trigger audit after insert or update or delete on public.%I
         for each row execute function public.audit_row()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

-- Lettura per tutti gli autenticati, scrittura admin.
do $$
declare
  t text;
begin
  foreach t in array array[
    'opening_exceptions', 'planning_rule_sets', 'planning_rules', 'planning_variables',
    'responsibilities', 'responsibility_assignees', 'extra_tasks', 'extra_task_assignees',
    'kpi_definitions', 'kpi_sets', 'kpi_set_items', 'store_weekly_targets', 'performance_periods'
  ] loop
    execute format(
      'create policy "%1$s: lettura autenticati" on public.%1$I
         for select to authenticated using (true)', t);
    execute format(
      'create policy "%1$s: scrittura admin" on public.%1$I
         for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;

  -- Solo admin.
  foreach t in array array['schedule_templates', 'rule_overrides', 'performance_goals'] loop
    execute format(
      'create policy "%1$s: solo admin" on public.%1$I
         for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;

  -- Proprie in lettura, admin in scrittura.
  foreach t in array array['profile_kpis', 'weekly_targets', 'shift_changes'] loop
    execute format(
      'create policy "%1$s: lettura propria o admin" on public.%1$I
         for select to authenticated using (profile_id = auth.uid() or public.is_admin())', t);
    execute format(
      'create policy "%1$s: scrittura admin" on public.%1$I
         for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end;
$$;

-- Turni: visibili se la settimana è pubblicata.
create policy "schedule_weeks: pubblicate o admin" on public.schedule_weeks
  for select to authenticated using (status = 'published' or public.is_admin());
create policy "schedule_weeks: scrittura admin" on public.schedule_weeks
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- La tabella dei turni "di lavoro" è solo degli admin; i dipendenti leggono published_shifts.
create policy "shifts: solo admin" on public.shifts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Ferie: la tabella completa solo all'interessato e agli admin; gli altri usano leaves_public.
create policy "leaves: lettura propria o admin" on public.leaves
  for select to authenticated using (profile_id = auth.uid() or public.is_admin());
create policy "leaves: scrittura admin" on public.leaves
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Richieste
create policy "requests: interessato, collega dello scambio, admin" on public.requests
  for select to authenticated using (
    profile_id = auth.uid() or public.is_admin()
    or (type = 'scambio_turno' and target_profile_id = auth.uid())
  );
create policy "requests: inserimento proprio" on public.requests
  for insert to authenticated with check (
    profile_id = auth.uid() and status = 'pending' and decided_by is null
  );
create policy "requests: inserimento admin (per conto di)" on public.requests
  for insert to authenticated with check (public.is_admin());
create policy "requests: gestione admin" on public.requests
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "requests: eliminazione admin" on public.requests
  for delete to authenticated using (public.is_admin());

create policy "request_comments: chi vede la richiesta" on public.request_comments
  for select to authenticated using (
    exists (select 1 from public.requests r where r.id = request_id)
  );
create policy "request_comments: scrive chi vede la richiesta" on public.request_comments
  for insert to authenticated with check (
    author_id = auth.uid() and exists (select 1 from public.requests r where r.id = request_id)
  );

-- Comunicazioni
create policy "announcements: destinatari o admin" on public.announcements
  for select to authenticated using (
    public.is_admin() or (
      publish_at <= now()
      and (expires_at is null or expires_at > now())
      and public.is_announcement_recipient(announcements, auth.uid())
    )
  );
create policy "announcements: scrittura admin" on public.announcements
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "announcement_reads: proprie o admin" on public.announcement_reads
  for select to authenticated using (profile_id = auth.uid() or public.is_admin());
create policy "announcement_reads: inserimento proprio" on public.announcement_reads
  for insert to authenticated with check (
    profile_id = auth.uid() and exists (select 1 from public.announcements a where a.id = announcement_id)
  );
create policy "announcement_reads: aggiornamento proprio" on public.announcement_reads
  for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- Spunte delle responsabilità: tabellone visibile a tutti; spunta solo chi è assegnato, oggi o ieri.
create policy "responsibility_checks: lettura autenticati" on public.responsibility_checks
  for select to authenticated using (true);
create policy "responsibility_checks: spunta assegnatari" on public.responsibility_checks
  for insert to authenticated with check (
    public.is_admin() or (
      done_by = auth.uid()
      and date between public.today_rome() - 1 and public.today_rome()
      and public.is_responsibility_assignee(responsibility_id, auth.uid())
    )
  );
create policy "responsibility_checks: annulla assegnatari" on public.responsibility_checks
  for delete to authenticated using (
    public.is_admin() or (
      date between public.today_rome() - 1 and public.today_rome()
      and public.is_responsibility_assignee(responsibility_id, auth.uid())
    )
  );
create policy "responsibility_checks: modifica admin" on public.responsibility_checks
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Numeri giornalieri: propri, da 7 giorni fa a oggi.
create policy "daily_entries: lettura propria o admin" on public.daily_entries
  for select to authenticated using (profile_id = auth.uid() or public.is_admin());
create policy "daily_entries: scrittura propria (7 giorni) o admin" on public.daily_entries
  for all to authenticated
  using (
    public.is_admin() or (
      profile_id = auth.uid() and date between public.today_rome() - 7 and public.today_rome()
    )
  )
  with check (
    public.is_admin() or (
      profile_id = auth.uid() and date between public.today_rome() - 7 and public.today_rome()
    )
  );

create policy "weekly_comments: proprie pubblicate o admin" on public.weekly_comments
  for select to authenticated using (public.is_admin() or (profile_id = auth.uid() and published));
create policy "weekly_comments: scrittura admin" on public.weekly_comments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "employee_week_notes: propria o admin" on public.employee_week_notes
  for select to authenticated using (profile_id = auth.uid() or public.is_admin());
create policy "employee_week_notes: scrittura propria" on public.employee_week_notes
  for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy "push_subscriptions: proprie" on public.push_subscriptions
  for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Viste
-- ---------------------------------------------------------------------------

-- Planning ferie per tutti: "Ferie" o "Assente", mai il motivo (§3).
create view public.leaves_public
with (security_barrier = true)
as
select
  l.profile_id,
  l.date,
  l.status,
  l.source,
  case when l.type = 'ferie' then 'ferie' else 'assente' end as kind
from public.leaves l;

-- Performance del dipendente: solo le proprie pubblicate, senza nota privata.
create view public.my_performance_goals
with (security_barrier = true)
as
select
  g.id, g.profile_id, g.period_id, g.pillar, g.slot, g.title, g.objective, g.comment,
  g.progress, g.employee_note, g.published_at, g.updated_at
from public.performance_goals g
where g.profile_id = auth.uid() and g.published;

-- Turni pubblicati (istantanea dell'ultima pubblicazione), per tutti.
create view public.published_shifts
with (security_barrier = true)
as
select
  w.id as week_id,
  w.week_start,
  w.version,
  s.*
from public.schedule_weeks w
cross join lateral jsonb_to_recordset(w.published_shifts) as s (
  id uuid, profile_id uuid, date date, start_time time, end_time time, break_minutes int,
  template_code text, template_label text, is_absence boolean, zone text,
  is_back_office boolean, department_id uuid, note text, changed boolean
)
where w.status = 'published';

-- Totali del negozio per settimana e voce (visibili a tutti, §8.3).
create view public.store_weekly_totals
with (security_barrier = true)
as
select
  (date_trunc('week', d.date))::date as week_start,
  d.kpi_id,
  sum(d.value) as total
from public.daily_entries d
group by 1, 2;

-- Numeri per persona del Monitoraggio: visibili a tutti solo se l'admin lo consente.
create view public.monitoring_weekly_by_person
with (security_barrier = true)
as
select
  (date_trunc('week', d.date))::date as week_start,
  d.profile_id,
  d.kpi_id,
  sum(d.value) as total
from public.daily_entries d
where public.is_admin()
   or d.profile_id = auth.uid()
   or (select s.share_individual_monitoring from public.store_settings s limit 1)
group by 1, 2, 3;

revoke all on public.published_shifts from anon, public;
grant select on public.published_shifts to authenticated;
revoke all on public.leaves_public, public.my_performance_goals, public.store_weekly_totals,
  public.monitoring_weekly_by_person from anon, public;
grant select on public.leaves_public, public.my_performance_goals, public.store_weekly_totals,
  public.monitoring_weekly_by_person to authenticated;

-- ---------------------------------------------------------------------------
-- Funzioni per i dipendenti (security definer, controlli espliciti)
-- ---------------------------------------------------------------------------

-- Annulla una propria richiesta finché è in attesa.
create or replace function public.cancel_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.requests
     set status = 'cancelled'
   where id = p_request_id
     and profile_id = auth.uid()
     and status in ('pending', 'peer_accepted', 'peer_declined');
  if not found then
    raise exception 'Richiesta non annullabile' using errcode = '42501';
  end if;
end;
$$;

-- Il collega accetta o rifiuta uno scambio turno proposto a lui.
create or replace function public.respond_to_swap(p_request_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.requests
     set status = case when p_accept then 'peer_accepted' else 'peer_declined' end
   where id = p_request_id
     and type = 'scambio_turno'
     and target_profile_id = auth.uid()
     and status = 'pending';
  if not found then
    raise exception 'Scambio non disponibile' using errcode = '42501';
  end if;
end;
$$;

-- Il dipendente risponde a un proprio obiettivo di performance pubblicato.
create or replace function public.set_performance_note(p_goal_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.performance_goals
     set employee_note = nullif(trim(p_note), '')
   where id = p_goal_id and profile_id = auth.uid() and published;
  if not found then
    raise exception 'Obiettivo non disponibile' using errcode = '42501';
  end if;
end;
$$;

-- Un assegnatario chiude (o riapre) un'attività extra.
create or replace function public.set_extra_task_done(p_task_id uuid, p_done boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() and not exists (
    select 1 from public.extra_task_assignees a where a.task_id = p_task_id and a.profile_id = auth.uid()
  ) then
    raise exception 'Non sei assegnatario di questa attività' using errcode = '42501';
  end if;
  update public.extra_tasks
     set status = case when p_done then 'done' else 'open' end,
         done_by = case when p_done then auth.uid() end,
         done_at = case when p_done then now() end
   where id = p_task_id and status <> 'cancelled';
end;
$$;

revoke execute on function public.cancel_request(uuid), public.respond_to_swap(uuid, boolean),
  public.set_performance_note(uuid, text), public.set_extra_task_done(uuid, boolean) from public, anon;
grant execute on function public.cancel_request(uuid), public.respond_to_swap(uuid, boolean),
  public.set_performance_note(uuid, text), public.set_extra_task_done(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Effetti automatici delle richieste approvate (§5 "Trigger e funzioni")
-- ---------------------------------------------------------------------------

create or replace function public.apply_approved_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
  v_day date;
  v_a public.shifts;
  v_b public.shifts;
  v_ids_a uuid[];
  v_ids_b uuid[];
begin
  if new.status <> 'approved' or old.status = 'approved' then
    return new;
  end if;

  if new.type in ('ferie', 'permesso', 'malattia', 'giorno_libero', 'indisponibilita') then
    v_type := case new.type
      when 'ferie' then 'ferie'
      when 'permesso' then 'permesso'
      when 'malattia' then 'malattia'
      else 'altro'
    end;
    for v_day in select generate_series(new.start_date, new.end_date, interval '1 day')::date loop
      if new.recurring_weekdays is not null and cardinality(new.recurring_weekdays) > 0
         and not (extract(isodow from v_day)::smallint = any (new.recurring_weekdays)) then
        continue;
      end if;
      insert into public.leaves (profile_id, date, type, hours, status, source, request_id, note)
      values (new.profile_id, v_day, v_type,
              case when new.type = 'permesso' then new.hours end,
              'confirmed', 'request', new.id, null)
      on conflict (profile_id, date) do update
        set type = excluded.type, hours = excluded.hours, status = 'confirmed',
            source = 'request', request_id = excluded.request_id;
    end loop;

    -- I turni già presenti in quei giorni vanno segnalati come "in conflitto"
    -- (un permesso di poche ore non annulla il turno: si segnala comunque).
    update public.shifts s
       set conflict = true
     where s.profile_id = new.profile_id
       and s.date between new.start_date and new.end_date
       and (new.recurring_weekdays is null or cardinality(new.recurring_weekdays) = 0
            or extract(isodow from s.date)::smallint = any (new.recurring_weekdays));

  elsif new.type = 'scambio_turno' then
    if old.status <> 'peer_accepted' then
      raise exception 'Lo scambio va prima accettato dal collega';
    end if;
    -- Lo scambio lavora sulle giornate (persona + data), non sugli id: gli id dei turni
    -- cambiano quando l'admin riscrive una giornata dopo la pubblicazione.
    select array_agg(id) into v_ids_a from public.shifts
     where profile_id = new.profile_id and date = new.start_date;
    if v_ids_a is null then
      raise exception 'Turni dello scambio non trovati: il turno di chi chiede non c''è più';
    end if;
    if new.target_date is not null then
      select array_agg(id) into v_ids_b from public.shifts
       where profile_id = new.target_profile_id and date = new.target_date;
      if v_ids_b is null then
        raise exception 'Turni dello scambio non trovati: il turno del collega non c''è più';
      end if;
    end if;

    set constraints public.shifts_profile_date_start deferred;

    for v_a in select * from public.shifts where id = any (v_ids_a) loop
      update public.shifts set profile_id = new.target_profile_id where id = v_a.id;
      insert into public.shift_changes (shift_id, profile_id, date, before, after, changed_by)
      values (v_a.id, new.profile_id, v_a.date, to_jsonb(v_a), null, auth.uid()),
             (v_a.id, new.target_profile_id, v_a.date, null, to_jsonb(v_a), auth.uid());
    end loop;
    if v_ids_b is not null then
      for v_b in select * from public.shifts where id = any (v_ids_b) loop
        update public.shifts set profile_id = new.profile_id where id = v_b.id;
        insert into public.shift_changes (shift_id, profile_id, date, before, after, changed_by)
        values (v_b.id, new.target_profile_id, v_b.date, to_jsonb(v_b), null, auth.uid()),
               (v_b.id, new.profile_id, v_b.date, null, to_jsonb(v_b), auth.uid());
      end loop;
    end if;
  end if;

  return new;
end;
$$;

create trigger apply_approved_request
  after update of status on public.requests
  for each row execute function public.apply_approved_request();

-- Se una richiesta approvata viene poi rifiutata/annullata, le ferie nate da lei spariscono.
create or replace function public.revoke_request_leaves()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'approved' and new.status in ('rejected', 'cancelled') then
    delete from public.leaves where request_id = new.id;
  end if;
  return new;
end;
$$;

create trigger revoke_request_leaves
  after update of status on public.requests
  for each row execute function public.revoke_request_leaves();

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
-- I bucket (attachments, exports privati; avatars, branding leggibili dagli
-- autenticati) si creano in supabase/storage.sql, eseguito solo su Supabase.
