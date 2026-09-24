#!/usr/bin/env bash
# Compares the schema the migrations produce on a fresh database with the
# live (linked) Supabase project's schema (audit S3-H1).
#
# Needs: a local Postgres 15+ you can create databases on (PGHOST/PGPORT/
# PGUSER), and the production connection string (Supabase dashboard →
# Connect → "Session pooler" URI, with the database password):
#
#   PROD_DB_URL='postgresql://postgres.<ref>:<password>@<host>:5432/postgres' \
#   PGHOST=… PGUSER=postgres scripts/check-drift.sh
#
# It only reads production's catalog; nothing is changed there.
#
# No output after "Differences:" means production matches the migrations.
# Anything listed was changed by hand in production (or a migration was
# skipped): turn it into a new migration, or re-apply the missing one.
set -euo pipefail
: "${PROD_DB_URL:?Set PROD_DB_URL to the production connection string}"
here="$(cd "$(dirname "$0")/.." && pwd)"
out="$(mktemp -d)"
db="fp_drift_$$"

psql -q -d postgres -c "create database $db" >/dev/null
trap 'psql -q -d postgres -c "drop database if exists $db" >/dev/null; rm -rf "$out"' EXIT
psql -q -v ON_ERROR_STOP=1 -d "$db" -f "$here/supabase/security-tests/supabase_shim.sql" >/dev/null
for f in "$here"/supabase/migrations/*.sql; do
  psql -q -v ON_ERROR_STOP=1 -d "$db" -f "$f" >/dev/null 2>"$out/err" || { echo "Migration failed on a fresh database: $f"; cat "$out/err"; exit 1; }
done
echo "All migrations applied cleanly to a fresh database."

# Normalised schema listings: tables/columns, constraints, indexes,
# policies, functions (by signature and body hash) and triggers.
read -r -d '' Q <<'SQL' || true
select 'column '||table_name||'.'||column_name||' '||data_type||' null='||is_nullable||' default='||coalesce(column_default,'')
  from information_schema.columns where table_schema='public'
union all select 'constraint '||conrelid::regclass||' '||conname||' '||pg_get_constraintdef(oid)
  from pg_constraint where connamespace='public'::regnamespace
union all select 'index '||indexname||' '||indexdef from pg_indexes where schemaname='public'
union all select 'policy '||tablename||'.'||policyname||' '||cmd||' '||coalesce(qual,'')||' / '||coalesce(with_check,'')
  from pg_policies where schemaname='public'
union all select 'function '||p.oid::regprocedure||' md5='||md5(p.prosrc)||' definer='||p.prosecdef
  from pg_proc p where p.pronamespace='public'::regnamespace
union all select 'trigger '||tgrelid::regclass||' '||tgname||' '||pg_get_triggerdef(oid)
  from pg_trigger where not tgisinternal and tgrelid::regclass::text not like 'storage.%'
order by 1;
SQL
psql -Atq -d "$db" -c "$Q" > "$out/migrations.txt"
psql "${PROD_DB_URL:?Set PROD_DB_URL to the production connection string}" -Atq -c "$Q" > "$out/production.txt"

echo "Differences (< migrations only, > production only):"
diff "$out/migrations.txt" "$out/production.txt" || true
