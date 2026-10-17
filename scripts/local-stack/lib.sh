# shellcheck shell=bash
# Configurazione comune degli script dello stack locale (va incluso con `source`).

set -euo pipefail

STACK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$STACK_DIR/../.." && pwd)"

POSTGREST_VERSION="${POSTGREST_VERSION:-v12.2.12}"
AUTH_VERSION="${AUTH_VERSION:-v2.180.0}"

CACHE_DIR="${RETAIL_STACK_HOME:-$HOME/.cache/retail-hub-stack}"
BIN_DIR="$CACHE_DIR/bin"
AUTH_DIR="$CACHE_DIR/auth-$AUTH_VERSION"
RUN_DIR="$CACHE_DIR/run"
SECRETS_FILE="$CACHE_DIR/secrets.env"

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PG_SUPERUSER="${PG_SUPERUSER:-postgres}"
PG_SUPERPASS="${PG_SUPERPASS:-postgres}"
DB_NAME="${DB_NAME:-retail_dev}"

POSTGREST_PORT=3001
AUTH_PORT=9999
GATEWAY_PORT=54321

log() { printf '\033[1m[stack]\033[0m %s\n' "$*"; }
die() { printf '\033[31m[stack] %s\033[0m\n' "$*" >&2; exit 1; }

# psql come superutente; $1 = database, il resto va a psql.
su_psql() {
  local db="$1"; shift
  PGOPTIONS="-c client_min_messages=warning" PGPASSWORD="$PG_SUPERPASS" command psql -h "$PGHOST" -p "$PGPORT" -U "$PG_SUPERUSER" -d "$db" \
    -v ON_ERROR_STOP=1 -q -X "$@"
}

load_secrets() {
  [[ -f "$SECRETS_FILE" ]] || die "Mancano i segreti ($SECRETS_FILE): esegui prima setup.sh"
  # shellcheck disable=SC1090
  source "$SECRETS_FILE"
}

# Genera JWT secret, chiavi anon/service_role e password dei ruoli (una volta sola).
ensure_secrets() {
  mkdir -p "$CACHE_DIR"
  if [[ -f "$SECRETS_FILE" ]]; then load_secrets; return; fi
  log "Genero JWT secret e chiavi in $SECRETS_FILE"
  node --input-type=module -e '
    import { createHmac, randomBytes } from "node:crypto";
    const secret = randomBytes(32).toString("hex");
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const sign = (payload) => {
      const head = b64({ alg: "HS256", typ: "JWT" }) + "." + b64(payload);
      return head + "." + createHmac("sha256", secret).update(head).digest("base64url");
    };
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + 10 * 365 * 24 * 3600;
    const out = {
      JWT_SECRET: secret,
      ANON_KEY: sign({ iss: "supabase", role: "anon", iat, exp }),
      SERVICE_ROLE_KEY: sign({ iss: "supabase", role: "service_role", iat, exp }),
      AUTHENTICATOR_PASSWORD: randomBytes(16).toString("hex"),
      AUTH_ADMIN_PASSWORD: randomBytes(16).toString("hex"),
    };
    for (const [k, v] of Object.entries(out)) console.log(`${k}=${v}`);
  ' > "$SECRETS_FILE.tmp"
  mv "$SECRETS_FILE.tmp" "$SECRETS_FILE"
  chmod 600 "$SECRETS_FILE"
  load_secrets
}

auth_db_url() { echo "postgres://supabase_auth_admin:$AUTH_ADMIN_PASSWORD@$PGHOST:$PGPORT/$DB_NAME?sslmode=disable"; }
rest_db_url() { echo "postgres://authenticator:$AUTHENTICATOR_PASSWORD@$PGHOST:$PGPORT/$DB_NAME"; }

# Variabili d'ambiente di GoTrue (usate sia da `auth migrate` sia dal server).
auth_env() {
  cat <<EOF
GOTRUE_DB_DRIVER=postgres
DATABASE_URL=$(auth_db_url)
DB_NAMESPACE=auth
GOTRUE_DB_MIGRATIONS_PATH=$AUTH_DIR/migrations
GOTRUE_API_HOST=127.0.0.1
PORT=$AUTH_PORT
API_EXTERNAL_URL=http://localhost:$GATEWAY_PORT/auth/v1
GOTRUE_SITE_URL=http://localhost:3000
GOTRUE_URI_ALLOW_LIST=http://localhost:3000/**
GOTRUE_DISABLE_SIGNUP=true
GOTRUE_JWT_SECRET=$JWT_SECRET
GOTRUE_JWT_EXP=3600
GOTRUE_JWT_AUD=authenticated
GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated
GOTRUE_JWT_ADMIN_ROLES=service_role
GOTRUE_JWT_ISSUER=http://localhost:$GATEWAY_PORT/auth/v1
GOTRUE_EXTERNAL_EMAIL_ENABLED=true
GOTRUE_EXTERNAL_PHONE_ENABLED=false
GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED=false
GOTRUE_MAILER_AUTOCONFIRM=true
GOTRUE_SMS_AUTOCONFIRM=false
GOTRUE_PASSWORD_MIN_LENGTH=6
GOTRUE_RATE_LIMIT_TOKEN_REFRESH=1000
GOTRUE_RATE_LIMIT_VERIFY=1000
GOTRUE_LOG_LEVEL=info
EOF
}

pid_alive() { [[ -f "$1" ]] && kill -0 "$(cat "$1")" 2>/dev/null; }
