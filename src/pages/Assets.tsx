import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Boxes } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../contexts/OrgContext';
import { useAssetsPage, useAssetTypes, useLocations } from '../lib/queries';
import { resolveI18n } from '../i18n/resolver';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import Pill from '../components/ui/Pill';
import Pagination from '../components/ui/Pagination';
import AssetDialog, { type AssetFormValues } from '../components/AssetDialog';
import { friendlyError } from '../lib/ui';

const PAGE_SIZE = 25;

export default function Assets() {
  const { isManager } = useOrg();
  const { t, i18n } = useTranslation('assets');
  const { t: tc } = useTranslation('common');
  const lng = i18n.resolvedLanguage ?? 'en';
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id;
  const queryClient = useQueryClient();
  const assetTypes = useAssetTypes();
  const locations = useLocations();
  const [open, setOpen] = useState(false);
  const [filterTypeId, setFilterTypeId] = useState('');
  const [filterLocationId, setFilterLocationId] = useState('');
  const [filterStatus, setFilterStatus] = useState<'inService' | 'retired' | ''>('inService');
  const [page, setPage] = useState(1);

  const assets = useAssetsPage(page, PAGE_SIZE, {
    assetTypeId: filterTypeId || undefined,
    locationId: filterLocationId || undefined,
    status: filterStatus || undefined,
  });
  const rows = assets.data?.rows ?? [];
  const total = assets.data?.count ?? 0;

  const typeName = (id: string | null) => {
    const at = assetTypes.data?.find((x) => x.id === id);
    return at ? resolveI18n(at.name_i18n, lng) : '—';
  };
  const locName = (id: string | null) => {
    const l = locations.data?.find((x) => x.id === id);
    return l ? resolveI18n(l.name_i18n, lng) : '—';
  };

  const create = useMutation({
    mutationFn: async (v: AssetFormValues) => {
      const { error } = await supabase.from('fp_assets').insert({
        org_id: orgId,
        name_i18n: { en: v.en, vi: v.vi || v.en },
        asset_type_id: v.assetTypeId || null,
        location_id: v.locationId || null,
        serial: v.serial || null,
        manufacturer: v.manufacturer || null,
        model: v.model || null,
        warranty_expiry: v.warranty || null,
      });
      if (error) throw error;
    },
    meta: { errorHandled: true }, // shown in the dialog
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['assets', orgId] });
      void queryClient.invalidateQueries({ queryKey: ['assets_page'] });
      setOpen(false);
    },
  });

  // Inline "Other / create new" for the dialog's type & location pickers.
  const createType = async (name: string): Promise<string | null> => {
    const nm = name.trim();
    if (!nm) return null;
    const { data, error } = await supabase
      .from('fp_asset_types')
      .insert({ org_id: orgId, name_i18n: { en: nm, vi: nm } })
      .select('id')
      .single();
    if (error) return null;
    await queryClient.invalidateQueries({ queryKey: ['asset_types', orgId] });
    return data.id as string;
  };
  return (
    <div className="max-w-5xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{t('title')}</h1>
          <p className="mt-1 text-sm text-ink-muted">{t('subtitle')}</p>
        </div>
        {isManager && (
          <Button onClick={() => setOpen(true)}>
            <Plus size={16} /> {t('add')}
          </Button>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <div className="min-w-[160px]">
          <label className="mb-1 block text-xs text-ink-muted">{t('columns.type')}</label>
          <Select
            value={filterTypeId}
            onChange={(e) => {
              setFilterTypeId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{tc('common.all')}</option>
            {(assetTypes.data ?? []).map((at) => (
              <option key={at.id} value={at.id}>{resolveI18n(at.name_i18n, lng)}</option>
            ))}
          </Select>
        </div>
        <div className="min-w-[160px]">
          <label className="mb-1 block text-xs text-ink-muted">{t('columns.location')}</label>
          <Select
            value={filterLocationId}
            onChange={(e) => {
              setFilterLocationId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{tc('common.all')}</option>
            {(locations.data ?? []).map((l) => (
              <option key={l.id} value={l.id}>{resolveI18n(l.name_i18n, lng)}</option>
            ))}
          </Select>
        </div>
        <div className="min-w-[160px]">
          <label className="mb-1 block text-xs text-ink-muted">{t('columns.status')}</label>
          <Select
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value as 'inService' | 'retired' | '');
              setPage(1);
            }}
          >
            <option value="inService">{t('filter.inService')}</option>
            <option value="retired">{t('filter.retired')}</option>
            <option value="">{t('filter.all')}</option>
          </Select>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line bg-white p-8 text-center">
          <Boxes className="mx-auto text-ink-muted" aria-hidden />
          <p className="mt-2 text-sm text-ink-muted">{t('empty')}</p>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-line bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-surface text-left text-xs text-ink-muted">
              <tr>
                <th className="px-4 py-2 font-medium">{t('columns.name')}</th>
                <th className="px-4 py-2 font-medium">{t('columns.type')}</th>
                <th className="px-4 py-2 font-medium">{t('columns.location')}</th>
                <th className="px-4 py-2 font-medium">{t('columns.serial')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-b border-line last:border-0 hover:bg-surface">
                  <td className="px-4 py-2">
                    <Link to={`/assets/${a.id}`} className="font-medium text-brand hover:text-brand-600">
                      {resolveI18n(a.name_i18n, lng)}
                    </Link>
                    {a.status !== 'active' && (
                      <Pill className="ml-2 bg-surface text-ink-muted">{t(`status.${a.status}`)}</Pill>
                    )}
                  </td>
                  <td className="px-4 py-2 text-ink-muted">{typeName(a.asset_type_id)}</td>
                  <td className="px-4 py-2 text-ink-muted">{locName(a.location_id)}</td>
                  <td className="px-4 py-2 text-ink-muted">{a.serial ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={setPage}
        summary={(p, tp, tt) => tc('pagination.summary', { page: p, totalPages: tp, total: tt })}
        prevLabel={tc('pagination.prev')}
        nextLabel={tc('pagination.next')}
      />

      {open && (
        <AssetDialog
          locations={locations.data ?? []}
          assetTypeOptions={(assetTypes.data ?? []).map((at) => ({
            id: at.id,
            label: resolveI18n(at.name_i18n, lng),
          }))}
          locationLabel={(l) => resolveI18n(l.name_i18n, lng)}
          onCreateType={createType}
          busy={create.isPending}
          error={create.error ? friendlyError(create.error as { code?: string; message?: string }, tc) : null}
          onCancel={() => setOpen(false)}
          onSubmit={(v) => create.mutate(v)}
        />
      )}
    </div>
  );
}
