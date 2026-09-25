import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, Plus, QrCode, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../contexts/OrgContext';
import { friendlyError } from '../lib/ui';
import Button from './ui/Button';
import Input from './ui/Input';
import Select from './ui/Select';
import Modal from './ui/Modal';
import ShareLink from './ShareLink';

export const JOIN_ROLES = ['occupant', 'technician', 'vendor', 'manager'] as const;
type JoinRole = (typeof JOIN_ROLES)[number];

interface JoinLink {
  id: string;
  role: JoinRole;
  token: string;
  label: string | null;
  expires_at: string | null;
  max_uses: number | null;
  use_count: number;
  revoked_at: string | null;
  created_at: string;
}

export function joinUrl(token: string) {
  return `${window.location.origin}/join/${token}`;
}

/**
 * Shareable join links, one per role (0082): create, share (copy, apps, QR)
 * and revoke. Org admins only (RLS).
 */
export default function JoinLinks({ defaultRole = 'occupant', compact = false }: { defaultRole?: JoinRole; compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const lng = i18n.resolvedLanguage ?? 'en';
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id;
  const queryClient = useQueryClient();
  const [role, setRole] = useState<JoinRole>(defaultRole);
  const [label, setLabel] = useState('');
  const [expiry, setExpiry] = useState<'never' | '7' | '30'>('never');
  const [maxUses, setMaxUses] = useState('');
  const [sharing, setSharing] = useState<JoinLink | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const links = useQuery({
    queryKey: ['join_links', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_join_links')
        .select('id, role, token, label, expires_at, max_uses, use_count, revoked_at, created_at')
        .eq('org_id', orgId!)
        .is('revoked_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as JoinLink[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      setMsg(null);
      const uses = maxUses.trim() ? Math.max(1, Math.floor(Number(maxUses))) : null;
      const { data, error } = await supabase
        .from('fp_join_links')
        .insert({
          org_id: orgId,
          role,
          label: label.trim() || null,
          expires_at: expiry === 'never' ? null : new Date(Date.now() + Number(expiry) * 864e5).toISOString(),
          max_uses: uses && Number.isFinite(uses) ? uses : null,
        })
        .select('id, role, token, label, expires_at, max_uses, use_count, revoked_at, created_at')
        .single();
      if (error) throw error;
      return data as JoinLink;
    },
    onSuccess: (link) => {
      setLabel('');
      setMaxUses('');
      void queryClient.invalidateQueries({ queryKey: ['join_links', orgId] });
      setSharing(link);
    },
    onError: (e) => setMsg(friendlyError(e as { code?: string; message?: string }, t)),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('fp_join_links').update({ revoked_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['join_links', orgId] }),
    onError: (e) => setMsg(friendlyError(e as { code?: string; message?: string }, t)),
  });

  const status = (l: JoinLink) => {
    if (l.expires_at && new Date(l.expires_at) <= new Date()) return t('join.expired');
    if (l.max_uses && l.use_count >= l.max_uses) return t('join.usedUp');
    return null;
  };

  return (
    <div className="space-y-4">
      {!compact && <p className="text-sm text-ink-muted">{t('join.intro')}</p>}
      {msg && <p role="alert" className="rounded-lg border border-status-crit/30 bg-white p-3 text-sm text-status-crit">{msg}</p>}

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label htmlFor="join-role" className="mb-1 block text-xs text-ink-muted">{t('join.role')}</label>
          <Select id="join-role" value={role} onChange={(e) => setRole(e.target.value as JoinRole)}>
            {JOIN_ROLES.map((r) => (
              <option key={r} value={r}>{t(`roles.${r}`)}</option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="join-label" className="mb-1 block text-xs text-ink-muted">{t('join.label')}</label>
          <Input id="join-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} placeholder={t('join.labelPlaceholder')} />
        </div>
        {!compact && (
          <>
            <div>
              <label htmlFor="join-expiry" className="mb-1 block text-xs text-ink-muted">{t('join.expires')}</label>
              <Select id="join-expiry" value={expiry} onChange={(e) => setExpiry(e.target.value as 'never' | '7' | '30')}>
                <option value="never">{t('join.never')}</option>
                <option value="7">{t('join.days', { count: 7 })}</option>
                <option value="30">{t('join.days', { count: 30 })}</option>
              </Select>
            </div>
            <div>
              <label htmlFor="join-max" className="mb-1 block text-xs text-ink-muted">{t('join.maxUses')}</label>
              <Input id="join-max" type="number" inputMode="numeric" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder={t('join.unlimited')} />
            </div>
          </>
        )}
      </div>
      {role === 'manager' && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{t('join.managerWarning')}</p>}
      <Button onClick={() => create.mutate()} loading={create.isPending} className="w-full sm:w-auto">
        <Plus size={16} aria-hidden /> {t('join.create')}
      </Button>

      {(links.data ?? []).length > 0 && (
        <ul className="space-y-2">
          {(links.data ?? []).map((l) => {
            const problem = status(l);
            return (
              <li key={l.id} className={`flex flex-wrap items-center gap-3 rounded-lg border border-line px-3 py-2 text-sm ${problem ? 'opacity-60' : ''}`}>
                <Link2 size={16} className="shrink-0 text-brand" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">
                    {t(`roles.${l.role}`)}
                    {l.label && <span className="font-normal text-ink-muted"> · {l.label}</span>}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {problem ??
                      [
                        t('join.uses', { count: l.use_count }) + (l.max_uses ? ` / ${l.max_uses}` : ''),
                        l.expires_at ? t('join.until', { date: new Date(l.expires_at).toLocaleDateString(lng, { day: 'numeric', month: 'short' }) }) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                  </p>
                </div>
                {!problem && (
                  <button type="button" onClick={() => setSharing(l)} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-medium text-ink hover:bg-surface">
                    <QrCode size={16} aria-hidden /> {t('join.share')}
                  </button>
                )}
                <button type="button" onClick={() => revoke.mutate(l.id)} className="grid h-10 w-10 place-items-center rounded-lg text-ink-muted hover:bg-surface hover:text-status-crit" aria-label={t('join.revoke')} title={t('join.revoke')}>
                  <Trash2 size={16} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {sharing && (
        <Modal title={t('join.shareTitle', { role: t(`roles.${sharing.role}`) })} onClose={() => setSharing(null)} closeLabel={t('actions.close')} wide>
          <ShareLink
            url={joinUrl(sharing.token)}
            message={t('join.shareMessage', { org: currentOrg?.name ?? '', role: t(`roles.${sharing.role}`) })}
            qrTitle={t('join.qrTitle', { org: currentOrg?.name ?? '' })}
            qrSubtitle={t('join.qrSubtitle', { role: t(`roles.${sharing.role}`) })}
          />
        </Modal>
      )}
    </div>
  );
}
