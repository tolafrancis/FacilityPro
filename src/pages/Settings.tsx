import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Copy, Cpu, Pencil, Power } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../contexts/OrgContext';
import { useAuth } from '../contexts/AuthContext';
import {
  useAssetTypes,
  useFaultTypes,
  useOrgMembers,
  useSites,
  useSlaPolicies,
  useTechnicianCertifications,
  useTechnicianProfile,
  useUserSites,
} from '../lib/queries';
import { resolveI18n } from '../i18n/resolver';
import { daysUntil, PRIORITIES, PRIORITY_CLASS, friendlyError } from '../lib/ui';
import { notifyError } from '../components/Toaster';
import type { AssetType, FaultType, Priority, Role, Site } from '../lib/database.types';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Pill from '../components/ui/Pill';
import BilingualName from '../components/ui/BilingualName';

type TabKey = 'general' | 'catalogs' | 'sla' | 'team' | 'integrations';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'general', label: 'General' },
  { key: 'catalogs', label: 'Catalogs' },
  { key: 'sla', label: 'SLA' },
  { key: 'team', label: 'Team & roles' },
  { key: 'integrations', label: 'Integrations' },
];

export default function Settings() {
  const { t } = useTranslation('settings');
  const { role } = useOrg();
  const [tab, setTab] = useState<TabKey>('general');
  const visibleTabs = TABS.filter((tabItem) => tabItem.key !== 'team' || role === 'org_admin');

  const selectTab = (key: TabKey) => {
    setTab(key);
    if (typeof document !== 'undefined') document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold text-ink">{t('title')}</h1>
      <p className="mt-1 text-sm text-ink-muted">{t('subtitle')}</p>

      <div className="mt-6 flex flex-wrap gap-1 border-b border-line">
        {visibleTabs.map((tabItem) => (
          <button
            key={tabItem.key}
            type="button"
            onClick={() => selectTab(tabItem.key)}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium transition ${
              tab === tabItem.key ? 'border-b-2 border-brand text-brand' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {tabItem.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'general' && <GeneralSection />}
        {tab === 'catalogs' && <CatalogsSection />}
        {tab === 'sla' && <SlaSection />}
        {tab === 'team' && role === 'org_admin' && <TeamSection />}
        {tab === 'integrations' && <IntegrationsSection />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// General — org profile (name, languages, timezone, currency)
// ---------------------------------------------------------------------------
function GeneralSection() {
  const { currentOrg, role, refresh } = useOrg();
  const orgId = currentOrg?.id;
  const queryClient = useQueryClient();
  const canEdit = role === 'org_admin';
  const langs = (currentOrg?.active_languages as string[] | undefined) ?? ['en', 'vi'];

  const settingsQuery = useQuery({
    queryKey: ['org_settings', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_organizations').select('settings').eq('id', orgId!).single();
      if (error) throw error;
      return (data?.settings ?? {}) as Record<string, unknown>;
    },
  });

  const [name, setName] = useState('');
  const [aiSentiment, setAiSentiment] = useState(false);
  const [lng, setLng] = useState('en');
  const [timezone, setTimezone] = useState('');
  const [currency, setCurrency] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setName(currentOrg?.name ?? '');
    setLng(currentOrg?.default_lng ?? 'en');
  }, [currentOrg]);
  useEffect(() => {
    if (settingsQuery.data) {
      setTimezone((settingsQuery.data.timezone as string) ?? '');
      setCurrency((settingsQuery.data.currency as string) ?? '');
      setAiSentiment(settingsQuery.data.ai_sentiment === true);
    }
  }, [settingsQuery.data]);

  const save = useMutation({
    mutationFn: async () => {
      const settings = { ...(settingsQuery.data ?? {}), timezone, currency, ai_sentiment: aiSentiment };
      const { error } = await supabase
        .from('fp_organizations')
        .update({ name, default_lng: lng, settings })
        .eq('id', orgId!);
      if (error) throw error;
    },
    onSuccess: () => {
      // The org name/language in the header come from OrgContext.
      void refresh();
      void queryClient.invalidateQueries({ queryKey: ['org_settings', orgId] });
      setMsg('Saved.');
    },
    onError: (e) => setMsg(e instanceof Error ? e.message : 'Unable to save.'),
  });

  return (
    <section className="rounded-xl border border-line bg-white p-4">
      <h2 className="font-semibold text-ink">Organisation profile</h2>
      <p className="mt-1 text-sm text-ink-muted">Basic details used across the workspace.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">Default language</label>
          <Select value={lng} onChange={(e) => setLng(e.target.value)} disabled={!canEdit}>
            {langs.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">Timezone</label>
          <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="e.g. Asia/Ho_Chi_Minh" disabled={!canEdit} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">Currency</label>
          <Input value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="e.g. USD" disabled={!canEdit} />
        </div>
      </div>
      <label className="mt-4 flex items-start gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={aiSentiment}
          onChange={(e) => setAiSentiment(e.target.checked)}
          disabled={!canEdit}
          className="mt-0.5 h-4 w-4 rounded border-line text-brand focus:ring-brand/30"
        />
        <span>
          Score inbox messages' sentiment with AI
          <span className="block text-xs text-ink-muted">
            Off by default. When on, the text of incoming customer messages is sent to Anthropic (Claude) to detect unhappy
            customers for the "low sentiment" workflow trigger. Mention this in your privacy notice.
          </span>
        </span>
      </label>
      {canEdit && (
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={() => save.mutate()} loading={save.isPending}>Save</Button>
          {msg && <span className="text-sm text-ink-muted">{msg}</span>}
        </div>
      )}
      {!canEdit && <p className="mt-4 text-sm text-ink-muted">Only an organisation admin can edit these.</p>}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Catalogs — fault types & asset types
// ---------------------------------------------------------------------------
type CatalogDialogState =
  | { kind: 'fault'; mode: 'create' }
  | { kind: 'fault'; mode: 'edit'; row: FaultType }
  | { kind: 'asset'; mode: 'create' }
  | { kind: 'asset'; mode: 'edit'; row: AssetType }
  | null;

function CatalogsSection() {
  const { i18n } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const lng = i18n.resolvedLanguage ?? 'en';
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id;
  const queryClient = useQueryClient();
  const faults = useFaultTypes();
  const assetTypes = useAssetTypes();
  const [dialog, setDialog] = useState<CatalogDialogState>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const invFault = () => queryClient.invalidateQueries({ queryKey: ['fault_types', orgId] });
  const invAsset = () => queryClient.invalidateQueries({ queryKey: ['asset_types', orgId] });

  const saveFault = async (v: { id?: string; en: string; vi: string; priority: Priority }) => {
    const payload = { name_i18n: { en: v.en, vi: v.vi || v.en }, default_priority: v.priority };
    const { error } = v.id
      ? await supabase.from('fp_fault_types').update(payload).eq('id', v.id)
      : await supabase.from('fp_fault_types').insert({ org_id: orgId, ...payload });
    if (error) { setMsg(friendlyError(error, tc)); return; }
    invFault();
    setDialog(null);
  };

  const saveAsset = async (v: { id?: string; en: string; vi: string }) => {
    const payload = { name_i18n: { en: v.en, vi: v.vi || v.en } };
    const { error } = v.id
      ? await supabase.from('fp_asset_types').update(payload).eq('id', v.id)
      : await supabase.from('fp_asset_types').insert({ org_id: orgId, ...payload });
    if (error) { setMsg(friendlyError(error, tc)); return; }
    invAsset();
    setDialog(null);
  };

  const toggleFault = async (ft: FaultType) => {
    const { error } = await supabase.from('fp_fault_types').update({ is_active: ft.is_active === false }).eq('id', ft.id);
    if (error) { setMsg(friendlyError(error, tc)); return; }
    invFault();
  };
  const toggleAsset = async (at: AssetType) => {
    const { error } = await supabase.from('fp_asset_types').update({ is_active: at.is_active === false }).eq('id', at.id);
    if (error) { setMsg(friendlyError(error, tc)); return; }
    invAsset();
  };

  const deleteFault = async (ft: FaultType) => {
    setMsg(null);
    const { count } = await supabase.from('fp_requests').select('id', { count: 'exact', head: true }).eq('fault_type_id', ft.id);
    if ((count ?? 0) > 0) { setMsg(`"${resolveI18n(ft.name_i18n, lng)}" is used by ${count} request(s) — deactivate it instead of deleting.`); return; }
    const { error } = await supabase.from('fp_fault_types').delete().eq('id', ft.id);
    if (error) { setMsg(friendlyError(error, tc)); return; }
    invFault();
  };
  const deleteAsset = async (at: AssetType) => {
    setMsg(null);
    const { count } = await supabase.from('fp_assets').select('id', { count: 'exact', head: true }).eq('asset_type_id', at.id);
    if ((count ?? 0) > 0) { setMsg(`"${resolveI18n(at.name_i18n, lng)}" is used by ${count} asset(s) — deactivate it instead of deleting.`); return; }
    const { error } = await supabase.from('fp_asset_types').delete().eq('id', at.id);
    if (error) { setMsg(friendlyError(error, tc)); return; }
    invAsset();
  };

  const loadDefaults = async () => {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc('fp_load_default_catalogs', { p_org: orgId });
    setBusy(false);
    if (error) { setMsg(friendlyError(error, tc)); return; }
    invFault();
    invAsset();
    setMsg('Default types loaded (only added when a catalog was empty).');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-muted">Manage the fault and asset types your team can choose from.</p>
        <Button variant="secondary" onClick={loadDefaults} loading={busy}>Load default types</Button>
      </div>
      {msg && <p className="text-sm text-status-crit">{msg}</p>}

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border border-line bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-ink">Fault types</h2>
            <button type="button" onClick={() => setDialog({ kind: 'fault', mode: 'create' })} className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:text-brand-600">
              <Plus size={15} /> Add
            </button>
          </div>
          <ul className="mt-3 space-y-2">
            {(faults.data ?? []).map((ft) => (
              <li key={ft.id} className={`flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm ${ft.is_active === false ? 'opacity-60' : ''}`}>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-ink">{resolveI18n(ft.name_i18n, lng)}</span>
                  <Pill className={PRIORITY_CLASS[ft.default_priority]}>{tc(`priority.${ft.default_priority}`)}</Pill>
                  {ft.is_active === false && <span className="rounded-full bg-ink-muted/10 px-2 py-0.5 text-xs text-ink-muted">Inactive</span>}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <button type="button" onClick={() => setDialog({ kind: 'fault', mode: 'edit', row: ft })} className="text-ink-muted hover:text-brand" aria-label="Edit"><Pencil size={14} /></button>
                  <button type="button" onClick={() => toggleFault(ft)} className="text-ink-muted hover:text-brand" aria-label="Toggle active"><Power size={14} /></button>
                  <button type="button" onClick={() => deleteFault(ft)} className="text-ink-muted hover:text-status-crit" aria-label="Delete"><Trash2 size={14} /></button>
                </span>
              </li>
            ))}
            {faults.data?.length === 0 && <li className="text-sm text-ink-muted">No fault types yet.</li>}
          </ul>
        </section>

        <section className="rounded-xl border border-line bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-ink">Asset types</h2>
            <button type="button" onClick={() => setDialog({ kind: 'asset', mode: 'create' })} className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:text-brand-600">
              <Plus size={15} /> Add
            </button>
          </div>
          <ul className="mt-3 space-y-2">
            {(assetTypes.data ?? []).map((at) => (
              <li key={at.id} className={`flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm ${at.is_active === false ? 'opacity-60' : ''}`}>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-ink">{resolveI18n(at.name_i18n, lng)}</span>
                  {at.is_active === false && <span className="rounded-full bg-ink-muted/10 px-2 py-0.5 text-xs text-ink-muted">Inactive</span>}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <button type="button" onClick={() => setDialog({ kind: 'asset', mode: 'edit', row: at })} className="text-ink-muted hover:text-brand" aria-label="Edit"><Pencil size={14} /></button>
                  <button type="button" onClick={() => toggleAsset(at)} className="text-ink-muted hover:text-brand" aria-label="Toggle active"><Power size={14} /></button>
                  <button type="button" onClick={() => deleteAsset(at)} className="text-ink-muted hover:text-status-crit" aria-label="Delete"><Trash2 size={14} /></button>
                </span>
              </li>
            ))}
            {assetTypes.data?.length === 0 && <li className="text-sm text-ink-muted">No asset types yet.</li>}
          </ul>
        </section>
      </div>

      {dialog?.kind === 'fault' && (
        <CatalogDialog
          title={dialog.mode === 'edit' ? 'Edit fault type' : 'Add fault type'}
          withPriority
          initial={dialog.mode === 'edit' ? { en: dialog.row.name_i18n.en ?? '', vi: dialog.row.name_i18n.vi ?? '', priority: dialog.row.default_priority } : null}
          onCancel={() => setDialog(null)}
          onSubmit={(v) => saveFault({ id: dialog.mode === 'edit' ? dialog.row.id : undefined, en: v.en, vi: v.vi, priority: v.priority })}
        />
      )}
      {dialog?.kind === 'asset' && (
        <CatalogDialog
          title={dialog.mode === 'edit' ? 'Edit asset type' : 'Add asset type'}
          initial={dialog.mode === 'edit' ? { en: dialog.row.name_i18n.en ?? '', vi: dialog.row.name_i18n.vi ?? '', priority: 'medium' } : null}
          onCancel={() => setDialog(null)}
          onSubmit={(v) => saveAsset({ id: dialog.mode === 'edit' ? dialog.row.id : undefined, en: v.en, vi: v.vi })}
        />
      )}
    </div>
  );
}

interface CatalogDialogProps {
  title: string;
  withPriority?: boolean;
  initial?: { en: string; vi: string; priority: Priority } | null;
  onCancel: () => void;
  onSubmit: (v: { en: string; vi: string; priority: Priority }) => void;
}

function CatalogDialog({ title, withPriority, initial, onCancel, onSubmit }: CatalogDialogProps) {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const [en, setEn] = useState(initial?.en ?? '');
  const [vi, setVi] = useState(initial?.vi ?? '');
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? 'medium');
  const [busy, setBusy] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!en) return;
    setBusy(true);
    onSubmit({ en, vi, priority });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-xl border border-line bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        <div className="mt-4 space-y-4">
          <BilingualName en={en} vi={vi} onEn={setEn} onVi={setVi} />
          {withPriority && (
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">{t('faultTypes.priority')}</label>
              <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{tc(`priority.${p}`)}</option>)}
              </Select>
            </div>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>{tc('actions.cancel')}</Button>
          <Button type="submit" loading={busy}>{tc('actions.save')}</Button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SLA targets
// ---------------------------------------------------------------------------
function SlaSection() {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id;
  const queryClient = useQueryClient();
  const policies = useSlaPolicies();

  const hoursFor = (p: Priority): string => {
    const found = policies.data?.find((x) => x.priority === p);
    return found ? String(found.resolution_hours) : '';
  };

  return (
    <section className="rounded-xl border border-line bg-white p-4">
      <h2 className="font-semibold text-ink">{t('sla.title')}</h2>
      <p className="mt-1 text-sm text-ink-muted">{t('sla.hint')}</p>
      <div className="mt-3 space-y-2">
        {PRIORITIES.map((p) => (
          <SlaRow
            key={p}
            priority={p}
            initial={hoursFor(p)}
            label={tc(`priority.${p}`)}
            hoursLabel={t('sla.hours')}
            saveLabel={t('sla.save')}
            onSave={async (hours) => {
              const { error } = await supabase.from('fp_sla_policies').upsert({ org_id: orgId, priority: p, resolution_hours: hours }, { onConflict: 'org_id,priority' });
              if (error) {
                notifyError(friendlyError(error, tc));
                return;
              }
              void queryClient.invalidateQueries({ queryKey: ['sla_policies', orgId] });
            }}
          />
        ))}
      </div>
    </section>
  );
}

function SlaRow({ priority, initial, label, hoursLabel, saveLabel, onSave }: { priority: Priority; initial: string; label: string; hoursLabel: string; saveLabel: string; onSave: (hours: number) => Promise<void> }) {
  const [hours, setHours] = useState(initial);
  const [saving, setSaving] = useState(false);
  return (
    <div className="flex items-center gap-3">
      <Pill className={`${PRIORITY_CLASS[priority]} w-20 justify-center`}>{label}</Pill>
      <Input type="number" min={1} value={hours} onChange={(e) => setHours(e.target.value)} placeholder={hoursLabel} className="max-w-[140px]" />
      <button
        type="button"
        disabled={saving || !hours}
        onClick={async () => {
          const n = parseInt(hours, 10);
          if (!n) return;
          setSaving(true);
          await onSave(n);
          setSaving(false);
        }}
        className="text-sm font-medium text-brand hover:text-brand-600 disabled:opacity-50"
      >
        {saveLabel}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team & roles — members + invites (org admin only)
// ---------------------------------------------------------------------------
const ROLES: Role[] = ['org_admin', 'manager', 'technician', 'occupant', 'vendor'];

function TeamSection() {
  const { t: tc } = useTranslation('common');
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const orgId = currentOrg?.id;
  const queryClient = useQueryClient();
  const members = useOrgMembers();
  const sitesQuery = useSites();
  const sites = sitesQuery.data ?? [];
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('technician');
  const [inviteLink, setInviteLink] = useState<{ email: string; link: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [siteAccessFor, setSiteAccessFor] = useState<string | null>(null);
  const [profileFor, setProfileFor] = useState<string | null>(null);

  const invites = useQuery({
    queryKey: ['invites', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_invites').select('id, email, role, token, accepted_at').eq('org_id', orgId!).is('accepted_at', null).order('created_at', { ascending: false });
      if (error) throw error;
      return data as { id: string; email: string; role: Role; token: string; accepted_at: string | null }[];
    },
  });

  const changeRole = useMutation({
    mutationFn: async (v: { userId: string; role: Role }) => {
      setMsg(null);
      const { error } = await supabase.from('fp_users_orgs').update({ role: v.role }).eq('org_id', orgId!).eq('user_id', v.userId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['org_members', orgId] }),
    onError: (e) => setMsg(friendlyError(e as { code?: string; message?: string }, tc)),
  });

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      setMsg(null);
      const { error } = await supabase.from('fp_users_orgs').delete().eq('org_id', orgId!).eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['org_members', orgId] }),
    onError: (e) => setMsg(friendlyError(e as { code?: string; message?: string }, tc)),
  });

  const sendInvite = useMutation({
    mutationFn: async () => {
      setMsg(null);
      const { data, error } = await supabase.from('fp_invites').insert({ org_id: orgId, email: email.trim(), role: inviteRole, invited_by: user?.id ?? null }).select('email, token').single();
      if (error) throw error;
      return data as { email: string; token: string };
    },
    onSuccess: (inv) => {
      // The database queues the invitation email (migration 0065).
      setInviteLink({ email: inv.email, link: `${window.location.origin}/invite?token=${inv.token}` });
      setEmail('');
      void queryClient.invalidateQueries({ queryKey: ['invites', orgId] });
    },
    onError: (e) => setMsg(friendlyError(e as { code?: string; message?: string }, tc)),
  });

  const revokeInvite = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('fp_invites').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invites', orgId] }),
  });

  return (
    <div className="space-y-6">
      {msg && <p role="alert" className="rounded-lg border border-status-crit/30 bg-white p-3 text-sm text-status-crit">{msg}</p>}
      <section className="rounded-xl border border-line bg-white p-4">
        <h2 className="font-semibold text-ink">Members</h2>
        <ul className="mt-3 space-y-2">
          {(members.data ?? []).map((m) => (
            <li key={m.user_id} className="rounded-lg border border-line px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-ink">{m.email}</span>
                <span className="flex items-center gap-2">
                  <Select
                    value={m.role}
                    onChange={(e) => changeRole.mutate({ userId: m.user_id, role: e.target.value as Role })}
                    disabled={m.user_id === user?.id}
                    className="w-40"
                  >
                    {ROLES.map((r) => <option key={r} value={r}>{tc(`roles.${r}`)}</option>)}
                  </Select>
                  {sites.length > 1 && m.role !== 'org_admin' && (
                    <button
                      type="button"
                      onClick={() => setSiteAccessFor(siteAccessFor === m.user_id ? null : m.user_id)}
                      className="whitespace-nowrap text-xs font-medium text-brand hover:text-brand-600"
                    >
                      Site access
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setProfileFor(profileFor === m.user_id ? null : m.user_id)}
                    className="whitespace-nowrap text-xs font-medium text-brand hover:text-brand-600"
                  >
                    Profile
                  </button>
                  {m.user_id !== user?.id && (
                    <button type="button" onClick={() => removeMember.mutate(m.user_id)} className="text-ink-muted hover:text-status-crit" aria-label="Remove member">
                      <Trash2 size={15} />
                    </button>
                  )}
                </span>
              </div>
              {siteAccessFor === m.user_id && <MemberSiteAccess userId={m.user_id} sites={sites} orgId={orgId!} />}
              {profileFor === m.user_id && <MemberProfile userId={m.user_id} orgId={orgId!} />}
            </li>
          ))}
          {members.data?.length === 0 && <li className="text-sm text-ink-muted">No members yet.</li>}
        </ul>
      </section>

      <section className="rounded-xl border border-line bg-white p-4">
        <h2 className="font-semibold text-ink">Invite a member</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
          <Select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)}>
            {ROLES.map((r) => <option key={r} value={r}>{tc(`roles.${r}`)}</option>)}
          </Select>
          <Button onClick={() => sendInvite.mutate()} loading={sendInvite.isPending} disabled={!email}>
            <Plus size={16} /> Invite
          </Button>
        </div>
        {inviteLink && (
          <div className="mt-3 rounded-lg bg-surface p-3">
            <p className="text-xs text-ink-muted">An invitation email is on its way to {inviteLink.email}. You can also share this link directly:</p>
            <div className="mt-1 flex items-center gap-2">
              <code className="block flex-1 break-all text-xs text-ink">{inviteLink.link}</code>
              <button type="button" onClick={() => void navigator.clipboard?.writeText(inviteLink.link)} className="text-ink-muted hover:text-brand" aria-label="Copy link">
                <Copy size={15} />
              </button>
            </div>
          </div>
        )}
        {(invites.data ?? []).length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-medium text-ink">Pending invites</p>
            <ul className="mt-2 space-y-2">
              {(invites.data ?? []).map((inv) => (
                <li key={inv.id} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm">
                  <span className="truncate text-ink">{inv.email} · <span className="text-ink-muted">{tc(`roles.${inv.role}`)}</span></span>
                  <span className="flex items-center gap-2">
                    <button type="button" onClick={() => void navigator.clipboard?.writeText(`${window.location.origin}/invite?token=${inv.token}`)} className="text-ink-muted hover:text-brand" aria-label="Copy invite link">
                      <Copy size={15} />
                    </button>
                    <button type="button" onClick={() => revokeInvite.mutate(inv.id)} className="text-ink-muted hover:text-status-crit" aria-label="Revoke invite">
                      <Trash2 size={15} />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-member site restriction. No rows for a member = unrestricted (the
// default for every member until an admin opts them into scoping).
// ---------------------------------------------------------------------------
function MemberSiteAccess({ userId, sites, orgId }: { userId: string; sites: Site[]; orgId: string }) {
  const { i18n } = useTranslation();
  const lng = i18n.resolvedLanguage ?? 'en';
  const queryClient = useQueryClient();
  const userSitesQuery = useUserSites(userId);
  const assignedIds = new Set((userSitesQuery.data ?? []).map((s) => s.site_id));
  const unrestricted = (userSitesQuery.data ?? []).length === 0;

  const toggleSite = useMutation({
    mutationFn: async (v: { siteId: string; checked: boolean }) => {
      if (v.checked) {
        const { error } = await supabase.from('fp_user_sites').insert({ user_id: userId, org_id: orgId, site_id: v.siteId });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('fp_user_sites').delete().eq('user_id', userId).eq('org_id', orgId).eq('site_id', v.siteId);
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user_sites', orgId, userId] }),
  });

  return (
    <div className="mt-2 rounded-lg border border-line bg-surface p-3">
      <p className="text-xs text-ink-muted">
        {unrestricted
          ? 'Unrestricted — this member sees every site. Check a site below to confine them to it.'
          : 'Confined to the checked site(s) only.'}
      </p>
      <div className="mt-2 flex flex-wrap gap-3">
        {sites.map((site) => (
          <label key={site.id} className="inline-flex items-center gap-1.5 text-sm text-ink">
            <input
              type="checkbox"
              checked={assignedIds.has(site.id)}
              onChange={(e) => toggleSite.mutate({ siteId: site.id, checked: e.target.checked })}
              className="h-4 w-4 rounded border-line text-brand focus:ring-brand/30"
            />
            {resolveI18n(site.name_i18n, lng)}
          </label>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Technician profile: employee ID, phone, labor rate, shift, skills, and
// certifications with expiry tracking — closes the "technician is just a
// role" gap. Admin/manager only, matching the rate card's sensitivity.
// ---------------------------------------------------------------------------
function MemberProfile({ userId, orgId }: { userId: string; orgId: string }) {
  const queryClient = useQueryClient();
  const profileQuery = useTechnicianProfile(userId);
  const profile = profileQuery.data;
  const certsQuery = useTechnicianCertifications(profile?.id);

  const [employeeId, setEmployeeId] = useState('');
  const [phone, setPhone] = useState('');
  const [laborRate, setLaborRate] = useState('');
  const [shift, setShift] = useState('');
  const [skillsText, setSkillsText] = useState('');
  const [certName, setCertName] = useState('');
  const [certIssuer, setCertIssuer] = useState('');
  const [certExpiry, setCertExpiry] = useState('');

  useEffect(() => {
    setEmployeeId(profile?.employee_id ?? '');
    setPhone(profile?.phone ?? '');
    setLaborRate(profile?.labor_rate != null ? String(profile.labor_rate) : '');
    setShift(profile?.shift ?? '');
    setSkillsText((profile?.skills ?? []).join(', '));
  }, [profile]);

  const saveProfile = useMutation({
    mutationFn: async () => {
      const skills = skillsText.split(',').map((s) => s.trim()).filter(Boolean);
      const { error } = await supabase.from('fp_technician_profiles').upsert(
        {
          org_id: orgId,
          user_id: userId,
          employee_id: employeeId || null,
          phone: phone || null,
          labor_rate: laborRate === '' ? null : Math.max(0, parseFloat(laborRate) || 0),
          shift: shift || null,
          skills,
        },
        { onConflict: 'org_id,user_id' }
      );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['technician_profile', orgId, userId] }),
  });

  const addCert = useMutation({
    mutationFn: async () => {
      if (!profile?.id || !certName) return;
      const { error } = await supabase.from('fp_technician_certifications').insert({
        org_id: orgId,
        technician_profile_id: profile.id,
        name: certName,
        issuer: certIssuer || null,
        expiry_date: certExpiry || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['technician_certifications', profile?.id] });
      setCertName('');
      setCertIssuer('');
      setCertExpiry('');
    },
  });

  const removeCert = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('fp_technician_certifications').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['technician_certifications', profile?.id] }),
  });

  return (
    <div className="mt-2 space-y-3 rounded-lg border border-line bg-surface p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-ink-muted">Employee ID</label>
          <Input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-ink-muted">Phone</label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-ink-muted">Labor rate ($ / hour)</label>
          <Input type="number" min={0} value={laborRate} onChange={(e) => setLaborRate(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-ink-muted">Shift</label>
          <Input value={shift} onChange={(e) => setShift(e.target.value)} placeholder="Day, Night, Rotating…" />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs text-ink-muted">Skills (comma-separated)</label>
        <Input value={skillsText} onChange={(e) => setSkillsText(e.target.value)} placeholder="HVAC, Electrical, Plumbing" />
      </div>
      <Button type="button" onClick={() => saveProfile.mutate()} loading={saveProfile.isPending}>
        Save profile
      </Button>

      {profile?.id ? (
        <div className="border-t border-line pt-3">
          <p className="text-xs font-medium text-ink-muted">Certifications</p>
          <ul className="mt-2 space-y-1 text-sm">
            {(certsQuery.data ?? []).map((c) => {
              const d = daysUntil(c.expiry_date);
              const flag = d !== null && d <= 30;
              return (
                <li key={c.id} className="flex items-center justify-between gap-2 text-ink">
                  <span>
                    {c.name}
                    {c.issuer && ` · ${c.issuer}`}
                    {c.expiry_date && (
                      <span className={flag ? 'ml-2 text-status-crit' : 'ml-2 text-ink-muted'}>
                        {d !== null && d < 0 ? 'Expired' : `Expires ${c.expiry_date}`}
                      </span>
                    )}
                  </span>
                  <button type="button" onClick={() => removeCert.mutate(c.id)} className="text-ink-muted hover:text-status-crit" aria-label="Remove certification">
                    <Trash2 size={13} />
                  </button>
                </li>
              );
            })}
            {(certsQuery.data ?? []).length === 0 && <li className="text-ink-muted">No certifications recorded.</li>}
          </ul>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <Input value={certName} onChange={(e) => setCertName(e.target.value)} placeholder="Certification name" className="w-40" />
            <Input value={certIssuer} onChange={(e) => setCertIssuer(e.target.value)} placeholder="Issuer (optional)" className="w-32" />
            <Input type="date" value={certExpiry} onChange={(e) => setCertExpiry(e.target.value)} className="w-36" />
            <button
              type="button"
              disabled={!certName || addCert.isPending}
              onClick={() => addCert.mutate()}
              className="rounded-lg border border-line px-3 py-2 text-xs font-medium text-brand hover:bg-white disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-ink-muted">Save the profile once to start adding certifications.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Integrations & notifications
// ---------------------------------------------------------------------------
function IntegrationsSection() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const pref = useQuery({
    queryKey: ['notification_pref', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_notification_prefs').select('email_enabled').eq('user_id', user!.id).maybeSingle();
      if (error) throw error;
      return data as { email_enabled: boolean } | null;
    },
  });

  const setEmailPref = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase.from('fp_notification_prefs').upsert({ user_id: user!.id, email_enabled: enabled }, { onConflict: 'user_id' });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notification_pref', user?.id] }),
  });

  const emailOn = !!pref.data?.email_enabled;

  // Numbers / OAs are connected by the platform operator (0064, 0076): a
  // tenant choosing its own id could otherwise receive another tenant's messages.
  const channels = useQuery({
    queryKey: ['channel_accounts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_channel_accounts').select('id, channel, display_name, external_id, active');
      if (error) throw error;
      return (data ?? []) as { id: string; channel: string; display_name: string | null; external_id: string; active: boolean }[];
    },
  });

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-line bg-white p-4">
        <div className="flex items-start gap-3">
          <Cpu size={18} className="mt-0.5 text-brand" aria-hidden />
          <div>
            <h2 className="font-semibold text-ink">IoT & sensors</h2>
            <p className="mt-1 text-sm text-ink-muted">Manage device keys and ingest endpoints from the Devices page.</p>
            <Link to="/devices" className="mt-2 inline-flex text-sm font-medium text-brand hover:text-brand-600">Manage devices →</Link>
          </div>
        </div>
      </section>

      {([
        ['whatsapp', 'WhatsApp', 'No WhatsApp number is connected. Contact FacilityPro support to connect your business number; replies to WhatsApp conversations can\'t be delivered until then.'],
        ['zalo', 'Zalo', 'No Zalo Official Account is connected. Contact FacilityPro support to connect your OA; replies to Zalo conversations can\'t be delivered until then.'],
      ] as const).map(([channel, label, empty]) => {
        const connected = (channels.data ?? []).filter((c) => c.channel === channel && c.active);
        return (
          <section key={channel} className="rounded-xl border border-line bg-white p-4">
            <h2 className="font-semibold text-ink">{label}</h2>
            {connected.length > 0 ? (
              <ul className="mt-1 text-sm text-ink">
                {connected.map((c) => (
                  <li key={c.id}>Connected: {c.display_name ?? c.external_id}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-ink-muted">{empty}</p>
            )}
          </section>
        );
      })}

      <section className="rounded-xl border border-line bg-white p-4">
        <h2 className="font-semibold text-ink">Email, SMS &amp; push delivery</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Outbound messages are delivered by the <code className="text-xs">process-outbox</code> function (Resend / Twilio / web-push). Set the provider secrets and schedule the function to enable delivery.
        </p>
        <label className="mt-3 flex items-start gap-2 text-sm text-ink">
          <input type="checkbox" checked={emailOn} onChange={(e) => setEmailPref.mutate(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-line text-brand focus:ring-brand/30" />
          <span>Email me my notifications<span className="block text-xs text-ink-muted">When on, in-app notifications addressed to you are also emailed.</span></span>
        </label>
      </section>
    </div>
  );
}
