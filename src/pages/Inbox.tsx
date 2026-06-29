import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Send, MessageSquare } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';
import { useConversations, useMessages } from '../lib/queries';
import { formatDate } from '../lib/ui';
import type { ConversationChannel } from '../lib/database.types';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Pill from '../components/ui/Pill';

const CHANNELS: ConversationChannel[] = ['manual', 'web', 'whatsapp', 'zalo', 'line', 'email'];

export default function Inbox() {
  const { t, i18n } = useTranslation('inbox');
  const { t: tc } = useTranslation('common');
  const lng = i18n.resolvedLanguage ?? 'en';
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id;
  const queryClient = useQueryClient();

  const conversations = useConversations();
  const [selected, setSelected] = useState<string | null>(null);
  const messages = useMessages(selected ?? undefined);
  const [draft, setDraft] = useState('');
  const [showNew, setShowNew] = useState(false);

  const list = conversations.data ?? [];
  const current = list.find((c) => c.id === selected);

  const send = useMutation({
    mutationFn: async () => {
      if (!draft.trim() || !orgId || !selected) return;
      const { data, error } = await supabase
        .from('fp_messages')
        .insert({
          org_id: orgId,
          conversation_id: selected,
          direction: 'out',
          body: draft.trim(),
          sender: user?.id ?? null,
        })
        .select('id')
        .single();
      if (error) throw error;
      // Deliver to external channels (best effort; no-op for manual/web).
      if (current && current.channel !== 'manual' && current.channel !== 'web') {
        void supabase.functions.invoke('channel-send', { body: { message_id: data.id } });
      }
    },
    onSuccess: () => {
      setDraft('');
      void queryClient.invalidateQueries({ queryKey: ['messages', selected] });
      void queryClient.invalidateQueries({ queryKey: ['conversations', orgId] });
    },
  });

  const create = useMutation({
    mutationFn: async (v: { name: string; channel: ConversationChannel; handle: string; first: string }) => {
      const { data, error } = await supabase
        .from('fp_conversations')
        .insert({
          org_id: orgId,
          channel: v.channel,
          contact_name: v.name || null,
          contact_handle: v.handle || null,
        })
        .select('id')
        .single();
      if (error) throw error;
      if (v.first.trim()) {
        await supabase.from('fp_messages').insert({
          org_id: orgId,
          conversation_id: data.id,
          direction: 'out',
          body: v.first.trim(),
          sender: user?.id ?? null,
        });
      }
      return data.id as string;
    },
    onSuccess: (id) => {
      void queryClient.invalidateQueries({ queryKey: ['conversations', orgId] });
      setSelected(id);
      setShowNew(false);
    },
  });

  const [ticketNote, setTicketNote] = useState<string | null>(null);
  const createTicket = useMutation({
    mutationFn: async () => {
      if (!current || !orgId) return;
      const reqChannels = ['web', 'whatsapp', 'zalo', 'line', 'email'];
      const channel = reqChannels.includes(current.channel) ? current.channel : 'web';
      const lastIn = [...(messages.data ?? [])].reverse().find((m) => m.direction === 'in');
      const body = lastIn?.body ?? messages.data?.[messages.data.length - 1]?.body ?? '';
      const title = `${current.contact_name || current.contact_handle || t('unknownContact')}`;
      const { error } = await supabase.from('fp_requests').insert({
        org_id: orgId,
        title,
        body_original: body || null,
        source_lng: lng,
        severity: 'medium',
        priority: 'medium',
        channel,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setTicketNote(t('ticketCreated'));
      window.setTimeout(() => setTicketNote(null), 4000);
    },
  });

  return (
    <div className="max-w-5xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{t('title')}</h1>
          <p className="mt-1 text-sm text-ink-muted">{t('subtitle')}</p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus size={16} /> {t('new')}
        </Button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-line bg-white">
          {list.length === 0 ? (
            <div className="p-6 text-center">
              <MessageSquare className="mx-auto text-ink-muted" aria-hidden />
              <p className="mt-2 text-sm text-ink-muted">{t('empty')}</p>
            </div>
          ) : (
            <ul className="max-h-[28rem] overflow-auto">
              {list.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(c.id)}
                    className={`w-full border-b border-line px-3 py-3 text-left last:border-0 hover:bg-surface ${
                      selected === c.id ? 'bg-brand-50/60' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-ink">
                        {c.contact_name || c.contact_handle || t('unknownContact')}
                      </span>
                      <Pill className="bg-surface text-ink-muted">{t(`channels.${c.channel}`)}</Pill>
                    </div>
                    <p className="mt-0.5 text-xs text-ink-muted">{formatDate(c.last_message_at, lng)}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-line bg-white md:col-span-2">
          {!current ? (
            <div className="grid h-full min-h-[20rem] place-items-center p-6 text-sm text-ink-muted">
              {t('selectPrompt')}
            </div>
          ) : (
            <div className="flex h-full min-h-[28rem] flex-col">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-ink">
                    {current.contact_name || current.contact_handle || t('unknownContact')}
                  </p>
                  <p className="text-xs text-ink-muted">{t(`channels.${current.channel}`)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {ticketNote && <span className="text-xs text-status-ok">{ticketNote}</span>}
                  <button
                    type="button"
                    onClick={() => createTicket.mutate()}
                    disabled={createTicket.isPending}
                    className="rounded-lg border border-line px-2 py-1 text-xs font-medium text-brand hover:bg-surface disabled:opacity-50"
                  >
                    {t('createTicket')}
                  </button>
                </div>
              </div>
              <div className="flex-1 space-y-2 overflow-auto p-4">
                {(messages.data ?? []).map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                      m.direction === 'out'
                        ? 'ml-auto bg-brand text-white'
                        : 'bg-surface text-ink'
                    }`}
                  >
                    {m.body}
                    <div
                      className={`mt-1 text-[10px] ${
                        m.direction === 'out' ? 'text-white/70' : 'text-ink-muted'
                      }`}
                    >
                      {formatDate(m.created_at, lng)}
                    </div>
                  </div>
                ))}
                {(messages.data ?? []).length === 0 && (
                  <p className="text-sm text-ink-muted">{t('noMessages')}</p>
                )}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send.mutate();
                }}
                className="flex gap-2 border-t border-line p-3"
              >
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={t('replyPlaceholder')}
                />
                <Button type="submit" loading={send.isPending} disabled={!draft.trim()}>
                  <Send size={15} /> {t('send')}
                </Button>
              </form>
            </div>
          )}
        </div>
      </div>

      {showNew && (
        <NewConversationDialog
          channels={CHANNELS}
          busy={create.isPending}
          onCancel={() => setShowNew(false)}
          onSubmit={(v) => create.mutate(v)}
          t={t}
          tc={tc}
        />
      )}
    </div>
  );
}

