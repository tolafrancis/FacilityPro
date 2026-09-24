import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { supabase } from '../lib/supabase';
import { useOrg } from '../contexts/OrgContext';

interface Permit {
  id: string;
  title: string;
  asset: string;
  requester: string;
  approver: string;
  due_date: string | null;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  notes: string | null;
  created_at: string;
}

async function fetchPermits(orgId: string | undefined) {
  if (!orgId) return [] as Permit[];
  const { data, error } = await supabase.from('fp_permits').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Permit[];
}

export default function Permits() {
  const { currentOrg, isManager } = useOrg();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ title: '', asset: '', requester: '', approver: '', dueDate: '', notes: '', status: 'submitted' as Permit['status'] });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const { data: permits = [] } = useQuery({
    queryKey: ['permits', currentOrg?.id],
    queryFn: () => fetchPermits(currentOrg?.id),
    enabled: !!currentOrg?.id,
  });

  useEffect(() => {
    if (!currentOrg?.id) return;
    void queryClient.invalidateQueries({ queryKey: ['permits', currentOrg.id] });
  }, [currentOrg?.id, queryClient]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentOrg?.id || !form.title) return;
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await supabase.from('fp_permits').insert({
        org_id: currentOrg.id,
        title: form.title,
        asset: form.asset || 'Site-wide',
        requester: form.requester || 'Operations',
        approver: form.approver || 'Safety lead',
        due_date: form.dueDate || null,
        status: form.status,
        notes: form.notes || null,
      });
      if (error) throw error;
      setForm({ title: '', asset: '', requester: '', approver: '', dueDate: '', notes: '', status: 'submitted' });
      setMessage('Permit saved successfully.');
      await queryClient.invalidateQueries({ queryKey: ['permits', currentOrg.id] });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save permit.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Permits to work</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          Route maintenance and contractor approvals through a structured permit workflow before work begins.
        </p>
      </div>

      <div className={isManager ? 'grid gap-6 lg:grid-cols-[0.95fr_1.05fr]' : 'max-w-3xl'}>
        {isManager && (
        <form onSubmit={submit} className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">Create permit</h2>
          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">Permit title</label>
              <Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Hot work permit" required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">Asset or area</label>
                <Input value={form.asset} onChange={(event) => setForm({ ...form, asset: event.target.value })} placeholder="Roof level" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">Requester</label>
                <Input value={form.requester} onChange={(event) => setForm({ ...form, requester: event.target.value })} placeholder="Maintenance team" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">Approver</label>
                <Input value={form.approver} onChange={(event) => setForm({ ...form, approver: event.target.value })} placeholder="Site supervisor" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">Due date</label>
                <Input type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">Status</label>
              <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Permit['status'] })} className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20">
                <option value="draft">Draft</option>
                <option value="submitted">Submitted</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">Notes</label>
              <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={4} className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" placeholder="Describe the work, hazards, and safety controls." />
            </div>
            <Button type="submit" loading={busy}>Submit permit</Button>
            {message && <p className="text-sm text-brand">{message}</p>}
          </div>
        </form>
        )}

        <div className="space-y-4">
          {permits.length === 0 && (
            <div className="rounded-2xl border border-dashed border-line bg-white p-8 text-center text-sm text-ink-muted">
              No permits yet. Create one to track safety approvals for upcoming work.
            </div>
          )}
          {permits.map((permit) => (
            <div key={permit.id} className="rounded-2xl border border-line bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-ink">{permit.title}</h3>
                  <p className="mt-1 text-sm text-ink-muted">{permit.asset} · {permit.requester}</p>
                </div>
                <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-medium text-brand">{permit.status}</span>
              </div>
              <p className="mt-3 text-sm text-ink-muted">Approver: {permit.approver}</p>
              {permit.due_date && <p className="text-sm text-ink-muted">Due: {permit.due_date}</p>}
              {permit.notes && <p className="mt-3 text-sm text-ink-muted">{permit.notes}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
