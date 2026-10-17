#!/usr/bin/env bash
# Ricrea il database retail_dev da zero (drop + setup). Le chiavi JWT restano le stesse,
# quindi .env.local resta valido. Se lo stack era acceso viene riavviato.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

was_running=false
for name in postgrest auth gateway; do pid_alive "$RUN_DIR/$name.pid" && was_running=true; done
"$STACK_DIR/stop.sh"

log "Elimino il database $DB_NAME"
su_psql postgres -c "drop database if exists $DB_NAME with (force)"
"$STACK_DIR/setup.sh"

if $was_running; then "$STACK_DIR/start.sh"; fi
