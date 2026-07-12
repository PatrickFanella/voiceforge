#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required and must target an empty disposable database}"

if [[ "$DATABASE_URL" == "$RESTORE_DATABASE_URL" ]]; then
  echo "Source and restore database URLs must differ." >&2
  exit 1
fi

dump_file="$(mktemp -t voiceforge-restore.XXXXXX.dump)"
trap 'rm -f "$dump_file"' EXIT
pg_dump --format=custom --no-owner --no-acl --dbname="$DATABASE_URL" --file="$dump_file"
pg_restore --clean --if-exists --no-owner --no-acl --dbname="$RESTORE_DATABASE_URL" "$dump_file"
psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -c "select count(*) as workspaces from workspaces" -c "select count(*) as audit_events from audit_events" -c "select count(*) as migrations from drizzle.__drizzle_migrations"
echo "VoiceForge restore verification completed successfully."
