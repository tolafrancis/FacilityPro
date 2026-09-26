import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { useAdmin } from '../AdminContext';
import { Badge, Card, ErrorState, PageHeader, Skeleton } from '../components/ui';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { rpc, useAdminAction } from '../lib/tenants';
import { useFlags, type Flag } from '../lib/appmanagement';
import { ConfirmDialog } from './TenantDetail';
import { Field } from './billing/shared';

/** Features & modules: global switches and gradual rollouts. */
export default function Features() {
  const { t } = useTranslation('admin');
  const { can } = useAdmin();
  const flags = useFlags();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Flag | null>(null);
  const manage = can('platform.manage');
  const save = useAdminAction((p: Record<string, unknown>) => rpc('fp_admin_save_flag', { p }), t('features.toast.saved'));
  const del = useAdminAction((key: string) => rpc('fp_admin_delete_flag', { p_key: key }), t('features.toast.deleted'));

  if (flags.isError) return <div className="mx-auto max-w-5xl"><ErrorState message={t('errors.load')} onRetry={() => void flags.refetch()} retryLabel={t('retry')} /></div>;
  const groups = (['module', 'feature'] as const).map((k) => ({ k, rows: (flags.data ?? []).filter((f) => f.kind === k) }));

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={t('nav.items.flags')}
        description={t('features.subtitle')}
        actions={manage && <Button onClick={() => setCreating(true)}><Plus size={16} aria-hidden /> {t('features.new')}</Button>}
      />
      {flags.isLoading ? <Skeleton className="h-96" /> : (
        <div className="space-y-4">
          {groups.map((g) => (
            <Card key={g.k} title={t(`features.${g.k}s`)} description={t(`features.${g.k}sHint`)}>
              {g.rows.length === 0 ? <p className="text-sm text-ink-muted">{t('features.noFeatures')}</p> : (
                <ul className="divide-y divide-line">
                  {g.rows.map((f) => <FlagRow key={f.key} f={f} manage={manage} onSave={(p) => save.mutate({ key: f.key, ...p })} onDelete={() => setDeleting(f)} />)}
                </ul>
              )}
            </Card>
          ))}
          <p className="text-xs text-ink-muted">{t('features.overridesHint')}</p>
        </div>
      )}
      {creating && <NewFlagDialog onClose={() => setCreating(false)} />}
      {deleting && (
        <ConfirmDialog
          title={t('features.deleteTitle', { key: deleting.key })}
          body={t('features.deleteBody')}
          confirmLabel={t('features.delete')}
          danger
          busy={del.isPending}
          onClose={() => setDeleting(null)}
          onConfirm={() => del.mutate(deleting.key, { onSuccess: () => setDeleting(null) })}
        />
      )}
    </div>
  );
}

function FlagRow({ f, manage, onSave, onDelete }: { f: Flag; manage: boolean; onSave: (p: Record<string, unknown>) => void; onDelete: () => void }) {
  const { t } = useTranslation('admin');
  const [pct, setPct] = useState(String(f.rollout_pct));
  const label = t(`modules.${f.key}`, { defaultValue: f.description ?? f.key });
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{label}</p>
        <p className="text-xs text-ink-muted">
          <code>{f.key}</code>
          {f.kind === 'feature' && f.description && f.description !== label && ` · ${f.description}`}
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          {t('features.reach', { on: f.tenants_on, total: f.tenants_total })}
          {(f.overrides_on > 0 || f.overrides_off > 0) && ` · ${t('features.overrides', { on: f.overrides_on, off: f.overrides_off })}`}
        </p>
      </div>
      <div className="flex items-center gap-3">
        {f.enabled && (
          <label className="flex items-center gap-1.5 text-xs text-ink-muted">
            {t('features.rollout')}
            <input
              type="number" min={0} max={100} value={pct} disabled={!manage}
              onChange={(e) => setPct(e.target.value)}
              onBlur={() => { const n = Math.max(0, Math.min(100, Math.round(Number(pct) || 0))); setPct(String(n)); if (n !== f.rollout_pct) onSave({ rollout_pct: n }); }}
              aria-label={t('features.rolloutFor', { name: label })}
              className="h-8 w-16 rounded-md border border-line bg-panel px-2 text-right text-sm text-ink"
            />%
          </label>
        )}
        <Badge tone={f.enabled ? 'ok' : 'neutral'}>{f.enabled ? t('features.on') : t('features.off')}</Badge>
        {manage && (
          <button
            type="button" role="switch" aria-checked={f.enabled} aria-label={t('features.toggle', { name: label })}
            onClick={() => onSave({ enabled: !f.enabled })}
            className={`relative h-6 w-11 rounded-full transition ${f.enabled ? 'bg-brand' : 'bg-ink/20'}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${f.enabled ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        )}
        {manage && f.kind === 'feature' && (
          <button type="button" onClick={onDelete} aria-label={t('features.deleteTitle', { key: f.key })} className="grid h-8 w-8 place-items-center rounded-md text-ink-muted hover:bg-ink/5 hover:text-status-crit">
            <Trash2 size={15} aria-hidden />
          </button>
        )}
      </div>
    </li>
  );
}

function NewFlagDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('admin');
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [pct, setPct] = useState('0');
  const save = useAdminAction(() => rpc('fp_admin_save_flag', { p: { key: key.trim().toLowerCase(), description, enabled: true, rollout_pct: Number(pct) } }), t('features.toast.saved'));
  const valid = /^[a-z0-9_.-]{2,64}$/.test(key.trim().toLowerCase()) && Number(pct) >= 0 && Number(pct) <= 100;
  return (
    <Modal title={t('features.new')} onClose={onClose} closeLabel={t('close')}>
      <div className="space-y-3">
        <Field id="fl-key" label={t('features.key')} hint={t('features.keyHint')}><Input id="fl-key" value={key} onChange={(e) => setKey(e.target.value)} placeholder="new_dashboard" /></Field>
        <Field id="fl-desc" label={t('features.description')}><Input id="fl-desc" value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} /></Field>
        <Field id="fl-pct" label={t('features.rolloutStart')} hint={t('features.rolloutHint')}><Input id="fl-pct" type="number" min={0} max={100} value={pct} onChange={(e) => setPct(e.target.value)} /></Field>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
        <Button disabled={!valid} loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onClose })}>{t('features.create')}</Button>
      </div>
    </Modal>
  );
}
