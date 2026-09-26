import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '../../lib/supabase';

// Audit log & security (migration 0089).

const num = z.coerce.number();
const nstr = z.string().nullable();

export const AuditRowSchema = z.object({
  id: num, at: z.string(), action: z.string(), target_type: z.string(), target_id: nstr, org_id: nstr, org_name: nstr,
  ip: nstr, admin_id: nstr, admin_email: nstr, before: z.unknown().nullable(), after: z.unknown().nullable(),
});
export type AuditRow = z.infer<typeof AuditRowSchema>;

export interface AuditQuery {
  search?: string;
  action?: string;
  admin?: string;
  targetType?: string;
  org?: string;
  from?: string;
  to?: string;
  limit: number;
  offset: number;
}

export async function fetchAudit(q: AuditQuery) {
  const { data, error } = await supabase.rpc('fp_admin_audit_list', {
    p_search: q.search || null, p_action: q.action || null, p_admin: q.admin || null, p_target_type: q.targetType || null,
    p_org: q.org || null, p_from: q.from || null, p_to: q.to || null, p_limit: q.limit, p_offset: q.offset,
  });
  if (error) throw error;
  return z.object({ total: num, rows: z.array(AuditRowSchema) }).parse(data);
}

export function useAudit(q: AuditQuery) {
  return useQuery({ queryKey: ['admin_audit', q], placeholderData: (prev) => prev, queryFn: () => fetchAudit(q) });
}

export function useAuditFacets() {
  return useQuery({
    queryKey: ['admin_audit_facets'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fp_admin_audit_facets');
      if (error) throw error;
      return z.object({
        actions: z.array(z.string()), target_types: z.array(z.string()),
        admins: z.array(z.object({ id: z.string(), email: z.string() })),
      }).parse(data);
    },
  });
}

export interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
  kind: 'added' | 'removed' | 'changed' | 'same';
}

const NOISE = new Set(['updated_at']);

/** Field-by-field comparison of an audit entry's before/after values. */
export function diffRecords(before: unknown, after: unknown): FieldChange[] {
  const b = before && typeof before === 'object' && !Array.isArray(before) ? (before as Record<string, unknown>) : {};
  const a = after && typeof after === 'object' && !Array.isArray(after) ? (after as Record<string, unknown>) : {};
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => !NOISE.has(k)).sort();
  return keys.map((field) => {
    const inB = field in b;
    const inA = field in a;
    const same = inB && inA && JSON.stringify(b[field]) === JSON.stringify(a[field]);
    return { field, before: b[field], after: a[field], kind: same ? 'same' : !inB ? 'added' : !inA ? 'removed' : 'changed' };
  });
}

export const SecurityOverviewSchema = z.object({
  settings: z.object({ admin_require_2fa: z.boolean(), admin_session_minutes: num }),
  my_aal: nstr,
  staff: z.array(z.object({
    user_id: z.string(), email: z.string(), role: z.string(), disabled: z.boolean(), mfa: z.boolean(),
    last_sign_in_at: nstr, sessions: num,
  })),
  sensitive_30d: z.record(num),
});

export function useSecurityOverview() {
  return useQuery({
    queryKey: ['admin_security'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fp_admin_security_overview');
      if (error) throw error;
      return SecurityOverviewSchema.parse(data);
    },
  });
}
