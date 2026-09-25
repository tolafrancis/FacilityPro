-- Admin panel demo data: 20 tenants, 200 users, subscriptions, invoices,
-- support tickets, activity, requests and work orders, spread over the last
-- 12 months, so every admin screen has something realistic to show.
--
-- FOR A LOCAL OR STAGING DATABASE ONLY. It refuses to run unless you opt in
-- in the same session:
--
--   set fp.allow_demo_seed = 'yes';
--   \i supabase/seed/admin_demo.sql
--
-- Everything it creates is marked (settings.demo = true on organisations,
-- @demo.facilitypro.test emails), and the block at the end removes it all.
-- Demo users have no password; they exist to be listed, not to sign in.

do $$
begin
  if coalesce(current_setting('fp.allow_demo_seed', true), '') <> 'yes' then
    raise exception 'Demo seed refused: run "set fp.allow_demo_seed = ''yes'';" first, and only on a local or staging database.';
  end if;
  if exists (select 1 from fp_organizations where settings ->> 'demo' = 'true') then
    raise exception 'Demo data is already loaded. Run the clean-up block at the end of this file first.';
  end if;
end $$;

do $$
declare
  names text[] := array[
    'Saigon Tower Management', 'Hanoi Medical Center', 'Mekong Logistics', 'Danang Resort & Spa', 'Lotus Offices',
    'Phu My Hung Estates', 'VinaSteel Works', 'Highland Hotels Group', 'Bach Mai Clinic Network', 'Cantho Cold Chain',
    'Riverside Residences', 'Sunrise Manufacturing', 'Metro Retail Parks', 'Blue Ocean Shipping', 'Green Campus University',
    'Pagoda Heritage Trust', 'City Government Facilities', 'Golden Lotus Mall', 'Northwind Data Centers', 'Harbor View Apartments'];
  industries text[] := array['property_management', 'health_care', 'fleet_management', 'hospitality', 'facility_management',
    'property_management', 'manufacturing', 'hospitality', 'health_care', 'fleet_management',
    'property_management', 'manufacturing', 'property_management', 'fleet_management', 'government',
    'religious', 'government', 'property_management', 'facility_management', 'property_management'];
  first_names text[] := array['Lan', 'Minh', 'Hoa', 'Tuan', 'Mai', 'Duc', 'Linh', 'Quang', 'Thu', 'Nam', 'An', 'Bao', 'Chi', 'Dung', 'Giang', 'Hai', 'Khanh', 'Long', 'Ngoc', 'Phuong'];
  last_names text[] := array['Nguyen', 'Tran', 'Le', 'Pham', 'Hoang', 'Vu', 'Dang', 'Bui', 'Do', 'Ho'];
  roles text[] := array['org_admin', 'manager', 'technician', 'technician', 'technician', 'occupant', 'occupant', 'occupant', 'vendor', 'technician'];
  plans text[] := array['business', 'pro', 'pro', 'free'];
  v_org uuid;
  v_user uuid;
  v_created timestamptz;
  v_plan text;
  v_status text;
  v_interval text;
  v_price numeric;
  i int;
  j int;
  k int;
  n_users int;
  u_idx int := 0;
  inv_no int := 1000;
  v_loc uuid;
  v_site uuid;
  v_ticket uuid;
