-- 0096_plan_features_move.sql
-- Starter now includes the Email & Zalo inbox, room & desk booking, permits
-- to work, technician attendance and TV display boards (moved down from
-- Professional). Display-only feature lists; limits are unchanged.

update fp_plans set features = '["Everything in Free", "Preventive maintenance", "Checklists", "Parts & inventory", "Tenant portal", "Email & push notifications", "Email & Zalo inbox", "Room & desk booking", "Permits to work", "Technician attendance", "TV display boards"]'::jsonb where code = 'starter';
update fp_plans set features = '["Everything in Starter", "Workflows & automation", "SLA targets & approvals", "Meters & meter-based maintenance", "Vendors, contracts & documents", "Surveys & broadcasts", "Budgets, procurement & invoices", "IoT sensors & alerts", "Smart assistant & sentiment scoring", "Full reports & dashboards", "Email support"]'::jsonb where code = 'pro';
