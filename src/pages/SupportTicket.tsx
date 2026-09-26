import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Send, ThumbsDown, ThumbsUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatDate } from '../lib/ui';
import Button from '../components/ui/Button';
import Pill from '../components/ui/Pill';
import { notify } from '../components/Toaster';
import { statusPill } from './Support';

interface Thread {
  id: string;
  number: number;
  subject: string;
  status: string;
  priority: string;
  category: string;
  created_at: string;
  solved_at: string | null;
  rating: 'good' | 'bad' | null;
  rating_comment: string | null;
  can_reply: boolean;
  messages: { id: string; body: string; created_at: string; author_kind: 'staff' | 'requester' | 'system'; author: string | null; mine: boolean }[];
}

export default function SupportTicket() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation('support');
  const lng = i18n.resolvedLanguage ?? 'en';
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['my_ticket', id],
    enabled: !!id,
    refetchInterval: 30_000,
    meta: { errorHandled: true },
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fp_my_ticket', { p_id: id });
      if (error) throw error;
      return data as Thread;
    },
  });
  const [body, setBody] = useState('');
  const [comment, setComment] = useState('');
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['my_ticket', id] });
    void qc.invalidateQueries({ queryKey: ['my_tickets'] });
  };
  const call = (fn: string, args: Record<string, unknown>) => async () => {
    const { error } = await supabase.rpc(fn, args);
    if (error) throw error;
  };
  const onError = (e: unknown) => notify((e as { details?: string }).details ?? t('failed'), 'error');
  const reply = useMutation({ meta: { errorHandled: true }, mutationFn: call('fp_ticket_reply', { p_id: id, p_body: body.trim() }), onSuccess: () => { setBody(''); refresh(); }, onError });
  const solve = useMutation({ meta: { errorHandled: true }, mutationFn: call('fp_ticket_mark_solved', { p_id: id }), onSuccess: refresh, onError });
  const rate = useMutation({
    meta: { errorHandled: true },
    mutationFn: (rating: 'good' | 'bad') => call('fp_ticket_rate', { p_id: id, p_rating: rating, p_comment: comment.trim() || null })(),
    onSuccess: () => { notify(t('thanksRating'), 'success'); refresh(); },
    onError,
  });

  const back = (
    <Link to="/support" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
      <ArrowLeft size={15} aria-hidden /> {t('title')}
    </Link>
  );
  if (q.isError) return <div className="max-w-3xl">{back}<p className="text-sm text-ink-muted">{t('notFound')}</p></div>;
  const d = q.data;
  if (!d) return <div className="max-w-3xl">{back}<div className="h-64 animate-pulse rounded-xl bg-ink/5" /></div>;
  const done = d.status === 'solved' || d.status === 'closed';

  return (
    <div className="max-w-3xl">
      {back}
      <p className="text-sm text-ink-muted">#{d.number} · {t(`category.${d.category}`)} · {formatDate(d.created_at, lng)}</p>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-ink">{d.subject}</h1>
        <Pill className={statusPill(d.status)}>{t(`status.${d.status}`)}</Pill>
      </div>
      {d.status === 'pending' && <p className="mt-2 text-sm text-ink">{t('pendingHint')}</p>}

      <ol className="mt-6 space-y-4">
        {d.messages.map((m) => m.author_kind === 'system' ? (
          <li key={m.id} className="text-center text-xs text-ink-muted">{t('markedSolved')} · {formatDate(m.created_at, lng)}</li>
        ) : (
          <li key={m.id} className={`flex ${m.author_kind === 'staff' ? 'justify-start' : 'justify-end'}`}>
            <div className={`max-w-[85%] rounded-xl border px-4 py-3 ${m.author_kind === 'staff' ? 'border-brand/20 bg-brand/5' : 'border-line bg-panel'}`}>
              <p className="mb-1 text-xs text-ink-muted">
                <span className="font-medium text-ink">{m.author_kind === 'staff' ? t('staffName', { name: m.author ?? '' }) : m.mine ? t('you') : m.author}</span>
                {' · '}{formatDate(m.created_at, lng)}
              </p>
              <p className="whitespace-pre-wrap break-words text-sm text-ink">{m.body}</p>
            </div>
          </li>
        ))}
      </ol>

      {d.can_reply ? (
        <form className="mt-6 rounded-xl border border-line bg-panel p-4" onSubmit={(e) => { e.preventDefault(); if (body.trim()) reply.mutate(); }}>
          <label htmlFor="reply" className="mb-1 block text-sm font-medium text-ink">{done ? t('reopenLabel') : t('replyLabel')}</label>
          <textarea id="reply" rows={4} value={body} maxLength={20000} onChange={(e) => setBody(e.target.value)}
            className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-base text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 sm:text-sm" />
          <div className="mt-3 flex flex-wrap justify-between gap-2">
            {!done ? (
              <Button type="button" variant="secondary" onClick={() => solve.mutate()} loading={solve.isPending}>
                <CheckCircle2 size={15} aria-hidden /> {t('markSolved')}
              </Button>
            ) : <span />}
            <Button type="submit" disabled={!body.trim()} loading={reply.isPending}><Send size={15} aria-hidden /> {t('sendReply')}</Button>
          </div>
        </form>
      ) : (
        <p className="mt-6 rounded-lg bg-surface p-3 text-sm text-ink-muted">
          {t('closedHint')} <Link to="/support" className="font-medium text-brand-600 hover:underline">{t('new')}</Link>
        </p>
      )}

      {done && (
        <section className="mt-4 rounded-xl border border-line bg-panel p-4">
          {d.rating ? (
            <p className="flex items-center gap-2 text-sm text-ink">
              {d.rating === 'good' ? <ThumbsUp size={16} className="text-status-ok" aria-hidden /> : <ThumbsDown size={16} className="text-status-crit" aria-hidden />}
              {t('rated')}
            </p>
          ) : (
            <>
              <p className="text-sm font-medium text-ink">{t('rateQuestion')}</p>
              <textarea aria-label={t('rateComment')} rows={2} value={comment} maxLength={1000} onChange={(e) => setComment(e.target.value)} placeholder={t('rateComment')}
                className="mt-2 w-full rounded-lg border border-line bg-panel px-3 py-2 text-base text-ink focus:border-brand focus:outline-none sm:text-sm" />
              <div className="mt-2 flex gap-2">
                <Button variant="secondary" onClick={() => rate.mutate('good')} loading={rate.isPending && rate.variables === 'good'}><ThumbsUp size={15} aria-hidden /> {t('good')}</Button>
                <Button variant="secondary" onClick={() => rate.mutate('bad')} loading={rate.isPending && rate.variables === 'bad'}><ThumbsDown size={15} aria-hidden /> {t('bad')}</Button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
