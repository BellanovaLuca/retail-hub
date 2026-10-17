#!/usr/bin/env bash
# Prova migrazioni, seed e RLS su un database Postgres usa-e-getta.
# Uso: DATABASE_URL=postgres://... tests/db/run.sh   (il database viene svuotato!)
set -euo pipefail
: "${DATABASE_URL:?Imposta DATABASE_URL su un database di prova vuoto}"
here="$(cd "$(dirname "$0")" && pwd)"
root="$here/../.."
psql() { command psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q "$@"; }

psql -c 'drop schema if exists public cascade; drop schema if exists auth cascade; create schema public;'
psql -f "$here/supabase-stub.sql"
for f in "$root"/supabase/migrations/*.sql; do psql -f "$f"; done
psql -f "$root/supabase/seed.sql"
for f in "$here"/*.test.sql; do
  echo "→ $(basename "$f")"
  psql -f "$f" >/dev/null
done
echo "Test del database superati."
