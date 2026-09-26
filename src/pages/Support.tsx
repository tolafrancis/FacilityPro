import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { LifeBuoy, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../contexts/OrgContext';
import { formatDate } from '../lib/ui';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import Pill from '../components/ui/Pill';
import { notify } from '../components/Toaster';

export interface MyTicket {
  id: string;
  number: number;
  subject: string;
  status: 'open' | 'pending' | 'on_hold' | 'solved' | 'closed';
  priority: string;
  category: string;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  last_message_by: 'staff' | 'requester' | null;
  requester_email: string | null;
  mine: boolean;
}

const CATEGORIES = ['question', 'problem', 'billing', 'account', 'feature', 'other'] as const;
const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;

export function statusPill(s: string) {
  return s === 'pending' ? 'bg-status-warn/15 text-status-warn'
    : s === 'open' || s === 'on_hold' ? 'bg-status-info/10 text-status-info'
    : s === 'solved' ? 'bg-status-ok/10 text-status-ok'
    : 'bg-surface text-ink-muted';
}

/** Help & support: this organisation's tickets with FacilityPro support. */
export default function Support() {
  const { t, i18n } = useTranslation('support');
  const lng = i18n.resolvedLanguage ?? 'en';
  const { currentOrg, role } = useOrg();
  const orgId = currentOrg?.id;
  const [creating, setCreating] = useState(false);
  const tickets = useQuery({
    queryKey: ['my_tickets', orgId],
    enabled: !!orgId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fp_my_tickets', { p_org: orgId });
      if (error) throw error;
      return (data ?? []) as MyTicket[];
    },
  });
  const rows = tickets.data ?? [];

  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{t('title')}</h1>
          <p className="mt-1 text-sm text-ink-muted">{role === 'org_admin' ? t('subtitleAdmin') : t('subtitle')}</p>
        </div>
        <Button onClick={() => setCreating(true)}><Plus size={16} aria-hidden /> {t('new')}</Button>
      </div>

      <section className="mt-6 rounded-xl border border-line bg-panel">
        {tickets.isLoading ? (
          <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-ink/5" />)}</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <LifeBuoy size={32} className="text-ink-muted" aria-hidden />
            <p className="mt-3 font-medium text-ink">{t('emptyTitle')}</p>
            <p className="mt-1 max-w-sm text-sm text-ink-muted">{t('emptyBody')}</p>
            <Button className="mt-4" onClick={() => setCreating(true)}><Plus size={16} aria-hidden /> {t('new')}</Button>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id}>
                <Link to={`/support/${r.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-ink/[0.03]">
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      {r.last_message_by === 'staff' && r.status === 'pending' && <span className="h-2 w-2 shrink-0 rounded-full bg-brand" aria-label={t('newReply')} />}
                      <span className="truncate font-medium text-ink">{r.subject}</span>
                    </span>
                    <span className="block text-xs text-ink-muted">
                      #{r.number} · {t(`category.${r.category}`)} · {formatDate(r.last_message_at ?? r.updated_at, lng)}
                      {!r.mine && r.requester_email && ` · ${r.requester_email}`}
                    </span>
                  </span>
                  <Pill className={statusPill(r.status)}>{t(`status.${r.status}`)}</Pill>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      {creating && orgId && <NewTicket orgId={orgId} onClose={() => setCreating(false)} />}
    </div>
  );
}

function NewTicket({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const { t } = useTranslation('support');
  const navigate = useNavigate();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<string>('question');
  const [priority, setPriority] = useState<string>('normal');
  const create = useMutation({
    meta: { errorHandled: true },
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('fp_create_ticket', {
        p_org: orgId, p_subject: subject.trim(), p_body: body.trim(), p_category: category, p_priority: priority,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (id) => {
      notify(t('created'), 'success');
      navigate(`/support/${id}`);
    },
    onError: (e) => notify((e as { details?: string }).details ?? t('failed'), 'error'),
  });
  const valid = subject.trim().length >= 3 && body.trim().length > 0;
  return (
    <Modal title={t('new')} onClose={onClose} closeLabel={t('close')} wide>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (valid) create.mutate(); }}>
        <div>
          <label htmlFor="tk-subject" className="mb-1 block text-sm font-medium text-ink">{t('subject')}</label>
          <Input id="tk-subject" value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} placeholder={t('subjectPlaceholder')} />
        </div>
        <div>
          <label htmlFor="tk-body" className="mb-1 block text-sm font-medium text-ink">{t('description')}</label>
          <textarea id="tk-body" rows={6} value={body} maxLength={20000} onChange={(e) => setBody(e.target.value)} placeholder={t('descriptionPlaceholder')}
            className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-base text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 sm:text-sm" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="tk-cat" className="mb-1 block text-sm font-medium text-ink">{t('categoryLabel')}</label>
            <Select id="tk-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{t(`category.${c}`)}</option>)}
            </Select>
          </div>
          <div>
            <label htmlFor="tk-pri" className="mb-1 block text-sm font-medium text-ink">{t('priorityLabel')}</label>
            <Select id="tk-pri" value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}
            </Select>
          </div>
        </div>
        <p className="text-xs text-ink-muted">{t('responseHint')}</p>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button type="submit" disabled={!valid} loading={create.isPending}>{t('send')}</Button>
        </div>
      </form>
    </Modal>
  );
}
