import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { isAdminRole, roleCan, type AdminRole, type Permission } from './permissions';

type Theme = 'light' | 'dark' | 'system';

interface AdminContextValue {
  role: AdminRole | null;
  loading: boolean;
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
      const role = (data as { role: unknown } | null)?.role;
      return isAdminRole(role) ? role : null;
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
    const role = q.data ?? null;
    return {
      role,
      loading: q.isLoading,
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
  }, [q.data, q.isLoading, theme, dark]);

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used inside AdminProvider');
  return ctx;
}
