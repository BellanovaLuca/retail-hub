#!/usr/bin/env bash
# Prova migrazioni, seed e RLS su un database Postgres usa-e-getta.
# Uso: DATABASE_URL=postgres://... tests/db/run.sh   (il database viene svuotato!)
set -euo pipefail
: "${DATABASE_URL:?Imposta DATABASE_URL su un database di prova vuoto}"

# Questo script SVUOTA il database (drop schema public/auth): solo su questa macchina e solo su
# un database di prova (il nome deve contenere "test"). Mai su retail_dev o su un progetto vero.
rest="${DATABASE_URL#*://}"
rest="${rest%%\?*}"
hostport="${rest%%/*}"
hostport="${hostport##*@}"
dbname="${rest#*/}"
[[ "$rest" == */* ]] || dbname=""
case "$hostport" in
  "[::1]"*) host="::1" ;;
  *) host="${hostport%%:*}" ;;
esac
case "$host" in
  localhost | 127.0.0.1 | ::1) ;;
  *)
    echo "tests/db/run.sh: host \"$host\" non locale: mi fermo (il database verrebbe svuotato)." >&2
    exit 1
    ;;
esac
case "$dbname" in
  *test*) ;;
  *)
    echo "tests/db/run.sh: il database \"$dbname\" non ha \"test\" nel nome: mi fermo (verrebbe svuotato)." >&2
    exit 1
    ;;
esac
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
