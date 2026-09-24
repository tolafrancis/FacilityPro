import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import i18n from '../i18n';
import { setMonitoringUser } from '../lib/monitoring';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /** captchaToken: required once CAPTCHA protection is enabled in Supabase Auth. */
  signIn: (email: string, password: string, captchaToken?: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    captchaToken?: string,
    /** Where the confirmation email's link lands, e.g. back on an invite. */
    redirectTo?: string
  ) => Promise<{ error: string | null; needsConfirm: boolean }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      void setMonitoringUser(next?.user.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn: AuthContextValue['signIn'] = async (email, password, captchaToken) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: captchaToken ? { captchaToken } : undefined,
    });
    return { error: error?.message ?? null };
  };

  const signUp: AuthContextValue['signUp'] = async (email, password, captchaToken, redirectTo) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      // lang picks the language of Supabase Auth emails (templates in
      // supabase/templates read .Data.lang).
      options: { captchaToken, emailRedirectTo: redirectTo, data: { lang: i18n.resolvedLanguage ?? 'en' } },
    });
    return { error: error?.message ?? null, needsConfirm: !!data.user && !data.session };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, loading, signIn, signUp, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
