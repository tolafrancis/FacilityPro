import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../lib/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Armchair, Trash2, Pencil, CalendarPlus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../contexts/OrgContext';
import { useAuth } from '../contexts/AuthContext';
import { useDeskBookings, useDesks, useLocations } from '../lib/queries';
import { resolveI18n } from '../i18n/resolver';
import type { Desk, LocationRow } from '../lib/database.types';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import BilingualName from '../components/ui/BilingualName';

interface DeskDraft {
  en: string;
  vi: string;
  zoneId: string;
}

export default function Desks() {
  const { isManager } = useOrg();
  const { t: tc } = useTranslation('common');
  const { t, i18n } = useTranslation('bookings');
  const lng = i18n.resolvedLanguage ?? 'en';
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const orgId = currentOrg?.id;
  const queryClient = useQueryClient();
  const desks = useDesks();
  const bookings = useDeskBookings();
  const locations = useLocations();
  const zones = (locations.data ?? []).filter((l) => l.kind === 'zone');
  const [dialog, setDialog] = useState<{ mode: 'create' } | { mode: 'edit'; desk: Desk } | null>(null);

  const invalidateDesks = () => queryClient.invalidateQueries({ queryKey: ['desks', orgId] });
  const invalidateBookings = () => queryClient.invalidateQueries({ queryKey: ['desk_bookings', orgId] });

  const saveDesk = useMutation({
    mutationFn: async (args: { id?: string; v: DeskDraft }) => {
      const payload = {
        name_i18n: { en: args.v.en, vi: args.v.vi || args.v.en },
        zone_id: args.v.zoneId || null,
      };
      if (args.id) {
        const { error } = await supabase.from('fp_desks').update(payload).eq('id', args.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('fp_desks').insert({ org_id: orgId, ...payload });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      void invalidateDesks();
      setDialog(null);
    },
  });

  const removeDesk = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('fp_desks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void invalidateDesks();
      void invalidateBookings();
    },
  });

  const zoneName = (id: string | null) =>
    id ? resolveI18n(zones.find((z) => z.id === id)?.name_i18n, lng) || '—' : '—';
  const deskName = (id: string) => resolveI18n(desks.data?.find((d) => d.id === id)?.name_i18n, lng) || '—';

  const deskRows = desks.data ?? [];
  const bookingRows = bookings.data ?? [];

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{t('desks.title')}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {t('desks.subtitle')}
          </p>
        </div>
        {isManager && (
          <Button onClick={() => setDialog({ mode: 'create' })}>
            <Plus size={16} /> {t('desks.new')}
          </Button>
        )}
      </div>

      {deskRows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line bg-white p-8 text-center">
          <Armchair className="mx-auto text-ink-muted" aria-hidden />
          <p className="mt-2 text-sm text-ink-muted">{t('desks.empty')}</p>
        </div>
      ) : (
        <ul className="mt-6 space-y-2">
          {deskRows.map((d) => (
            <li key={d.id} className="flex items-center justify-between rounded-lg border border-line bg-white px-4 py-3">
              <span className="flex items-center gap-2 text-sm font-medium text-ink">
                <Armchair size={16} className="text-ink-muted" aria-hidden />
                {resolveI18n(d.name_i18n, lng)}
                <span className="text-xs font-normal text-ink-muted">{t('desks.zone')}: {zoneName(d.zone_id)}</span>
              </span>
              {isManager && (
              <span className="flex items-center gap-3">
                <button type="button" onClick={() => setDialog({ mode: 'edit', desk: d })} className="text-ink-muted hover:text-brand" aria-label={tc('actions.edit')}>
                  <Pencil size={15} />
                </button>
                <button type="button" onClick={() => removeDesk.mutate(d.id)} className="text-ink-muted hover:text-status-crit" aria-label={tc('actions.cancel')}>
                  <Trash2 size={15} />
                </button>
              </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <BookingPanel
        desks={deskRows}
        orgId={orgId}
        userId={user?.id ?? null}
        onBooked={invalidateBookings}
      />

      {bookingRows.length > 0 && (
        <section className="mt-6 rounded-xl border border-line bg-white p-4">
          <h2 className="font-semibold text-ink">{t('recent')}</h2>
          <ul className="mt-3 space-y-2">
            {bookingRows.map((b) => (
              <li key={b.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm">
                <span className="text-ink">
                  {deskName(b.desk_id)}
                  <span className="text-ink-muted"> · {b.booker_name || t('someone')}{b.booked_for ? ` · ${b.booked_for}` : ''}</span>
                </span>
                <span className="text-xs text-ink-muted">{formatDate(b.created_at, lng)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {dialog && (
        <DeskDialog
          title={dialog.mode === 'create' ? t('desks.new') : t('desks.edit')}
          initial={dialog.mode === 'edit' ? dialog.desk : null}
          zones={zones}
          lng={lng}
          busy={saveDesk.isPending}
          saveLabel={tc('actions.save')}
          cancelLabel={tc('actions.cancel')}
          onCancel={() => setDialog(null)}
          onSubmit={(v) => saveDesk.mutate({ id: dialog.mode === 'edit' ? dialog.desk.id : undefined, v })}
        />
      )}
    </div>
  );
}

function BookingPanel({
  desks,
  orgId,
  userId,
  onBooked,
}: {
  desks: Desk[];
  orgId: string | undefined;
  userId: string | null;
  onBooked: () => void;
}) {
  const { t, i18n } = useTranslation('bookings');
  const lng = i18n.resolvedLanguage ?? 'en';
  const [deskId, setDeskId] = useState('');
  const [bookerName, setBookerName] = useState('');
  const [bookedFor, setBookedFor] = useState('');

  const book = useMutation({
    mutationFn: async () => {
      if (!deskId) return;
      const { error } = await supabase.from('fp_desk_bookings').insert({
        org_id: orgId,
        desk_id: deskId,
        booked_by: userId,
        booker_name: bookerName || null,
        booked_for: bookedFor || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      onBooked();
      setBookerName('');
      setBookedFor('');
    },
  });

  if (desks.length === 0) return null;

  return (
    <section className="mt-6 rounded-xl border border-line bg-white p-4">
      <h2 className="font-semibold text-ink">{t('make')}</h2>
      <p className="mt-1 text-sm text-ink-muted">{t('desks.bookingHint')}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <Select value={deskId} onChange={(e) => setDeskId(e.target.value)}>
          <option value="">{t('desks.select')}</option>
          {desks.map((d) => (
            <option key={d.id} value={d.id}>{resolveI18n(d.name_i18n, lng)}</option>
          ))}
        </Select>
        <Input value={bookerName} onChange={(e) => setBookerName(e.target.value)} placeholder={t('bookerName')} />
        <Input type="date" value={bookedFor} onChange={(e) => setBookedFor(e.target.value)} />
        <Button onClick={() => book.mutate()} loading={book.isPending} disabled={!deskId}>
          <CalendarPlus size={16} /> {t('book')}
        </Button>
      </div>
    </section>
  );
}

function DeskDialog({
  title,
  initial,
  zones,
  lng,
  busy,
  saveLabel,
  cancelLabel,
  onCancel,
  onSubmit,
}: {
  title: string;
  initial: Desk | null;
  zones: LocationRow[];
  lng: string;
  busy: boolean;
  saveLabel: string;
  cancelLabel: string;
  onCancel: () => void;
  onSubmit: (v: DeskDraft) => void;
}) {
  const { t } = useTranslation('bookings');
  const [en, setEn] = useState(initial?.name_i18n.en ?? '');
  const [vi, setVi] = useState(initial?.name_i18n.vi ?? '');
  const [zoneId, setZoneId] = useState(initial?.zone_id ?? '');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!en) return;
    onSubmit({ en, vi, zoneId });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-xl border border-line bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        <div className="mt-4 space-y-4">
          <BilingualName en={en} vi={vi} onEn={setEn} onVi={setVi} />
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">{t('desks.zone')}</label>
            <Select value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
              <option value="">{t('desks.noZone')}</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>{resolveI18n(z.name_i18n, lng)}</option>
              ))}
            </Select>
            {zones.length === 0 && (
              <p className="mt-1 text-xs text-ink-muted">{t('desks.zoneTip')}</p>
            )}
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
