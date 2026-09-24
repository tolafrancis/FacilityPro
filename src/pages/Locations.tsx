import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Building2, Layers, DoorOpen, LayoutGrid, MapPinned } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../contexts/OrgContext';
import { resolveI18n } from '../i18n/resolver';
import type { Site, LocationRow, LocationKind } from '../lib/database.types';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';

type DialogState =
  | { mode: 'site' }
  | { mode: 'child'; kind: LocationKind; siteId: string; parentId: string | null }
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
  const [dialog, setDialog] = useState<DialogState>(null);

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
          {isManager && nextKind && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  setDialog({ mode: 'child', kind: nextKind, siteId: node.site_id!, parentId: node.id })
                }
                className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:text-brand-600"
              >
                <Plus size={14} /> {t(`add${cap(nextKind)}`)}
              </button>
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
                  <button
                    type="button"
                    onClick={() =>
                      setDialog({ mode: 'child', kind: 'building', siteId: site.id, parentId: null })
                    }
                    className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:text-brand-600"
                  >
                    <Plus size={14} /> {t('addBuilding')}
                  </button>
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
              : t('dialog.addChildTitle', { kind: t(dialog.kind) })
          }
          showAddress={dialog.mode === 'site'}
          busy={addSite.isPending || addLocation.isPending}
          onCancel={() => setDialog(null)}
          onSubmit={(vals) => {
            if (dialog.mode === 'site') {
              addSite.mutate(vals);
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
  showAddress: boolean;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (vals: { en: string; vi: string; address: string }) => void;
}

function NameDialog({ title, showAddress, busy, onCancel, onSubmit }: NameDialogProps) {
  const { t } = useTranslation('locations');
  const [en, setEn] = useState('');
  const [vi, setVi] = useState('');
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
