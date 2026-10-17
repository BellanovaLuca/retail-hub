#!/usr/bin/env bash
# Ferma gateway, GoTrue e PostgREST avviati da start.sh (Postgres resta acceso).
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

for name in gateway auth postgrest; do
  pidfile="$RUN_DIR/$name.pid"
  if pid_alive "$pidfile"; then
    pid="$(cat "$pidfile")"
    kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 20); do kill -0 "$pid" 2>/dev/null || break; sleep 0.25; done
    kill -9 "$pid" 2>/dev/null || true
    log "$name fermato"
  else
    log "$name non attivo"
  fi
  rm -f "$pidfile"
done
