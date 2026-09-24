import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Building2, Layers, DoorOpen, LayoutGrid, MapPinned, Pencil, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../contexts/OrgContext';
import { resolveI18n } from '../i18n/resolver';
import type { Site, LocationRow, LocationKind } from '../lib/database.types';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { friendlyError } from '../lib/ui';

type DialogState =
  | { mode: 'site' }
  | { mode: 'child'; kind: LocationKind; siteId: string; parentId: string | null }
  | { mode: 'rename'; table: 'fp_sites' | 'fp_locations'; id: string; kind: string; en: string; vi: string }
  | null;

const KIND_ICON: Record<LocationKind, typeof Building2> = {
  building: Building2,
  floor: Layers,
  room: DoorOpen,
  zone: LayoutGrid,
};

export default function Locations() {
  const { isManager } = useOrg();
  const { t, i18n } = useTranslation('locations');
  const lng = i18n.resolvedLanguage ?? 'en';
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id;
  const queryClient = useQueryClient();
  const { t: tc } = useTranslation('common');
  const [dialog, setDialog] = useState<DialogState>(null);
  const [error, setError] = useState<string | null>(null);

  const sitesQuery = useQuery({
    queryKey: ['sites', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_sites')
        .select('*')
        .eq('org_id', orgId!)
        .order('created_at');
      if (error) throw error;
      return data as Site[];
    },
  });

  const locationsQuery = useQuery({
    queryKey: ['locations', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_locations')
        .select('*')
        .eq('org_id', orgId!)
        .order('created_at');
      if (error) throw error;
      return data as LocationRow[];
    },
  });

  const addSite = useMutation({
    mutationFn: async (vals: { en: string; vi: string; address: string }) => {
      const { error } = await supabase.from('fp_sites').insert({
        org_id: orgId,
        name_i18n: { en: vals.en, vi: vals.vi || vals.en },
        address: vals.address || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sites', orgId] });
      setDialog(null);
    },
  });

  const addLocation = useMutation({
    mutationFn: async (vals: {
      en: string;
      vi: string;
      kind: LocationKind;
      siteId: string;
      parentId: string | null;
    }) => {
      const { error } = await supabase.from('fp_locations').insert({
        org_id: orgId,
        site_id: vals.siteId,
        parent_id: vals.parentId,
        name_i18n: { en: vals.en, vi: vals.vi || vals.en },
        kind: vals.kind,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['locations', orgId] });
      setDialog(null);
    },
  });

  const rename = useMutation({
    mutationFn: async (v: { table: 'fp_sites' | 'fp_locations'; id: string; en: string; vi: string }) => {
      const { data, error } = await supabase
        .from(v.table)
        .update({ name_i18n: { en: v.en, vi: v.vi || v.en } })
        .eq('id', v.id)
        .select('id');
      if (error) throw error;
      if (!data?.length) throw { code: '42501', message: 'permission denied' };
    },
    onSuccess: (_d, v) => {
      void queryClient.invalidateQueries({ queryKey: [v.table === 'fp_sites' ? 'sites' : 'locations', orgId] });
      setDialog(null);
    },
  });

  // Refused by the database while the location still contains locations or
  // assets, or has work history (migration 0068); the message says so.
  const remove = useMutation({
    meta: { errorHandled: true },
    mutationFn: async (v: { table: 'fp_sites' | 'fp_locations'; id: string }) => {
      setError(null);
      const { data, error } = await supabase.from(v.table).delete().eq('id', v.id).select('id');
      if (error) throw error;
      if (!data?.length) throw { code: '42501', message: 'permission denied' };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sites', orgId] });
      void queryClient.invalidateQueries({ queryKey: ['locations', orgId] });
    },
    onError: (e) => setError(friendlyError(e as { code?: string; message?: string }, tc)),
  });

  const editButtons = (table: 'fp_sites' | 'fp_locations', id: string, kind: string, name: { en?: string; vi?: string }) =>
    isManager ? (
      <>
        <button
          type="button"
          onClick={() => setDialog({ mode: 'rename', table, id, kind, en: name.en ?? '', vi: name.vi ?? '' })}
          className="text-ink-muted hover:text-brand"
          aria-label={t('rename')}
          title={t('rename')}
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(t('deleteConfirm', { name: resolveI18n(name, lng) }))) remove.mutate({ table, id });
          }}
          className="text-ink-muted hover:text-status-crit"
          aria-label={t('delete')}
          title={t('delete')}
        >
          <Trash2 size={14} />
        </button>
      </>
    ) : null;

  const locations = locationsQuery.data ?? [];
  const childrenOf = (siteId: string, parentId: string | null) =>
    locations.filter((l) => l.site_id === siteId && l.parent_id === parentId);

  const renderNode = (node: LocationRow, depth: number) => {
    const Icon = KIND_ICON[node.kind];
    const children = childrenOf(node.site_id!, node.id);
    const nextKind: LocationKind | null =
      node.kind === 'building' ? 'floor' : node.kind === 'floor' ? 'room' : null;
    return (
      <div key={node.id} style={{ marginLeft: depth * 16 }} className="mt-1">
        <div className="flex items-center justify-between rounded-lg border border-line bg-white px-3 py-2">
          <span className="flex items-center gap-2 text-sm text-ink">
            <Icon size={16} className="text-ink-muted" aria-hidden />
            {resolveI18n(node.name_i18n, lng)}
            <span className="text-xs text-ink-muted">· {t(node.kind)}</span>
          </span>
          {isManager && (
            <div className="flex items-center gap-2">
              {editButtons('fp_locations', node.id, t(node.kind), node.name_i18n)}
              {nextKind && (
                <button
                  type="button"
                  onClick={() =>
                    setDialog({ mode: 'child', kind: nextKind, siteId: node.site_id!, parentId: node.id })
                  }
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:text-brand-600"
                >
                  <Plus size={14} /> {t(`add${cap(nextKind)}`)}
                </button>
              )}
              {node.kind === 'floor' && (
                <button
                  type="button"
                  onClick={() =>
                    setDialog({ mode: 'child', kind: 'zone', siteId: node.site_id!, parentId: node.id })
                  }
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:text-brand-600"
                >
                  <Plus size={14} /> {t('addZone')}
                </button>
              )}
            </div>
          )}
        </div>
        {children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  const sites = sitesQuery.data ?? [];

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{t('title')}</h1>
          <p className="mt-1 text-sm text-ink-muted">{t('subtitle')}</p>
        </div>
        {isManager && (
          <Button onClick={() => setDialog({ mode: 'site' })}>
            <Plus size={16} /> {t('addSite')}
          </Button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-status-crit/30 bg-white p-3 text-sm text-status-crit">
          {error}
        </p>
      )}

      {sites.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line bg-white p-8 text-center">
          <MapPinned className="mx-auto text-ink-muted" aria-hidden />
          <p className="mt-2 text-sm text-ink-muted">{t('empty')}</p>
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          {sites.map((site) => (
            <section key={site.id}>
              <div className="flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2">
                <span className="flex items-center gap-2 text-sm font-semibold text-brand-600">
                  <MapPinned size={16} aria-hidden />
                  {resolveI18n(site.name_i18n, lng)}
                  <span className="text-xs font-normal text-ink-muted">· {t('site')}</span>
                </span>
                {isManager && (
                  <span className="flex items-center gap-2">
                    {editButtons('fp_sites', site.id, t('site'), site.name_i18n)}
                    <button
                      type="button"
                      onClick={() =>
                        setDialog({ mode: 'child', kind: 'building', siteId: site.id, parentId: null })
                      }
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:text-brand-600"
                    >
                      <Plus size={14} /> {t('addBuilding')}
                    </button>
                  </span>
                )}
              </div>
              {childrenOf(site.id, null).map((b) => renderNode(b, 1))}
            </section>
          ))}
        </div>
      )}

      {dialog && (
        <NameDialog
          title={
            dialog.mode === 'site'
              ? t('dialog.addSiteTitle')
              : dialog.mode === 'rename'
                ? t('dialog.renameTitle', { kind: dialog.kind })
                : t('dialog.addChildTitle', { kind: t(dialog.kind) })
          }
          initial={dialog.mode === 'rename' ? { en: dialog.en, vi: dialog.vi } : undefined}
          showAddress={dialog.mode === 'site'}
          busy={addSite.isPending || addLocation.isPending || rename.isPending}
          onCancel={() => setDialog(null)}
          onSubmit={(vals) => {
            if (dialog.mode === 'site') {
              addSite.mutate(vals);
            } else if (dialog.mode === 'rename') {
              rename.mutate({ table: dialog.table, id: dialog.id, en: vals.en, vi: vals.vi });
            } else {
              addLocation.mutate({
                en: vals.en,
                vi: vals.vi,
                kind: dialog.kind,
                siteId: dialog.siteId,
                parentId: dialog.parentId,
              });
            }
          }}
        />
      )}
    </div>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface NameDialogProps {
  title: string;
  initial?: { en: string; vi: string };
  showAddress: boolean;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (vals: { en: string; vi: string; address: string }) => void;
}

function NameDialog({ title, initial, showAddress, busy, onCancel, onSubmit }: NameDialogProps) {
  const { t } = useTranslation('locations');
  const [en, setEn] = useState(initial?.en ?? '');
  const [vi, setVi] = useState(initial?.vi ?? '');
  const [address, setAddress] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!en) return;
    onSubmit({ en, vi, address });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-xl border border-line bg-white p-6 shadow-lg"
      >
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">{t('form.nameEn')}</label>
            <Input value={en} onChange={(e) => setEn(e.target.value)} placeholder={t('form.namePlaceholder')} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">{t('form.nameVi')}</label>
            <Input value={vi} onChange={(e) => setVi(e.target.value)} />
          </div>
          {showAddress && (
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">{t('form.address')}</label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t('cancel')}
          </Button>
          <Button type="submit" loading={busy}>
            {t('save')}
          </Button>
        </div>
      </form>
    </div>
  );
}
