import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, QrCode, Wrench, ClipboardList, Plus, Gauge } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { writeOrQueue } from '../lib/sync';
import { useOrg } from '../contexts/OrgContext';
import {
  useAsset,
  useAssetTypes,
  useDocumentLinks,
  useDocuments,
  useLocations,
  useMeterReadings,
  useMeters,
  useRequests,
  useWorkOrders,
} from '../lib/queries';
import { resolveI18n } from '../i18n/resolver';
import { formatDate, formatDateOnly, REQUEST_STATUS_CLASS, WO_STATUS_CLASS } from '../lib/ui';
import type { Meter } from '../lib/database.types';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Pill from '../components/ui/Pill';
import BilingualName from '../components/ui/BilingualName';
import Select from '../components/ui/Select';

type Tab = 'info' | 'history' | 'meters' | 'documents' | 'qr';

export default function AssetDetail() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation('assets');
  const { t: tc } = useTranslation('common');
  const lng = i18n.resolvedLanguage ?? 'en';
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('info');

  const assetQuery = useAsset(id);
  const assetTypes = useAssetTypes();
  const locations = useLocations();
  const requests = useRequests();
  const workOrders = useWorkOrders();

  const asset = assetQuery.data;
  if (!asset) {
    return <p className="text-sm text-ink-muted">{tc('loading')}</p>;
  }

  const typeName = asset.asset_type_id
    ? resolveI18n(
        assetTypes.data?.find((x) => x.id === asset.asset_type_id)?.name_i18n,
        lng
      )
    : '—';
  const loc = locations.data?.find((x) => x.id === asset.location_id);
  const locName = loc ? resolveI18n(loc.name_i18n, lng) : '—';

  const assetRequests = (requests.data ?? []).filter((r) => r.asset_id === asset.id);
  const assetWorkOrders = (workOrders.data ?? []).filter((w) => w.asset_id === asset.id);

  const reportUrl = `${window.location.origin}/report?org=${asset.org_id}&asset=${asset.id}${
    asset.location_id ? `&location=${asset.location_id}` : ''
  }`;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'info', label: t('detail.info') },
    { key: 'history', label: t('detail.history') },
    { key: 'meters', label: t('meters.tab') },
    { key: 'documents', label: t('detail.documents') },
    { key: 'qr', label: t('detail.qr') },
  ];

  return (
    <div className="max-w-3xl">
      <button
        onClick={() => navigate('/assets')}
        className="mb-3 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={15} /> {t('title')}
      </button>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{resolveI18n(asset.name_i18n, lng)}</h1>
          <p className="mt-1 text-sm text-ink-muted">{typeName}</p>
        </div>
        <Button
          onClick={() =>
            navigate(
              `/requests/new?asset=${asset.id}${
                asset.location_id ? `&location=${asset.location_id}` : ''
              }`
            )
          }
        >
          {tc('actions.reportFault')}
        </Button>
      </div>

      <div className="mt-5 flex gap-1 border-b border-line">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.key}
            onClick={() => setTab(tabItem.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
              tab === tabItem.key
                ? 'border-brand text-brand-600'
                : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            {tabItem.label}
          </button>
        ))}
      </div>

      {tab === 'info' && (
        <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
          <Info label={t('detail.type')} value={typeName} />
          <Info label={t('detail.location')} value={locName} />
          <Info label={t('detail.serial')} value={asset.serial ?? '—'} />
          <Info label={t('detail.warranty')} value={formatDate(asset.warranty_expiry, lng)} />
        </dl>
      )}

      {tab === 'history' && (
        <div className="mt-5 space-y-2">
          {assetRequests.length === 0 && assetWorkOrders.length === 0 && (
            <p className="text-sm text-ink-muted">{t('detail.noHistory')}</p>
          )}
          {assetRequests.map((r) => (
            <Link
              key={r.id}
              to={`/requests/${r.id}`}
              className="flex items-center justify-between rounded-lg border border-line bg-white px-3 py-2 text-sm hover:bg-surface"
            >
              <span className="flex items-center gap-2 text-ink">
                <ClipboardList size={15} className="text-ink-muted" />
                {r.title ?? '—'}
              </span>
              <Pill className={REQUEST_STATUS_CLASS[r.status]}>{tc(`requestStatus.${r.status}`)}</Pill>
            </Link>
          ))}
          {assetWorkOrders.map((w) => (
            <Link
              key={w.id}
              to={`/work-orders/${w.id}`}
              className="flex items-center justify-between rounded-lg border border-line bg-white px-3 py-2 text-sm hover:bg-surface"
            >
              <span className="flex items-center gap-2 text-ink">
                <Wrench size={15} className="text-ink-muted" />
                {w.title ?? '—'}
              </span>
              <Pill className={WO_STATUS_CLASS[w.status]}>{tc(`woStatus.${w.status}`)}</Pill>
            </Link>
          ))}
        </div>
      )}

      {tab === 'meters' && id && <MetersTab assetId={id} />}

      {tab === 'documents' && id && <DocumentsTab assetId={id} />}

      {tab === 'qr' && (
        <div className="mt-5 rounded-xl border border-line bg-white p-6 text-center">
          <div className="inline-block rounded-lg border border-line p-4">
            <QRCodeSVG value={reportUrl} size={180} />
          </div>
          <p className="mx-auto mt-3 max-w-sm text-sm text-ink-muted">{t('detail.qrHint')}</p>
          <Button variant="secondary" className="mt-4" onClick={() => window.print()}>
            <QrCode size={16} /> {tc('actions.printQr')}
          </Button>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-ink">{value}</dd>
    </div>
  );
}

