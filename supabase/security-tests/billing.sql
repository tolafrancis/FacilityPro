-- Plans & billing suite (0086). Every check states the intended behaviour.
-- Run with supabase/security-tests/run.sh.

\ir _harness.sql

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'super@platform.test'),
  ('00000000-0000-0000-0000-0000000000f2', 'admin@platform.test'),
  ('00000000-0000-0000-0000-0000000000f4', 'analyst@platform.test'),
  ('00000000-0000-0000-0000-00000000000a', 'owner@alpha.test'),
  ('00000000-0000-0000-0000-0000000000a1', 'tech@alpha.test'),
  ('00000000-0000-0000-0000-00000000000b', 'owner@beta.test');
\set super   '00000000-0000-0000-0000-0000000000f1'
\set padmin  '00000000-0000-0000-0000-0000000000f2'
\set analyst '00000000-0000-0000-0000-0000000000f4'
\set ownerA  '00000000-0000-0000-0000-00000000000a'
\set techA   '00000000-0000-0000-0000-0000000000a1'
\set ownerB  '00000000-0000-0000-0000-00000000000b'
insert into fp_platform_admins (user_id, role) values (:'super', 'super_admin'), (:'padmin', 'admin'), (:'analyst', 'analyst');

select t.run('authenticated', :'ownerA', $q$select fp_create_organization('Alpha Towers')$q$);
select t.run('authenticated', :'ownerB', $q$select fp_create_organization('Beta Clinic')$q$);
select id as "orgA" from fp_organizations where name = 'Alpha Towers' \gset
select id as "orgB" from fp_organizations where name = 'Beta Clinic' \gset
insert into fp_users_orgs (user_id, org_id, role) values (:'techA', :'orgA', 'technician');

create temp table j (k text, v jsonb);
grant all on j to authenticated, service_role;

-- ===========================================================================
-- Plans and coupons
-- ===========================================================================
select t.run('authenticated', :'super', $q$select fp_admin_save_plan('{"code":"pro","name_i18n":{"en":"Pro","vi":"Pro"},"price":29,"price_year":290,"currency":"USD","limits":{"assets":"250","members":"15","sites":"5"},"stripe_price_month":"price_ProM","stripe_price_year":"price_ProY","paypal_plan_month":"P-PROMONTH","active":true}')$q$) as r \gset
select t.check('billing staff save a plan with prices, limits and provider IDs',
  :'r' = 'ok:1' and (select price_year = 290 and stripe_price_month = 'price_ProM' and paypal_plan_month = 'P-PROMONTH'
                            and limits = '{"assets":250,"members":15,"sites":5}'::jsonb from fp_plans where code = 'pro')
  and exists (select 1 from fp_admin_audit where target_type = 'fp_plans' and target_id = 'pro' and admin_id = :'super'));
select t.check('bad plans are refused: free must stay free, IDs are checked, limits are numbers',
  t.run('authenticated', :'super', $q$select fp_admin_save_plan('{"code":"free","name_i18n":{"en":"Free"},"price":5}')$q$) like 'err:%free_plan%'
  and t.run('authenticated', :'super', $q$select fp_admin_save_plan('{"code":"x1","name_i18n":{"en":"X"},"price":5,"stripe_price_month":"prod_123"}')$q$) like 'err:%invalid_stripe_price%'
  and t.run('authenticated', :'super', $q$select fp_admin_save_plan('{"code":"x1","name_i18n":{"en":"X"},"price":5,"limits":{"assets":"lots"}}')$q$) like 'err:%invalid_limit%');
select t.check('admins without billing rights, analysts and tenants cannot edit plans or coupons',
  t.run('authenticated', :'padmin', $q$select fp_admin_save_plan('{"code":"pro","name_i18n":{"en":"Pro"},"price":1}')$q$) like 'err:%Not authorized%'
  and t.run('authenticated', :'ownerA', $q$select fp_admin_save_coupon('{"code":"FREE100","percent_off":100}')$q$) like 'err:%Not authorized%'
  and t.run('authenticated', :'ownerA', $q$update fp_plans set price = 0 where code = 'pro'$q$) not like 'ok:1');

select t.run('authenticated', :'super', $q$select fp_admin_save_coupon('{"code":"launch20","percent_off":"20","duration":"repeating","duration_months":"3","max_redemptions":"2"}')$q$) as r \gset
select t.check('coupons are saved upper-case with a discount and limits',
  :'r' = 'ok:1' and (select percent_off = 20 and duration_months = 3 and max_redemptions = 2 from fp_coupons where code = 'LAUNCH20')
  and t.run('authenticated', :'super', $q$select fp_admin_save_coupon('{"code":"BOTH","percent_off":"10","amount_off":"5"}')$q$) like 'err:%discount_required%');

