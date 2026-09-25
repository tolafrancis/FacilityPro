import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { orgCurrency } from '../lib/ui';
import type { Membership, Organization, Role } from '../lib/database.types';

interface OrgContextValue {
  memberships: Membership[];
  currentOrg: Organization | null;
  role: Role | null;
  /** org_admin or manager: may create/edit the org's configuration and records. */
  isManager: boolean;
  /** ISO 4217 code for amounts in this organisation (see orgCurrency). */
  currency: string;
  loading: boolean;
  /** Set when memberships could not be loaded (e.g. network error). */
  error: string | null;
  refresh: () => Promise<void>;
  setCurrentOrg: (orgId: string) => void;
  /** Suspended or deleted organisations the user belongs to (0084). */
  closedOrgs: ClosedOrg[];
}

const OrgContext = createContext<OrgContextValue | undefined>(undefined);
const STORAGE_KEY = 'fp_current_org';

/** An organisation the user belongs to that platform staff suspended or deleted. */
export interface ClosedOrg {
  org_id: string;
  name: string;
  role: string;
  suspended: boolean;
  deleted: boolean;
  reason: string | null;
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEY)
  );
  // Which user the memberships belong to. Until they're loaded for the
  // signed-in user we report `loading`, so routing never mistakes "not loaded
  // yet" for "no organisation" (which redirected every deep link/refresh to
  // /onboarding and then to the dashboard).
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [closedOrgs, setClosedOrgs] = useState<ClosedOrg[]>([]);

  const refresh = useCallback(async () => {
    if (!userId) {
      setMemberships([]);
      setLoadedFor(null);
      setError(null);
      return;
    }
    // Admins/managers can read every member row of their org (RLS), so the
    // query must be limited to the signed-in user's own memberships.
    const { data, error: err } = await supabase
      .from('fp_users_orgs')
      .select(
        'org_id, role, fp_organizations(id, name, default_lng, active_languages, subscription_tier, allow_public_requests, auto_create_work_orders, settings, industry, logo_path)'
      )
      .eq('user_id', userId);
    if (err) {
      setError(err.message);
    } else {
      // A suspended or deleted organisation's membership row still comes
      // back, but the organisation itself is hidden (0084): keep only open
      // ones, and ask why the others are closed.
      const rows = (data ?? []) as unknown as Membership[];
      const open = rows.filter((m) => m.fp_organizations);
      setMemberships(open);
      if (open.length < rows.length) {
        const { data: status } = await supabase.rpc('fp_my_org_status');
        setClosedOrgs(((status ?? []) as ClosedOrg[]).filter((o) => o.suspended || o.deleted));
      } else {
        setClosedOrgs([]);
      }
      setError(null);
    }
    setLoadedFor(userId);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Only the first load for a user blocks the app; later refreshes (after
  // creating an org or accepting an invite) update in place, so the page that
  // asked for the refresh isn't unmounted mid-flow.
  const loading = !!userId && loadedFor !== userId;

  const setCurrentOrg = (orgId: string) => {
    setCurrentId(orgId);
    localStorage.setItem(STORAGE_KEY, orgId);
  };

  const current =
    memberships.find((m) => m.org_id === currentId) ?? memberships[0] ?? null;

  // Daily activity for the platform's DAU/MAU and "last active" (0083):
  // one call per organisation per day and browser.
  const activeOrgId = current?.org_id;
  useEffect(() => {
    if (!activeOrgId || !user) return;
    const day = new Date().toISOString().slice(0, 10);
    const key = `fp.activity.${user.id}.${activeOrgId}`;
    try {
      if (localStorage.getItem(key) === day) return;
      localStorage.setItem(key, day);
    } catch {
      /* no storage: record anyway (the database ignores repeats) */
    }
    void supabase.rpc('fp_record_activity', { p_org: activeOrgId }).then(() => undefined, () => undefined);
  }, [activeOrgId, user]);

  return (
    <OrgContext.Provider
      value={{
        memberships,
        currentOrg: current?.fp_organizations ?? null,
        role: current?.role ?? null,
        isManager: current?.role === 'org_admin' || current?.role === 'manager',
        currency: orgCurrency(current?.fp_organizations),
        loading,
        error,
        refresh,
        setCurrentOrg,
        closedOrgs,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used within OrgProvider');
  return ctx;
}
