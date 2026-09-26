import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '../../lib/supabase';

// Users across all tenants (functions in migration 0085). Responses are
// validated with Zod; the database checks every permission.

const num = z.coerce.number();
const nstr = z.string().nullable();

export const USER_STATUSES = ['active', 'banned', 'unconfirmed'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];
/** List filters: account statuses plus derived groups. */
export const USER_FILTERS = ['active', 'banned', 'unconfirmed', 'inactive', 'no_org', 'staff'] as const;
export type UserFilter = (typeof USER_FILTERS)[number];
export const MEMBER_ROLES = ['org_admin', 'manager', 'technician', 'occupant', 'vendor'] as const;

const Membership = z.object({ org_id: z.string(), name: z.string(), role: z.string() });

export const UserRowSchema = z.object({
  user_id: z.string(),
  email: z.string(),
  full_name: nstr,
  phone: nstr,
  created_at: z.string(),
  last_sign_in_at: nstr,
  confirmed: z.boolean(),
  banned_until: nstr,
  status: z.enum(USER_STATUSES),
  staff_role: nstr,
  mfa: z.boolean(),
  orgs: num,
  memberships: z.array(Membership),
});
export type UserRow = z.infer<typeof UserRowSchema>;

export interface UserQuery {
  search?: string;
  status?: UserFilter | '';
  role?: string;
  org?: string;
  sort: string;
  desc: boolean;
  limit: number;
  offset: number;
  ids?: string[];
}

export async function fetchUsers(q: UserQuery) {
  const { data, error } = await supabase.rpc('fp_admin_users', {
    p_search: q.search || null,
    p_status: q.status || null,
    p_role: q.role || null,
    p_org: q.org || null,
    p_sort: q.sort,
    p_desc: q.desc,
    p_limit: q.limit,
    p_offset: q.offset,
    p_ids: q.ids ?? null,
  });
  if (error) throw error;
  return z.object({ total: num, rows: z.array(UserRowSchema) }).parse(data);
}

export function useUsers(q: UserQuery) {
  return useQuery({
    queryKey: ['admin_users', q],
    placeholderData: (prev) => prev,
    queryFn: () => fetchUsers(q),
  });
}

export const UserDetailSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string(),
    full_name: nstr,
    phone: nstr,
    created_at: z.string(),
    last_sign_in_at: nstr,
    email_confirmed_at: nstr,
    banned_until: nstr,
    status: z.enum(USER_STATUSES),
    providers: z.array(z.string()).catch([]),
  }),
  staff_role: nstr,
  memberships: z.array(Membership.extend({ joined_at: z.string(), org_status: z.string(), active_days_30: num })),
  active_days_30: num,
  mfa: z.array(z.object({ id: z.string(), type: z.string(), status: z.string(), name: nstr, created_at: z.string() })),
  sessions: z.array(z.object({ id: z.string(), created_at: nstr, last_used: nstr, user_agent: nstr, ip: nstr, aal: nstr })),
  logins: z.array(z.object({ action: z.string(), at: z.string(), ip: nstr })),
  admin_actions: z.array(z.object({ action: z.string(), at: z.string(), ip: nstr, after: z.record(z.unknown()).nullable(), actor_email: nstr })),
});
export type UserDetail = z.infer<typeof UserDetailSchema>;

export function useUser(id: string | undefined) {
  return useQuery({
    queryKey: ['admin_user', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fp_admin_user', { p_user: id });
      if (error) throw error;
      return UserDetailSchema.parse(data);
    },
  });
}

/** A short device label from a browser user agent ("Chrome on Windows"). */
export function describeUserAgent(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const browser =
    /Edg\//.test(ua) ? 'Edge'
    : /OPR\/|Opera/.test(ua) ? 'Opera'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari'
    : /okhttp|Dart|Expo|CFNetwork/i.test(ua) ? 'App'
    : null;
  const os =
    /iPhone|iPad|iOS/.test(ua) ? 'iOS'
    : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
    : /Linux/.test(ua) ? 'Linux'
    : null;
  if (browser && os) return `${browser} · ${os}`;
  return browser ?? os ?? ua.slice(0, 60);
}