-- ===========================================================================
-- Checkout checks (as the tenant)
-- ===========================================================================
select t.run('authenticated', :'ownerA', format($q$insert into j select 'ctx', fp_billing_checkout_context(%L, 'pro', 'year', 'stripe', 'launch20')$q$, :'orgA'));
select t.check('an org admin gets the checkout details: price ID, email, coupon',
  (select v ->> 'price_id' = 'price_ProY' and v ->> 'email' = 'owner@alpha.test' and v -> 'coupon' ->> 'code' = 'LAUNCH20' from j where k = 'ctx'));
select t.check('checkout is refused for non-admins, other tenants, plans not for sale, bad coupons and PayPal coupons',
  t.run('authenticated', :'techA', format($q$select fp_billing_checkout_context(%L, 'pro', 'month', 'stripe')$q$, :'orgA')) like 'err:%Not authorized%'
  and t.run('authenticated', :'ownerB', format($q$select fp_billing_checkout_context(%L, 'pro', 'month', 'stripe')$q$, :'orgA')) like 'err:%Not authorized%'
  and t.run('authenticated', :'ownerA', format($q$select fp_billing_checkout_context(%L, 'pro', 'year', 'paypal')$q$, :'orgA')) like 'err:%plan_not_for_sale%'
  and t.run('authenticated', :'ownerA', format($q$select fp_billing_checkout_context(%L, 'free', 'month', 'stripe')$q$, :'orgA')) like 'err:%unknown_plan%'
  and t.run('authenticated', :'ownerA', format($q$select fp_billing_checkout_context(%L, 'pro', 'month', 'stripe', 'NOPE')$q$, :'orgA')) like 'err:%invalid_coupon%'
  and t.run('authenticated', :'ownerA', format($q$select fp_billing_checkout_context(%L, 'pro', 'month', 'paypal', 'LAUNCH20')$q$, :'orgA')) like 'err:%coupon_card_only%');
select t.check('tenants cannot call the webhook functions',
  t.run('authenticated', :'ownerA', format($q$select fp_billing_sync_subscription(%L, 'business', 'month', 'active', 'stripe', 'cus_1', 'sub_1', now(), now() + interval '1 month')$q$, :'orgA')) like 'err:%permission denied%'
  and t.run('anon', null, $q$select fp_billing_log_event('stripe', 'evt_x', 'x', null)$q$) like 'err:%permission denied%');

-- ===========================================================================
-- Webhooks (as the service role)
-- ===========================================================================
select t.run('service_role', null, $q$insert into j select 'first', to_jsonb(fp_billing_log_event('stripe', 'evt_1', 'checkout.session.completed', 'cs_1'))$q$);
select t.run('service_role', null, $q$insert into j select 'again', to_jsonb(fp_billing_log_event('stripe', 'evt_1', 'checkout.session.completed', 'cs_1'))$q$);
select t.check('each provider event is processed once',
  (select v = 'true' from j where k = 'first') and (select v = 'false' from j where k = 'again'));
select t.run('service_role', null, $q$select fp_billing_finish_event('stripe', 'evt_1', 'failed', 'boom')$q$);
select t.run('service_role', null, $q$insert into j select 'retry', to_jsonb(fp_billing_log_event('stripe', 'evt_1', 'checkout.session.completed', 'cs_1'))$q$);
select t.check('a failed event is processed again when the provider retries it',
  (select v = 'true' from j where k = 'retry'));

select t.run('service_role', null, format($q$select fp_billing_sync_subscription(%L, 'pro', 'year', 'active', 'stripe', 'cus_A', 'sub_A', now(), now() + interval '1 year')$q$, :'orgA')) as r \gset
select t.check('a paid subscription activates the plan, its limits and the tenant tier',
  :'r' = 'ok:1'
  and (select status = 'active' and plan_code = 'pro' and provider = 'stripe' and billing_interval = 'year'
              and provider_subscription_id = 'sub_A' from fp_subscriptions where org_id = :'orgA')
  and fp_plan_limit(:'orgA', 'members') = 15
  and (select subscription_tier = 'pro' from fp_organizations where id = :'orgA'));
select t.check('the organisation is found from its provider IDs',
  (select fp_billing_find_org('stripe', 'sub_A', null)) = :'orgA'::uuid
  and (select fp_billing_find_org('stripe', null, 'cus_A')) = :'orgA'::uuid
  and fp_billing_find_org('paypal', 'sub_A', null) is null);
