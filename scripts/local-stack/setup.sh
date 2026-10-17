#!/usr/bin/env bash
# Prepara lo stack Supabase locale senza Docker: binari di PostgREST e GoTrue in
# ~/.cache/retail-hub-stack, database `retail_dev` con ruoli Supabase, schema auth
# (migrazioni di GoTrue), migrazioni e seed del progetto, chiavi JWT.
# Idempotente: si può rilanciare; le migrazioni del progetto si applicano solo
# se lo schema public è ancora vuoto (per ripartire da zero usa reset.sh).
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

command -v psql >/dev/null || die "psql non trovato"
command -v node >/dev/null || die "node non trovato"
mkdir -p "$BIN_DIR" "$RUN_DIR"

# --- Binari ------------------------------------------------------------------

download() { # url dest
  log "Scarico $1"
  curl -fsSL --retry 3 -o "$2.part" "$1" && mv "$2.part" "$2"
}

if [[ ! -x "$BIN_DIR/postgrest-$POSTGREST_VERSION" ]]; then
  tmp="$(mktemp -d)"
  download "https://github.com/PostgREST/postgrest/releases/download/$POSTGREST_VERSION/postgrest-$POSTGREST_VERSION-linux-static-x86-64.tar.xz" "$tmp/postgrest.tar.xz"
  tar -xJf "$tmp/postgrest.tar.xz" -C "$tmp"
  install -m 755 "$tmp/postgrest" "$BIN_DIR/postgrest-$POSTGREST_VERSION"
  rm -rf "$tmp"
fi
ln -sfn "postgrest-$POSTGREST_VERSION" "$BIN_DIR/postgrest"

if [[ ! -x "$AUTH_DIR/auth" ]]; then
  tmp="$(mktemp -d)"
  download "https://github.com/supabase/auth/releases/download/$AUTH_VERSION/auth-$AUTH_VERSION-x86.tar.gz" "$tmp/auth.tar.gz"
  mkdir -p "$tmp/x"
  tar -xzf "$tmp/auth.tar.gz" -C "$tmp/x"
  rm -rf "$AUTH_DIR" && mkdir -p "$AUTH_DIR"
  if [[ -f "$tmp/x/auth" ]]; then install -m 755 "$tmp/x/auth" "$AUTH_DIR/auth"
  else install -m 755 "$tmp/x/gotrue" "$AUTH_DIR/auth"; fi
  cp -r "$tmp/x/migrations" "$AUTH_DIR/migrations"
  rm -rf "$tmp"
fi
log "PostgREST: $("$BIN_DIR/postgrest" --version 2>&1 | head -1) · Auth: $AUTH_VERSION"

ensure_secrets

# --- Database e ruoli ----------------------------------------------------------

su_psql postgres -c "select 1" >/dev/null || die "Postgres non raggiungibile su $PGHOST:$PGPORT"

log "Ruoli Supabase (anon, authenticated, service_role, authenticator, supabase_auth_admin)"
su_psql postgres -v authpw="$AUTHENTICATOR_PASSWORD" -v adminpw="$AUTH_ADMIN_PASSWORD" <<'SQL'
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator login noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin login noinherit createrole; end if;
end $$;
alter role service_role bypassrls;
alter role authenticator login noinherit password :'authpw';
alter role supabase_auth_admin login noinherit createrole password :'adminpw';
alter role supabase_auth_admin set search_path = auth;
grant anon, authenticated, service_role to authenticator;
SQL

if [[ "$(su_psql postgres -tAc "select 1 from pg_database where datname = '$DB_NAME'")" != "1" ]]; then
  log "Creo il database $DB_NAME"
  su_psql postgres -c "create database $DB_NAME"
fi

su_psql "$DB_NAME" -c "grant connect on database $DB_NAME to authenticator, supabase_auth_admin" \
  -c "grant create on database $DB_NAME to supabase_auth_admin" \
  -c "create schema if not exists extensions" \
  -c "grant usage on schema extensions to anon, authenticated, service_role"

# --- Schema auth: tabelle e funzioni le crea GoTrue con le sue migrazioni ---------
# GoTrue non crea lo schema: come l'immagine Postgres di Supabase, lo creiamo vuoto
# con proprietario supabase_auth_admin.
su_psql "$DB_NAME" -c "create schema if not exists auth authorization supabase_auth_admin"

log "Migrazioni di GoTrue (schema auth)"
(
  set -a; eval "$(auth_env)"; set +a
  "$AUTH_DIR/auth" migrate
) > "$RUN_DIR/auth-migrate.log" 2>&1 || { cat "$RUN_DIR/auth-migrate.log"; die "Migrazioni GoTrue fallite"; }

su_psql "$DB_NAME" <<'SQL'
-- Come su Supabase: i ruoli dell'API vedono lo schema auth e le sue funzioni helper.
grant usage on schema auth to anon, authenticated, service_role;

-- auth.uid()/auth.role() compatibili con PostgREST v12 (request.jwt.claims JSON).
-- Le migrazioni di GoTrue le definiscono già così; le ridefiniamo per sicurezza.
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;
alter function auth.uid() owner to supabase_auth_admin;
alter function auth.role() owner to supabase_auth_admin;
grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;
SQL

# --- Migrazioni e seed del progetto ---------------------------------------------

if [[ "$(su_psql "$DB_NAME" -tAc "select to_regclass('public.profiles') is not null")" == "t" ]]; then
  log "Schema public già migrato: salto migrazioni e seed (usa reset.sh per ricreare)"
else
  for f in "$REPO_ROOT"/supabase/migrations/*.sql; do
    log "Migrazione $(basename "$f")"
    su_psql "$DB_NAME" -f "$f"
  done
  log "Seed supabase/seed.sql"
  su_psql "$DB_NAME" -f "$REPO_ROOT/supabase/seed.sql"
fi

# Privilegi di default come Supabase, dopo le migrazioni: RLS resta la difesa.
log "Privilegi di default su public"
su_psql "$DB_NAME" <<'SQL'
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;
SQL

# PostgREST ricarica lo schema se è già in esecuzione.
su_psql "$DB_NAME" -c "notify pgrst, 'reload schema'"

log "Setup completato. Avvia con scripts/local-stack/start.sh"
