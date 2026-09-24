-- 0073_realtime_notifications.sql
-- Audit finding S4-M1: notifications only appeared on reload. The bell now
-- subscribes to new rows through Supabase Realtime (which applies RLS: a
-- user only receives their own notifications).

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'fp_notifications') then
      alter publication supabase_realtime add table fp_notifications;
    end if;
  else
    raise warning '0073: publication supabase_realtime not found (not a Supabase database?); notifications will refresh by polling only.';
  end if;
end $$;