function NewConversationDialog({
  channels,
  busy,
  onCancel,
  onSubmit,
  t,
  tc,
}: {
  channels: ConversationChannel[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (v: { name: string; channel: ConversationChannel; handle: string; first: string }) => void;
  t: (k: string) => string;
  tc: (k: string) => string;
}) {
  const [name, setName] = useState('');
  const [channel, setChannel] = useState<ConversationChannel>('manual');
  const [handle, setHandle] = useState('');
  const [first, setFirst] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({ name, channel, handle, first });
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/30 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-xl border border-line bg-white p-6 shadow-lg"
      >
        <h2 className="text-lg font-semibold text-ink">{t('newTitle')}</h2>
        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">{t('contactName')}</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">{t('channel')}</label>
              <Select value={channel} onChange={(e) => setChannel(e.target.value as ConversationChannel)}>
                {channels.map((c) => (
                  <option key={c} value={c}>
                    {t(`channels.${c}`)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">{t('handle')}</label>
              <Input value={handle} onChange={(e) => setHandle(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">{t('firstMessage')}</label>
            <Input value={first} onChange={(e) => setFirst(e.target.value)} />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            {tc('actions.cancel')}
          </Button>
          <Button type="submit" loading={busy}>
            {tc('actions.create')}
          </Button>
        </div>
      </form>
    </div>
  );
}
