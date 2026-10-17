#!/usr/bin/env bash
# Avvia in background PostgREST (3001), GoTrue (9999) e il gateway (54321).
# Pid e log in ~/.cache/retail-hub-stack/run/. Idempotente: salta i servizi già attivi.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

[[ -x "$BIN_DIR/postgrest" && -x "$AUTH_DIR/auth" ]] || die "Binari assenti: esegui prima setup.sh"
load_secrets
mkdir -p "$RUN_DIR"

# start_service nome comando... (env già esportato dal chiamante)
start_service() {
  local name="$1"; shift
  local pidfile="$RUN_DIR/$name.pid" logfile="$RUN_DIR/$name.log"
  if pid_alive "$pidfile"; then log "$name già attivo (pid $(cat "$pidfile"))"; return; fi
  nohup setsid "$@" >>"$logfile" 2>&1 </dev/null &
  echo $! >"$pidfile"
  log "$name avviato (pid $!, log $logfile)"
}

wait_http() { # nome url
  for _ in $(seq 1 60); do
    curl -fsS -o /dev/null "$2" 2>/dev/null && { log "$1 pronto: $2"; return; }
    sleep 0.5
  done
  die "$1 non risponde su $2 (vedi $RUN_DIR/$1.log)"
}

# PostgREST: configurazione in un file (contiene il JWT secret, resta fuori dal repo).
cat >"$RUN_DIR/postgrest.conf" <<CONF
db-uri = "$(rest_db_url)"
db-schemas = "public"
db-extra-search-path = "public, extensions"
db-anon-role = "anon"
db-max-rows = 1000
jwt-secret = "$JWT_SECRET"
jwt-secret-is-base64 = false
server-host = "127.0.0.1"
server-port = $POSTGREST_PORT
admin-server-port = $((POSTGREST_PORT + 1))
CONF
chmod 600 "$RUN_DIR/postgrest.conf"
start_service postgrest "$BIN_DIR/postgrest" "$RUN_DIR/postgrest.conf"

(
  set -a; eval "$(auth_env)"; set +a
  start_service auth "$AUTH_DIR/auth" serve
)

(
  export GATEWAY_PORT POSTGREST_PORT AUTH_PORT
  start_service gateway node "$STACK_DIR/gateway.mjs"
)

wait_http postgrest "http://127.0.0.1:$((POSTGREST_PORT + 1))/ready"
wait_http auth "http://127.0.0.1:$AUTH_PORT/health"
wait_http gateway "http://localhost:$GATEWAY_PORT/health"
log "Stack pronto su http://localhost:$GATEWAY_PORT (variabili: scripts/local-stack/env.sh)"
