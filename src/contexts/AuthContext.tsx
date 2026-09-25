import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import i18n from '../i18n';
import { setMonitoringUser } from '../lib/monitoring';
import { forgetSessionPreference, rememberSession, sessionExpiredOnRestart } from '../lib/sessionPersistence';

export interface SignUpOptions {
  captchaToken?: string;
  /** Where the confirmation email's link lands, e.g. back on an invite. */
  redirectTo?: string;
  fullName?: string;
  phone?: string;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /** captchaToken: required once CAPTCHA protection is enabled in Supabase Auth. */
  signIn: (email: string, password: string, captchaToken?: string, keepLoggedIn?: boolean) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, options?: SignUpOptions) => Promise<{ error: string | null; needsConfirm: boolean }>;
  /** The 6-digit code from the confirmation email. */
  verifySignUp: (email: string, code: string) => Promise<{ error: string | null }>;
  resendSignUp: (email: string, captchaToken?: string, redirectTo?: string) => Promise<{ error: string | null }>;
  requestPasswordReset: (email: string, captchaToken?: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      // "Keep me logged in" was off and the browser has been closed since.
      if (data.session && sessionExpiredOnRestart()) {
        forgetSessionPreference();
        await supabase.auth.signOut({ scope: 'local' });
        setSession(null);
      } else {
        setSession(data.session);
      }
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      void setMonitoringUser(next?.user.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn: AuthContextValue['signIn'] = async (email, password, captchaToken, keepLoggedIn = true) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: captchaToken ? { captchaToken } : undefined,
    });
    if (!error) rememberSession(keepLoggedIn);
    return { error: error?.message ?? null };
  };

  const signUp: AuthContextValue['signUp'] = async (email, password, options = {}) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        captchaToken: options.captchaToken,
        emailRedirectTo: options.redirectTo,
        // lang picks the language of Supabase Auth emails (templates in
        // supabase/templates read .Data.lang).
        data: {
          lang: i18n.resolvedLanguage ?? 'en',
          ...(options.fullName ? { full_name: options.fullName } : {}),
          ...(options.phone ? { phone: options.phone } : {}),
        },
      },
    });
    if (!error && data.session) rememberSession(true);
    return { error: error?.message ?? null, needsConfirm: !!data.user && !data.session };
  };

  const verifySignUp: AuthContextValue['verifySignUp'] = async (email, code) => {
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'signup' });
    if (!error) rememberSession(true);
    return { error: error?.message ?? null };
  };

  const resendSignUp: AuthContextValue['resendSignUp'] = async (email, captchaToken, redirectTo) => {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { captchaToken, emailRedirectTo: redirectTo },
    });
    return { error: error?.message ?? null };
  };

  const requestPasswordReset: AuthContextValue['requestPasswordReset'] = async (email, captchaToken) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      captchaToken,
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return { error: error?.message ?? null };
  };

  const updatePassword: AuthContextValue['updatePassword'] = async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    forgetSessionPreference();
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        session, user: session?.user ?? null, loading, signIn, signUp, verifySignUp, resendSignUp,
        requestPasswordReset, updatePassword, signOut,
      }}
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