function MetersTab({ assetId }: { assetId: string }) {
  const { t, i18n } = useTranslation('assets');
  const { t: tc } = useTranslation('common');
  const lng = i18n.resolvedLanguage ?? 'en';
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id;
  const queryClient = useQueryClient();
  const metersQuery = useMeters(assetId);
  const [open, setOpen] = useState(false);

  const addMeter = useMutation({
    mutationFn: async (v: { en: string; vi: string; unit: string }) => {
      const { error } = await supabase.from('fp_meters').insert({
        org_id: orgId,
        asset_id: assetId,
        name_i18n: { en: v.en, vi: v.vi || v.en },
        unit: v.unit || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['meters', assetId] });
      setOpen(false);
    },
  });

  const meters = metersQuery.data ?? [];

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink">{t('meters.tab')}</p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:text-brand-600"
        >
          <Plus size={15} /> {t('meters.add')}
        </button>
      </div>

      {meters.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">{t('meters.empty')}</p>
      ) : (
        <div className="mt-3 space-y-2">
          {meters.map((m) => (
            <MeterRow key={m.id} meter={m} orgId={orgId!} lng={lng} />
          ))}
        </div>
      )}

      {open && (
        <MeterDialog
          busy={addMeter.isPending}
          onCancel={() => setOpen(false)}
          onSubmit={(v) => addMeter.mutate(v)}
          title={t('meters.add')}
          unitLabel={t('meters.unit')}
          cancelLabel={tc('actions.cancel')}
          saveLabel={tc('actions.create')}
        />
      )}
    </div>
  );
}

