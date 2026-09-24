import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../lib/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Building2, Trash2, Pencil, CalendarPlus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../contexts/OrgContext';
import { useAuth } from '../contexts/AuthContext';
import { useFacilities, useFacilityBookings, useLocations } from '../lib/queries';
import { resolveI18n } from '../i18n/resolver';
import type { Facility, LocationRow } from '../lib/database.types';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import BilingualName from '../components/ui/BilingualName';

interface FacilityDraft {
  en: string;
  vi: string;
  locationId: string;
  capacity: string;
}

export default function Facilities() {
  const { isManager } = useOrg();
  const { t: tc } = useTranslation('common');
  const { i18n } = useTranslation();
  const lng = i18n.resolvedLanguage ?? 'en';
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const orgId = currentOrg?.id;
  const queryClient = useQueryClient();
  const facilities = useFacilities();
  const bookings = useFacilityBookings();
  const locations = useLocations();
  const locationList = locations.data ?? [];
  const [dialog, setDialog] = useState<{ mode: 'create' } | { mode: 'edit'; facility: Facility } | null>(null);

  const invalidateFacilities = () => queryClient.invalidateQueries({ queryKey: ['facilities', orgId] });
  const invalidateBookings = () => queryClient.invalidateQueries({ queryKey: ['facility_bookings', orgId] });

  const saveFacility = useMutation({
    mutationFn: async (args: { id?: string; v: FacilityDraft }) => {
      const payload = {
        name_i18n: { en: args.v.en, vi: args.v.vi || args.v.en },
        location_id: args.v.locationId || null,
        capacity: args.v.capacity ? Number(args.v.capacity) : null,
      };
      if (args.id) {
        const { error } = await supabase.from('fp_facilities').update(payload).eq('id', args.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('fp_facilities').insert({ org_id: orgId, ...payload });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      void invalidateFacilities();
      setDialog(null);
    },
  });

  const removeFacility = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('fp_facilities').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void invalidateFacilities();
      void invalidateBookings();
    },
  });

  const locationName = (id: string | null) =>
    id ? resolveI18n(locationList.find((l) => l.id === id)?.name_i18n, lng) || '—' : '—';
  const facilityName = (id: string) => resolveI18n(facilities.data?.find((f) => f.id === id)?.name_i18n, lng) || '—';

  const facilityRows = facilities.data ?? [];
  const bookingRows = bookings.data ?? [];

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Facilities</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Common facilities (meeting rooms, gyms, etc.). A new booking can trigger the &ldquo;Alert after Facilities Booking&rdquo; workflow.
          </p>
        </div>
        {isManager && (
          <Button onClick={() => setDialog({ mode: 'create' })}>
            <Plus size={16} /> New facility
          </Button>
        )}
      </div>

      {facilityRows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line bg-white p-8 text-center">
          <Building2 className="mx-auto text-ink-muted" aria-hidden />
          <p className="mt-2 text-sm text-ink-muted">No facilities yet. Add one to start taking bookings.</p>
        </div>
      ) : (
        <ul className="mt-6 space-y-2">
          {facilityRows.map((f) => (
            <li key={f.id} className="flex items-center justify-between rounded-lg border border-line bg-white px-4 py-3">
              <span className="flex items-center gap-2 text-sm font-medium text-ink">
                <Building2 size={16} className="text-ink-muted" aria-hidden />
                {resolveI18n(f.name_i18n, lng)}
                <span className="text-xs font-normal text-ink-muted">
                  {locationName(f.location_id)}{f.capacity ? ` · seats ${f.capacity}` : ''}
                </span>
              </span>
              {isManager && (
              <span className="flex items-center gap-3">
                <button type="button" onClick={() => setDialog({ mode: 'edit', facility: f })} className="text-ink-muted hover:text-brand" aria-label={tc('actions.edit')}>
                  <Pencil size={15} />
                </button>
                <button type="button" onClick={() => removeFacility.mutate(f.id)} className="text-ink-muted hover:text-status-crit" aria-label={tc('actions.cancel')}>
                  <Trash2 size={15} />
                </button>
              </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <BookingPanel
        facilities={facilityRows}
        orgId={orgId}
        userId={user?.id ?? null}
        onBooked={invalidateBookings}
      />

      {bookingRows.length > 0 && (
        <section className="mt-6 rounded-xl border border-line bg-white p-4">
          <h2 className="font-semibold text-ink">Recent bookings</h2>
          <ul className="mt-3 space-y-2">
            {bookingRows.map((b) => (
              <li key={b.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm">
                <span className="text-ink">
                  {facilityName(b.facility_id)}
                  <span className="text-ink-muted"> · {b.booker_name || 'Someone'}{b.booked_for ? ` · ${b.booked_for}` : ''}</span>
                </span>
                <span className="text-xs text-ink-muted">{formatDate(b.created_at, lng)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {dialog && (
        <FacilityDialog
          title={dialog.mode === 'create' ? 'New facility' : 'Edit facility'}
          initial={dialog.mode === 'edit' ? dialog.facility : null}
          locations={locationList}
          lng={lng}
          busy={saveFacility.isPending}
          saveLabel={tc('actions.save')}
          cancelLabel={tc('actions.cancel')}
          onCancel={() => setDialog(null)}
          onSubmit={(v) => saveFacility.mutate({ id: dialog.mode === 'edit' ? dialog.facility.id : undefined, v })}
        />
      )}
    </div>
  );
}

function BookingPanel({
  facilities,
  orgId,
  userId,
  onBooked,
}: {
  facilities: Facility[];
  orgId: string | undefined;
  userId: string | null;
  onBooked: () => void;
}) {
  const { i18n } = useTranslation();
  const lng = i18n.resolvedLanguage ?? 'en';
  const [facilityId, setFacilityId] = useState('');
  const [bookerName, setBookerName] = useState('');
  const [bookedFor, setBookedFor] = useState('');

  const book = useMutation({
    mutationFn: async () => {
      if (!facilityId) return;
      const { error } = await supabase.from('fp_facility_bookings').insert({
        org_id: orgId,
        facility_id: facilityId,
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

  if (facilities.length === 0) return null;

  return (
    <section className="mt-6 rounded-xl border border-line bg-white p-4">
      <h2 className="font-semibold text-ink">Make a booking</h2>
      <p className="mt-1 text-sm text-ink-muted">Records a facility booking (and fires the facilities-booking workflow when wired).</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <Select value={facilityId} onChange={(e) => setFacilityId(e.target.value)}>
          <option value="">Select facility</option>
          {facilities.map((f) => (
            <option key={f.id} value={f.id}>{resolveI18n(f.name_i18n, lng)}</option>
          ))}
        </Select>
        <Input value={bookerName} onChange={(e) => setBookerName(e.target.value)} placeholder="Booker name" />
        <Input type="date" value={bookedFor} onChange={(e) => setBookedFor(e.target.value)} />
        <Button onClick={() => book.mutate()} loading={book.isPending} disabled={!facilityId}>
          <CalendarPlus size={16} /> Book
        </Button>
      </div>
    </section>
  );
}

function FacilityDialog({
  title,
  initial,
  locations,
  lng,
  busy,
  saveLabel,
  cancelLabel,
  onCancel,
  onSubmit,
}: {
  title: string;
  initial: Facility | null;
  locations: LocationRow[];
  lng: string;
  busy: boolean;
  saveLabel: string;
  cancelLabel: string;
  onCancel: () => void;
  onSubmit: (v: FacilityDraft) => void;
}) {
  const [en, setEn] = useState(initial?.name_i18n.en ?? '');
  const [vi, setVi] = useState(initial?.name_i18n.vi ?? '');
  const [locationId, setLocationId] = useState(initial?.location_id ?? '');
  const [capacity, setCapacity] = useState(initial?.capacity ? String(initial.capacity) : '');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!en) return;
    onSubmit({ en, vi, locationId, capacity });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-xl border border-line bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        <div className="mt-4 space-y-4">
          <BilingualName en={en} vi={vi} onEn={setEn} onVi={setVi} />
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Location</label>
            <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">No location</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{resolveI18n(l.name_i18n, lng)}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Capacity</label>
            <Input type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="Seats (optional)" />
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
