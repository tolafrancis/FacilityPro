-- 0059_security_hardening.sql
-- Fixes the audit's security Blockers (S2-B1..B6). Covered by
-- supabase/security-tests/security_blockers.sql (run via supabase/security-tests/run.sh).
--
--   B1  Membership self-escalation: a member could UPDATE their own
--       fp_users_orgs row (any column), making themselves org_admin of any org.
--   B2  Supabase grants EXECUTE on every public function to anon and
--       authenticated by default, so internal SECURITY DEFINER helpers
--       (workflow actions, notify, cron jobs, seeders) were callable from the
--       API with just the anon key.
--   B3  Org admins could activate paid subscriptions on their own org.
--   B4  Any org admin (i.e. anyone who signs up) could edit the global plan
--       catalogue, including every tenant's payment link.
--   B5  Child rows were only checked against their own org_id; the parent they
--       point at (work order, part, PO line, meter, asset...) could belong to
--       another org, and SECURITY DEFINER triggers then wrote across tenants.
--   B6  Workflow email/SMS/push actions accepted any recipient, turning the
--       platform into an open relay for anyone who signs up.
--
-- Also fixes a production bug found while testing: the event workflow engine
-- passed a RECORD to fp_exec_workflow(fp_workflows), which Postgres rejects —
-- so any org with an active event workflow could not insert the triggering
-- row at all (e.g. requests with a service_request workflow, work orders with
-- a migrated workorder.created auto-assign workflow).
--
-- Requires Postgres 15+ (ON DELETE SET NULL (column) on composite FKs).
--
-- NOTE FOR FUTURE MIGRATIONS: new functions in `public` are no longer
-- executable by anon/authenticated by default. Grant EXECUTE explicitly to the
-- roles that should call them from the API. Trigger functions need no grant.

-- ===========================================================================
-- B5 (part 1) — rows can never move between orgs
-- ===========================================================================
create or replace function fp_forbid_org_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.org_id is distinct from old.org_id then
    raise exception 'org_id cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

do $$
declare r record;
begin
  for r in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'org_id'
      and c.table_name like 'fp\_%' and t.table_type = 'BASE TABLE'
  loop
    execute format('drop trigger if exists trg_fp_forbid_org_change on %I', r.table_name);
    execute format(
      'create trigger trg_fp_forbid_org_change before update of org_id on %I '
      'for each row execute function fp_forbid_org_change()', r.table_name);
  end loop;
end $$;

-- ===========================================================================
-- B1 — membership rows
-- ===========================================================================
-- Members could rewrite their own row (role, org_id). No client code relies on
-- self-updates; preferred_lng changes can get a narrow RPC if ever needed.
drop policy if exists uo_update_self_pref on fp_users_orgs;

-- Members join only through fp_accept_invite / fp_create_organization
-- (SECURITY DEFINER). A direct admin INSERT let an admin enrol any existing
-- user without consent (and then target them with workflow messages).
drop policy if exists uo_admin_insert on fp_users_orgs;

drop policy if exists uo_admin_update on fp_users_orgs;
create policy uo_admin_update on fp_users_orgs for update to authenticated
  using ( fp_has_role(org_id, array['org_admin']) )
  with check ( fp_has_role(org_id, array['org_admin']) and role <> 'super_admin' );

create or replace function fp_users_orgs_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'user_id cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fp_users_orgs_guard on fp_users_orgs;
create trigger trg_fp_users_orgs_guard
  before update on fp_users_orgs
  for each row execute function fp_users_orgs_guard();

-- ===========================================================================
-- B4 — platform operators own the plan catalogue
-- ===========================================================================
create table if not exists fp_platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table fp_platform_admins enable row level security;
-- No policies: managed from the SQL editor / service role only.
--   insert into fp_platform_admins (user_id)
--     select id from auth.users where email = 'you@yourcompany.com';

create or replace function fp_is_platform_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from fp_platform_admins where user_id = auth.uid());
$$;

drop policy if exists plans_write on fp_plans;
create policy plans_write on fp_plans for all to authenticated
  using ( fp_is_platform_admin() )
  with check ( fp_is_platform_admin() );

-- ===========================================================================
-- B3 — subscriptions are written by the platform, not the customer
-- ===========================================================================
drop policy if exists subs_write on fp_subscriptions;
revoke insert, update, delete on fp_subscriptions from anon, authenticated;

drop policy if exists subs_platform_select on fp_subscriptions;
create policy subs_platform_select on fp_subscriptions for select to authenticated
  using ( fp_is_platform_admin() );

