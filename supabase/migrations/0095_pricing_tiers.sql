-- 0095_pricing_tiers.sql
-- Five plans, matching the public pricing page and the brochure:
--   Free $0 · Starter $29 · Professional $49 · Business $99 · Enterprise (custom)
--
--   * 'pro' keeps its code (the 14-day trial and existing subscriptions use
--     it) and becomes Professional: $49, 25 staff, 5 sites, 1,000 assets.
--   * New 'starter' and 'enterprise' plans. Enterprise has no list price:
--     fp_plans.contact_sales marks it, and the Billing page shows "Custom"
--     with a request button instead of a checkout.
--   * Yearly prices are ten months' worth (two months free).
--   * Only staff (org_admin, manager, technician) count towards the member
--     limit. Occupants and vendors are unlimited on every plan.
--   * Provider price IDs (Stripe/PayPal) are not touched: after a price
--     change they must be updated in the platform admin's plan editor.

alter table fp_plans add column if not exists contact_sales boolean not null default false;

insert into fp_plans (code, name_i18n, price, price_year, currency, interval, limits, features, sort, active, contact_sales) values
  ('free', '{"en":"Free","vi":"Miễn phí"}', 0, null, 'USD', 'month',
    '{"members":3,"sites":1,"assets":25}',
    '["Issue reporting & QR codes", "Work orders with photos", "Mobile app, works offline", "Assets & locations", "Basic reports"]',
    0, true, false),
  ('starter', '{"en":"Starter","vi":"Khởi đầu"}', 29, 290, 'USD', 'month',
    '{"members":10,"sites":2,"assets":150}',
    '["Everything in Free", "Preventive maintenance", "Checklists", "Parts & inventory", "Tenant portal", "Email & push notifications"]',
    1, true, false),
  ('pro', '{"en":"Professional","vi":"Chuyên nghiệp"}', 49, 490, 'USD', 'month',
    '{"members":25,"sites":5,"assets":1000}',
    '["Everything in Starter", "Workflows & automation", "SLA targets & approvals", "Meters & meter-based maintenance", "Vendors, contracts & documents", "Surveys & broadcasts", "Email & Zalo inbox", "Room & desk booking", "Permits to work", "Budgets, procurement & invoices", "IoT sensors & alerts", "Technician attendance", "TV display boards", "Smart assistant & sentiment scoring", "Full reports & dashboards", "Email support"]',
    2, true, false),
  ('business', '{"en":"Business","vi":"Doanh nghiệp"}', 99, 990, 'USD', 'month',
    '{"members":75,"sites":20}',
    '["Everything in Professional", "Priority support", "Onboarding help", "SMS alerts & WhatsApp inbox"]',
    3, true, false),
  ('enterprise', '{"en":"Enterprise","vi":"Doanh nghiệp lớn"}', 0, null, 'USD', 'month',
    '{}',
    '["Everything in Business", "Custom integrations", "Modbus gateway set-up", "Data import", "Dedicated contact", "Invoice billing"]',
    4, true, true)
on conflict (code) do update set
  name_i18n = excluded.name_i18n,
  price = excluded.price,
  price_year = excluded.price_year,
  limits = excluded.limits,
  features = excluded.features,
  sort = excluded.sort,
  active = excluded.active,
  contact_sales = excluded.contact_sales;

-- ===========================================================================
-- Only staff count towards the member limit
-- ===========================================================================
create or replace function fp_enforce_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  k    text := tg_argv[0];
  lim  int;
  used int;
begin
  -- Occupants and vendors are free on every plan.
  -- (Nested: only fp_users_orgs and fp_invites rows have a role.)
  if k = 'members' then
    if new.role not in ('org_admin', 'manager', 'technician') then
      return new;
    end if;
  end if;
  lim := fp_plan_limit(new.org_id, k);
  if lim is null then
    return new;
  end if;
  -- Serialise per organisation and limit so parallel inserts can't overshoot.
  perform pg_advisory_xact_lock(hashtext(new.org_id::text || ':plan:' || k));
  used := case k
    when 'assets'  then (select count(*) from fp_assets where org_id = new.org_id and status not in ('retired', 'disposed'))
    when 'sites'   then (select count(*) from fp_sites where org_id = new.org_id)
    when 'members' then fp_staff_count(new.org_id)
                        + case when tg_table_name = 'fp_invites'
                               then (select count(*) from fp_invites
                                     where org_id = new.org_id and accepted_at is null and expires_at > now()
                                       and role in ('org_admin', 'manager', 'technician'))
                               else 0 end
  end;
  if used >= lim then
    raise exception 'plan_limit_reached:%', k
      using errcode = 'P0001',
            detail = format('Your plan allows %s %s. Upgrade under Billing to add more.', lim, k);
  end if;
  return new;
end;
$$;

create or replace function fp_staff_count(p_org uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from fp_users_orgs
  where org_id = p_org and role in ('org_admin', 'manager', 'technician');
$$;
revoke all on function fp_staff_count(uuid) from public, anon, authenticated;

-- Billing page: usage and the limits in force (members = staff).
create or replace function fp_plan_usage(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not fp_is_member(p_org) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'assets',  jsonb_build_object('used', (select count(*) from fp_assets where org_id = p_org and status not in ('retired', 'disposed')),
                                  'limit', fp_plan_limit(p_org, 'assets')),
    'members', jsonb_build_object('used', fp_staff_count(p_org),
                                  'limit', fp_plan_limit(p_org, 'members')),
    'sites',   jsonb_build_object('used', (select count(*) from fp_sites where org_id = p_org),
                                  'limit', fp_plan_limit(p_org, 'sites')),
    'trial_ends_at', (select current_period_end from fp_subscriptions
                      where org_id = p_org and status = 'trialing')
  );
end;
$$;
