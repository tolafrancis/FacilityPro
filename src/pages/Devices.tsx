import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Cpu, Circle, BatteryLow, Search } from 'lucide-react';
import { useOrg } from '../contexts/OrgContext';
import { usePersistentState } from '../lib/persistedState';
import { ago, CATEGORIES, PROTOCOLS, SEVERITY_CLASS, STATUS_DOT, useDeviceAlerts, useDeviceDirectory, type DirectoryDevice } from '../lib/iot';
import { useLocationLabels } from '../components/iot/locationLabels';
import AddDeviceWizard from '../components/iot/AddDeviceWizard';
import DeviceAlerts from '../components/iot/DeviceAlerts';
import Gateways from '../components/iot/Gateways';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Pill from '../components/ui/Pill';

type Tile = 'all' | 'online' | 'offline' | 'warning' | 'critical' | 'battery';
type Tab = 'devices' | 'alerts' | 'gateways';

const isOffline = (d: DirectoryDevice) => d.status === 'offline' || d.status === 'never';
const isCritical = (d: DirectoryDevice) => d.alert_severity === 'critical' || d.alert_severity === 'emergency';
const TILE_TEST: Record<Tile, (d: DirectoryDevice) => boolean> = {
  all: () => true,
  online: (d) => d.status === 'online',
  offline: isOffline,
  warning: (d) => d.alert_severity === 'warning',
  critical: isCritical,
  battery: (d) => d.battery_low,
};

