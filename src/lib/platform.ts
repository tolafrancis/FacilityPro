import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useOrgId } from './queries';

// Platform-wide switches set in the admin panel (migration 0088): modules
// per organisation, announcements, maintenance mode.

/** Admin module flag → the app pages it covers (paths and nav keys). */
export const MODULE_PAGES: Record<string, { paths: string[]; nav: string[] }> = {
  work_orders: { paths: ['/work-orders', '/my-work'], nav: ['workOrders', 'myWork'] },
  preventive_maintenance: { paths: ['/maintenance'], nav: ['maintenance'] },
  assets: { paths: ['/assets'], nav: ['assets'] },
  inventory: { paths: ['/parts'], nav: ['parts'] },
  space_booking: { paths: ['/desks', '/facilities'], nav: ['desks', 'facilities'] },
  vendors: { paths: ['/vendors'], nav: ['vendors'] },
  inspections: { paths: ['/checklists'], nav: ['checklists'] },
  iot: { paths: ['/devices'], nav: ['devices'] },
};

/** The organisation's flags; everything counts as on until they load. */
export function useOrgFlags() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['org_flags', orgId],
    enabled: !!orgId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fp_org_flags', { p_org: orgId });
      if (error) throw error;
      return (data ?? {}) as Record<string, boolean>;
    },
  });
}

/** Modules switched off for this organisation. */
export function offModules(flags: Record<string, boolean> | undefined): string[] {
  if (!flags) return [];
  return Object.keys(MODULE_PAGES).filter((m) => flags[m] === false);
}

export function hiddenNavKeys(flags: Record<string, boolean> | undefined): Set<string> {
  return new Set(offModules(flags).flatMap((m) => MODULE_PAGES[m].nav));
}

/** The module a path belongs to, if it is switched off. */
export function offModuleForPath(path: string, flags: Record<string, boolean> | undefined): string | null {
  for (const m of offModules(flags)) {
    if (MODULE_PAGES[m].paths.some((p) => path === p || path.startsWith(`${p}/`))) return m;
  }
  return null;
}

export interface AppStatus {
  app_name: string;
  maintenance_mode: boolean;
  maintenance_message: string | null;
  maintenance_until: string | null;
  support_email: string | null;
  mobile_min_version: string | null;
  mobile_latest_version: string | null;
  mobile_force_update: boolean;
}

/** Public app status (maintenance, versions); checked every minute. */
export function useAppStatus() {
  return useQuery({
    queryKey: ['app_status'],
    refetchInterval: 60_000,
    retry: false,
    meta: { errorHandled: true },
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fp_app_status');
      if (error) throw error;
      return data as AppStatus | null;
    },
  });
}

/** The signed-in user's platform staff role, if any (null for everyone else). */
export function useStaffRole(enabled: boolean) {
  return useQuery({
    queryKey: ['staff_role'],
    enabled,
    staleTime: 5 * 60_000,
    meta: { errorHandled: true },
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fp_admin_role');
      if (error) throw error;
      return (data as string | null) ?? null;
    },
  });
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  level: 'info' | 'warning' | 'critical';
  published_at: string;
}

export function useMyAnnouncements() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['my_announcements', orgId],
    enabled: !!orgId,
    refetchInterval: 5 * 60_000,
    meta: { errorHandled: true },
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fp_my_announcements', { p_org: orgId });
      if (error) throw error;
      return (data ?? []) as Announcement[];
    },
  });
}