select t.check('an active tenant cannot start a second provider subscription',
  t.run('authenticated', :'ownerA', format($q$select fp_billing_checkout_context(%L, 'pro', 'month', 'stripe')$q$, :'orgA')) like 'err:%already_subscribed%');

select t.run('service_role', null, format($q$insert into j select 'old', to_jsonb(fp_billing_sync_subscription(%L, 'pro', 'month', 'canceled', 'stripe', 'cus_A', 'sub_OLD', null, null))$q$, :'orgA'));
select t.check('a cancellation for an older subscription is ignored',
  (select v = '"ignored"' from j where k = 'old') and (select status = 'active' from fp_subscriptions where org_id = :'orgA'));

update fp_subscriptions set current_period_end = now() - interval '1 day' where org_id = :'orgA';
select t.check('a renewal that is a day late keeps the paid limits (3-day grace)', fp_plan_limit(:'orgA', 'members') = 15);
update fp_subscriptions set current_period_end = now() - interval '4 days' where org_id = :'orgA';
select t.check('after the grace period the free limits apply', fp_plan_limit(:'orgA', 'members') = 3);
update fp_subscriptions set current_period_end = now() + interval '1 year' where org_id = :'orgA';

select t.run('service_role', null, format($q$insert into j select 'inv', to_jsonb(fp_billing_upsert_invoice('stripe', 'in_1', %L, 'pro', 290, 'usd', 'paid', now(), now() + interval '1 year', now(), 1, 'https://pay.stripe.com/i/1', null, 'pi_1'))$q$, :'orgA'));
select id as "inv1" from fp_platform_invoices where provider_ref = 'in_1' \gset
select t.run('service_role', null, format($q$select fp_billing_upsert_invoice('stripe', 'in_1', %L, 'pro', 290, 'usd', 'open')$q$, :'orgA'));
select t.check('provider invoices get a number, are stored once and never go back from paid',
  (select count(*) = 1 from fp_platform_invoices where provider_ref = 'in_1')
  and (select status = 'paid' and currency = 'USD' and number like 'FP-%' and hosted_url is not null from fp_platform_invoices where id = :'inv1')
  and exists (select 1 from fp_platform_events where type = 'payment_succeeded' and org_id = :'orgA'));

select t.run('service_role', null, format($q$select fp_billing_record_refund(%L, 're_1', 90, 'Partial')$q$, :'inv1'));
select t.run('service_role', null, format($q$select fp_billing_record_refund(%L, 're_1', 90, 'Partial')$q$, :'inv1'));
select t.check('a refund reported twice counts once',
  (select refunded_amount = 90 and status = 'paid' from fp_platform_invoices where id = :'inv1'));
select t.run('service_role', null, format($q$select fp_billing_record_refund(%L, 're_2', 200, 'Rest')$q$, :'inv1'));
select t.check('refunding the rest marks the invoice refunded',
  (select refunded_amount = 290 and status = 'refunded' from fp_platform_invoices where id = :'inv1')
  and (select fp_billing_find_invoice('stripe', 'pi_1')) = :'inv1'::uuid);

-- ===========================================================================
-- Tenant invoice access
-- ===========================================================================
select t.check('an org admin sees their own invoices; members and other tenants do not',
  t.run('authenticated', :'ownerA', $q$select 1 from fp_platform_invoices$q$) = 'ok:1'
  and t.run('authenticated', :'techA', $q$select 1 from fp_platform_invoices$q$) = 'ok:0'
  and t.run('authenticated', :'ownerB', $q$select 1 from fp_platform_invoices$q$) = 'ok:0');
select t.check('tenants cannot change invoices or refunds',
  t.run('authenticated', :'ownerA', format($q$update fp_platform_invoices set status = 'paid' where id = %L$q$, :'inv1')) not like 'ok:1'
  and t.run('authenticated', :'ownerA', format($q$insert into fp_invoice_refunds (invoice_id, amount) values (%L, 1)$q$, :'inv1')) like 'err:%');

