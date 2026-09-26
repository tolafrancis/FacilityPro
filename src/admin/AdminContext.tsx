import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { isAdminRole, roleCan, type AdminRole, type Permission } from './permissions';

type Theme = 'light' | 'dark' | 'system';

interface AdminContextValue {
  role: AdminRole | null;
  loading: boolean;
  /** Staff account that must finish two-factor sign-in first (0089). */
  mfaRequired: boolean;
  /** Minutes of inactivity before the panel signs out. */
  sessionMinutes: number;
  refresh: () => void;
  can: (p: Permission) => boolean;
  theme: Theme;
  setTheme: (t: Theme) => void;
  dark: boolean;
}

const AdminContext = createContext<AdminContextValue | null>(null);
const THEME_KEY = 'fp.admin.theme';

/**
 * The signed-in user's staff role, from the database (fp_admin_permissions,
 * 0083). The UI hides what a role can't do; the database refuses it anyway.
 */
export function AdminProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ['admin_permissions', user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fp_admin_permissions');
      if (error) throw error;
      const d = (data ?? {}) as { role?: unknown; mfa_required?: unknown; session_minutes?: unknown };
      return {
        role: isAdminRole(d.role) ? d.role : null,
        mfaRequired: d.mfa_required === true,
        sessionMinutes: typeof d.session_minutes === 'number' && d.session_minutes >= 5 ? d.session_minutes : 480,
      };
    },
  });

  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const v = localStorage.getItem(THEME_KEY);
      return v === 'light' || v === 'dark' ? v : 'system';
    } catch {
      return 'system';
    }
  });
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const on = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const dark = theme === 'dark' || (theme === 'system' && systemDark);

  // The toasts and dialogs live outside the admin tree: theme the page.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    return () => document.documentElement.classList.remove('dark');
  }, [dark]);

  const value = useMemo<AdminContextValue>(() => {
    const role = q.data?.role ?? null;
    return {
      role,
      loading: q.isLoading,
      mfaRequired: q.data?.mfaRequired ?? false,
      sessionMinutes: q.data?.sessionMinutes ?? 480,
      refresh: () => void q.refetch(),
      can: (p) => roleCan(role, p),
      theme,
      setTheme: (t) => {
        setThemeState(t);
        try {
          localStorage.setItem(THEME_KEY, t);
        } catch {
          /* per-browser preference only */
        }
      },
      dark,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data, q.isLoading, theme, dark]);

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used inside AdminProvider');
  return ctx;
}
