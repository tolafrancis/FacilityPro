import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { supabase } from '../lib/supabase';
import { useOrg } from '../contexts/OrgContext';

interface AttendanceEntry {
  id: string;
  technician: string;
  site: string;
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
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ technician: '', site: '', action: 'Checked in' as AttendanceEntry['action'], note: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const { data: entries = [] } = useQuery({
    queryKey: ['attendance', currentOrg?.id],
    queryFn: () => fetchAttendance(currentOrg?.id),
    enabled: !!currentOrg?.id,
  });

  useEffect(() => {
    if (!currentOrg?.id) return;
    void queryClient.invalidateQueries({ queryKey: ['attendance', currentOrg.id] });
  }, [currentOrg?.id, queryClient]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentOrg?.id || !form.technician) return;
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await supabase.from('fp_attendance').insert({
        org_id: currentOrg.id,
        technician: form.technician,
        site: form.site || 'Main site',
        action: form.action,
        note: form.note || null,
      });
      if (error) throw error;
      setForm({ technician: '', site: '', action: 'Checked in', note: '' });
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
                <Input value={form.technician} onChange={(event) => setForm({ ...form, technician: event.target.value })} placeholder="Alex" required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">Site</label>
                <Input value={form.site} onChange={(event) => setForm({ ...form, site: event.target.value })} placeholder="Building B" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">Action</label>
              <select value={form.action} onChange={(event) => setForm({ ...form, action: event.target.value as AttendanceEntry['action'] })} className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20">
                <option value="Checked in">Checked in</option>
                <option value="Checked out">Checked out</option>
              </select>
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
                  <h3 className="font-semibold text-ink">{entry.technician}</h3>
                  <p className="text-sm text-ink-muted">{entry.site}</p>
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
