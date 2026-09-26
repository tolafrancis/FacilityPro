import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

const { CouponFormSchema, PlanFormSchema, planFormToPayload } = await import('./billing');

const plan = {
  code: 'Pro', name_en: 'Pro', name_vi: '', price: '29', price_year: '', currency: 'USD',
  assets: '250', members: '', sites: '5', features: 'Priority support\n\n IoT dashboards ',
  stripe_price_month: 'price_123', stripe_price_year: '', paypal_plan_month: 'P-ABC123', paypal_plan_year: '', active: true,
};

describe('plan form', () => {
  it('turns the form into what fp_admin_save_plan expects', () => {
    const r = PlanFormSchema.parse(plan);
    expect(planFormToPayload(r)).toEqual({
      code: 'pro', name_i18n: { en: 'Pro', vi: 'Pro' }, price: 29, price_year: null, currency: 'USD',
      limits: { assets: '250', members: '', sites: '5' }, features: ['Priority support', 'IoT dashboards'],
      stripe_price_month: 'price_123', stripe_price_year: '', paypal_plan_month: 'P-ABC123', paypal_plan_year: '', active: true,
    });
  });

  it('refuses wrong provider IDs, negative prices and non-numeric limits', () => {
    const bad = (patch: Record<string, unknown>) => !PlanFormSchema.safeParse({ ...plan, ...patch }).success;
    expect(bad({ stripe_price_month: 'prod_123' })).toBe(true);
    expect(bad({ paypal_plan_month: 'plan-1' })).toBe(true);
    expect(bad({ price: '-1' })).toBe(true);
    expect(bad({ assets: 'lots' })).toBe(true);
    expect(bad({ code: 'a' })).toBe(true);
  });
});

describe('coupon form', () => {
  const base = { code: 'launch20', description: '', kind: 'percent', value: '20', currency: 'USD', duration: 'once', duration_months: '', max_redemptions: '', expires_at: '', active: true };
  it('upper-cases the code', () => {
    expect(CouponFormSchema.parse(base).code).toBe('LAUNCH20');
  });
  it('caps percentages at 100 and needs months for repeating discounts', () => {
    expect(CouponFormSchema.safeParse({ ...base, value: '120' }).success).toBe(false);
    expect(CouponFormSchema.safeParse({ ...base, kind: 'amount', value: '120' }).success).toBe(true);
    expect(CouponFormSchema.safeParse({ ...base, duration: 'repeating' }).success).toBe(false);
    expect(CouponFormSchema.safeParse({ ...base, duration: 'repeating', duration_months: '3' }).success).toBe(true);
  });
});
