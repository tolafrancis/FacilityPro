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
import type { Membership, Organization, Role } from '../lib/database.types';

interface OrgContextValue {
  memberships: Membership[];
  currentOrg: Organization | null;
  role: Role | null;
  loading: boolean;
  /** Set when memberships could not be loaded (e.g. network error). */
  error: string | null;
  refresh: () => Promise<void>;
  setCurrentOrg: (orgId: string) => void;
}

const OrgContext = createContext<OrgContextValue | undefined>(undefined);
const STORAGE_KEY = 'fp_current_org';

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
        'org_id, role, fp_organizations(id, name, default_lng, active_languages, subscription_tier, allow_public_requests, auto_create_work_orders, settings)'
      )
      .eq('user_id', userId);
    if (err) {
      setError(err.message);
    } else {
      setMemberships((data ?? []) as unknown as Membership[]);
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

  return (
    <OrgContext.Provider
      value={{
        memberships,
        currentOrg: current?.fp_organizations ?? null,
        role: current?.role ?? null,
        loading,
        error,
        refresh,
        setCurrentOrg,
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