begin
  for i in 1 .. 20 loop
    v_created := now() - make_interval(days => (365 - i * 17));
    insert into fp_organizations (name, default_lng, industry, created_at, currency, contact_name, contact_email, contact_phone, address, settings,
                                  subdomain, last_active_at)
    values (names[i], case when i % 3 = 0 then 'en' else 'vi' end, industries[i], v_created,
            case when i % 4 = 0 then 'USD' else 'VND' end,
            first_names[1 + i % 20] || ' ' || last_names[1 + i % 10],
            'ops' || i || '@demo.facilitypro.test', '+84 90 ' || lpad((1000000 + i * 7919)::text, 7, '0'),
            (10 + i) || ' Nguyen Hue, District 1, Ho Chi Minh City',
            jsonb_build_object('demo', true, 'timezone', 'Asia/Ho_Chi_Minh'),
            'demo-' || lower(regexp_replace(split_part(names[i], ' ', 1), '[^a-zA-Z]', '', 'g')) || i,
            case when i % 7 = 0 then now() - interval '40 days' else now() - make_interval(hours => i * 5) end)
    returning id into v_org;
    update fp_platform_events set at = v_created where org_id = v_org and type = 'signup';

    -- Plan mix: most paying, some trials, a past-due, two cancelled, one suspended.
    v_plan := plans[1 + i % 4];
    v_interval := case when i % 5 = 0 then 'year' else 'month' end;
    v_status := case when i in (18, 19) then 'trialing' when i = 12 then 'past_due' when i in (7, 15) then 'canceled' else 'active' end;
    insert into fp_subscriptions (org_id, plan_code, status, provider, billing_interval, current_period_start, current_period_end, trial_ends_at, canceled_at, note)
    -- Starts active (or trialing); past-due and cancelled are set after the
    -- users join, the way real tenants get there.
    values (v_org, case when v_status = 'trialing' then 'pro' else v_plan end, case when v_status = 'trialing' then 'trialing' else 'active' end,
            case when i % 3 = 0 then 'paypal' when i % 3 = 1 then 'stripe' else 'manual' end, v_interval,
            date_trunc('month', now()), date_trunc('month', now()) + interval '1 month',
            case when v_status = 'trialing' then now() + make_interval(days => 3 + i) end,
            null, 'Demo');
    if i = 16 then
      update fp_organizations set suspended_at = now() - interval '2 days', suspended_reason = 'Unpaid invoices (demo)' where id = v_org;
    end if;

    -- Invoices: one per month since sign-up for paying tenants.
    select price into v_price from fp_plans where code = v_plan;
    if v_status <> 'trialing' and coalesce(v_price, 0) > 0 then
      for k in 0 .. least(11, (extract(epoch from now() - v_created) / 2592000)::int) loop
        inv_no := inv_no + 1;
        insert into fp_platform_invoices (number, org_id, plan_code, amount, currency, status, provider, issued_at, paid_at, failed_at, attempts, refunded_amount, period_start, period_end)
        values ('INV-' || inv_no, v_org, v_plan, v_price, 'USD',
                case when i = 12 and k = 0 then 'failed' when i = 3 and k = 2 then 'refunded' when k = 0 and i % 6 = 0 then 'open' else 'paid' end,
                case when i % 3 = 0 then 'paypal' when i % 3 = 1 then 'stripe' else 'manual' end,
                date_trunc('month', now()) - make_interval(months => k),
                case when not (i = 12 and k = 0) and not (k = 0 and i % 6 = 0) then date_trunc('month', now()) - make_interval(months => k) + interval '2 days' end,
                case when i = 12 and k = 0 then now() - interval '3 days' end,
                case when i = 12 and k = 0 then 3 else 1 end,
                case when i = 3 and k = 2 then v_price else 0 end,
                date_trunc('month', now()) - make_interval(months => k),
                date_trunc('month', now()) - make_interval(months => k - 1));
      end loop;
    end if;

    -- Sites and locations.
    insert into fp_sites (org_id, name_i18n, address) values (v_org, jsonb_build_object('en', 'Main site', 'vi', 'Cơ sở chính'), (10 + i) || ' Nguyen Hue')
    returning id into v_site;
    insert into fp_locations (org_id, site_id, name_i18n, kind) values (v_org, v_site, jsonb_build_object('en', 'Building A', 'vi', 'Tòa A'), 'building') returning id into v_loc;
    insert into fp_locations (org_id, site_id, parent_id, name_i18n, kind)
    select v_org, v_site, v_loc, jsonb_build_object('en', 'Floor ' || f, 'vi', 'Tầng ' || f), 'floor' from generate_series(1, 2 + i % 4) f;

    -- 200 users in all, within each plan's member limit (free: 3).
    n_users := case when v_plan = 'free' and v_status <> 'trialing' then 3 when i in (4, 8, 12, 16) then 11 else 12 end;
    for j in 1 .. n_users loop
      u_idx := u_idx + 1;
      v_user := gen_random_uuid();
      insert into auth.users (id, email, raw_user_meta_data, created_at, last_sign_in_at, email_confirmed_at)
      values (v_user, 'user' || u_idx || '@demo.facilitypro.test',
              jsonb_build_object('full_name', first_names[1 + (u_idx * 7) % 20] || ' ' || last_names[1 + (u_idx * 3) % 10]),
              v_created + make_interval(days => j), case when j % 4 = 0 then null else now() - make_interval(hours => (u_idx * 13) % 400) end,
              case when j = n_users then null else v_created end);
      insert into fp_users_orgs (user_id, org_id, role, created_at) values (v_user, v_org, roles[1 + (j - 1) % 10], v_created + make_interval(days => j));
      -- Daily activity over the last 60 days (busier tenants, more days).
      insert into fp_daily_activity (day, user_id, org_id)
      select current_date - d, v_user, v_org from generate_series(0, 59) d
      where (d + u_idx) % (2 + i % 4) = 0 and not (i in (7, 15, 16)) and j % 4 <> 0;
    end loop;

    -- Requests and work orders over the last 60 days.
    insert into fp_requests (org_id, title, body_original, source_lng, status, priority, created_at, location_id)
    select v_org, (array['Air-con leaking', 'Light out in corridor', 'Door lock broken', 'Water pressure low', 'Lift noisy', 'Toilet blocked'])[1 + (g % 6)],
           'Demo request', 'en', (array['new', 'triaged', 'resolved', 'closed'])[1 + (g % 4)], (array['low', 'medium', 'high', 'critical'])[1 + (g % 4)],
           now() - make_interval(days => (g * 3) % 60, hours => g), v_loc
    from generate_series(1, 4 + (20 - i)) g;
    -- Work orders start assigned and move through the normal lifecycle.
    insert into fp_work_orders (org_id, title, priority, status, created_at, due_at, location_id, assigned_to)
    select v_org, 'Demo work order ' || g, (array['low', 'medium', 'high'])[1 + (g % 3)], 'assigned',
           now() - make_interval(days => (g * 4) % 60), now() - make_interval(days => (g * 4) % 60) + interval '5 days', v_loc,
           (select user_id from fp_users_orgs where org_id = v_org and role = 'technician' order by created_at limit 1)
    from generate_series(1, 3 + (20 - i) / 2) g;
    update fp_work_orders set status = 'in_progress' where org_id = v_org and (substring(title from '\d+$'))::int % 4 in (1, 2, 3);
    update fp_work_orders set status = 'resolved', completion_code = 'fixed' where org_id = v_org and (substring(title from '\d+$'))::int % 4 in (2, 3);
    update fp_work_orders set status = 'closed' where org_id = v_org and (substring(title from '\d+$'))::int % 4 = 3;

    if v_status in ('past_due', 'canceled') then
      update fp_subscriptions set status = v_status where org_id = v_org;
      update fp_subscriptions set canceled_at = now() - make_interval(days => i) where org_id = v_org and v_status = 'canceled';
      update fp_platform_events set at = now() - make_interval(days => i) where org_id = v_org and type = 'cancellation';
    end if;
  end loop;

  -- Support tickets with conversations and internal notes.
  for i in 1 .. 30 loop
    select id into v_org from fp_organizations where settings ->> 'demo' = 'true' order by created_at offset (i % 20) limit 1;
    insert into fp_support_tickets (org_id, requester_email, subject, status, priority, sla_due_at, first_response_at, solved_at, created_at)
    values (v_org, 'user' || (i * 6) || '@demo.facilitypro.test',
            (array['Cannot log in', 'Invoice question', 'How do I add a site?', 'Work order emails not arriving', 'Request to upgrade plan', 'Data export needed', 'QR codes not scanning', 'Add more users'])[1 + i % 8],
            (array['open', 'pending', 'on_hold', 'solved', 'closed', 'open'])[1 + i % 6],
            (array['low', 'normal', 'high', 'urgent'])[1 + i % 4],
            now() - make_interval(days => i) + interval '1 day',
            case when i % 3 <> 0 then now() - make_interval(days => i) + interval '2 hours' end,
            case when i % 6 in (3, 4) then now() - make_interval(days => i) + interval '1 day' end,
            now() - make_interval(days => i))
    returning id into v_ticket;
    insert into fp_ticket_messages (ticket_id, author_id, body, internal, created_at) values
      (v_ticket, null, 'Hello, we need help with this. (demo)', false, now() - make_interval(days => i)),
      (v_ticket, null, 'Checked the logs; looks like a configuration issue. (demo internal note)', true, now() - make_interval(days => i) + interval '1 hour');
  end loop;

  -- Two tenants changed plans recently (activity feed).
  update fp_subscriptions set plan_code = 'business' where org_id = (select id from fp_organizations where name = 'Lotus Offices' and settings ->> 'demo' = 'true');
  update fp_subscriptions set plan_code = 'free' where org_id = (select id from fp_organizations where name = 'Sunrise Manufacturing' and settings ->> 'demo' = 'true');
end $$;

select
  (select count(*) from fp_organizations where settings ->> 'demo' = 'true') as tenants,
  (select count(*) from auth.users where email like '%@demo.facilitypro.test') as users,
  (select count(*) from fp_platform_invoices i join fp_organizations o on o.id = i.org_id where o.settings ->> 'demo' = 'true') as invoices,
  (select count(*) from fp_support_tickets t join fp_organizations o on o.id = t.org_id where o.settings ->> 'demo' = 'true') as tickets;

-- ---------------------------------------------------------------------------
-- Clean-up: removes everything above (run on its own).
-- ---------------------------------------------------------------------------
-- delete from fp_organizations where settings ->> 'demo' = 'true';
-- delete from auth.users where email like '%@demo.facilitypro.test';
