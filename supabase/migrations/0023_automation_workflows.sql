-- 0023_automation_workflows.sql
-- Automation layer: anonymous public fault reporting, auto request->work order
-- conversion, SLA escalation, and contract/license expiry reminders.

-- Org-level automation switches.
alter table fp_organizations add column allow_public_requests   boolean not null default false;
alter table fp_organizations add column auto_create_work_orders boolean not null default false;

-- Escalation bookkeeping on work orders.
alter table fp_work_orders add column escalated    boolean not null default false;
alter table fp_work_orders add column escalated_at timestamptz;

-- De-dupe expiry reminders.
alter table fp_contracts add column last_reminded_at timestamptz;
alter table fp_licenses  add column last_reminded_at timestamptz;

-- ---------------------------------------------------------------------------
-- Public (anonymous) fault reporting
-- A QR code can point an occupant at /report?org=...&asset=...; these two
-- SECURITY DEFINER functions are the only anonymous entry points, and both
-- refuse orgs that haven't switched public reporting on.
-- ---------------------------------------------------------------------------
create or replace function fp_public_context(
  p_org uuid,
  p_asset uuid default null,
  p_location uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  allowed boolean;
  org_name text;
  asset_name jsonb;
  loc_name jsonb;
begin
  select allow_public_requests, name into allowed, org_name
    from fp_organizations where id = p_org;

  if not coalesce(allowed, false) then
    return jsonb_build_object('allowed', false);
  end if;

  if p_asset is not null then
    select name_i18n into asset_name from fp_assets where id = p_asset and org_id = p_org;
  end if;
  if p_location is not null then
    select name_i18n into loc_name from fp_locations where id = p_location and org_id = p_org;
  end if;

  return jsonb_build_object(
    'allowed', true,
    'org_name', org_name,
    'asset_name', asset_name,
    'location_name', loc_name
  );
end;
$$;

create or replace function fp_public_report(
  p_org uuid,
  p_title text,
  p_body text default null,
  p_severity text default 'medium',
  p_lng text default 'en',
  p_asset uuid default null,
  p_location uuid default null,
  p_reporter text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed boolean;
  sev text;
  new_id uuid;
begin
  select allow_public_requests into allowed from fp_organizations where id = p_org;
  if not coalesce(allowed, false) then
    raise exception 'Public reporting is not enabled for this organization';
  end if;

  sev := case when p_severity in ('low','medium','high','critical') then p_severity else 'medium' end;

  insert into fp_requests
    (org_id, title, body_original, source_lng, asset_id, location_id,
     severity, priority, channel, created_by)
  values
    (p_org,
     coalesce(nullif(p_title, ''), 'Reported issue'),
     nullif(trim(coalesce(p_body, '') || case when p_reporter is not null
            then E'\n\n— ' || p_reporter else '' end), ''),
     coalesce(p_lng, 'en'), p_asset, p_location,
     sev, sev, 'qr', null)
  returning id into new_id;

  return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Auto-convert a new request into a work order (when the org opts in).
-- The work order then runs through the existing assignment + SLA triggers.
-- ---------------------------------------------------------------------------
create or replace function fp_auto_create_wo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  auto_on boolean;
begin
  select auto_create_work_orders into auto_on from fp_organizations where id = new.org_id;
  if coalesce(auto_on, false) then
    insert into fp_work_orders (org_id, request_id, asset_id, title, priority, status)
    values (new.org_id, new.id, new.asset_id,
            coalesce(new.title, 'Work order'), new.priority, 'assigned');
  end if;
  return new;
end;
$$;

create trigger trg_fp_auto_create_wo
  after insert on fp_requests
  for each row execute function fp_auto_create_wo();

-- ---------------------------------------------------------------------------
-- SLA escalation: overdue, unresolved work orders are flagged and managers
-- are notified (once). Run on a schedule (e.g. hourly) via pg_cron.
-- ---------------------------------------------------------------------------
create or replace function fp_escalate_overdue(p_org uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  u record;
  n int := 0;
begin
  if auth.uid() is not null then
    if p_org is null or not fp_has_role(p_org, array['org_admin','manager']) then
      raise exception 'Not authorized';
    end if;
  end if;

  for r in
    select * from fp_work_orders
    where not escalated
      and due_at is not null and due_at < now()
      and status in ('assigned','in_progress','on_hold')
      and (p_org is null or org_id = p_org)
  loop
    update fp_work_orders set escalated = true, escalated_at = now() where id = r.id;
    for u in
      select user_id from fp_users_orgs
      where org_id = r.org_id and role in ('org_admin','manager')
    loop
      insert into fp_notifications (org_id, user_id, kind, title, body, link)
      values (r.org_id, u.user_id, 'sla_breach', 'Work order overdue',
              coalesce(r.title, ''), '/work-orders/' || r.id);
    end loop;
    n := n + 1;
  end loop;

  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Expiry reminders for contracts and licenses (within reminder_days, at most
-- once a week). Run daily via pg_cron.
-- ---------------------------------------------------------------------------
create or replace function fp_send_expiry_reminders(p_org uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  u record;
  n int := 0;
begin
  if auth.uid() is not null then
    if p_org is null or not fp_has_role(p_org, array['org_admin','manager']) then
      raise exception 'Not authorized';
    end if;
  end if;

  for r in
    select id, org_id, title as label, expiry_date, 'contract' as kind
      from fp_contracts
      where expiry_date is not null
        and expiry_date <= current_date + (reminder_days || ' days')::interval
        and (last_reminded_at is null or last_reminded_at < now() - interval '7 days')
        and (p_org is null or org_id = p_org)
    union all
    select id, org_id, name as label, expiry_date, 'license' as kind
      from fp_licenses
      where expiry_date is not null
        and expiry_date <= current_date + (reminder_days || ' days')::interval
        and (last_reminded_at is null or last_reminded_at < now() - interval '7 days')
        and (p_org is null or org_id = p_org)
  loop
    for u in
      select user_id from fp_users_orgs
      where org_id = r.org_id and role in ('org_admin','manager')
    loop
      insert into fp_notifications (org_id, user_id, kind, title, body, link)
      values (r.org_id, u.user_id, 'expiry_reminder',
              case when r.kind = 'contract' then 'Contract expiring' else 'License expiring' end,
              coalesce(r.label, '') || ' · ' || to_char(r.expiry_date, 'YYYY-MM-DD'),
              '/vendors');
    end loop;

    if r.kind = 'contract' then
      update fp_contracts set last_reminded_at = now() where id = r.id;
    else
      update fp_licenses set last_reminded_at = now() where id = r.id;
    end if;
    n := n + 1;
  end loop;

  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Execution grants. Cron/automation functions must NOT be callable by anon
-- (anon has no auth.uid and would otherwise process every org). Public
-- reporting functions are explicitly opened to anon.
-- ---------------------------------------------------------------------------
revoke execute on function fp_generate_due_pm(uuid)        from public;
revoke execute on function fp_escalate_overdue(uuid)        from public;
revoke execute on function fp_send_expiry_reminders(uuid)   from public;
grant execute on function fp_generate_due_pm(uuid)          to authenticated, service_role;
grant execute on function fp_escalate_overdue(uuid)         to authenticated, service_role;
grant execute on function fp_send_expiry_reminders(uuid)    to authenticated, service_role;

grant execute on function fp_public_context(uuid, uuid, uuid)                      to anon, authenticated;
grant execute on function fp_public_report(uuid, text, text, text, text, uuid, uuid, text) to anon, authenticated;

-- Optional automation (run once after enabling pg_cron):
--   select cron.schedule('fp-escalate', '0 * * * *', $$ select fp_escalate_overdue(); $$);
--   select cron.schedule('fp-expiry',   '0 7 * * *', $$ select fp_send_expiry_reminders(); $$);
