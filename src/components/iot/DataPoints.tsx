import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { resolveI18n } from '../../i18n/resolver';
import { useDataPoints, useIotCatalog, type DataPoint, type DirectoryDevice } from '../../lib/iot';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Pill from '../ui/Pill';

type Draft = Omit<DataPoint, 'id' | 'org_id' | 'device_id' | 'discovered'> & { id?: string; sourceText: string };

const blank = (): Draft => ({
  key: '', metric: '', name: null, unit: null, scale: 1, offset: 0, source: {}, sourceText: '',
  writable: false, dangerous: false, min_value: null, max_value: null, active: true,
});

/**
 * Data-point mapping: what the device sends (key) → canonical metric, unit,
 * scale/offset, and its protocol address (Modbus register etc.). Keys seen in
 * data but not yet mapped are marked "discovered".
 */
export default function DataPoints({ device, isAdmin }: { device: DirectoryDevice; isAdmin: boolean }) {
  const { t, i18n } = useTranslation('devices');
  const lng = i18n.resolvedLanguage ?? 'en';
  const queryClient = useQueryClient();
  const points = useDataPoints(device.id);
  const catalog = useIotCatalog();
  const [edit, setEdit] = useState<Draft | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['data_points', device.id] });
    void queryClient.invalidateQueries({ queryKey: ['device_latest', device.id] });
  };

  const applyModel = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('fp_device_apply_model', { p_device: device.id });
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      let source: Record<string, unknown> = {};
      if (d.sourceText.trim()) {
        try {
          source = JSON.parse(d.sourceText);
        } catch {
          throw new Error(t('iot.invalidJson'));
        }
      }
      const row = {
        org_id: device.org_id, device_id: device.id, key: d.key.trim(), metric: d.metric.trim() || d.key.trim(),
        name: d.name?.trim() || null, unit: d.unit?.trim() || null, scale: Number(d.scale) || 1, offset: Number(d.offset) || 0,
        source, writable: d.writable, dangerous: d.dangerous,
        min_value: d.min_value === null || String(d.min_value) === '' ? null : Number(d.min_value),
        max_value: d.max_value === null || String(d.max_value) === '' ? null : Number(d.max_value),
        active: d.active, discovered: false,
      };
      const { error } = d.id
        ? await supabase.from('fp_device_data_points').update(row).eq('id', d.id)
        : await supabase.from('fp_device_data_points').insert(row);
      if (error) throw error;
    },
    onSuccess: () => { setEdit(null); setErr(null); refresh(); },
    onError: (e: Error) => setErr(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('fp_device_data_points').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const quantities = catalog.data?.quantities ?? [];
  const canonical = (m: string) => quantities.find((q) => q.code === m)?.canonical_unit;

  return (
    <section className="mt-6 rounded-xl border border-line bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-ink">{t('iot.dataPoints')}</h2>
        {isAdmin && (
          <div className="flex gap-2">
            {device.model_id && (
              <Button variant="secondary" className="px-3 py-1 text-xs" loading={applyModel.isPending} onClick={() => applyModel.mutate()}>
                {t('iot.applyModel')}
              </Button>
            )}
            <Button variant="secondary" className="px-3 py-1 text-xs" onClick={() => setEdit(blank())}>
              <Plus size={14} /> {t('iot.addDataPoint')}
            </Button>
          </div>
        )}
      </div>
      <p className="mt-1 text-sm text-ink-muted">{t('iot.dataPointsHint')}</p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="pb-2">{t('iot.dpKey')}</th>
              <th className="pb-2">{t('metric')}</th>
              <th className="pb-2">{t('iot.dpUnit')}</th>
              <th className="pb-2">{t('iot.dpSource')}</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {(points.data ?? []).map((p) => (
              <tr key={p.id} className={`border-t border-line ${p.active ? '' : 'opacity-50'}`}>
                <td className="py-1.5 font-mono text-xs text-ink">
                  {p.key} {p.discovered && <Pill className="ml-1 bg-amber-50 text-amber-700">{t('iot.discovered')}</Pill>}
                </td>
                <td className="py-1.5 text-ink">
                  {(() => { const q = quantities.find((x) => x.code === p.metric); return q ? resolveI18n(q.name_i18n, lng) : p.metric; })()}
                  {p.writable && <Pill className="ml-1 bg-blue-50 text-status-info">{t('iot.writable')}</Pill>}
                </td>
                <td className="py-1.5 text-ink-muted">
                  {p.unit ?? '—'}
                  {canonical(p.metric) && p.unit && canonical(p.metric) !== p.unit ? ` → ${canonical(p.metric)}` : ''}
                  {p.scale !== 1 || p.offset !== 0 ? ` (×${p.scale}${p.offset ? ` + ${p.offset}` : ''})` : ''}
                </td>
                <td className="max-w-[12rem] truncate py-1.5 font-mono text-[11px] text-ink-muted" title={JSON.stringify(p.source)}>
                  {Object.keys(p.source ?? {}).length ? JSON.stringify(p.source) : '—'}
                </td>
                <td className="py-1.5 text-right">
                  {isAdmin && (
                    <span className="inline-flex gap-2">
                      <button type="button" aria-label={t('iot.edit')} className="text-ink-muted hover:text-ink"
                        onClick={() => setEdit({ ...p, sourceText: Object.keys(p.source ?? {}).length ? JSON.stringify(p.source) : '' })}>
                        <Pencil size={14} />
                      </button>
                      <button type="button" aria-label={t('iot.delete')} className="text-ink-muted hover:text-status-crit" onClick={() => remove.mutate(p.id)}>
                        <Trash2 size={14} />
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {(points.data ?? []).length === 0 && (
              <tr><td colSpan={5} className="py-2 text-sm text-ink-muted">{t('iot.noDataPoints')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {edit && (
        <form
          className="mt-3 grid grid-cols-2 gap-3 rounded-lg border border-line bg-surface p-3 sm:grid-cols-4"
          onSubmit={(e) => { e.preventDefault(); if (edit.key.trim()) save.mutate(edit); }}
        >
          <label className="text-xs font-medium text-ink">{t('iot.dpKey')}
            <Input value={edit.key} disabled={!!edit.id} onChange={(e) => setEdit({ ...edit, key: e.target.value })} required />
          </label>
          <label className="text-xs font-medium text-ink">{t('metric')}
            <Select value={quantities.some((q) => q.code === edit.metric) ? edit.metric : ''} onChange={(e) => setEdit({ ...edit, metric: e.target.value, unit: edit.unit ?? canonical(e.target.value) ?? null })}>
              <option value="">{t('iot.customMetric')}</option>
              {quantities.map((q) => <option key={q.code} value={q.code}>{resolveI18n(q.name_i18n, lng)}</option>)}
            </Select>
          </label>
          {!quantities.some((q) => q.code === edit.metric) && (
            <label className="text-xs font-medium text-ink">{t('iot.metricCode')}
              <Input value={edit.metric} onChange={(e) => setEdit({ ...edit, metric: e.target.value })} placeholder={edit.key} />
            </label>
          )}
          <label className="text-xs font-medium text-ink">{t('iot.dpUnit')}
            <Input value={edit.unit ?? ''} onChange={(e) => setEdit({ ...edit, unit: e.target.value })} placeholder="°F, kW, Wh…" />
          </label>
          <label className="text-xs font-medium text-ink">{t('iot.dpName')}
            <Input value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          </label>
          <label className="text-xs font-medium text-ink">{t('iot.scale')}
            <Input type="number" step="any" value={edit.scale} onChange={(e) => setEdit({ ...edit, scale: e.target.value as unknown as number })} />
          </label>
          <label className="text-xs font-medium text-ink">{t('iot.offset')}
            <Input type="number" step="any" value={edit.offset} onChange={(e) => setEdit({ ...edit, offset: e.target.value as unknown as number })} />
          </label>
          <label className="col-span-2 text-xs font-medium text-ink sm:col-span-4">{t('iot.dpSource')}
            <Input className="font-mono text-xs" value={edit.sourceText} onChange={(e) => setEdit({ ...edit, sourceText: e.target.value })}
              placeholder='{"register_type":"holding","address":3028,"datatype":"float32","one_based":true}' />
          </label>
          <label className="flex items-center gap-2 text-xs text-ink">
            <input type="checkbox" checked={edit.writable} onChange={(e) => setEdit({ ...edit, writable: e.target.checked })} /> {t('iot.writable')}
          </label>
          <label className="flex items-center gap-2 text-xs text-ink">
            <input type="checkbox" checked={edit.dangerous} onChange={(e) => setEdit({ ...edit, dangerous: e.target.checked })} /> {t('iot.dangerous')}
          </label>
          <label className="flex items-center gap-2 text-xs text-ink">
            <input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> {t('active')}
          </label>
          {edit.writable && (
            <>
              <label className="text-xs font-medium text-ink">{t('iot.min')}
                <Input type="number" step="any" value={edit.min_value ?? ''} onChange={(e) => setEdit({ ...edit, min_value: e.target.value === '' ? null : Number(e.target.value) })} />
              </label>
              <label className="text-xs font-medium text-ink">{t('iot.max')}
                <Input type="number" step="any" value={edit.max_value ?? ''} onChange={(e) => setEdit({ ...edit, max_value: e.target.value === '' ? null : Number(e.target.value) })} />
              </label>
            </>
          )}
          {err && <p className="col-span-2 text-xs text-status-crit sm:col-span-4">{err}</p>}
          <div className="col-span-2 flex justify-end gap-2 sm:col-span-4">
            <Button type="button" variant="secondary" onClick={() => { setEdit(null); setErr(null); }}>{t('iot.cancel')}</Button>
            <Button type="submit" loading={save.isPending}>{t('iot.save')}</Button>
          </div>
        </form>
      )}
    </section>
  );
}