export default function Devices() {
  const { t, i18n } = useTranslation('devices');
  const lng = i18n.resolvedLanguage ?? 'en';
  const navigate = useNavigate();
  const { currentOrg, role } = useOrg();
  const orgId = currentOrg?.id;
  const isAdmin = role === 'org_admin';
  const isStaff = role === 'org_admin' || role === 'manager' || role === 'technician';

  const devices = useDeviceDirectory();
  const openAlerts = useDeviceAlerts();
  const labels = useLocationLabels();
  const [showAdd, setShowAdd] = useState(false);
  const [tab, setTab] = usePersistentState<Tab>('devices.tab', 'devices');
  const [tile, setTile] = useState<Tile>('all');
  const [q, setQ] = useState('');
  const [building, setBuilding] = useState('');
  const [category, setCategory] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [protocol, setProtocol] = useState('');

  const all = devices.data ?? [];
  const counts = useMemo(
    () => Object.fromEntries((Object.keys(TILE_TEST) as Tile[]).map((k) => [k, all.filter(TILE_TEST[k]).length])) as Record<Tile, number>,
    [all]
  );
  const manufacturers = [...new Set(all.map((d) => d.manufacturer).filter(Boolean))] as string[];
  const filtered = all.filter((d) =>
    TILE_TEST[tile](d)
    && (!q || `${d.name} ${d.external_id ?? ''} ${d.model ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    && (!building || labels.building(d.location_id) === building)
    && (!category || d.category === category)
    && (!manufacturer || d.manufacturer === manufacturer)
    && (!protocol || d.protocol === protocol)
  );
  const nameOf = (id: string) => all.find((d) => d.id === id)?.name ?? '';

  const tiles: { key: Tile; tone: string }[] = [
    { key: 'all', tone: 'text-ink' },
    { key: 'online', tone: 'text-status-ok' },
    { key: 'offline', tone: 'text-status-crit' },
    { key: 'warning', tone: 'text-amber-600' },
    { key: 'critical', tone: 'text-status-crit' },
    { key: 'battery', tone: 'text-amber-600' },
  ];

  return (
    <div className="max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{t('title')}</h1>
          <p className="mt-1 text-sm text-ink-muted">{t('subtitle')}</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowAdd(true)}>
            <Plus size={16} /> {t('add')}
          </Button>
        )}
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {tiles.map(({ key, tone }) => (
          <button
            key={key}
            type="button"
            onClick={() => { setTile(key); setTab('devices'); }}
            aria-pressed={tile === key}
            className={`rounded-xl border bg-white p-3 text-left transition ${tile === key ? 'border-brand ring-2 ring-brand/20' : 'border-line hover:bg-surface'}`}
          >
            <p className="text-xs text-ink-muted">{t(`iot.tiles.${key}`)}</p>
            <p className={`mt-0.5 text-2xl font-semibold ${tone}`}>{counts[key] ?? 0}</p>
          </button>
        ))}
      </div>

      <div className="mt-5 flex gap-1 border-b border-line" role="tablist">
        {(['devices', 'alerts', ...(role === 'org_admin' || role === 'manager' ? ['gateways'] : [])] as Tab[]).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === k ? 'border-brand text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}
          >
            {t(`iot.tabs.${k}`)}
            {k === 'alerts' && (openAlerts.data?.length ?? 0) > 0 && (
              <span className="ml-1.5 rounded-full bg-status-crit px-1.5 text-[11px] text-white">{openAlerts.data?.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'devices' && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <div className="relative col-span-2 sm:col-span-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('iot.search')} className="pl-9" aria-label={t('iot.search')} />
            </div>
            <Select value={building} onChange={(e) => setBuilding(e.target.value)} aria-label={t('iot.building')}>
              <option value="">{t('iot.allBuildings')}</option>
              {labels.buildings.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </Select>
            <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label={t('iot.category')}>
              <option value="">{t('iot.allCategories')}</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{t(`iot.categories.${c}`)}</option>)}
            </Select>
            <Select value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} aria-label={t('iot.manufacturer')}>
              <option value="">{t('iot.allManufacturers')}</option>
              {manufacturers.map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
            <Select value={protocol} onChange={(e) => setProtocol(e.target.value)} aria-label={t('iot.protocolLabel')}>
              <option value="">{t('iot.allProtocols')}</option>
              {PROTOCOLS.map((p) => <option key={p} value={p}>{t(`iot.protocol.${p}`)}</option>)}
            </Select>
          </div>

          <div className="mt-3 rounded-xl border border-line bg-white">
            {filtered.length === 0 ? (
              <div className="p-8 text-center">
                <Cpu className="mx-auto text-ink-muted" aria-hidden />
                <p className="mt-2 text-sm text-ink-muted">{all.length === 0 ? t('empty') : t('iot.noMatch')}</p>
              </div>
            ) : (
              <ul>
                {filtered.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/devices/${d.id}`)}
                      className="flex w-full items-center justify-between gap-3 border-b border-line px-4 py-3 text-left last:border-0 hover:bg-surface"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <Circle size={10} className={`shrink-0 ${STATUS_DOT[d.status]}`} aria-label={t(`iot.status.${d.status}`)} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink">{d.name}</p>
                          <p className="truncate text-xs text-ink-muted">
                            {labels.label(d.location_id)}
                            {d.manufacturer ? ` · ${d.manufacturer}${d.model ? ` ${d.model}` : ''}` : ''}
                            {d.last_seen_at ? ` · ${ago(d.last_seen_at, lng)}` : ` · ${t('neverSeen')}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {d.battery_low && <BatteryLow size={16} className="text-amber-600" aria-label={t('iot.tiles.battery')} />}
                        {d.alert_severity && <Pill className={SEVERITY_CLASS[d.alert_severity]}>{t(`iot.severity.${d.alert_severity}`)}</Pill>}
                        {d.protocol && <Pill className="hidden bg-surface text-ink-muted sm:inline-flex">{t(`iot.protocol.${d.protocol}`)}</Pill>}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {tab === 'alerts' && (
        <div className="mt-4 rounded-xl border border-line bg-white px-4">
          <DeviceAlerts canAct={isStaff} deviceName={nameOf} />
        </div>
      )}

      {tab === 'gateways' && orgId && <div className="mt-4"><Gateways orgId={orgId} isAdmin={isAdmin} /></div>}

      {showAdd && orgId && (
        <AddDeviceWizard
          orgId={orgId}
          onClose={() => setShowAdd(false)}
          onCreated={(id) => {
            setShowAdd(false);
            navigate(`/devices/${id}`);
          }}
        />
      )}
    </div>
  );
}
