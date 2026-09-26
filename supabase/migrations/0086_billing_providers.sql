-- 0086: plans & billing — Stripe and PayPal, invoices, refunds, coupons,
-- revenue reports.
--
--   * Payments: tenants subscribe through Stripe Checkout or PayPal
--     subscriptions (edge function billing-checkout). The providers report
--     back to billing-webhook, which records every event once
--     (fp_billing_events) and applies it with the service-only functions
--     below: subscription state, invoices, refunds, coupon redemptions.
--     A provider subscription keeps its plan limits for 3 days past the
--     period end, so a late renewal webhook never drops a paying tenant to
--     the free limits.
--   * Staff (billing.view / billing.manage):
--       revenue overview (MRR, ARR, collected, outstanding, failed,
--       refunded; monthly revenue by provider and plan)
--       invoice list with search and filters; manual invoices: create, mark
--       paid, void, refund (Stripe/PayPal refunds go through the
--       admin-billing function, which refunds at the provider first)
--       subscription list; plan and coupon editing
--   * Tenant org admins read their own organisation's invoices.
--   * fp_admin_change_plan: a manual active plan no longer inherits an old
--     trial end date (which silently dropped it to free limits later).
-- Covered by supabase/security-tests/billing.sql.

-- ===========================================================================
-- Schema
-- ===========================================================================
alter table fp_platform_invoices
  add column if not exists description          text,
  add column if not exists hosted_url           text,
  add column if not exists pdf_url              text,
  add column if not exists provider_payment_ref text,
  add column if not exists void_reason          text,
  add column if not exists created_by           uuid;
create index if not exists fp_platform_invoices_payment_ref_idx
  on fp_platform_invoices (provider, provider_payment_ref) where provider_payment_ref is not null;

alter table fp_subscriptions
  add column if not exists cancel_at_period_end boolean not null default false;

create sequence if not exists fp_invoice_number_seq;

create or replace function fp_next_invoice_number()
returns text
language sql
volatile
set search_path = public
as $$
  select 'FP-' || to_char(now() at time zone 'utc', 'YYYY') || '-' || lpad(nextval('fp_invoice_number_seq')::text, 6, '0');
$$;

-- Refunds: one row per provider refund, so a refund reported twice (by the
-- admin panel and again by the webhook) counts once.
create table if not exists fp_invoice_refunds (
  id                 uuid primary key default gen_random_uuid(),
  invoice_id         uuid not null references fp_platform_invoices(id) on delete cascade,
  provider_refund_id text,
  amount             numeric not null check (amount > 0),
  reason             text,
  created_by         uuid,
  created_at         timestamptz not null default now()
);
create unique index if not exists fp_invoice_refunds_provider_uk
  on fp_invoice_refunds (invoice_id, provider_refund_id) where provider_refund_id is not null;

create or replace function fp_invoice_refunds_apply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  total numeric;
begin
  select coalesce(sum(amount), 0) into total from fp_invoice_refunds where invoice_id = new.invoice_id;
  update fp_platform_invoices
     set refunded_amount = least(amount, total),
         status = case when total >= amount then 'refunded' else status end
   where id = new.invoice_id;
  return new;
end;
$$;
drop trigger if exists trg_fp_invoice_refunds_apply on fp_invoice_refunds;
create trigger trg_fp_invoice_refunds_apply after insert on fp_invoice_refunds
  for each row execute function fp_invoice_refunds_apply();

-- Every provider webhook, recorded once (no payloads: just what happened).
create table if not exists fp_billing_events (
  id           bigint generated always as identity primary key,
  provider     text not null check (provider in ('stripe', 'paypal')),
  event_id     text not null,
  type         text not null,
  object_id    text,
  org_id       uuid references fp_organizations(id) on delete set null,
  status       text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed')),
  error        text,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, event_id)
);
create index if not exists fp_billing_events_at_idx on fp_billing_events (received_at desc);

alter table fp_invoice_refunds enable row level security;
alter table fp_billing_events enable row level security;
drop policy if exists admin_read on fp_invoice_refunds;
create policy admin_read on fp_invoice_refunds for select to authenticated using ( fp_admin_can('billing.view') );
drop policy if exists admin_read on fp_billing_events;
create policy admin_read on fp_billing_events for select to authenticated using ( fp_admin_can('billing.view') );
revoke insert, update, delete on fp_invoice_refunds, fp_billing_events from anon, authenticated;

-- Tenant org admins see their organisation's invoices (and nothing else's).
drop policy if exists invoices_org_admin_select on fp_platform_invoices;
create policy invoices_org_admin_select on fp_platform_invoices for select to authenticated
  using ( fp_has_role(org_id, array['org_admin']) and status <> 'draft' );

-- ===========================================================================
-- Plan limits: grace period for provider subscriptions
-- ===========================================================================
create or replace function fp_plan_limit(p_org uuid, p_key text)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select (coalesce(
    (select p.limits from fp_subscriptions s join fp_plans p on p.code = s.plan_code
      where s.org_id = p_org and s.status in ('active', 'trialing', 'past_due')
        and (s.status <> 'past_due' or s.provider in ('stripe', 'paypal'))
        and coalesce(s.current_period_end, 'infinity')
            + case when s.provider in ('stripe', 'paypal') then interval '3 days' else interval '0' end > now()),
    (select limits from fp_plans where code = 'free')
  ) ->> p_key)::int;
$$;