-- ===========================================================================
-- Manual invoices
-- ===========================================================================
select t.run('authenticated', :'super', format($q$insert into j select 'man', to_jsonb(fp_admin_create_invoice(jsonb_build_object('org_id', %L, 'amount', 100, 'currency', 'usd', 'coupon_code', 'launch20', 'description', 'Onboarding')))$q$, :'orgB'));
select (v #>> '{}')::uuid as "man" from j where k = 'man' \gset
select t.check('staff create a manual invoice; the coupon discount is applied and redeemed',
  (select amount = 80 and status = 'open' and provider = 'manual' and coupon_code = 'LAUNCH20' and due_at > now() from fp_platform_invoices where id = :'man')
  and (select redemptions = 1 from fp_coupons where code = 'LAUNCH20')
  and exists (select 1 from fp_admin_audit where action = 'invoice.create' and target_id = :'man'));
select t.check('provider invoices cannot be marked paid or voided by hand',
  t.run('authenticated', :'super', format($q$select fp_admin_void_invoice(%L, 'test')$q$, :'inv1')) like 'err:%provider_invoice%');
select t.run('authenticated', :'super', format($q$select fp_admin_mark_invoice_paid(%L)$q$, :'man')) as r \gset
select t.check('a manual invoice is marked paid',
  :'r' = 'ok:1' and (select status = 'paid' and paid_at is not null from fp_platform_invoices where id = :'man'));
select t.check('a refund needs a reason and can''t exceed what was paid',
  t.run('authenticated', :'super', format($q$select fp_admin_refund_manual(%L, 10, '')$q$, :'man')) like 'err:%reason_required%'
  and t.run('authenticated', :'super', format($q$select fp_admin_refund_manual(%L, 81, 'too much')$q$, :'man')) like 'err:%invalid_amount%');
select t.run('authenticated', :'super', format($q$select fp_admin_refund_manual(%L, 80, 'Duplicate payment')$q$, :'man')) as r \gset
select t.check('a full manual refund marks the invoice refunded and is audited',
  :'r' = 'ok:1' and (select status = 'refunded' and refunded_amount = 80 from fp_platform_invoices where id = :'man')
  and exists (select 1 from fp_admin_audit where action = 'invoice.refund' and target_id = :'man'));
select t.check('paid invoices cannot be voided',
  t.run('authenticated', :'super', format($q$select fp_admin_void_invoice(%L, 'oops')$q$, :'man')) like 'err:%invalid_status%');
select t.check('admins without billing rights cannot create invoices',
  t.run('authenticated', :'padmin', format($q$select fp_admin_create_invoice(jsonb_build_object('org_id', %L, 'amount', 5))$q$, :'orgB')) like 'err:%Not authorized%');

-- ===========================================================================
-- Reports
-- ===========================================================================
select t.run('authenticated', :'super', $q$insert into j select 'ov', fp_admin_billing_overview(now() - interval '90 days', now())$q$);
select t.check('the overview reports MRR, ARR, collected and refunded money',
  (select (v -> 'kpis' ->> 'mrr')::numeric > 0 and (v -> 'kpis' ->> 'arr')::numeric = 290
          and (v -> 'kpis' ->> 'collected')::numeric = 370 and (v -> 'kpis' ->> 'refunded')::numeric = 370
          and jsonb_array_length(v -> 'monthly') between 3 and 5
   from j where k = 'ov'));
select t.run('authenticated', :'super', $q$insert into j select 'list', fp_admin_invoices(p_provider => 'manual')$q$);
select t.run('authenticated', :'super', $q$insert into j select 'subs', fp_admin_subscriptions(p_provider => 'stripe')$q$);
select t.check('invoice and subscription lists filter on the server',
  (select (v ->> 'total')::int = 1 and v -> 'rows' -> 0 ->> 'org_name' = 'Beta Clinic' from j where k = 'list')
  and (select (v ->> 'total')::int = 1 and v -> 'rows' -> 0 ->> 'plan_code' = 'pro' and (v -> 'rows' -> 0 ->> 'mrr')::numeric > 0 from j where k = 'subs'));
select t.check('analysts and tenants cannot read billing reports',
  t.run('authenticated', :'analyst', $q$select fp_admin_billing_overview(now() - interval '30 days', now())$q$) like 'err:%Not authorized%'
  and t.run('authenticated', :'ownerA', $q$select fp_admin_invoices()$q$) like 'err:%Not authorized%');

-- ===========================================================================
-- Manual plan changes are open-ended
-- ===========================================================================
update fp_subscriptions set status = 'trialing', current_period_end = now() - interval '5 days' where org_id = :'orgB';
select t.run('authenticated', :'super', format($q$select fp_admin_change_plan(%L, 'business', 'month', 'active')$q$, :'orgB')) as r \gset
select t.check('a manual plan change doesn''t inherit an expired trial end',
  :'r' = 'ok:1' and (select current_period_end is null and provider = 'manual' from fp_subscriptions where org_id = :'orgB')
  and fp_plan_limit(:'orgB', 'members') is null);

\ir _report.sql
