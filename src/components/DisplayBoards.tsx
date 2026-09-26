import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, ExternalLink, MonitorPlay, Pencil, Plus, Power, QrCode, RefreshCw, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../contexts/OrgContext';
import { useSites } from '../lib/queries';
import { resolveI18n } from '../i18n/resolver';
import { friendlyError } from '../lib/ui';
import { notify, notifyError } from './Toaster';
import {
  BOARD_FIELDS, BOARD_PRIORITIES, COLUMN_STATUSES, displayUrl, isOnline, useDisplayBoards,
  type BoardField, type BoardStatus, type ColumnKey, type DisplayBoard,
} from '../lib/displayBoards';
import Button from './ui/Button';
import Input from './ui/Input';
import Select from './ui/Select';
import Modal from './ui/Modal';
import ShareLink from './ShareLink';

const COLUMNS = Object.keys(COLUMN_STATUSES) as ColumnKey[];
const DONE_HOURS = [0, 1, 2, 4, 8, 12, 24];

type Draft = Omit<DisplayBoard, 'id' | 'org_id' | 'token' | 'last_seen_at' | 'created_at' | 'active'> & { id?: string };

const NEW_DRAFT: Draft = {
  name: '', site_id: null, statuses: ['open', 'assigned', 'in_progress', 'on_hold', 'resolved', 'verified', 'closed'],
  fields: ['priority', 'due', 'location', 'assignee'], priorities: null, layout: 'columns', theme: 'dark', lng: 'en', done_hours: 4,
};

/**
 * TV display boards (0092): links that show live work order status on a
 * screen. Org admins and managers.
 */
