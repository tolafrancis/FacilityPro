import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import SearchSelect from '../components/ui/SearchSelect';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';
import { useLocations, useOrgMembers } from '../lib/queries';
import { resolveI18n } from '../i18n/resolver';

interface AttendanceEntry {
  id: string;
  technician: string;
  site: string;
  technician_id: string | null;
  location_id: string | null;
  action: 'Checked in' | 'Checked out';
  note: string | null;
  checked_at: string;
}

async function fetchAttendance(orgId: string | undefined) {
  if (!orgId) return [] as AttendanceEntry[];
  const { data, error } = await supabase.from('fp_attendance').select('*').eq('org_id', orgId).order('checked_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AttendanceEntry[];
}

export default function Attendance() {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const members = useOrgMembers();
  const locations = useLocations();
  const [form, setForm] = useState({ technicianId: '', locationId: '', action: 'Checked in' as AttendanceEntry['action'], note: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const { data: entries = [] } = useQuery({
    queryKey: ['attendance', currentOrg?.id],
    queryFn: () => fetchAttendance(currentOrg?.id),
    enabled: !!currentOrg?.id,
  });

  // Default to logging your own attendance — still changeable by an
  // admin/manager entering it on someone else's behalf (e.g. a contractor).
  useEffect(() => {
    if (!form.technicianId && user?.id) setForm((f) => ({ ...f, technicianId: user.id }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!currentOrg?.id) return;
    void queryClient.invalidateQueries({ queryKey: ['attendance', currentOrg.id] });
  }, [currentOrg?.id, queryClient]);

  const technicianEmail = (id: string) => members.data?.find((m) => m.user_id === id)?.email ?? id.slice(0, 8);
  const locationName = (id: string | null) => {
    const loc = locations.data?.find((l) => l.id === id);
    return loc ? resolveI18n(loc.name_i18n, 'en') : null;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentOrg?.id || !form.technicianId) return;
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await supabase.from('fp_attendance').insert({
        org_id: currentOrg.id,
        technician_id: form.technicianId,
        technician: technicianEmail(form.technicianId),
        location_id: form.locationId || null,
        site: locationName(form.locationId) ?? 'Main site',
        action: form.action,
        note: form.note || null,
      });
      if (error) throw error;
      setForm({ technicianId: user?.id ?? '', locationId: '', action: 'Checked in', note: '' });
      setMessage('Attendance saved.');
      await queryClient.invalidateQueries({ queryKey: ['attendance', currentOrg.id] });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save attendance.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Technician attendance</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          Track technician check-in and check-out activity so supervisors can see who is on site and when.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <form onSubmit={submit} className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">Log attendance</h2>
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">Technician</label>
                <Select value={form.technicianId} onChange={(event) => setForm({ ...form, technicianId: event.target.value })} required>
                  <option value="">Select…</option>
                  {(members.data ?? []).map((m) => (
                    <option key={m.user_id} value={m.user_id}>{m.email}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">Site / location</label>
                <SearchSelect
                  value={form.locationId}
                  onChange={(id) => setForm({ ...form, locationId: id })}
                  options={(locations.data ?? []).map((l) => ({ id: l.id, label: resolveI18n(l.name_i18n, 'en') }))}
                  placeholder="Search locations…"
                  emptyLabel="Main site (unspecified)"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">Action</label>
              <Select value={form.action} onChange={(event) => setForm({ ...form, action: event.target.value as AttendanceEntry['action'] })}>
                <option value="Checked in">Checked in</option>
                <option value="Checked out">Checked out</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">Note</label>
              <textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} rows={4} className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" placeholder="Location, task, or handoff detail" />
            </div>
            <Button type="submit" loading={busy}>Save entry</Button>
            {message && <p className="text-sm text-brand">{message}</p>}
          </div>
        </form>

        <div className="space-y-4">
          {entries.length === 0 && (
            <div className="rounded-2xl border border-dashed border-line bg-white p-8 text-center text-sm text-ink-muted">
              No attendance records yet. Start logging technician activity for better visibility.
            </div>
          )}
          {entries.map((entry) => (
            <div key={entry.id} className="rounded-2xl border border-line bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-ink">
                    {entry.technician_id ? technicianEmail(entry.technician_id) : entry.technician}
                  </h3>
                  <p className="text-sm text-ink-muted">{locationName(entry.location_id) ?? entry.site}</p>
                </div>
                <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-medium text-brand">{entry.action}</span>
              </div>
              <p className="mt-3 text-sm text-ink-muted">{entry.note || 'No note provided.'}</p>
              <p className="mt-2 text-xs uppercase tracking-[0.2em] text-ink-muted">{new Date(entry.checked_at).toLocaleString()}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
