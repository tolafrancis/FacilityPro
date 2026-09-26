import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '../../lib/supabase';
import { ADMIN_ROLES } from '../permissions';

// Admin team (migration 0091).

const nstr = z.string().nullable();

export const StaffSchema = z.object({
  user_id: z.string(), email: z.string(), name: nstr, display_name: nstr,
  role: z.enum(ADMIN_ROLES), disabled_at: nstr, added_at: z.string(), last_sign_in_at: nstr,
  mfa: z.boolean(), actions_30d: z.coerce.number(), last_action_at: nstr,
});
export type Staff = z.infer<typeof StaffSchema>;

export const InviteSchema = z.object({
  id: z.string(), email: z.string(), role: z.enum(ADMIN_ROLES), display_name: nstr, invited_by_email: nstr,
  created_at: z.string(), sent_at: z.string(), expires_at: z.string(), expired: z.boolean(),
});
export type StaffInvite = z.infer<typeof InviteSchema>;

export const TeamSchema = z.object({ me: z.string(), staff: z.array(StaffSchema), invites: z.array(InviteSchema) });

export function useTeam() {
  return useQuery({
    queryKey: ['admin_team'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fp_admin_team');
      if (error) throw error;
      return TeamSchema.parse(data);
    },
  });
}

/** Where invite emails link to: this site. */
export function linkBase(): string {
  return window.location.origin;
}

/** Active super admins other than `except` (the UI mirrors the database guard). */
export function otherActiveSuperAdmins(staff: Pick<Staff, 'user_id' | 'role' | 'disabled_at'>[], except: string): number {
  return staff.filter((s) => s.role === 'super_admin' && !s.disabled_at && s.user_id !== except).length;
}
