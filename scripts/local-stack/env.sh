#!/usr/bin/env bash
# Stampa le variabili per .env.local. Uso: scripts/local-stack/env.sh > .env.local
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_secrets

cat <<ENV
# Stack Supabase locale (scripts/local-stack): non committare.
NEXT_PUBLIC_SUPABASE_URL=http://localhost:$GATEWAY_PORT
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
NEXT_PUBLIC_APP_URL=http://localhost:3000
FIRST_ADMIN_CODE=ADM-001
FIRST_ADMIN_PIN=39182746
PIN_PEPPER=sviluppo-locale-non-usare-in-produzione
DATABASE_URL=postgres://$PG_SUPERUSER:$PG_SUPERPASS@$PGHOST:$PGPORT/$DB_NAME
ENV
