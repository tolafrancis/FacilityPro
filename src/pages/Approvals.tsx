import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, XCircle, ClipboardCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';
import { useApprovals, useOrgMembers, useWorkOrders } from '../lib/queries';
import { formatDate } from '../lib/ui';

export default function Approvals() {
  const { t, i18n } = useTranslation('approvals');
  const lng = i18n.resolvedLanguage ?? 'en';
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id;
  const queryClient = useQueryClient();

  const pending = useApprovals('pending');
  const workOrders = useWorkOrders();
  const members = useOrgMembers();
  const [note, setNote] = useState<Record<string, string>>({});

  const woTitle = (id: string) =>
    workOrders.data?.find((w) => w.id === id)?.title ?? id.slice(0, 8);
  const requester = (uid: string | null) =>
    uid ? members.data?.find((m) => m.user_id === uid)?.email ?? uid : '—';

  const decide = useMutation({
    mutationFn: async (v: { id: string; status: 'approved' | 'rejected'; note: string }) => {
      const { error } = await supabase
        .from('fp_approvals')
        .update({
          status: v.status,
          note: v.note || null,
          decided_by: user?.id ?? null,
          decided_at: new Date().toISOString(),
        })
        .eq('id', v.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['approvals', orgId, 'pending'] });
    },
  });

  const rows = pending.data ?? [];

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold text-ink">{t('title')}</h1>
      <p className="mt-1 text-sm text-ink-muted">{t('subtitle')}</p>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line bg-white p-8 text-center">
          <ClipboardCheck className="mx-auto text-ink-muted" aria-hidden />
          <p className="mt-2 text-sm text-ink-muted">{t('empty')}</p>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((a) => (
            <li key={a.id} className="rounded-xl border border-line bg-white p-4">
              <div className="flex items-start justify-between">
                <div>
                  <Link
                    to={`/work-orders/${a.work_order_id}`}
                    className="text-sm font-medium text-ink hover:text-brand-600"
                  >
                    {woTitle(a.work_order_id)}
                  </Link>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {t('requestedBy', { who: requester(a.requested_by) })} ·{' '}
                    {formatDate(a.created_at, lng)}
                  </p>
                  {a.note && <p className="mt-1 text-sm text-ink">{a.note}</p>}
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <input
                  value={note[a.id] ?? ''}
                  onChange={(e) => setNote((p) => ({ ...p, [a.id]: e.target.value }))}
                  placeholder={t('notePlaceholder')}
                  className="flex-1 rounded-lg border border-line px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() =>
                    decide.mutate({ id: a.id, status: 'approved', note: note[a.id] ?? '' })
                  }
                  className="inline-flex items-center gap-1 rounded-lg bg-status-ok/10 px-3 py-2 text-sm font-medium text-status-ok hover:bg-status-ok/20"
                >
                  <CheckCircle2 size={15} /> {t('approve')}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    decide.mutate({ id: a.id, status: 'rejected', note: note[a.id] ?? '' })
                  }
                  className="inline-flex items-center gap-1 rounded-lg bg-status-crit/10 px-3 py-2 text-sm font-medium text-status-crit hover:bg-status-crit/20"
                >
                  <XCircle size={15} /> {t('reject')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
