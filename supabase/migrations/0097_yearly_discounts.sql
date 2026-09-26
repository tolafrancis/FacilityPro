-- 0097_yearly_discounts.sql
-- Yearly prices: Starter $288 ($24/mo, 17% off), Professional $468 ($39/mo,
-- 20% off), Business $948 ($79/mo, 20% off). Matches the home page and the
-- brochure. Provider yearly price IDs are set in the admin plan editor.

update fp_plans set price_year = 288 where code = 'starter';
update fp_plans set price_year = 468 where code = 'pro';
update fp_plans set price_year = 948 where code = 'business';
