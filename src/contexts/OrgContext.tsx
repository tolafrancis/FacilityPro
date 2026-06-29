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
  refresh: () => Promise<void>;
  setCurrentOrg: (orgId: string) => void;
}

const OrgContext = createContext<OrgContextValue | undefined>(undefined);
const STORAGE_KEY = 'fp_current_org';

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEY)
  );
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setMemberships([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('fp_users_orgs')
      .select(
        'org_id, role, fp_organizations(id, name, default_lng, active_languages, subscription_tier, allow_public_requests, auto_create_work_orders)'
      );
    if (!error && data) {
      setMemberships(data as unknown as Membership[]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
