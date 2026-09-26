import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

const { UserDetailSchema, UserRowSchema, describeUserAgent } = await import('./users');

describe('user agents', () => {
  it('names the browser and system', () => {
    expect(describeUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36')).toBe('Chrome · Windows');
    expect(describeUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1')).toBe('Safari · iOS');
    expect(describeUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Gecko/20100101 Firefox/127.0')).toBe('Firefox · macOS');
    expect(describeUserAgent('Mozilla/5.0 (Windows NT 10.0) Chrome/126.0 Safari/537.36 Edg/126.0')).toBe('Edge · Windows');
    expect(describeUserAgent(null)).toBeNull();
  });
});

describe('user responses', () => {
  it('accepts a list row and rejects an unknown status', () => {
    const row = {
      user_id: 'u1', email: 'a@b.test', full_name: null, phone: null, created_at: '2026-01-01T00:00:00Z', last_sign_in_at: null,
      confirmed: true, banned_until: null, status: 'active', staff_role: null, mfa: false, orgs: '1',
      memberships: [{ org_id: 'o1', name: 'Alpha', role: 'manager' }],
    };
    const parsed = UserRowSchema.parse(row);
    expect(parsed.orgs).toBe(1);
    expect(UserRowSchema.safeParse({ ...row, status: 'deleted' }).success).toBe(false);
  });

  it('tolerates missing provider lists in the detail', () => {
    const d = UserDetailSchema.parse({
      user: { id: 'u1', email: 'a@b.test', full_name: null, phone: null, created_at: 'x', last_sign_in_at: null, email_confirmed_at: null, banned_until: null, status: 'unconfirmed', providers: null },
      staff_role: null, memberships: [], active_days_30: 0, mfa: [], sessions: [], logins: [], admin_actions: [],
    });
    expect(d.user.providers).toEqual([]);
  });
});
