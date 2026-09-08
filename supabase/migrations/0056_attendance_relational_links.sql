-- 0056_attendance_relational_links.sql
-- Audit follow-up: fp_attendance.technician and .site were free text —
-- a technician typed their own name differently every time and "site" had
-- no relationship to the actual location hierarchy the rest of the app
-- uses. Adds real links; the old text columns stay for any existing rows
-- and as a display fallback, but the UI now writes technician_id/location_id.

alter table fp_attendance
  add column technician_id uuid references auth.users(id) on delete set null,
  add column location_id uuid references fp_locations(id) on delete set null;

create index fp_attendance_technician_idx on fp_attendance (technician_id);
create index fp_attendance_location_idx on fp_attendance (location_id);

-- A free-text technician name meant anyone could log a check-in under any
-- name. Now that it's a real user link, only that user (or admin/manager,
-- e.g. logging a contractor who isn't self-serving this) can create the row.
drop policy if exists attendance_insert on fp_attendance;
create policy attendance_insert on fp_attendance for insert to authenticated
  with check (
    fp_is_member(org_id)
    and (technician_id = auth.uid() or fp_has_role(org_id, array['org_admin','manager']))
  );

