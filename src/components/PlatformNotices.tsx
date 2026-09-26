import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Megaphone, PowerOff, Wrench, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { offModuleForPath, useMyAnnouncements, useOrgFlags, type AppStatus } from '../lib/platform';
import Button from './ui/Button';

/** Full-page notice while the platform is in maintenance (staff are let through). */
export function MaintenanceScreen({ status }: { status: AppStatus }) {
  const { t, i18n } = useTranslation();
  const { session, signOut } = useAuth();
  const lng = i18n.resolvedLanguage ?? 'en';
  return (
    <div className="grid min-h-screen place-items-center bg-surface px-4">
      <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-8 text-center shadow-sm">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-brand/10 text-brand"><Wrench size={26} aria-hidden /></div>
        <h1 className="mt-4 text-xl font-semibold text-ink">{t('maintenance.title', { app: status.app_name || 'FacilityPro' })}</h1>
        <p className="mt-2 whitespace-pre-line text-sm text-ink-muted">{status.maintenance_message || t('maintenance.body')}</p>
        {status.maintenance_until && (
          <p className="mt-3 text-sm text-ink">
            {t('maintenance.until', { when: new Date(status.maintenance_until).toLocaleString(lng, { weekday: 'short', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) })}
          </p>
        )}
        <p className="mt-4 text-xs text-ink-muted">{t('maintenance.autoRefresh')}</p>
        {status.support_email && <p className="mt-1 text-xs text-ink-muted">{t('maintenance.contact')} <a className="underline" href={`mailto:${status.support_email}`}>{status.support_email}</a></p>}
        <div className="mt-6 flex justify-center gap-2">
          <Button variant="secondary" onClick={() => window.location.reload()}>{t('maintenance.retry')}</Button>
          {session && <Button variant="secondary" onClick={() => void signOut()}>{t('maintenance.signOut')}</Button>}
        </div>
      </div>
    </div>
  );
}

/** Thin strip telling staff the app is closed to everyone else. */
export function MaintenanceStaffStrip() {
  const { t } = useTranslation();
  return (
    <div role="status" className="bg-amber-500 px-4 py-1.5 text-center text-xs font-medium text-white">
      <Wrench size={12} className="mr-1 inline" aria-hidden /> {t('maintenance.staffStrip')}
    </div>
  );
}

const LEVEL_STYLE = {
  info: 'border-status-info/30 bg-status-info/10',
  warning: 'border-status-warn/40 bg-status-warn/10',
  critical: 'border-status-crit/40 bg-status-crit/10',
} as const;

/** Announcements from FacilityPro for this organisation, above every page. */
export function AnnouncementBar() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useMyAnnouncements();
  const [open, setOpen] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const items = (q.data ?? []).filter((a) => !hidden.has(a.id));
  if (items.length === 0) return null;

  const dismiss = async (id: string) => {
    setHidden((h) => new Set(h).add(id));
    await supabase.rpc('fp_dismiss_announcement', { p_id: id });
    void qc.invalidateQueries({ queryKey: ['my_announcements'] });
  };

  return (
    <div className="mb-4 space-y-2" aria-label={t('announcements.label')}>
      {items.map((a) => {
        const Icon = a.level === 'info' ? Megaphone : AlertTriangle;
        const expanded = open === a.id;
        return (
          <div key={a.id} role={a.level === 'critical' ? 'alert' : 'status'} className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${LEVEL_STYLE[a.level]}`}>
            <Icon size={18} className={`mt-0.5 shrink-0 ${a.level === 'critical' ? 'text-status-crit' : a.level === 'warning' ? 'text-status-warn' : 'text-status-info'}`} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">{a.title}</p>
              <p className={`mt-0.5 whitespace-pre-line text-sm text-ink ${expanded ? '' : 'line-clamp-2'}`}>{a.body}</p>
              {a.body.length > 140 && (
                <button type="button" onClick={() => setOpen(expanded ? null : a.id)} className="mt-1 text-xs font-medium text-ink-muted underline">
                  {expanded ? t('announcements.less') : t('announcements.more')}
                </button>
              )}
            </div>
            {a.level !== 'critical' && (
              <button type="button" onClick={() => void dismiss(a.id)} aria-label={t('announcements.dismiss')} className="-mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-md text-ink-muted hover:bg-ink/5 hover:text-ink">
                <X size={16} aria-hidden />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Replaces a page whose module is switched off for this organisation. */
export function ModuleGate({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const flags = useOrgFlags().data;
  const off = offModuleForPath(pathname, flags);
  if (!off) return <>{children}</>;
  return (
    <div className="mx-auto mt-10 max-w-md rounded-xl border border-line bg-panel p-8 text-center">
      <PowerOff size={28} className="mx-auto text-ink-muted" aria-hidden />
      <h1 className="mt-3 text-lg font-semibold text-ink">{t('moduleOff.title')}</h1>
      <p className="mt-1 text-sm text-ink-muted">{t('moduleOff.body')}</p>
    </div>
  );
}