alter table fp_subscriptions
  add column if not exists requested_plan_code text references fp_plans(code) on delete set null,
  add column if not exists requested_at        timestamptz,
  add column if not exists cancel_requested_at timestamptz;

-- Carry over customers who clicked "Subscribe" under the old flow, so they
-- show up in the platform queue instead of silently staying 'pending'.
update fp_subscriptions
  set requested_plan_code = plan_code, requested_at = updated_at
  where status = 'pending' and requested_plan_code is null and plan_code is not null;

-- Org admins may edit their org's profile and intake switches, but not its
-- billing tier.
revoke insert, update, delete on fp_organizations from anon, authenticated;
grant update (name, default_lng, active_languages, settings,
              allow_public_requests, auto_create_work_orders)
  on fp_organizations to authenticated;

-- Customer side: record intent only. Nothing here grants a paid plan.
create or replace function fp_request_plan(p_org uuid, p_plan text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not fp_has_role(p_org, array['org_admin']) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if not exists (select 1 from fp_plans where code = p_plan and active) then
    raise exception 'Unknown plan %', p_plan;
  end if;

  insert into fp_subscriptions (org_id, plan_code, status, requested_plan_code, requested_at)
  values (p_org, 'free', 'active', p_plan, now())
  on conflict (org_id) do update
    set requested_plan_code = excluded.requested_plan_code,
        requested_at        = excluded.requested_at,
        cancel_requested_at = null;
end;
$$;

create or replace function fp_request_cancellation(p_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not fp_has_role(p_org, array['org_admin']) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  update fp_subscriptions
    set cancel_requested_at = now(), requested_plan_code = null, requested_at = null
    where org_id = p_org;
end;
$$;

-- Platform side: activate / cancel after payment has been verified.
create or replace function fp_platform_set_subscription(
  p_org      uuid,
  p_plan     text,
  p_status   text,
  p_interval text default 'month'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_end timestamptz;
begin
  if not fp_is_platform_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_status not in ('active','pending','past_due','canceled','trialing') then
    raise exception 'Invalid status %', p_status;
  end if;
  if not exists (select 1 from fp_plans where code = p_plan) then
    raise exception 'Unknown plan %', p_plan;
  end if;

  v_end := case when p_status in ('active','trialing')
                then now() + case when p_interval = 'year' then interval '1 year' else interval '1 month' end
           end;

  insert into fp_subscriptions (org_id, plan_code, status, provider, current_period_start, current_period_end)
  values (p_org, p_plan, p_status, 'manual',
          case when v_end is not null then now() end, v_end)
  on conflict (org_id) do update
    set plan_code            = excluded.plan_code,
        status               = excluded.status,
        provider             = excluded.provider,
        current_period_start = coalesce(excluded.current_period_start, fp_subscriptions.current_period_start),
        current_period_end   = coalesce(excluded.current_period_end, fp_subscriptions.current_period_end),
        requested_plan_code  = null,
        requested_at         = null,
        cancel_requested_at  = case when excluded.status = 'canceled' then null
                                    else fp_subscriptions.cancel_requested_at end;

  update fp_organizations set subscription_tier = p_plan where id = p_org;
end;
$$;

-- Platform queue of subscriptions (pending requests first).
create or replace function fp_platform_subscriptions()
returns table (
  org_id uuid, org_name text, plan_code text, status text,
  requested_plan_code text, requested_at timestamptz,
  cancel_requested_at timestamptz, current_period_end timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not fp_is_platform_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return query
    select s.org_id, o.name, s.plan_code, s.status, s.requested_plan_code, s.requested_at,
           s.cancel_requested_at, s.current_period_end
    from fp_subscriptions s
    join fp_organizations o on o.id = s.org_id
    order by (s.requested_plan_code is null and s.cancel_requested_at is null),
             coalesce(s.requested_at, s.cancel_requested_at) desc nulls last, o.name;
end;
$$;

-- ===========================================================================
-- B5 (part 2) — org-aware foreign keys
-- A child row may only reference a parent in the same org. Added NOT VALID so
-- the migration never fails on legacy data; each is then validated, and any
-- existing cross-org rows are reported as a WARNING for manual cleanup.
-- ===========================================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'fp_work_orders','fp_parts','fp_requests','fp_assets','fp_locations','fp_meters',
    'fp_finance_procurement','fp_procurement_lines','fp_procurement_receipts'
  ] loop
    if not exists (select 1 from pg_constraint where conname = t || '_id_org_uk') then
      execute format('alter table %I add constraint %I unique (id, org_id)', t, t || '_id_org_uk');
    end if;
  end loop;
end $$;

do $$
declare
  fk record;
begin
  for fk in
    select * from (values
      ('fp_wo_parts',          'fp_wo_parts_wo_org_fk',       'work_order_id, org_id',       'fp_work_orders',          'on delete cascade'),
      ('fp_wo_parts',          'fp_wo_parts_part_org_fk',     'part_id, org_id',             'fp_parts',                ''),
      ('fp_wo_labor',          'fp_wo_labor_wo_org_fk',       'work_order_id, org_id',       'fp_work_orders',          'on delete cascade'),
      ('fp_inventory_transactions','fp_inv_tx_part_org_fk',   'part_id, org_id',             'fp_parts',                'on delete cascade'),
      ('fp_procurement_lines', 'fp_proc_lines_po_org_fk',     'procurement_id, org_id',      'fp_finance_procurement',  'on delete cascade'),
      ('fp_procurement_lines', 'fp_proc_lines_part_org_fk',   'part_id, org_id',             'fp_parts',                'on delete set null (part_id)'),
      ('fp_procurement_receipts','fp_proc_receipts_po_org_fk','procurement_id, org_id',      'fp_finance_procurement',  'on delete cascade'),
      ('fp_procurement_receipt_lines','fp_proc_rlines_receipt_org_fk','receipt_id, org_id',  'fp_procurement_receipts', 'on delete cascade'),
      ('fp_procurement_receipt_lines','fp_proc_rlines_line_org_fk','procurement_line_id, org_id','fp_procurement_lines','on delete cascade'),
      ('fp_meter_readings',    'fp_readings_meter_org_fk',    'meter_id, org_id',            'fp_meters',               'on delete cascade'),
      ('fp_meters',            'fp_meters_asset_org_fk',      'asset_id, org_id',            'fp_assets',               'on delete cascade'),
      ('fp_devices',           'fp_devices_meter_org_fk',     'meter_id, org_id',            'fp_meters',               'on delete set null (meter_id)'),
      ('fp_devices',           'fp_devices_asset_org_fk',     'asset_id, org_id',            'fp_assets',               'on delete set null (asset_id)'),
      ('fp_media',             'fp_media_wo_org_fk',          'work_order_id, org_id',       'fp_work_orders',          'on delete cascade'),
      ('fp_media',             'fp_media_request_org_fk',     'request_id, org_id',          'fp_requests',             'on delete cascade'),
      ('fp_approvals',         'fp_approvals_wo_org_fk',      'work_order_id, org_id',       'fp_work_orders',          'on delete cascade'),
      ('fp_checklist_runs',    'fp_clruns_wo_org_fk',         'work_order_id, org_id',       'fp_work_orders',          'on delete cascade'),
      ('fp_work_orders',       'fp_wo_request_org_fk',        'request_id, org_id',          'fp_requests',             'on delete set null (request_id)'),
      ('fp_work_orders',       'fp_wo_asset_org_fk',          'asset_id, org_id',            'fp_assets',               'on delete set null (asset_id)'),
      ('fp_work_orders',       'fp_wo_location_org_fk',       'location_id, org_id',         'fp_locations',            'on delete set null (location_id)'),
      ('fp_requests',          'fp_req_asset_org_fk',         'asset_id, org_id',            'fp_assets',               'on delete set null (asset_id)'),
      ('fp_requests',          'fp_req_location_org_fk',      'location_id, org_id',         'fp_locations',            'on delete set null (location_id)'),
      ('fp_pm_schedules',      'fp_pm_asset_org_fk',          'asset_id, org_id',            'fp_assets',               'on delete set null (asset_id)'),
      ('fp_pm_schedules',      'fp_pm_meter_org_fk',          'meter_id, org_id',            'fp_meters',               'on delete set null (meter_id)'),
      ('fp_pm_required_parts', 'fp_pm_parts_part_org_fk',     'part_id, org_id',             'fp_parts',                'on delete cascade')
    ) as v(tbl, name, cols, parent, action)
  loop
    if not exists (select 1 from pg_constraint where conname = fk.name) then
      execute format('alter table %I add constraint %I foreign key (%s) references %I (%s) %s not valid',
                     fk.tbl, fk.name, fk.cols, fk.parent,
                     case when fk.cols like '%org_id' then 'id, org_id' end, fk.action);
    end if;
    begin
      execute format('alter table %I validate constraint %I', fk.tbl, fk.name);
    exception when foreign_key_violation then
      raise warning '% has existing rows that reference another org (constraint % left NOT VALID; new rows are enforced). Find them with: select * from % c where not exists (select 1 from % p where (p.id, p.org_id) = (c.%))',
        fk.tbl, fk.name, fk.tbl, fk.parent, replace(fk.cols, ', ', ', c.');
    end;
  end loop;
end $$;

-- A device's metric_map may only point at meters of the device's own org.
create or replace function fp_devices_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v text;
begin
  for v in select value from jsonb_each_text(coalesce(new.metric_map, '{}'::jsonb)) loop
    if nullif(v, '') is null then
      continue;
    end if;
    if v !~ '^[0-9a-fA-F-]{36}$'
       or not exists (select 1 from fp_meters where id = v::uuid and org_id = new.org_id) then
      raise exception 'metric_map references a meter outside this organisation' using errcode = '23503';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_fp_devices_guard on fp_devices;
create trigger trg_fp_devices_guard
  before insert or update of metric_map, org_id on fp_devices
  for each row execute function fp_devices_guard();

-- Parts used on a job: admin/manager, or the technician assigned to that job.
alter table fp_wo_parts alter column created_by set default auth.uid();
drop policy if exists wop_insert on fp_wo_parts;
create policy wop_insert on fp_wo_parts for insert to authenticated
  with check (
    fp_has_role(org_id, array['org_admin','manager'])
    or exists (
      select 1 from fp_work_orders w
      where w.id = work_order_id and w.org_id = fp_wo_parts.org_id and w.assigned_to = auth.uid()
    )
  );

alter table fp_media alter column created_by set default auth.uid();

drop policy if exists wo_labor_update on fp_wo_labor;
create policy wo_labor_update on fp_wo_labor for update to authenticated
  using ( user_id = auth.uid() or fp_has_role(org_id, array['org_admin','manager']) )
  with check ( fp_is_member(org_id)
               and (user_id = auth.uid() or fp_has_role(org_id, array['org_admin','manager'])) );

-- ===========================================================================
-- B6 — outbound messages: per-org attribution + daily quota
-- ===========================================================================
alter table fp_notification_outbox
  add column if not exists org_id uuid references fp_organizations(id) on delete cascade;
create index if not exists fp_outbox_org_quota_idx
  on fp_notification_outbox (org_id, channel, created_at);

create or replace function fp_outbox_daily_limit(p_channel text)
returns int
language sql
immutable
as $$
  select case p_channel when 'sms' then 100 when 'push' then 2000 else 500 end;
$$;

create or replace function fp_outbox_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  used int;
begin
  if new.org_id is null or new.status <> 'pending' then
    return new;
  end if;
  -- Serialise per org+channel so concurrent inserts can't overshoot.
  perform pg_advisory_xact_lock(hashtext(new.org_id::text || ':' || new.channel));
  select count(*) into used
    from fp_notification_outbox
    where org_id = new.org_id and channel = new.channel
      and created_at > now() - interval '24 hours'
      and error is distinct from 'daily_quota_exceeded';
  if used >= fp_outbox_daily_limit(new.channel) then
    new.status := 'failed';
    new.error  := 'daily_quota_exceeded';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fp_outbox_quota on fp_notification_outbox;
create trigger trg_fp_outbox_quota
  before insert on fp_notification_outbox
  for each row execute function fp_outbox_quota();

-- Same as 0020, plus org attribution for the quota.
create or replace function fp_enqueue_channels()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
  addr text;
begin
  select email_enabled, sms_enabled, push_enabled, phone
    into p
    from fp_notification_prefs
    where user_id = new.user_id;

  if p is null then
    return new;
  end if;

  if coalesce(p.email_enabled, false) then
    select email into addr from auth.users where id = new.user_id;
    if addr is not null then
      insert into fp_notification_outbox (org_id, user_id, channel, to_address, subject, body)
      values (new.org_id, new.user_id, 'email', addr, new.title, new.body);
    end if;
  end if;

  if coalesce(p.sms_enabled, false) and p.phone is not null and length(p.phone) > 0 then
    insert into fp_notification_outbox (org_id, user_id, channel, to_address, subject, body)
    values (new.org_id, new.user_id, 'sms', p.phone, new.title,
            new.title || coalesce(' — ' || nullif(new.body, ''), ''));
  end if;

  if coalesce(p.push_enabled, false) then
    insert into fp_notification_outbox (org_id, user_id, channel, to_address, subject, body)
    values (new.org_id, new.user_id, 'push', new.user_id::text, new.title, new.body);
  end if;

  return new;
end;
$$;

-- Resolve a workflow recipient to an org member (by user id or email).
create or replace function fp_wf_member(p_org uuid, p_target text)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select uo.user_id
  from fp_users_orgs uo
  join auth.users au on au.id = uo.user_id
  where uo.org_id = p_org
    and (
      (p_target ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        and uo.user_id = p_target::uuid)
      or lower(au.email) = lower(btrim(p_target))
    )
  limit 1;
$$;

-- A member's phone: technician profile first, then notification prefs.
create or replace function fp_wf_member_phone(p_org uuid, p_user uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select nullif(btrim(phone), '') from fp_technician_profiles where org_id = p_org and user_id = p_user),
    (select nullif(btrim(phone), '') from fp_notification_prefs where user_id = p_user)
  );
$$;

-- Same as 0039, but every recipient must be a member of the workflow's org,
-- fault types/locations must belong to it, and outbox rows carry org_id.
-- A rejected recipient raises, so the run is recorded as failed with a reason.
create or replace function fp_run_workflow_action(p_org uuid, p_action jsonb, p_context jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a_type    text := p_action->>'type';
  a_target  text := nullif(btrim(coalesce(p_action->>'target', '')), '');
  a_value   text := p_action->>'value';
  v_ft      uuid;
  v_loc     text;
  v_subject text;
  v_body    text;
  v_wo      text := p_context->>'work_order';
  v_user    uuid;
  v_addr    text;
  v_digits  text;
begin
  if a_type in ('send_email', 'send_approval_email') then
    v_subject := fp_render_template(nullif(p_action->>'subject', ''), p_context);
    if v_subject is null or v_subject = '' then
      v_subject := case a_type
        when 'send_approval_email' then 'FacilitySpace: approval required'
        else 'FacilitySpace: workflow notification'
      end;
    end if;
    v_body := coalesce(fp_render_template(nullif(a_value, ''), p_context), v_subject);
    if a_target is null then
      -- Blank target: in-app notification to admins/managers (which emails
      -- them if they opted in).
      perform fp_wf_notify(p_org, null, v_subject, v_body);
    else
      v_user := fp_wf_member(p_org, a_target);
      if v_user is null then
        raise exception 'Email recipient % is not a member of this organisation', a_target;
      end if;
      select email into v_addr from auth.users where id = v_user;
      insert into fp_notification_outbox (org_id, user_id, channel, to_address, subject, body)
      values (p_org, v_user, 'email', v_addr, v_subject, v_body);
    end if;

  elsif a_type = 'send_sms' then
    if a_target is not null then
      v_user := fp_wf_member(p_org, a_target);
      if v_user is not null then
        v_addr := fp_wf_member_phone(p_org, v_user);
      else
        -- A raw phone number is accepted only if it is a member's number.
        v_digits := regexp_replace(a_target, '[^0-9]', '', 'g');
        select phone into v_addr from (
          select tp.phone from fp_technician_profiles tp where tp.org_id = p_org
          union all
          select np.phone from fp_notification_prefs np
            join fp_users_orgs uo on uo.user_id = np.user_id and uo.org_id = p_org
        ) m
        where length(v_digits) >= 8 and regexp_replace(coalesce(m.phone, ''), '[^0-9]', '', 'g') = v_digits
        limit 1;
      end if;
      if v_addr is null then
        raise exception 'SMS recipient % is not a member of this organisation (or has no phone on file)', a_target;
      end if;
      v_body := coalesce(fp_render_template(nullif(a_value, ''), p_context), 'FacilitySpace alert');
      insert into fp_notification_outbox (org_id, user_id, channel, to_address, subject, body)
      values (p_org, v_user, 'sms', v_addr, 'FacilitySpace alert', v_body);
    end if;

  elsif a_type = 'send_push' then
    if a_target is not null then
      v_user := fp_wf_member(p_org, a_target);
      if v_user is null then
        raise exception 'Push recipient % is not a member of this organisation', a_target;
      end if;
      v_body := coalesce(fp_render_template(nullif(a_value, ''), p_context), 'FacilitySpace alert');
      insert into fp_notification_outbox (org_id, user_id, channel, to_address, subject, body)
      values (p_org, v_user, 'push', v_user::text, 'FacilitySpace alert', v_body);
    end if;

  elsif a_type = 'assign' then
    if a_target is not null then
      v_user := fp_wf_member(p_org, a_target);
      if v_user is null then
        raise exception 'Assignee % is not a member of this organisation', a_target;
      end if;
      if v_wo ~ '^[0-9a-fA-F-]{36}$' then
        update fp_work_orders set assigned_to = v_user
          where id = v_wo::uuid and org_id = p_org;
      end if;
    end if;
    perform fp_wf_notify(p_org, v_user::text, 'Workflow: assignment',
      coalesce(fp_render_template(nullif(a_value, ''), p_context), ''));

  elsif a_type in ('alert_account', 'send_survey') then
    perform fp_wf_notify(
      p_org,
      a_target,
      case a_type when 'alert_account' then 'Workflow: alert' else 'Workflow: survey' end,
      coalesce(
        fp_render_template(nullif(a_value, ''), p_context),
        case when a_type = 'send_survey' then 'Survey: ' || coalesce(a_target, '') else '' end
      )
    );

  elsif a_type = 'create_request' then
    v_ft := null;
    v_loc := p_context->>'location_tag';
    if a_target ~ '^[0-9a-fA-F-]{36}$' then
      select id into v_ft from fp_fault_types where id = a_target::uuid and org_id = p_org;
    end if;
    insert into fp_requests (org_id, title, fault_type_id, location_id, priority, status, channel)
    values (
      p_org,
      coalesce(fp_render_template(nullif(a_value, ''), p_context), 'Workflow-created request'),
      v_ft,
      (select id from fp_locations
        where v_loc ~ '^[0-9a-fA-F-]{36}$' and id = v_loc::uuid and org_id = p_org),
      coalesce(p_context->>'priority', 'medium'),
      'new',
      'web'
    );

  elsif a_type = 'create_expenditure' then
    insert into fp_finance_expenditures (org_id, description, category, amount)
    values (p_org, coalesce(fp_render_template(nullif(a_value, ''), p_context), 'Workflow expenditure'), 'Workflow', 0);
  end if;
end;
$$;

-- ===========================================================================
-- Workflow engine: pass a real fp_workflows row (was RECORD -> cast error).
-- Bodies otherwise identical to 0037 / 0034 / 0035, except the scheduler's
-- dedupe: it compared trigger_ref with the loop variable `rec` from inside the
-- query that produces `rec` (so always the previous/NULL row) and would have
-- re-fired every tick; it now compares with the candidate row itself.
-- ===========================================================================
create or replace function fp_run_workflows(
  p_org          uuid,
  p_trigger_type text,
  p_trigger_ref  text default null,
  p_context      jsonb default '{}'::jsonb
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  wf fp_workflows;
  n  int := 0;
begin
  perform set_config('fp.in_workflow', 'on', true);
  for wf in
    select * from fp_workflows
    where is_active = true and org_id = p_org and trigger_type = p_trigger_type
    order by run_order, created_at
  loop
    if coalesce(wf.cooldown_minutes, 0) > 0
       and wf.last_run_at is not null
       and now() - wf.last_run_at < make_interval(mins => wf.cooldown_minutes) then
      continue;
    end if;

    if fp_exec_workflow(wf, p_trigger_ref, p_context) then
      n := n + 1;
    end if;
  end loop;
  perform set_config('fp.in_workflow', 'off', true);
  return n;
end;
$$;

create or replace function fp_run_scheduled_workflows()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  wf  fp_workflows;
  r   jsonb;
  fld text;
  val numeric;
  rec record;
  ctx jsonb;
  n   int := 0;
begin
  perform set_config('fp.in_workflow', 'on', true);

  for wf in
    select * from fp_workflows
    where is_active = true
      and trigger_type in ('service_request', 'fault_report', 'asset_field')
  loop
    for r in select value from jsonb_array_elements(coalesce(wf.conditions->'rules', '[]'::jsonb)) loop
      fld := r->>'field';
      begin
        val := (r->>'value')::numeric;
      exception when others then
        val := null;
      end;
      if val is null then
        continue;
      end if;

      if fld = 'has_been_pending' and wf.trigger_type in ('service_request', 'fault_report') then
        for rec in
          select * from fp_requests
          where org_id = wf.org_id
            and status not in ('resolved', 'closed', 'rejected')
            and now() - created_at >= make_interval(mins => val::int)
            and not exists (
              select 1 from fp_workflow_runs wr
              where wr.workflow_id = wf.id and wr.trigger_ref = fp_requests.id::text
            )
        loop
          ctx := jsonb_build_object(
            'has_been_pending', round(extract(epoch from (now() - rec.created_at)) / 60.0),
            'priority', rec.priority, 'type', rec.fault_type_id,
            'location_tag', rec.location_id, 'status', rec.status, 'is_complete', 'false');
          if fp_exec_workflow(wf, rec.id::text, ctx) then n := n + 1; end if;
        end loop;

      elsif fld = 'days_since_purchase' and wf.trigger_type = 'asset_field' then
        for rec in
          select * from fp_assets
          where org_id = wf.org_id and purchase_date is not null
            and (current_date - purchase_date) >= val
            and not exists (
              select 1 from fp_workflow_runs wr
              where wr.workflow_id = wf.id and wr.trigger_ref = fp_assets.id::text
            )
        loop
          ctx := jsonb_build_object('days_since_purchase', current_date - rec.purchase_date, 'asset', rec.id);
          if fp_exec_workflow(wf, rec.id::text, ctx) then n := n + 1; end if;
        end loop;

      elsif fld = 'days_before_expiry' and wf.trigger_type = 'asset_field' then
        for rec in
          select * from fp_assets
          where org_id = wf.org_id and warranty_expiry is not null
            and warranty_expiry >= current_date
            and (warranty_expiry - current_date) <= val
            and not exists (
              select 1 from fp_workflow_runs wr
              where wr.workflow_id = wf.id and wr.trigger_ref = fp_assets.id::text
            )
        loop
          ctx := jsonb_build_object('days_before_expiry', rec.warranty_expiry - current_date, 'asset', rec.id);
          if fp_exec_workflow(wf, rec.id::text, ctx) then n := n + 1; end if;
        end loop;
      end if;
    end loop;
  end loop;

  perform set_config('fp.in_workflow', 'off', true);
  return n;
end;
$$;

create or replace function fp_wf_on_expenditure()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  b     record;
  wf    fp_workflows;
  ws    timestamptz;
  pk    text;
  spend numeric;
  ref   text;
  ctx   jsonb;
begin
  if current_setting('fp.in_workflow', true) = 'on' then return new; end if;
  perform set_config('fp.in_workflow', 'on', true);

  for b in select * from fp_finance_budgets where org_id = new.org_id loop
    if lower(b.period) like 'month%' then
      ws := date_trunc('month', now());   pk := to_char(now(), 'YYYYMM');
    elsif lower(b.period) like 'ann%' or lower(b.period) like 'year%' then
      ws := date_trunc('year', now());    pk := to_char(now(), 'YYYY');
    elsif lower(b.period) like 'quarter%' then
      ws := date_trunc('quarter', now()); pk := to_char(now(), 'YYYY"Q"Q');
    else
      ws := '-infinity'::timestamptz;     pk := 'total';
    end if;

    select coalesce(sum(amount), 0) into spend
      from fp_finance_expenditures
      where org_id = new.org_id and created_at >= ws;

    if spend > b.amount then
      ref := b.id::text || ':' || pk;
      ctx := jsonb_build_object(
        'cost_centre', b.id, 'budget_amount', spend, 'budget_limit', b.amount,
        'budget_name', b.name, 'period', b.period);
      for wf in
        select * from fp_workflows
        where org_id = new.org_id and is_active and trigger_type = 'expenditure_budget_exceeded'
        order by run_order, created_at
      loop
        if not exists (
          select 1 from fp_workflow_runs wr where wr.workflow_id = wf.id and wr.trigger_ref = ref
        ) then
          perform fp_exec_workflow(wf, ref, ctx);
        end if;
      end loop;
    end if;
  end loop;

  perform set_config('fp.in_workflow', 'off', true);
  return new;
end; $$;

-- ===========================================================================
-- B2 — scheduled jobs: only the scheduler (pg_cron / service_role), or a
-- manager of the one org being processed. Previously "no auth.uid()" was
-- treated as the scheduler, which is also true for anonymous API callers.
-- ===========================================================================
create or replace function fp_assert_scheduler_or_manager(p_org uuid)
returns void
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if auth.uid() is null then
    -- pg_cron has no JWT at all; edge functions use the service_role JWT.
    if coalesce(auth.role(), 'service_role') <> 'service_role' then
      raise exception 'Not authorized' using errcode = '42501';
    end if;
    return;
  end if;
  if p_org is null or not fp_has_role(p_org, array['org_admin','manager']) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
end;
$$;

-- Same generator as 0051, with the new guard and row locks so overlapping
-- runs (cron + "Generate due now") can't both generate the same schedule.
create or replace function fp_generate_due_pm(p_org uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n int := 0;
  v numeric;
  do_generate boolean;
begin
  perform fp_assert_scheduler_or_manager(p_org);

  for r in
    select * from fp_pm_schedules
    where active and (p_org is null or org_id = p_org)
    for update skip locked
  loop
    do_generate := false;
    v := null;

    if r.trigger_type = 'calendar' then
      if r.next_due_at is not null
         and r.next_due_at - (coalesce(r.lead_time_days, 0) || ' days')::interval <= now() then
        do_generate := true;
      end if;
    elsif r.trigger_type = 'meter' and r.meter_id is not null and r.meter_threshold is not null then
      select value into v
        from fp_meter_readings
        where meter_id = r.meter_id
        order by read_at desc
        limit 1;
      if v is not null and (v - coalesce(r.last_meter_value, 0)) >= r.meter_threshold then
        do_generate := true;
      end if;
    end if;

    if do_generate then
      insert into fp_work_orders
        (org_id, asset_id, title, priority, status, assigned_to, due_at,
         pm_schedule_id, checklist_template_id)
      values
        (r.org_id, r.asset_id,
         coalesce(r.name_i18n->>'en', r.name_i18n->>'vi', 'Preventive maintenance'),
         r.priority, 'assigned', r.assigned_to,
         case when r.trigger_type = 'calendar' then r.next_due_at else now() end,
         r.id, r.checklist_template_id);

      if r.trigger_type = 'calendar' then
        update fp_pm_schedules
          set last_run_at = now(),
              next_due_at = now() + (r.interval_days || ' days')::interval
          where id = r.id;
      else
        update fp_pm_schedules
          set last_run_at = now(),
              last_meter_value = v
          where id = r.id;
      end if;

      n := n + 1;
    end if;
  end loop;

  return n;
end;
$$;

-- Same as 0023, with the new guard.
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
  perform fp_assert_scheduler_or_manager(p_org);

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

-- Same as 0023, with the new guard.
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
  perform fp_assert_scheduler_or_manager(p_org);

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

-- Same as 0049, but only managers of the org may consume its PO sequence.
create or replace function fp_next_po_number(p_org uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq int;
begin
  if not fp_has_role(p_org, array['org_admin','manager']) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  insert into fp_po_counters (org_id, next_seq) values (p_org, 2)
    on conflict (org_id) do update set next_seq = fp_po_counters.next_seq + 1
    returning next_seq - 1 into v_seq;
  return 'PO-' || lpad(v_seq::text, 6, '0');
end;
$$;

-- ===========================================================================
-- B2 — EXECUTE is an allow-list from here on
-- ===========================================================================
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'fp\_%'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- Future functions start closed too (the default privileges Supabase ships
-- grant EXECUTE on new functions to PUBLIC, anon and authenticated).
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
alter default privileges in schema public grant execute on functions to service_role;

-- Anonymous entry points: QR/public fault reporting and device ingest.
grant execute on function fp_public_context(uuid, uuid, uuid) to anon, authenticated;
grant execute on function fp_public_report(uuid, text, text, text, text, uuid, uuid, text) to anon, authenticated;
grant execute on function fp_device_ingest(text, text, numeric, text, timestamptz, jsonb) to anon, authenticated;

-- RLS helpers (evaluated as the caller inside policies, incl. storage).
grant execute on function fp_is_member(uuid) to authenticated;
grant execute on function fp_has_role(uuid, text[]) to authenticated;
grant execute on function fp_has_site_access(uuid, uuid) to authenticated;
grant execute on function fp_location_site(uuid) to authenticated;
grant execute on function fp_is_platform_admin() to authenticated;

-- App RPCs (each checks the caller's role itself).
grant execute on function fp_create_organization(text, text) to authenticated;
grant execute on function fp_accept_invite(uuid) to authenticated;
grant execute on function fp_org_members(uuid) to authenticated;
grant execute on function fp_load_default_catalogs(uuid) to authenticated;
grant execute on function fp_next_po_number(uuid) to authenticated;
grant execute on function fp_emit_workflow_event(uuid, text, text, jsonb) to authenticated;
grant execute on function fp_generate_due_pm(uuid) to authenticated;
grant execute on function fp_escalate_overdue(uuid) to authenticated;
grant execute on function fp_send_expiry_reminders(uuid) to authenticated;
grant execute on function fp_request_plan(uuid, text) to authenticated;
grant execute on function fp_request_cancellation(uuid) to authenticated;
grant execute on function fp_platform_set_subscription(uuid, text, text, text) to authenticated;
grant execute on function fp_platform_subscriptions() to authenticated;
