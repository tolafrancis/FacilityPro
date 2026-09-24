import { useTranslation } from 'react-i18next';
import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { supabase } from '../lib/supabase';
import { formatDateOnly } from '../lib/ui';
import { useOrg } from '../contexts/OrgContext';

interface BroadcastItem {
  id: string;
  title: string;
  audience: string;
  message: string;
  created_at: string;
}

async function fetchBroadcasts(orgId: string | undefined) {
  if (!orgId) return [] as BroadcastItem[];
  const { data, error } = await supabase.from('fp_broadcasts').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as BroadcastItem[];
}

export default function TenantExperience() {
  const { t, i18n } = useTranslation('tenant');
  const lng = i18n.resolvedLanguage ?? 'en';
  const { currentOrg } = useOrg();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ title: '', audience: '', message: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const { data: broadcasts = [] } = useQuery({
    queryKey: ['broadcasts', currentOrg?.id],
    queryFn: () => fetchBroadcasts(currentOrg?.id),
    enabled: !!currentOrg?.id,
  });

  useEffect(() => {
    if (!currentOrg?.id) return;
    void queryClient.invalidateQueries({ queryKey: ['broadcasts', currentOrg.id] });
  }, [currentOrg?.id, queryClient]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentOrg?.id || !form.title || !form.message) return;
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await supabase.from('fp_broadcasts').insert({
        org_id: currentOrg.id,
        title: form.title,
        audience: form.audience.trim() || t('allTenants'),
        message: form.message,
      });
      if (error) throw error;
      setForm({ title: '', audience: '', message: '' });
      setMessage(t('saved'));
      await queryClient.invalidateQueries({ queryKey: ['broadcasts', currentOrg.id] });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{t('title')}</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          {t('subtitle')}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <form onSubmit={submit} className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">{t('create')}</h2>
          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">{t('fields.title')}</label>
              <Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder={t('fields.titlePlaceholder')} required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">{t('fields.audience')}</label>
              <Input value={form.audience} onChange={(event) => setForm({ ...form, audience: event.target.value })} placeholder={t('allTenants')} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">{t('fields.message')}</label>
              <textarea value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} rows={5} className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" placeholder={t('fields.messagePlaceholder')} />
            </div>
            <Button type="submit" loading={busy}>{t('publish')}</Button>
            {message && <p className="text-sm text-brand">{message}</p>}
          </div>
        </form>

        <div className="space-y-4">
          <div className="rounded-2xl border border-line bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-ink">{t('help.title')}</h2>
            <ul className="mt-3 space-y-2 text-sm text-ink-muted">
              <li className="rounded-lg border border-line bg-surface px-3 py-2">{t('help.tip1')}</li>
              <li className="rounded-lg border border-line bg-surface px-3 py-2">{t('help.tip2')}</li>
              <li className="rounded-lg border border-line bg-surface px-3 py-2">{t('help.tip3')}</li>
            </ul>
          </div>
          {broadcasts.length === 0 && (
            <div className="rounded-2xl border border-dashed border-line bg-white p-8 text-center text-sm text-ink-muted">
              {t('empty')}
            </div>
          )}
          {broadcasts.map((item) => (
            <div key={item.id} className="rounded-2xl border border-line bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-ink">{item.title}</h3>
                  <p className="text-sm text-ink-muted">{item.audience}</p>
                </div>
                <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-medium text-brand">{formatDateOnly(item.created_at, lng)}</span>
              </div>
              <p className="mt-3 text-sm text-ink-muted">{item.message}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