function MeterRow({ meter, orgId, lng }: { meter: Meter; orgId: string; lng: string }) {
  const { t } = useTranslation('assets');
  const queryClient = useQueryClient();
  const readingsQuery = useMeterReadings(meter.id);
  const [value, setValue] = useState('');

  const logReading = useMutation({
    mutationFn: async () => {
      const v = parseFloat(value);
      if (isNaN(v)) return;
      await writeOrQueue({
        op: 'insert',
        table: 'fp_meter_readings',
        values: { org_id: orgId, meter_id: meter.id, value: v },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['meter_readings', meter.id] });
      setValue('');
    },
  });

  const latest = readingsQuery.data?.[0];

  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium text-ink">
          <Gauge size={15} className="text-ink-muted" aria-hidden />
          {resolveI18n(meter.name_i18n, lng)}
          {meter.unit && <span className="text-xs text-ink-muted">({meter.unit})</span>}
        </span>
        <span className="text-xs text-ink-muted">
          {latest
            ? `${t('meters.latest')}: ${latest.value} · ${formatDateOnly(latest.read_at, lng)}`
            : t('meters.noReadings')}
        </span>
      </div>
      <div className="mt-2 flex items-end gap-2">
        <Input
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t('meters.value')}
          className="max-w-[140px]"
        />
        <button
          type="button"
          disabled={!value || logReading.isPending}
          onClick={() => logReading.mutate()}
          className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-brand hover:bg-surface disabled:opacity-50"
        >
          {t('meters.logReading')}
        </button>
      </div>
    </div>
  );
}

function MeterDialog({
  busy,
  onCancel,
  onSubmit,
  title,
  unitLabel,
  cancelLabel,
  saveLabel,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (v: { en: string; vi: string; unit: string }) => void;
  title: string;
  unitLabel: string;
  cancelLabel: string;
  saveLabel: string;
}) {
  const [en, setEn] = useState('');
  const [vi, setVi] = useState('');
  const [unit, setUnit] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!en) return;
    onSubmit({ en, vi, unit });
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-xl border border-line bg-white p-6 shadow-lg"
      >
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        <div className="mt-4 space-y-3">
          <BilingualName en={en} vi={vi} onEn={setEn} onVi={setVi} />
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">{unitLabel}</label>
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button type="submit" loading={busy}>
            {saveLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}

function DocumentsTab({ assetId }: { assetId: string }) {
  const { t } = useTranslation('assets');
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id;
  const queryClient = useQueryClient();
  const linksQuery = useDocumentLinks('asset', assetId);
  const documentsQuery = useDocuments();
  const [pickedId, setPickedId] = useState('');

  const links = linksQuery.data ?? [];
  const documents = documentsQuery.data ?? [];
  const linked = links
    .map((l) => documents.find((d) => d.id === l.document_id))
    .filter((d): d is NonNullable<typeof d> => !!d);
  const linkedIds = new Set(links.map((l) => l.document_id));
  const attachable = documents.filter((d) => !linkedIds.has(d.id));

  const attach = useMutation({
    mutationFn: async () => {
      if (!orgId || !pickedId) return;
      const { error } = await supabase.from('fp_document_links').insert({
        org_id: orgId,
        document_id: pickedId,
        entity_type: 'asset',
        entity_id: assetId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['document_links', 'asset', assetId] });
      setPickedId('');
    },
  });

  return (
    <div className="mt-5 space-y-3">
      {linked.length === 0 ? (
        <p className="text-sm text-ink-muted">{t('documents.empty')}</p>
      ) : (
        linked.map((doc) => (
          <div key={doc.id} className="rounded-lg border border-line bg-white px-3 py-2">
            <p className="text-sm font-medium text-ink">{doc.title}</p>
            <p className="text-xs text-ink-muted">{doc.category} · {doc.owner}</p>
            {doc.link && (
              <a href={doc.link} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-medium text-brand hover:text-brand-600">
                {t('documents.open')}
              </a>
            )}
          </div>
        ))
      )}

      {attachable.length > 0 && (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-ink-muted">{t('documents.attach')}</label>
            <Select value={pickedId} onChange={(e) => setPickedId(e.target.value)}>
              <option value="">{t('documents.choose')}</option>
              {attachable.map((doc) => (
                <option key={doc.id} value={doc.id}>{doc.title}</option>
              ))}
            </Select>
          </div>
          <Button type="button" disabled={!pickedId || attach.isPending} onClick={() => attach.mutate()}>
            {t('documents.attachAction')}
          </Button>
        </div>
      )}
    </div>
  );
}
