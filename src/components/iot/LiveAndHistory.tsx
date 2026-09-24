import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { resolveI18n } from '../../i18n/resolver';
import { ago, formatValue, useDeviceHistory, useDeviceLatest, useIotCatalog, type DirectoryDevice } from '../../lib/iot';
import HistoryChart from './HistoryChart';
import Input from '../ui/Input';

const RANGES = ['1h', '24h', '7d', '30d', 'custom'] as const;
type Range = (typeof RANGES)[number];
const RANGE_MS: Record<Exclude<Range, 'custom'>, number> = { '1h': 3600e3, '24h': 86400e3, '7d': 7 * 86400e3, '30d': 30 * 86400e3 };

/** Live values (Realtime) and the history chart for one metric. */
export default function LiveAndHistory({ device }: { device: DirectoryDevice }) {
  const { t, i18n } = useTranslation('devices');
  const lng = i18n.resolvedLanguage ?? 'en';
  const latest = useDeviceLatest(device.id);
  const catalog = useIotCatalog();
  const [metric, setMetric] = useState<string | null>(null);
  const [range, setRange] = useState<Range>('24h');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const rows = latest.data ?? [];
  const selected = metric ?? rows.find((r) => r.value !== null)?.metric ?? null;
  const qName = (code: string) => {
    const q = catalog.data?.quantities.find((x) => x.code === code);
    return q ? resolveI18n(q.name_i18n, lng) : code;
  };
  // Values older than the device's offline window are stale: shown, but flagged.
  const staleAfterMs = (device.offline_after_minutes ?? 15) * 60e3;

  // Stable window per range selection (not per render), so the query key doesn't churn.
  const [anchor, setAnchor] = useState(() => Date.now());
  const { from, to } = useMemo(() => {
    if (range === 'custom') {
      return {
        from: customFrom ? new Date(customFrom).toISOString() : new Date(anchor - 86400e3).toISOString(),
        to: customTo ? new Date(customTo).toISOString() : null,
      };
    }
    return { from: new Date(anchor - RANGE_MS[range]).toISOString(), to: null };
  }, [range, customFrom, customTo, anchor]);
  const history = useDeviceHistory(device.id, selected, from, to);
  const unit = rows.find((r) => r.metric === selected)?.unit ?? null;

  return (
    <>
      <section className="mt-6 rounded-xl border border-line bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-ink">{t('iot.liveData')}</h2>
          <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
            <span className="h-2 w-2 animate-pulse rounded-full bg-status-ok" aria-hidden /> {t('iot.live')}
          </span>
        </div>
        {rows.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">{t('noTelemetry')}</p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {rows.map((r) => {
              const stale = Date.now() - new Date(r.ts).getTime() > staleAfterMs;
              return (
                <button
                  key={r.metric}
                  type="button"
                  onClick={() => setMetric(r.metric)}
                  className={`rounded-lg border p-3 text-left transition ${selected === r.metric ? 'border-brand bg-brand-50' : 'border-line hover:bg-surface'}`}
                >
                  <p className="truncate text-xs text-ink-muted">{qName(r.metric)}</p>
                  <p className={`mt-0.5 text-lg font-semibold ${stale ? 'text-ink-muted' : 'text-ink'}`}>{formatValue(r.value, r.unit)}</p>
                  <p className={`text-[11px] ${stale ? 'text-status-warn' : 'text-ink-muted'}`}>
                    {stale ? t('iot.stale', { when: ago(r.ts, lng) }) : ago(r.ts, lng)}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {selected && (
        <section className="mt-6 rounded-xl border border-line bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-ink">{t('iot.history', { metric: qName(selected) })}</h2>
            <div className="flex flex-wrap gap-1" role="tablist">
              {RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  role="tab"
                  aria-selected={range === r}
                  onClick={() => { setRange(r); setAnchor(Date.now()); }}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium ${range === r ? 'bg-ink text-white' : 'bg-surface text-ink hover:bg-line'}`}
                >
                  {t(`iot.ranges.${r}`)}
                </button>
              ))}
            </div>
          </div>
          {range === 'custom' && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-xs text-ink-muted">
                {t('iot.from')}
                <Input type="datetime-local" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              </label>
              <label className="text-xs text-ink-muted">
                {t('iot.to')}
                <Input type="datetime-local" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
              </label>
            </div>
          )}
          <div className="mt-3">
            {history.isLoading ? (
              <p className="py-10 text-center text-sm text-ink-muted">…</p>
            ) : (
              <HistoryChart points={history.data ?? []} unit={unit} lng={lng} emptyLabel={t('iot.noHistory')} />
            )}
          </div>
        </section>
      )}
    </>
  );
}
