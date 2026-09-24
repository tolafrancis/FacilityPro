#!/usr/bin/env bash
# Build a throwaway database, apply the Supabase shim + every migration in
# order, then run the security suite.
#
# Usage: PGHOST=... PGPORT=... PGUSER=postgres supabase/security-tests/run.sh [--upto NNNN]
#   --upto NNNN   only apply migrations numbered <= NNNN (e.g. to show the
#                 suite failing on the pre-fix schema).
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
migrations="$here/../migrations"
db="fp_test_$$"
upto=""
if [[ "${1:-}" == "--upto" ]]; then upto="$2"; fi

export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"
psql_q() { psql -v ON_ERROR_STOP=1 -q "$@"; }

psql_q -d postgres -c "create database $db" >/dev/null
trap 'psql -q -d postgres -c "drop database if exists $db" >/dev/null' EXIT

psql_q -d "$db" -f "$here/supabase_shim.sql" >/dev/null
for f in "$migrations"/*.sql; do
  n="$(basename "$f" | cut -d_ -f1)"
  if [[ -n "$upto" && "$n" > "$upto" ]]; then continue; fi
  psql_q -d "$db" -f "$f" >/dev/null
done
echo "applied migrations${upto:+ up to $upto}"

# Strict mode only when the whole schema is present; a partial (pre-fix) run
# keeps going past statements that reference objects added by the fix.
strict=1
[[ -n "$upto" ]] && strict=0
psql -v ON_ERROR_STOP=$strict -q -d "$db" -f "$here/security_blockers.sql" 2>&1 \
  | grep -vE '^(psql:.*(ERROR|LINE|\^)|\s*\^|LINE [0-9]+:)' || true
psql -q -d "$db" -Atc "select count(*) from t.results where not ok" 2>/dev/null | {
  read -r failed
  if [[ "$failed" != "0" ]]; then echo "FAILED: $failed check(s)"; exit 1; fi
  echo "ALL CHECKS PASSED"
}
