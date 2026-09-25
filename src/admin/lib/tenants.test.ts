import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));
vi.mock('../../i18n', () => ({ default: { t: (k: string) => k } }));
vi.mock('../../components/Toaster', () => ({ notify: () => undefined }));

const { TenantFormSchema, adminErrorMessage } = await import('./tenants');
const { healthTone, tenantStatusTone } = await import('./tenantStatus');

const base = { name: 'Saigon Tower', default_lng: 'en', currency: 'VND' };

describe('tenant form validation', () => {
  it('accepts a minimal tenant', () => {
    expect(TenantFormSchema.safeParse(base).success).toBe(true);
  });

  it('requires a name', () => {
    const r = TenantFormSchema.safeParse({ ...base, name: '   ' });
    expect(r.success).toBe(false);
  });

  it('checks email, phone, subdomain and colour formats', () => {
    const bad = (patch: Record<string, unknown>) => !TenantFormSchema.safeParse({ ...base, ...patch }).success;
    expect(bad({ contact_email: 'nope' })).toBe(true);
    expect(bad({ contact_phone: 'call me' })).toBe(true);
    expect(bad({ subdomain: '-acme' })).toBe(true);
    expect(bad({ subdomain: 'ac me' })).toBe(true);
    expect(bad({ brand_color: 'orange' })).toBe(true);
    expect(bad({ trial_days: 120 })).toBe(true);
    expect(bad({ currency: 'XYZ' })).toBe(true);
  });

  it('allows empty optional fields and normalises the subdomain', () => {
    const r = TenantFormSchema.safeParse({ ...base, contact_email: '', subdomain: 'Saigon-Tower', brand_color: '#E8552D', contact_phone: '+84 90 123 4567' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.subdomain).toBe('saigon-tower');
  });
});

describe('admin errors and statuses', () => {
  it('turns database errors into readable messages', () => {
    expect(adminErrorMessage({ code: '42501', message: 'Not authorized' })).toBe('admin:errors2.permission');
    expect(adminErrorMessage({ message: 'duplicate key value violates unique constraint "fp_organizations_subdomain_uk"' })).toBe('admin:errors2.subdomainTaken');
    expect(adminErrorMessage({ message: 'confirm_name_mismatch', details: 'Type the tenant\'s exact name to delete it.' })).toBe('Type the tenant\'s exact name to delete it.');
  });

  it('colours statuses and health scores', () => {
    expect(tenantStatusTone('suspended')).toBe('crit');
    expect(tenantStatusTone('active')).toBe('ok');
    expect(healthTone(85).key).toBe('healthy');
    expect(healthTone(50).key).toBe('fair');
    expect(healthTone(10).key).toBe('atRisk');
  });
});