export default function DisplayBoards() {
  const { t, i18n } = useTranslation('display');
  const lng = i18n.resolvedLanguage ?? 'en';
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id;
  const qc = useQueryClient();
  const boards = useDisplayBoards(orgId);
  const sites = useSites();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [sharing, setSharing] = useState<DisplayBoard | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'rotate' | 'delete'; board: DisplayBoard } | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['display_boards', orgId] });
  const onError = (e: unknown) => notifyError(friendlyError(e as { code?: string; message?: string }, i18n.getFixedT(null, 'common')));

  const save = useMutation({
    meta: { errorHandled: true },
    mutationFn: async (p: Record<string, unknown>) => {
      const { data, error } = await supabase.rpc('fp_save_display_board', { p });
      if (error) throw error;
      return data as DisplayBoard;
    },
    onSuccess: (b, p) => {
      refresh();
      setEditing(null);
      if (!p.id) setSharing(b);
      else if (p.active === undefined) notify(t('manage.saved'), 'success');
    },
    onError,
  });
  const rotate = useMutation({
    meta: { errorHandled: true },
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('fp_rotate_display_board', { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => { refresh(); setConfirm(null); notify(t('manage.rotated'), 'success'); },
    onError,
  });
  const remove = useMutation({
    meta: { errorHandled: true },
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('fp_delete_display_board', { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => { refresh(); setConfirm(null); },
    onError,
  });

  const siteName = (id: string | null) => {
    if (!id) return t('manage.allSites');
    const s = sites.data?.find((x) => x.id === id);
    return s ? resolveI18n(s.name_i18n, lng) : '—';
  };
  const copy = async (b: DisplayBoard) => {
    try {
      await navigator.clipboard.writeText(displayUrl(b.token));
      notify(t('manage.copied'), 'success');
    } catch {
      setSharing(b);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">{t('manage.intro')}</p>
      <Button onClick={() => setEditing({ ...NEW_DRAFT, lng: lng === 'vi' ? 'vi' : 'en' })} className="w-full sm:w-auto">
        <Plus size={16} aria-hidden /> {t('manage.create')}
      </Button>

      {boards.isError && <p role="alert" className="text-sm text-status-crit">{t('manage.loadError')}</p>}
      {(boards.data ?? []).length > 0 && (
        <ul className="space-y-3">
          {(boards.data ?? []).map((b) => {
            const online = b.active && isOnline(b.last_seen_at);
            return (
              <li key={b.id} className={`rounded-xl border border-line bg-panel p-4 ${b.active ? '' : 'opacity-70'}`}>
                <div className="flex flex-wrap items-start gap-3">
                  <MonitorPlay size={20} className="mt-0.5 shrink-0 text-brand" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink">{b.name}</p>
                    <p className="text-xs text-ink-muted">
                      {siteName(b.site_id)} · {t(`manage.layout.${b.layout}`)} · {t(`manage.theme.${b.theme}`)}
                    </p>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                    !b.active ? 'bg-ink/10 text-ink-muted' : online ? 'bg-status-ok/10 text-status-ok' : 'bg-ink/5 text-ink-muted'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${!b.active ? 'bg-ink-muted' : online ? 'bg-status-ok' : 'bg-ink/30'}`} />
                    {!b.active ? t('manage.off') : online ? t('manage.online') : b.last_seen_at
                      ? t('manage.lastSeen', { date: new Date(b.last_seen_at).toLocaleString(lng, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) })
                      : t('manage.neverOpened')}
                  </span>
                </div>
                {b.active && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg bg-surface px-3 py-2">
                    <code className="min-w-0 flex-1 truncate text-xs text-ink-muted">{displayUrl(b.token)}</code>
                    <button type="button" onClick={() => void copy(b)} className="grid h-8 w-8 place-items-center rounded-md text-ink-muted hover:bg-ink/5 hover:text-ink" aria-label={t('manage.copy')} title={t('manage.copy')}>
                      <Copy size={15} aria-hidden />
                    </button>
                    <a href={displayUrl(b.token)} target="_blank" rel="noreferrer" className="grid h-8 w-8 place-items-center rounded-md text-ink-muted hover:bg-ink/5 hover:text-ink" aria-label={t('manage.open')} title={t('manage.open')}>
                      <ExternalLink size={15} aria-hidden />
                    </a>
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {b.active && (
                    <Button variant="secondary" onClick={() => setSharing(b)}><QrCode size={15} aria-hidden /> {t('manage.share')}</Button>
                  )}
                  <Button variant="secondary" onClick={() => setEditing({ id: b.id, name: b.name, site_id: b.site_id, statuses: b.statuses, fields: b.fields, priorities: b.priorities, layout: b.layout, theme: b.theme, lng: b.lng, done_hours: b.done_hours })}><Pencil size={15} aria-hidden /> {t('manage.edit')}</Button>
                  <Button variant="secondary" loading={save.isPending && save.variables?.id === b.id}
                    onClick={() => save.mutate({ id: b.id, name: b.name, site_id: b.site_id, fields: b.fields, priorities: b.priorities, active: !b.active })}>
                    <Power size={15} aria-hidden /> {b.active ? t('manage.turnOff') : t('manage.turnOn')}
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirm({ kind: 'rotate', board: b })}><RefreshCw size={15} aria-hidden /> {t('manage.rotate')}</Button>
                  <Button variant="ghost" onClick={() => setConfirm({ kind: 'delete', board: b })} className="text-status-crit"><Trash2 size={15} aria-hidden /> {t('manage.delete')}</Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {boards.data?.length === 0 && (
        <div className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-ink-muted">{t('manage.empty')}</div>
      )}

      {editing && (
        <BoardDialog draft={editing} sites={(sites.data ?? []).map((s) => ({ id: s.id, name: resolveI18n(s.name_i18n, lng) }))}
          busy={save.isPending} onClose={() => setEditing(null)}
          onSave={(d) => save.mutate({ ...d, org_id: orgId })} />
      )}
      {sharing && (
        <Modal title={t('manage.shareTitle', { name: sharing.name })} onClose={() => setSharing(null)} closeLabel={t('manage.close')} wide>
          <p className="mb-4 text-sm text-ink-muted">{t('manage.shareHint')}</p>
          <ShareLink url={displayUrl(sharing.token)} message={t('manage.shareMessage', { name: sharing.name })}
            qrTitle={sharing.name} qrSubtitle={t('manage.qrSubtitle')} />
        </Modal>
      )}
      {confirm && (
        <Modal title={t(confirm.kind === 'rotate' ? 'manage.rotate' : 'manage.delete')} onClose={() => setConfirm(null)} closeLabel={t('manage.close')}>
          <p className="text-sm text-ink">{t(confirm.kind === 'rotate' ? 'manage.rotateBody' : 'manage.deleteBody', { name: confirm.board.name })}</p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirm(null)}>{t('manage.cancel')}</Button>
            <Button variant={confirm.kind === 'delete' ? 'danger' : 'primary'} loading={rotate.isPending || remove.isPending}
              onClick={() => (confirm.kind === 'rotate' ? rotate.mutate(confirm.board.id) : remove.mutate(confirm.board.id))}>
              {t(confirm.kind === 'rotate' ? 'manage.rotate' : 'manage.delete')}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function BoardDialog({ draft, sites, busy, onClose, onSave }: {
  draft: Draft; sites: { id: string; name: string }[]; busy: boolean; onClose: () => void; onSave: (d: Draft) => void;
}) {
  const { t } = useTranslation('display');
  const [d, setD] = useState<Draft>(draft);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setD((x) => ({ ...x, [k]: v }));
    setError(null);
  };
  const columnOn = (c: ColumnKey) => COLUMN_STATUSES[c].some((s) => d.statuses.includes(s));
  const toggleColumn = (c: ColumnKey) => {
    const on = columnOn(c);
    const next: BoardStatus[] = on ? d.statuses.filter((s) => !COLUMN_STATUSES[c].includes(s)) : [...d.statuses, ...COLUMN_STATUSES[c]];
    set('statuses', next);
  };
  const toggleField = (f: BoardField) => set('fields', d.fields.includes(f) ? d.fields.filter((x) => x !== f) : [...d.fields, f]);
  const prios = d.priorities ?? [...BOARD_PRIORITIES];
  const togglePrio = (p: string) => {
    const next = prios.includes(p) ? prios.filter((x) => x !== p) : [...prios, p];
    set('priorities', next.length === BOARD_PRIORITIES.length ? null : next);
  };
  const submit = () => {
    if (!d.name.trim()) return setError(t('manage.nameRequired'));
    if (d.statuses.length === 0) return setError(t('manage.columnRequired'));
    if (d.priorities && d.priorities.length === 0) return setError(t('manage.priorityRequired'));
    setError(null);
    onSave(d);
  };
  const box = 'flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-ink has-[:checked]:border-brand has-[:checked]:bg-brand/5';

  return (
    <Modal title={d.id ? t('manage.editTitle') : t('manage.create')} onClose={onClose} closeLabel={t('manage.close')} wide>
      <div className="space-y-5">
        {error && <p role="alert" className="rounded-lg border border-status-crit/30 p-3 text-sm text-status-crit">{error}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="db-name" className="mb-1 block text-sm font-medium text-ink">{t('manage.name')}</label>
            <Input id="db-name" value={d.name} onChange={(e) => set('name', e.target.value)} maxLength={80} placeholder={t('manage.namePlaceholder')} />
          </div>
          <div>
            <label htmlFor="db-site" className="mb-1 block text-sm font-medium text-ink">{t('manage.site')}</label>
            <Select id="db-site" value={d.site_id ?? ''} onChange={(e) => set('site_id', e.target.value || null)}>
              <option value="">{t('manage.allSites')}</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">{t('manage.columnsLabel')}</legend>
          <div className="grid gap-2 sm:grid-cols-4">
            {COLUMNS.map((c) => (
              <label key={c} className={box}><input type="checkbox" className="accent-[#E8552D]" checked={columnOn(c)} onChange={() => toggleColumn(c)} />{t(`columns.${c}`)}</label>
            ))}
          </div>
          {columnOn('done') && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
              <label htmlFor="db-done">{t('manage.doneFor')}</label>
              <Select id="db-done" value={String(d.done_hours)} onChange={(e) => set('done_hours', Number(e.target.value))} className="w-auto">
                {DONE_HOURS.map((h) => <option key={h} value={h}>{h === 0 ? t('manage.doneNone') : t('manage.hours', { count: h })}</option>)}
              </Select>
            </div>
          )}
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">{t('manage.fieldsLabel')}</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {BOARD_FIELDS.map((f) => (
              <label key={f} className={box}><input type="checkbox" className="accent-[#E8552D]" checked={d.fields.includes(f)} onChange={() => toggleField(f)} />{t(`fields.${f}`)}</label>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-ink-muted">{t('manage.privacy')}</p>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">{t('manage.prioritiesLabel')}</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {BOARD_PRIORITIES.map((p) => (
              <label key={p} className={box}><input type="checkbox" className="accent-[#E8552D]" checked={prios.includes(p)} onChange={() => togglePrio(p)} />{t(`priority.${p}`)}</label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="db-layout" className="mb-1 block text-sm font-medium text-ink">{t('manage.layoutLabel')}</label>
            <Select id="db-layout" value={d.layout} onChange={(e) => set('layout', e.target.value as Draft['layout'])}>
              <option value="columns">{t('manage.layout.columns')}</option>
              <option value="list">{t('manage.layout.list')}</option>
            </Select>
          </div>
          <div>
            <label htmlFor="db-theme" className="mb-1 block text-sm font-medium text-ink">{t('manage.themeLabel')}</label>
            <Select id="db-theme" value={d.theme} onChange={(e) => set('theme', e.target.value as Draft['theme'])}>
              <option value="dark">{t('manage.theme.dark')}</option>
              <option value="light">{t('manage.theme.light')}</option>
            </Select>
          </div>
          <div>
            <label htmlFor="db-lng" className="mb-1 block text-sm font-medium text-ink">{t('manage.language')}</label>
            <Select id="db-lng" value={d.lng} onChange={(e) => set('lng', e.target.value as Draft['lng'])}>
              <option value="en">English</option>
              <option value="vi">Tiếng Việt</option>
            </Select>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button variant="secondary" onClick={onClose}>{t('manage.cancel')}</Button>
          <Button loading={busy} onClick={submit}>{d.id ? t('manage.save') : t('manage.createAndShare')}</Button>
        </div>
      </div>
    </Modal>
  );
}