-- ===========================================================================
-- Service functions (billing-webhook / billing-checkout / admin-billing)
-- ===========================================================================
create or replace function fp_billing_log_event(p_provider text, p_event_id text, p_type text, p_object text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  insert into fp_billing_events (provider, event_id, type, object_id)
  values (p_provider, left(p_event_id, 200), left(p_type, 100), left(p_object, 200))
  on conflict (provider, event_id) do nothing;
  get diagnostics n = row_count;
  if n = 0 then
    -- Seen before: process again only if it failed last time.
    update fp_billing_events set status = 'received', error = null
     where provider = p_provider and event_id = p_event_id and status = 'failed';
    get diagnostics n = row_count;
  end if;
  return n > 0;
end;
$$;

create or replace function fp_billing_finish_event(p_provider text, p_event_id text, p_status text, p_error text default null, p_org uuid default null)
returns void
language sql
security definer
set search_path = public
as $$
  update fp_billing_events
     set status = p_status, error = left(p_error, 1000), org_id = coalesce(p_org, org_id), processed_at = now()
   where provider = p_provider and event_id = p_event_id;
$$;

create or replace function fp_billing_find_org(p_provider text, p_subscription text, p_customer text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from fp_subscriptions
   where provider = p_provider
     and ((p_subscription is not null and provider_subscription_id = p_subscription)
          or (p_customer is not null and provider_customer_id = p_customer))
   order by (provider_subscription_id = p_subscription) desc nulls last
   limit 1;
$$;

-- Plan and interval for a provider price / plan id.
create or replace function fp_billing_plan_for_price(p_provider text, p_price text)
returns table (plan_code text, billing_interval text)
language sql
stable
security definer
set search_path = public
as $$
  select code, case when p_price in (stripe_price_year, paypal_plan_year) then 'year' else 'month' end
  from fp_plans
  where (p_provider = 'stripe' and p_price in (stripe_price_month, stripe_price_year))
     or (p_provider = 'paypal' and p_price in (paypal_plan_month, paypal_plan_year))
  limit 1;
$$;

-- Applies a provider's view of a subscription. Returns 'applied' or
-- 'ignored' (an older subscription reporting after the tenant moved on).
create or replace function fp_billing_sync_subscription(
  p_org uuid, p_plan text, p_interval text, p_status text, p_provider text,
  p_customer text, p_subscription text, p_period_start timestamptz, p_period_end timestamptz,
  p_cancel_at_period_end boolean default false, p_trial_end timestamptz default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  cur fp_subscriptions;
  v_plan text;
begin
  if p_provider not in ('stripe', 'paypal') or p_status not in ('active', 'trialing', 'past_due', 'canceled', 'pending') then
    raise exception 'invalid_value' using errcode = '22023';
  end if;
  if not exists (select 1 from fp_organizations where id = p_org) then
    raise exception 'unknown_org' using errcode = 'P0002';
  end if;
  select * into cur from fp_subscriptions where org_id = p_org;
  -- A different, older provider subscription must not overwrite the current one.
  if cur.provider_subscription_id is not null and cur.provider_subscription_id is distinct from p_subscription
     and cur.status in ('active', 'trialing', 'past_due') and cur.provider in ('stripe', 'paypal')
     and p_status in ('canceled', 'pending') then
    return 'ignored';
  end if;
  v_plan := case when exists (select 1 from fp_plans where code = p_plan) then p_plan else coalesce(cur.plan_code, 'free') end;

  insert into fp_subscriptions (org_id, plan_code, status, provider, billing_interval, provider_customer_id,
                                provider_subscription_id, current_period_start, current_period_end,
                                cancel_at_period_end, trial_ends_at)
  values (p_org, v_plan, p_status, p_provider, coalesce(p_interval, 'month'), p_customer, p_subscription,
          p_period_start, p_period_end, coalesce(p_cancel_at_period_end, false), p_trial_end)
  on conflict (org_id) do update
    set plan_code = excluded.plan_code, status = excluded.status, provider = excluded.provider,
        billing_interval = excluded.billing_interval,
        provider_customer_id = coalesce(excluded.provider_customer_id, fp_subscriptions.provider_customer_id),
        provider_subscription_id = excluded.provider_subscription_id,
        current_period_start = coalesce(excluded.current_period_start, fp_subscriptions.current_period_start),
        current_period_end = coalesce(excluded.current_period_end, fp_subscriptions.current_period_end),
        cancel_at_period_end = excluded.cancel_at_period_end,
        trial_ends_at = coalesce(excluded.trial_ends_at, fp_subscriptions.trial_ends_at),
        requested_plan_code = case when excluded.status in ('active', 'trialing') then null else fp_subscriptions.requested_plan_code end,
        requested_at = case when excluded.status in ('active', 'trialing') then null else fp_subscriptions.requested_at end,
        cancel_requested_at = case when excluded.cancel_at_period_end then coalesce(fp_subscriptions.cancel_requested_at, now()) end,
        canceled_at = case when excluded.status = 'canceled' then coalesce(fp_subscriptions.canceled_at, now()) end,
        updated_at = now();

  update fp_organizations
     set subscription_tier = case when p_status in ('active', 'trialing', 'past_due') then v_plan else 'free' end
   where id = p_org;
  return 'applied';
end;
$$;

-- Creates or updates a provider invoice. A paid invoice never goes back to
-- open/failed because of an out-of-order event; refunds and voids stay.
create or replace function fp_billing_upsert_invoice(
  p_provider text, p_ref text, p_org uuid, p_plan text, p_amount numeric, p_currency text, p_status text,
  p_period_start timestamptz default null, p_period_end timestamptz default null, p_paid_at timestamptz default null,
  p_attempts int default null, p_hosted_url text default null, p_pdf_url text default null,
  p_payment_ref text default null, p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_provider not in ('stripe', 'paypal') or p_status not in ('open', 'paid', 'failed', 'void') or p_ref is null then
    raise exception 'invalid_value' using errcode = '22023';
  end if;
  insert into fp_platform_invoices (number, org_id, plan_code, amount, currency, status, provider, provider_ref,
                                    period_start, period_end, paid_at, failed_at, attempts, hosted_url, pdf_url,
                                    provider_payment_ref, description)
  values (fp_next_invoice_number(), p_org,
          case when exists (select 1 from fp_plans where code = p_plan) then p_plan end,
          greatest(coalesce(p_amount, 0), 0), upper(coalesce(p_currency, 'USD')), p_status, p_provider, p_ref,
          p_period_start, p_period_end,
          case when p_status = 'paid' then coalesce(p_paid_at, now()) end,
          case when p_status = 'failed' then now() end,
          coalesce(p_attempts, case when p_status in ('paid', 'failed') then 1 else 0 end),
          p_hosted_url, p_pdf_url, p_payment_ref, left(p_description, 300))
  on conflict (provider, provider_ref) where provider_ref is not null do update
    set status = case
                   when fp_platform_invoices.status in ('refunded', 'void') then fp_platform_invoices.status
                   when fp_platform_invoices.status = 'paid' and excluded.status in ('open', 'failed') then 'paid'
                   else excluded.status end,
        amount = excluded.amount,
        paid_at = coalesce(fp_platform_invoices.paid_at, excluded.paid_at),
        failed_at = case when excluded.status = 'failed' then now() else fp_platform_invoices.failed_at end,
        attempts = greatest(fp_platform_invoices.attempts, excluded.attempts),
        hosted_url = coalesce(excluded.hosted_url, fp_platform_invoices.hosted_url),
        pdf_url = coalesce(excluded.pdf_url, fp_platform_invoices.pdf_url),
        provider_payment_ref = coalesce(excluded.provider_payment_ref, fp_platform_invoices.provider_payment_ref),
        period_start = coalesce(excluded.period_start, fp_platform_invoices.period_start),
        period_end = coalesce(excluded.period_end, fp_platform_invoices.period_end)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function fp_billing_find_invoice(p_provider text, p_ref text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from fp_platform_invoices
   where provider = p_provider and (provider_ref = p_ref or provider_payment_ref = p_ref)
   order by issued_at desc limit 1;
$$;

create or replace function fp_billing_record_refund(p_invoice uuid, p_refund_id text, p_amount numeric,
                                                    p_reason text default null, p_admin uuid default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  insert into fp_invoice_refunds (invoice_id, provider_refund_id, amount, reason, created_by)
  values (p_invoice, p_refund_id, p_amount, left(p_reason, 500), p_admin)
  on conflict (invoice_id, provider_refund_id) where provider_refund_id is not null do nothing;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

create or replace function fp_billing_redeem_coupon(p_code text)
returns void
language sql
security definer
set search_path = public
as $$
  update fp_coupons set redemptions = redemptions + 1 where code = upper(p_code);
$$;

-- ===========================================================================
-- Tenant checkout: checks run with the tenant's own token
-- ===========================================================================
-- Called by billing-checkout as the signed-in user. Refuses anything but an
-- org admin of an open organisation buying an active plan the provider can
-- sell; returns what the function needs to start the payment.
create or replace function fp_billing_checkout_context(p_org uuid, p_plan text, p_interval text, p_provider text, p_coupon text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  pl fp_plans;
  s  fp_subscriptions;
  c  fp_coupons;
  v_price text;
begin
  if not fp_has_role(p_org, array['org_admin']) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_interval not in ('month', 'year') or p_provider not in ('stripe', 'paypal') then
    raise exception 'invalid_value' using errcode = '22023';
  end if;
  select * into pl from fp_plans where code = p_plan and active;
  if pl.code is null or pl.price <= 0 then
    raise exception 'unknown_plan' using errcode = '22023';
  end if;
  v_price := case p_provider
    when 'stripe' then case p_interval when 'year' then pl.stripe_price_year else pl.stripe_price_month end
    else case p_interval when 'year' then pl.paypal_plan_year else pl.paypal_plan_month end end;
  if v_price is null then
    raise exception 'plan_not_for_sale' using errcode = '22023', detail = 'This plan can''t be bought this way yet.';
  end if;
  select * into s from fp_subscriptions where org_id = p_org;
  if s.provider in ('stripe', 'paypal') and s.status in ('active', 'trialing', 'past_due') and s.provider_subscription_id is not null then
    raise exception 'already_subscribed' using errcode = '22023',
      detail = 'This organisation already pays by ' || s.provider || '. Change or cancel that subscription first.';
  end if;
  if nullif(btrim(coalesce(p_coupon, '')), '') is not null then
    if p_provider <> 'stripe' then
      raise exception 'coupon_card_only' using errcode = '22023', detail = 'Coupons work with card payments only.';
    end if;
    select * into c from fp_coupons where code = upper(btrim(p_coupon)) and active
       and (expires_at is null or expires_at > now()) and (max_redemptions is null or redemptions < max_redemptions);
    if c.code is null then
      raise exception 'invalid_coupon' using errcode = '22023', detail = 'This coupon code isn''t valid.';
    end if;
  end if;
  return jsonb_build_object(
    'org_name', (select name from fp_organizations where id = p_org),
    'email', (select email from auth.users where id = auth.uid()),
    'plan_name', coalesce(pl.name_i18n ->> 'en', pl.code),
    'price_id', v_price,
    'customer_id', case when s.provider = p_provider then s.provider_customer_id end,
    'coupon', case when c.code is null then null else jsonb_build_object(
      'code', c.code, 'percent_off', c.percent_off, 'amount_off', c.amount_off, 'currency', c.currency,
      'duration', c.duration, 'duration_months', c.duration_months) end);
end;
$$;

-- The org's provider subscription, for "manage billing" / "cancel" (org admins).
create or replace function fp_billing_my_subscription(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not fp_has_role(p_org, array['org_admin']) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return (select jsonb_build_object('provider', provider, 'customer_id', provider_customer_id,
                                    'subscription_id', provider_subscription_id, 'status', status)
          from fp_subscriptions where org_id = p_org);
end;
$$;

-- ===========================================================================
-- Staff: overview and reports
-- ===========================================================================
create or replace function fp_admin_billing_overview(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from timestamptz := least(p_from, p_to);
  v_to   timestamptz := greatest(p_from, p_to);
  result jsonb;
begin
  perform fp_admin_require('billing.view');
  if v_to - v_from > interval '3 years' then
    v_from := v_to - interval '3 years';
  end if;
  with subs as (
    select s.*, fp_sub_mrr(s.plan_code, s.billing_interval) as mrr
    from fp_subscriptions s join fp_organizations o on o.id = s.org_id
    where o.deleted_at is null and o.suspended_at is null
  ),
  paying as (select * from subs where status in ('active', 'past_due') and coalesce(mrr, 0) > 0),
  inv as (select * from fp_platform_invoices where status <> 'draft'),
  months as (select generate_series(date_trunc('month', v_from), date_trunc('month', v_to), interval '1 month') as m)
  select jsonb_build_object(
    'range', jsonb_build_object('from', v_from, 'to', v_to),
    'kpis', jsonb_build_object(
      'mrr', (select coalesce(round(sum(mrr), 2), 0) from paying),
      'arr', (select coalesce(round(sum(mrr) * 12, 2), 0) from paying),
      'paying_tenants', (select count(*) from paying),
      'arpu', (select coalesce(round(avg(mrr), 2), 0) from paying),
      'trials', (select count(*) from subs where status = 'trialing'),
      'past_due', (select count(*) from subs where status = 'past_due'),
      'cancel_scheduled', (select count(*) from subs where cancel_at_period_end and status in ('active', 'trialing', 'past_due')),
      'collected', (select coalesce(sum(amount), 0) from inv where status in ('paid', 'refunded') and paid_at between v_from and v_to),
      'refunded', (select coalesce(sum(r.amount), 0) from fp_invoice_refunds r where r.created_at between v_from and v_to)
                  + (select coalesce(sum(i.refunded_amount), 0) from inv i where i.paid_at between v_from and v_to
                       and not exists (select 1 from fp_invoice_refunds r where r.invoice_id = i.id)),
      'outstanding', (select coalesce(sum(amount), 0) from inv where status = 'open'),
      'outstanding_count', (select count(*) from inv where status = 'open'),
      'failed', (select coalesce(sum(amount), 0) from inv where status = 'failed' and coalesce(failed_at, issued_at) between v_from and v_to),
      'failed_count', (select count(*) from inv where status = 'failed' and coalesce(failed_at, issued_at) between v_from and v_to)
    ),
    'monthly', (select coalesce(jsonb_agg(jsonb_build_object(
                   't', m.m,
                   'net', coalesce((select sum(i.amount - i.refunded_amount) from inv i
                                    where i.status in ('paid', 'refunded') and date_trunc('month', i.paid_at) = m.m), 0),
                   'stripe', coalesce((select sum(i.amount - i.refunded_amount) from inv i
                                    where i.provider = 'stripe' and i.status in ('paid', 'refunded') and date_trunc('month', i.paid_at) = m.m), 0),
                   'paypal', coalesce((select sum(i.amount - i.refunded_amount) from inv i
                                    where i.provider = 'paypal' and i.status in ('paid', 'refunded') and date_trunc('month', i.paid_at) = m.m), 0),
                   'manual', coalesce((select sum(i.amount - i.refunded_amount) from inv i
                                    where i.provider = 'manual' and i.status in ('paid', 'refunded') and date_trunc('month', i.paid_at) = m.m), 0)
                 ) order by m.m), '[]') from months m),
    'by_provider', (select coalesce(jsonb_agg(x order by x.amount desc), '[]') from (
                     select provider, sum(amount - refunded_amount) as amount, count(*) as invoices
                     from inv where status in ('paid', 'refunded') and paid_at between v_from and v_to group by provider) x),
    'by_plan', (select coalesce(jsonb_agg(x order by x.mrr desc), '[]') from (
                  select coalesce(plan_code, 'none') as plan, count(*) as tenants, round(sum(mrr), 2) as mrr
                  from paying group by 1) x),
    'attention', (select coalesce(jsonb_agg(x order by x.at desc), '[]') from (
                    select i.id, i.number, i.org_id, o.name as org_name, i.amount, i.currency, i.status, i.provider,
                           coalesce(i.failed_at, i.issued_at) as at
                    from inv i join fp_organizations o on o.id = i.org_id
                    where i.status in ('failed', 'open') order by coalesce(i.failed_at, i.issued_at) desc limit 8) x)
  ) into result;
  return result;
end;
$$;

create or replace function fp_admin_invoices(
  p_search   text default null,
  p_status   text default null,
  p_provider text default null,
  p_org      uuid default null,
  p_from     timestamptz default null,
  p_to       timestamptz default null,
  p_sort     text default 'issued_at',
  p_desc     boolean default true,
  p_limit    int default 25,
  p_offset   int default 0,
  p_ids      uuid[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit  int := least(greatest(coalesce(p_limit, 25), 1), 5000);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_sort   text := case when p_sort in ('issued_at', 'amount', 'number', 'org', 'status', 'paid_at') then p_sort else 'issued_at' end;
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  result   jsonb;
begin
  perform fp_admin_require('billing.view');
  with filtered as (
    select i.id, i.number, i.org_id, o.name as org_name, i.plan_code, i.amount, i.currency, i.status, i.provider,
           i.provider_ref, i.issued_at, i.due_at, i.paid_at, i.failed_at, i.attempts, i.refunded_amount,
           i.period_start, i.period_end, i.description, i.hosted_url, i.coupon_code
    from fp_platform_invoices i join fp_organizations o on o.id = i.org_id
    where (p_ids is null or i.id = any(p_ids))
      and (v_search is null or i.number ilike '%' || v_search || '%' or o.name ilike '%' || v_search || '%'
           or i.provider_ref = v_search or i.id::text = v_search)
      and (p_status is null or i.status = p_status)
      and (p_provider is null or i.provider = p_provider)
      and (p_org is null or i.org_id = p_org)
      and (p_from is null or i.issued_at >= p_from)
      and (p_to is null or i.issued_at <= p_to)
  ),
  page as (
    select * from filtered
    order by
      case when not p_desc then case v_sort when 'number' then number when 'org' then lower(org_name) when 'status' then status end end asc nulls last,
      case when p_desc then case v_sort when 'number' then number when 'org' then lower(org_name) when 'status' then status end end desc nulls last,
      case when not p_desc then case v_sort when 'issued_at' then extract(epoch from issued_at) when 'paid_at' then extract(epoch from paid_at)
                                            when 'amount' then amount end end asc nulls last,
      case when p_desc then case v_sort when 'issued_at' then extract(epoch from issued_at) when 'paid_at' then extract(epoch from paid_at)
                                        when 'amount' then amount end end desc nulls last,
      id
    limit v_limit offset v_offset
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'sum', (select coalesce(sum(amount), 0) from filtered),
    'rows', coalesce((select jsonb_agg(to_jsonb(page)) from page), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function fp_admin_invoice(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v jsonb;
begin
  perform fp_admin_require('billing.view');
  select to_jsonb(i) || jsonb_build_object('org_name', o.name) into v
  from fp_platform_invoices i join fp_organizations o on o.id = i.org_id where i.id = p_id;
  if v is null then
    raise exception 'Invoice not found' using errcode = 'P0002';
  end if;
  return v || jsonb_build_object('refunds', coalesce((
    select jsonb_agg(jsonb_build_object('id', r.id, 'amount', r.amount, 'reason', r.reason, 'at', r.created_at,
                                        'provider_refund_id', r.provider_refund_id,
                                        'by', (select email from auth.users where id = r.created_by)) order by r.created_at)
    from fp_invoice_refunds r where r.invoice_id = p_id), '[]'::jsonb));
end;
$$;

create or replace function fp_admin_subscriptions(
  p_search   text default null,
  p_status   text default null,
  p_provider text default null,
  p_sort     text default 'mrr',
  p_desc     boolean default true,
  p_limit    int default 25,
  p_offset   int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit  int := least(greatest(coalesce(p_limit, 25), 1), 5000);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_sort   text := case when p_sort in ('mrr', 'org', 'period_end', 'status', 'plan') then p_sort else 'mrr' end;
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  result   jsonb;
begin
  perform fp_admin_require('billing.view');
  with filtered as (
    select s.org_id, o.name as org_name, s.plan_code, s.billing_interval, s.status, coalesce(s.provider, 'manual') as provider,
           s.provider_subscription_id, s.current_period_end, s.trial_ends_at, s.cancel_at_period_end,
           s.requested_plan_code, s.cancel_requested_at,
           case when s.status in ('active', 'past_due') then coalesce(round(fp_sub_mrr(s.plan_code, s.billing_interval), 2), 0) else 0 end as mrr
    from fp_subscriptions s join fp_organizations o on o.id = s.org_id
    where o.deleted_at is null
      and (v_search is null or o.name ilike '%' || v_search || '%' or s.provider_subscription_id = v_search)
      and (p_status is null or s.status = p_status)
      and (p_provider is null or coalesce(s.provider, 'manual') = p_provider)
  ),
  page as (
    select * from filtered
    order by
      case when not p_desc then case v_sort when 'org' then lower(org_name) when 'status' then status when 'plan' then plan_code end end asc nulls last,
      case when p_desc then case v_sort when 'org' then lower(org_name) when 'status' then status when 'plan' then plan_code end end desc nulls last,
      case when not p_desc then case v_sort when 'mrr' then mrr when 'period_end' then extract(epoch from current_period_end) end end asc nulls last,
      case when p_desc then case v_sort when 'mrr' then mrr when 'period_end' then extract(epoch from current_period_end) end end desc nulls last,
      org_id
    limit v_limit offset v_offset
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', coalesce((select jsonb_agg(to_jsonb(page)) from page), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

-- ===========================================================================
-- Staff: manual invoices
-- ===========================================================================
create or replace function fp_admin_create_invoice(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org    uuid := nullif(p ->> 'org_id', '')::uuid;
  v_amount numeric := (p ->> 'amount')::numeric;
  v_cur    text := upper(coalesce(nullif(p ->> 'currency', ''), 'USD'));
  v_status text := coalesce(nullif(p ->> 'status', ''), 'open');
  v_due    int := coalesce((p ->> 'due_days')::int, 14);
  v_coupon fp_coupons;
  v_id     uuid;
begin
  perform fp_admin_require('billing.manage');
  if v_org is null or not exists (select 1 from fp_organizations where id = v_org and deleted_at is null) then
    raise exception 'unknown_org' using errcode = '22023', detail = 'Choose a tenant.';
  end if;
  if v_amount is null or v_amount <= 0 or v_amount > 100000000 then
    raise exception 'invalid_amount' using errcode = '22023', detail = 'Enter an amount above zero.';
  end if;
  if v_cur !~ '^[A-Z]{3}$' or v_status not in ('open', 'paid') or v_due < 0 or v_due > 90 then
    raise exception 'invalid_value' using errcode = '22023';
  end if;
  if nullif(p ->> 'plan_code', '') is not null and not exists (select 1 from fp_plans where code = p ->> 'plan_code') then
    raise exception 'unknown_plan' using errcode = '22023';
  end if;
  if nullif(p ->> 'coupon_code', '') is not null then
    select * into v_coupon from fp_coupons where code = upper(p ->> 'coupon_code') and active
       and (expires_at is null or expires_at > now()) and (max_redemptions is null or redemptions < max_redemptions);
    if v_coupon.code is null then
      raise exception 'invalid_coupon' using errcode = '22023', detail = 'This coupon code isn''t valid.';
    end if;
    v_amount := greatest(0, round(case when v_coupon.percent_off is not null then v_amount * (1 - v_coupon.percent_off / 100)
                                       else v_amount - v_coupon.amount_off end, 2));
    update fp_coupons set redemptions = redemptions + 1 where code = v_coupon.code;
  end if;

  insert into fp_platform_invoices (number, org_id, plan_code, amount, currency, status, provider, coupon_code,
                                    description, period_start, period_end, due_at, paid_at, attempts, created_by)
  values (fp_next_invoice_number(), v_org, nullif(p ->> 'plan_code', ''), v_amount, v_cur,
          case when v_amount = 0 then 'paid' else v_status end, 'manual', v_coupon.code,
          left(nullif(btrim(p ->> 'description'), ''), 300),
          nullif(p ->> 'period_start', '')::timestamptz, nullif(p ->> 'period_end', '')::timestamptz,
          now() + make_interval(days => v_due),
          case when v_status = 'paid' or v_amount = 0 then now() end,
          case when v_status = 'paid' then 1 else 0 end, auth.uid())
  returning id into v_id;
  perform fp_admin_log('invoice.create', 'fp_platform_invoices', v_id::text, v_org, null,
                       (select to_jsonb(i) from fp_platform_invoices i where id = v_id));
  return v_id;
end;
$$;

create or replace function fp_admin_manual_invoice(p_id uuid)
returns fp_platform_invoices
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  inv fp_platform_invoices;
begin
  perform fp_admin_require('billing.manage');
  select * into inv from fp_platform_invoices where id = p_id;
  if inv.id is null then
    raise exception 'Invoice not found' using errcode = 'P0002';
  end if;
  if inv.provider <> 'manual' then
    raise exception 'provider_invoice' using errcode = '22023',
      detail = 'This invoice is managed by ' || inv.provider || '. Use the refund or cancel actions instead.';
  end if;
  return inv;
end;
$$;

create or replace function fp_admin_mark_invoice_paid(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  inv fp_platform_invoices := fp_admin_manual_invoice(p_id);
begin
  if inv.status not in ('open', 'failed', 'draft') then
    raise exception 'invalid_status' using errcode = '22023', detail = 'Only open or failed invoices can be marked paid.';
  end if;
  update fp_platform_invoices set status = 'paid', paid_at = now(), attempts = attempts + 1 where id = p_id;
  perform fp_admin_log('invoice.mark_paid', 'fp_platform_invoices', p_id::text, inv.org_id, to_jsonb(inv), null);
end;
$$;

create or replace function fp_admin_void_invoice(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  inv fp_platform_invoices := fp_admin_manual_invoice(p_id);
begin
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'reason_required' using errcode = '22023', detail = 'Give a reason (3–500 characters).';
  end if;
  if inv.status not in ('open', 'failed', 'draft') then
    raise exception 'invalid_status' using errcode = '22023', detail = 'Only unpaid invoices can be voided; refund a paid one.';
  end if;
  update fp_platform_invoices set status = 'void', void_reason = left(btrim(p_reason), 500) where id = p_id;
  perform fp_admin_log('invoice.void', 'fp_platform_invoices', p_id::text, inv.org_id, to_jsonb(inv),
                       jsonb_build_object('reason', btrim(p_reason)));
end;
$$;

create or replace function fp_admin_refund_manual(p_id uuid, p_amount numeric, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  inv fp_platform_invoices := fp_admin_manual_invoice(p_id);
begin
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'reason_required' using errcode = '22023', detail = 'Give a reason (3–500 characters).';
  end if;
  if inv.status not in ('paid', 'refunded') then
    raise exception 'invalid_status' using errcode = '22023', detail = 'Only paid invoices can be refunded.';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > inv.amount - inv.refunded_amount then
    raise exception 'invalid_amount' using errcode = '22023', detail = 'Refund between 0 and the amount not yet refunded.';
  end if;
  insert into fp_invoice_refunds (invoice_id, amount, reason, created_by) values (p_id, p_amount, left(btrim(p_reason), 500), auth.uid());
  perform fp_admin_log('invoice.refund', 'fp_platform_invoices', p_id::text, inv.org_id, to_jsonb(inv),
                       jsonb_build_object('amount', p_amount, 'reason', btrim(p_reason)));
end;
$$;

-- ===========================================================================
-- Staff: plans and coupons
-- ===========================================================================
create or replace function fp_admin_save_plan(p jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code   text := lower(btrim(coalesce(p ->> 'code', '')));
  v_limits jsonb := '{}'::jsonb;
  k        text;
  v_price  numeric := (p ->> 'price')::numeric;
  v_year   numeric := nullif(p ->> 'price_year', '')::numeric;
  v_active boolean := coalesce((p ->> 'active')::boolean, true);
begin
  perform fp_admin_require('billing.manage');
  if v_code !~ '^[a-z0-9_]{2,32}$' then
    raise exception 'invalid_code' using errcode = '22023', detail = 'Use 2–32 lowercase letters, digits or _.';
  end if;
  if coalesce(btrim(p -> 'name_i18n' ->> 'en'), '') = '' then
    raise exception 'name_required' using errcode = '22023', detail = 'Give the plan an English name.';
  end if;
  if v_price is null or v_price < 0 or (v_year is not null and v_year < 0) then
    raise exception 'invalid_price' using errcode = '22023', detail = 'Prices can''t be negative.';
  end if;
  if v_code = 'free' and (v_price <> 0 or not v_active) then
    raise exception 'free_plan' using errcode = '22023', detail = 'The free plan stays free and active: it is the fallback for every tenant.';
  end if;
  if coalesce(p ->> 'currency', 'USD') !~ '^[A-Z]{3}$' then
    raise exception 'invalid_value' using errcode = '22023';
  end if;
  foreach k in array array['assets', 'members', 'sites'] loop
    if nullif(p -> 'limits' ->> k, '') is not null then
      if (p -> 'limits' ->> k) !~ '^\d{1,7}$' then
        raise exception 'invalid_limit' using errcode = '22023', detail = 'Limits are whole numbers; leave empty for unlimited.';
      end if;
      v_limits := v_limits || jsonb_build_object(k, (p -> 'limits' ->> k)::int);
    end if;
  end loop;
  if coalesce(p ->> 'stripe_price_month', '') !~ '^(price_[A-Za-z0-9]+)?$' or coalesce(p ->> 'stripe_price_year', '') !~ '^(price_[A-Za-z0-9]+)?$' then
    raise exception 'invalid_stripe_price' using errcode = '22023', detail = 'Stripe price IDs start with price_.';
  end if;
  if coalesce(p ->> 'paypal_plan_month', '') !~ '^(P-[A-Z0-9]+)?$' or coalesce(p ->> 'paypal_plan_year', '') !~ '^(P-[A-Z0-9]+)?$' then
    raise exception 'invalid_paypal_plan' using errcode = '22023', detail = 'PayPal plan IDs start with P-.';
  end if;
  if jsonb_typeof(coalesce(p -> 'features', '[]')) <> 'array' then
    raise exception 'invalid_value' using errcode = '22023';
  end if;

  insert into fp_plans (code, name_i18n, price, price_year, currency, interval, limits, features, sort, active,
                        stripe_price_month, stripe_price_year, paypal_plan_month, paypal_plan_year)
  values (v_code,
          jsonb_build_object('en', btrim(p -> 'name_i18n' ->> 'en'), 'vi', coalesce(nullif(btrim(p -> 'name_i18n' ->> 'vi'), ''), btrim(p -> 'name_i18n' ->> 'en'))),
          v_price, v_year, coalesce(p ->> 'currency', 'USD'), 'month', v_limits, coalesce(p -> 'features', '[]'),
          coalesce((p ->> 'sort')::int, (select coalesce(max(sort), 0) + 1 from fp_plans)), v_active,
          nullif(p ->> 'stripe_price_month', ''), nullif(p ->> 'stripe_price_year', ''),
          nullif(p ->> 'paypal_plan_month', ''), nullif(p ->> 'paypal_plan_year', ''))
  on conflict (code) do update
    set name_i18n = excluded.name_i18n, price = excluded.price, price_year = excluded.price_year,
        currency = excluded.currency, limits = excluded.limits, features = excluded.features,
        sort = coalesce((p ->> 'sort')::int, fp_plans.sort), active = excluded.active,
        stripe_price_month = excluded.stripe_price_month, stripe_price_year = excluded.stripe_price_year,
        paypal_plan_month = excluded.paypal_plan_month, paypal_plan_year = excluded.paypal_plan_year;
  return v_code;
end;
$$;

create or replace function fp_admin_save_coupon(p jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(btrim(coalesce(p ->> 'code', '')));
begin
  perform fp_admin_require('billing.manage');
  if v_code !~ '^[A-Z0-9_-]{3,32}$' then
    raise exception 'invalid_code' using errcode = '22023', detail = 'Use 3–32 letters, digits, - or _.';
  end if;
  if (nullif(p ->> 'percent_off', '') is null) = (nullif(p ->> 'amount_off', '') is null) then
    raise exception 'discount_required' using errcode = '22023', detail = 'Give either a percentage or an amount off.';
  end if;
  if coalesce(p ->> 'duration', 'once') = 'repeating' and nullif(p ->> 'duration_months', '') is null then
    raise exception 'months_required' using errcode = '22023', detail = 'Say for how many months the discount repeats.';
  end if;
  insert into fp_coupons (code, description, percent_off, amount_off, currency, duration, duration_months,
                          max_redemptions, expires_at, active)
  values (v_code, left(nullif(btrim(p ->> 'description'), ''), 200),
          nullif(p ->> 'percent_off', '')::numeric, nullif(p ->> 'amount_off', '')::numeric,
          case when nullif(p ->> 'amount_off', '') is not null then upper(coalesce(nullif(p ->> 'currency', ''), 'USD')) end,
          coalesce(nullif(p ->> 'duration', ''), 'once'),
          case when p ->> 'duration' = 'repeating' then nullif(p ->> 'duration_months', '')::int end,
          nullif(p ->> 'max_redemptions', '')::int, nullif(p ->> 'expires_at', '')::timestamptz,
          coalesce((p ->> 'active')::boolean, true))
  on conflict (code) do update
    -- The discount itself can't change once created (Stripe coupons are fixed);
    -- the description, limits, expiry and switch can.
    set description = excluded.description, max_redemptions = excluded.max_redemptions,
        expires_at = excluded.expires_at, active = excluded.active;
  return v_code;
end;
$$;

-- ===========================================================================
-- Fix: manual plan changes are open-ended
-- ===========================================================================
create or replace function fp_admin_change_plan(p_org uuid, p_plan text, p_interval text default 'month', p_status text default 'active')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  before jsonb;
begin
  perform fp_admin_require('tenants.manage');
  if not exists (select 1 from fp_plans where code = p_plan) then
    raise exception 'unknown_plan' using errcode = '22023';
  end if;
  if p_interval not in ('month', 'year') or p_status not in ('active', 'trialing', 'past_due', 'canceled') then
    raise exception 'invalid_value' using errcode = '22023';
  end if;
  select to_jsonb(s) into before from fp_subscriptions s where org_id = p_org;
  insert into fp_subscriptions (org_id, plan_code, status, provider, billing_interval, current_period_start)
  values (p_org, p_plan, p_status, 'manual', p_interval, now())
  on conflict (org_id) do update
    set plan_code = excluded.plan_code, status = excluded.status, billing_interval = excluded.billing_interval,
        provider = 'manual', provider_subscription_id = null, cancel_at_period_end = false,
        -- A manual plan has no end date unless it is a trial.
        current_period_end = case when excluded.status = 'trialing' then fp_subscriptions.current_period_end end,
        requested_plan_code = null, requested_at = null,
        canceled_at = case when excluded.status = 'canceled' then fp_subscriptions.canceled_at end,
        updated_at = now();
  update fp_organizations
     set subscription_tier = case when p_status = 'canceled' then 'free' else p_plan end
   where id = p_org;
  perform fp_admin_log('tenant.change_plan', 'fp_subscriptions', p_org::text, p_org, before,
                       (select to_jsonb(s) from fp_subscriptions s where org_id = p_org));
end;
$$;

-- ===========================================================================
-- Grants
-- ===========================================================================
revoke execute on function fp_next_invoice_number(), fp_invoice_refunds_apply(),
  fp_billing_log_event(text, text, text, text), fp_billing_finish_event(text, text, text, text, uuid),
  fp_billing_find_org(text, text, text), fp_billing_plan_for_price(text, text),
  fp_billing_sync_subscription(uuid, text, text, text, text, text, text, timestamptz, timestamptz, boolean, timestamptz),
  fp_billing_upsert_invoice(text, text, uuid, text, numeric, text, text, timestamptz, timestamptz, timestamptz, int, text, text, text, text),
  fp_billing_find_invoice(text, text), fp_billing_record_refund(uuid, text, numeric, text, uuid),
  fp_billing_redeem_coupon(text), fp_billing_checkout_context(uuid, text, text, text, text),
  fp_billing_my_subscription(uuid), fp_admin_billing_overview(timestamptz, timestamptz),
  fp_admin_invoices(text, text, text, uuid, timestamptz, timestamptz, text, boolean, int, int, uuid[]),
  fp_admin_invoice(uuid), fp_admin_subscriptions(text, text, text, text, boolean, int, int),
  fp_admin_create_invoice(jsonb), fp_admin_manual_invoice(uuid), fp_admin_mark_invoice_paid(uuid),
  fp_admin_void_invoice(uuid, text), fp_admin_refund_manual(uuid, numeric, text),
  fp_admin_save_plan(jsonb), fp_admin_save_coupon(jsonb) from public, anon, authenticated;

-- Webhook and payment functions: service role only (edge functions).
grant execute on function fp_billing_log_event(text, text, text, text), fp_billing_finish_event(text, text, text, text, uuid),
  fp_billing_find_org(text, text, text), fp_billing_plan_for_price(text, text),
  fp_billing_sync_subscription(uuid, text, text, text, text, text, text, timestamptz, timestamptz, boolean, timestamptz),
  fp_billing_upsert_invoice(text, text, uuid, text, numeric, text, text, timestamptz, timestamptz, timestamptz, int, text, text, text, text),
  fp_billing_find_invoice(text, text), fp_billing_record_refund(uuid, text, numeric, text, uuid),
  fp_billing_redeem_coupon(text) to service_role;
grant usage on sequence fp_invoice_number_seq to service_role;

-- Signed-in callers: the functions check the role or permission themselves.
grant execute on function fp_billing_checkout_context(uuid, text, text, text, text), fp_billing_my_subscription(uuid),
  fp_admin_billing_overview(timestamptz, timestamptz),
  fp_admin_invoices(text, text, text, uuid, timestamptz, timestamptz, text, boolean, int, int, uuid[]),
  fp_admin_invoice(uuid), fp_admin_subscriptions(text, text, text, text, boolean, int, int),
  fp_admin_create_invoice(jsonb), fp_admin_mark_invoice_paid(uuid), fp_admin_void_invoice(uuid, text),
  fp_admin_refund_manual(uuid, numeric, text), fp_admin_save_plan(jsonb), fp_admin_save_coupon(jsonb) to authenticated;
