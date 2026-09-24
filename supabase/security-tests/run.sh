#!/usr/bin/env bash
# For each test suite in this folder: build a throwaway database, apply the
# Supabase shim + every migration in order, then run the suite.
#
# Usage: PGHOST=... PGPORT=... PGUSER=postgres supabase/security-tests/run.sh [--upto NNNN] [suite.sql ...]
#   --upto NNNN   only apply migrations numbered <= NNNN (e.g. to show a
#                 suite failing on the pre-fix schema).
#   suite.sql     run only these suites (default: every *.sql except the
#                 shim and _shared files).
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
migrations="$here/../migrations"
upto=""
if [[ "${1:-}" == "--upto" ]]; then upto="$2"; shift 2; fi

suites=("$@")
if [[ ${#suites[@]} -eq 0 ]]; then
  for f in "$here"/*.sql; do
    b="$(basename "$f")"
    [[ "$b" == supabase_shim.sql || "$b" == _* ]] && continue
    suites+=("$b")
  done
fi

export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"
psql_q() { psql -v ON_ERROR_STOP=1 -q "$@"; }

# Strict mode only when the whole schema is present; a partial (pre-fix) run
# keeps going past statements that reference objects added by later fixes.
strict=1
[[ -n "$upto" ]] && strict=0

total_failed=0
for suite in "${suites[@]}"; do
  db="fp_test_$$_$(basename "$suite" .sql)"
  psql_q -d postgres -c "create database $db" >/dev/null
  psql_q -d "$db" -f "$here/supabase_shim.sql" >/dev/null
  for f in "$migrations"/*.sql; do
    n="$(basename "$f" | cut -d_ -f1)"
    if [[ -n "$upto" && "$n" > "$upto" ]]; then continue; fi
    psql_q -d "$db" -f "$f" >/dev/null
  done

  echo "=== $suite (migrations${upto:+ up to $upto})"
  log="$(mktemp)"
  set +e
  (cd "$here" && psql -v ON_ERROR_STOP=$strict -q -d "$db" -f "$suite" >"$log" 2>&1)
  status=$?
  set -e
  # Expected errors (a probe that must fail) are noise in a partial run.
  grep -vE '^(psql:.*(ERROR|LINE|\^)|\s*\^|LINE [0-9]+:)' "$log" || true
  failed="$(psql -q -d "$db" -Atc "select count(*) from t.results where not ok" 2>/dev/null || echo 1)"
  # In strict mode a suite that stops early must not count as passing. (The
  # report's own final assertion also exits non-zero; that is already
  # counted in $failed.)
  if [[ "$strict" == 1 && "$status" != 0 && "$failed" == 0 ]]; then
    echo "SUITE ABORTED before finishing:"
    grep -E 'ERROR|LINE' "$log" | head -5
    failed=1
  fi
  rm -f "$log"
  psql -q -d postgres -c "drop database if exists $db" >/dev/null
  total_failed=$((total_failed + failed))
done

if [[ "$total_failed" != "0" ]]; then echo "FAILED: $total_failed check(s)"; exit 1; fi
echo "ALL CHECKS PASSED"
