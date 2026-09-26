import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '../../lib/supabase';
import type { Tone } from '../components/ui';

// Support tickets (migration 0087). Responses validated with Zod; the
// database checks every permission.

const num = z.coerce.number();
const nstr = z.string().nullable();

export const TICKET_STATUSES = ['open', 'pending', 'on_hold', 'solved', 'closed'] as const;
export const TICKET_PRIORITIES = ['urgent', 'high', 'normal', 'low'] as const;
export const TICKET_CATEGORIES = ['question', 'problem', 'billing', 'account', 'feature', 'other'] as const;
export const SLA_STATES = ['ok', 'due_soon', 'breached', 'paused', 'done'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export type SlaState = (typeof SLA_STATES)[number];

export function ticketStatusTone(s: string): Tone {
  return s === 'open' ? 'info' : s === 'pending' ? 'warn' : s === 'on_hold' ? 'neutral' : s === 'solved' ? 'ok' : 'neutral';
}
export function priorityTone(p: string): Tone {
  return p === 'urgent' ? 'crit' : p === 'high' ? 'warn' : p === 'normal' ? 'neutral' : 'neutral';
}
export function slaTone(s: string): Tone {
  return s === 'breached' ? 'crit' : s === 'due_soon' ? 'warn' : s === 'ok' ? 'ok' : 'neutral';
}

export const TicketRowSchema = z.object({
  id: z.string(), number: num, subject: z.string(), status: z.enum(TICKET_STATUSES), priority: z.string(), category: z.string(),
  channel: z.string(), org_id: nstr, org_name: nstr, requester_id: nstr, requester_email: nstr, assignee_id: nstr, assignee_email: nstr,
  created_at: z.string(), updated_at: z.string(), last_message_at: nstr, last_message_by: nstr, first_response_at: nstr,
  sla_due_at: nstr, sla_state: z.enum(SLA_STATES), tags: z.array(z.string()), rating: nstr, messages: num,
});
export type TicketRow = z.infer<typeof TicketRowSchema>;

export interface TicketQuery {
  search?: string;
  status?: string;
  priority?: string;
  assignee?: string;
  sla?: string;
  org?: string;
  sort: string;
  desc: boolean;
  limit: number;
  offset: number;
}

export async function fetchTickets(q: TicketQuery) {
  const { data, error } = await supabase.rpc('fp_admin_tickets', {
    p_search: q.search || null, p_status: q.status || null, p_priority: q.priority || null, p_assignee: q.assignee || null,
    p_sla: q.sla || null, p_org: q.org || null, p_sort: q.sort, p_desc: q.desc, p_limit: q.limit, p_offset: q.offset,
  });
  if (error) throw error;
  return z.object({ total: num, rows: z.array(TicketRowSchema) }).parse(data);
}

export function useTickets(q: TicketQuery) {
  return useQuery({ queryKey: ['admin_tickets', q], placeholderData: (prev) => prev, refetchInterval: 60_000, queryFn: () => fetchTickets(q) });
}

export const TicketDetailSchema = z.object({
  id: z.string(), number: num, subject: z.string(), status: z.enum(TICKET_STATUSES), priority: z.string(), category: z.string(),
  channel: z.string(), org_id: nstr, requester_id: nstr, requester_email: nstr, assignee_id: nstr, assignee_email: nstr,
  created_at: z.string(), updated_at: z.string(), first_response_at: nstr, first_response_due_at: nstr, resolution_due_at: nstr,
  solved_at: nstr, closed_at: nstr, tags: z.array(z.string()), rating: nstr, rating_comment: nstr,
  sla_state: z.enum(SLA_STATES), first_response_state: z.string(),
  requester: z.object({ id: z.string(), email: z.string(), name: nstr, role: nstr }).nullable(),
  org: z.object({ id: z.string(), name: z.string(), plan: nstr, status: z.string() }).nullable(),
  other_tickets: num,
  messages: z.array(z.object({
    id: z.string(), body: z.string(), internal: z.boolean(), author_kind: z.string(), created_at: z.string(),
    author_email: nstr, author_name: nstr,
  })),
});
export type TicketDetail = z.infer<typeof TicketDetailSchema>;

export function useTicket(id: string | undefined) {
  return useQuery({
    queryKey: ['admin_ticket', id],
    enabled: !!id,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fp_admin_ticket', { p_id: id });
      if (error) throw error;
      return TicketDetailSchema.parse(data);
    },
  });
}

export const TicketStatsSchema = z.object({
  open: num, pending: num, on_hold: num, unassigned: num, mine: num, breached: num, due_soon: num, solved_7d: num,
  first_response_hours_30d: num.nullable(), first_response_met_pct_30d: num.nullable(), satisfaction_pct_30d: num.nullable(), ratings_30d: num,
});
export function useTicketStats() {
  return useQuery({
    queryKey: ['admin_ticket_stats'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fp_admin_ticket_stats');
      if (error) throw error;
      return TicketStatsSchema.parse(data);
    },
  });
}

export function useAgents() {
  return useQuery({
    queryKey: ['admin_ticket_agents'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fp_admin_ticket_agents');
      if (error) throw error;
      return z.array(z.object({ user_id: z.string(), email: z.string(), name: z.string(), role: z.string() })).parse(data ?? []);
    },
  });
}

export const MacroSchema = z.object({ id: z.string(), title: z.string(), body: z.string(), updated_at: z.string() });
export type Macro = z.infer<typeof MacroSchema>;
export function useMacros() {
  return useQuery({
    queryKey: ['admin_ticket_macros'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_ticket_macros').select('id, title, body, updated_at').order('title');
      if (error) throw error;
      return z.array(MacroSchema).parse(data ?? []);
    },
  });
}

/** Fills {{name}}, {{first_name}}, {{ticket}}, {{agent}} in a saved reply. */
export function fillMacro(body: string, v: { name?: string | null; ticket: number; agent?: string | null }) {
  const first = (v.name ?? '').trim().split(/\s+/)[0] || '';
  return body
    .replace(/\{\{\s*first_name\s*\}\}/g, first)
    .replace(/\{\{\s*name\s*\}\}/g, (v.name ?? '').trim())
    .replace(/\{\{\s*ticket\s*\}\}/g, `#${v.ticket}`)
    .replace(/\{\{\s*agent\s*\}\}/g, v.agent ?? '');
}
