import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import Button from '../components/ui/Button';
import { supabase } from '../lib/supabase';
import { useOrg } from '../contexts/OrgContext';

type AssistantResult = {
  summary: string;
  actions: string[];
  source?: 'ai' | 'builtin' | 'rate_limited';
};

// Built-in guidance, in the UI language; recognises English and Vietnamese
// keywords.
function buildFallback(prompt: string, t: TFunction): Omit<AssistantResult, 'source'> {
  const lower = prompt.toLowerCase();
  const kind = /fault|repair|broken|hỏng|sửa|lỗi/.test(lower)
    ? 'fault'
    : /checklist|inspection|kiểm tra|danh sách/.test(lower)
      ? 'checklist'
      : 'general';
  return {
    summary: t(`fallback.${kind}.summary`),
    actions: [1, 2, 3].map((i) => t(`fallback.${kind}.action${i}`)),
  };
}

// The AI call runs server-side in the smart-assistant Edge Function, which
// holds the provider key (it must never be shipped in the web app bundle).
// Without it (not deployed / not configured / rate limited) the page falls
// back to built-in guidance, clearly labelled as such.
async function generateRecommendation(prompt: string, orgId: string | undefined, t: TFunction): Promise<AssistantResult> {
  if (orgId) {
    const { data, error } = await supabase.functions.invoke('smart-assistant', {
      body: { prompt, org_id: orgId },
    });
    const ai = data as { summary?: string; actions?: string[] } | null;
    if (!error && ai?.summary) {
      return { summary: ai.summary, actions: ai.actions ?? [], source: 'ai' };
    }
    if (error) {
      const payload = await (error as { context?: Response }).context?.json?.().catch(() => null);
      if ((payload as { error?: string } | null)?.error === 'rate_limited') {
        return { ...buildFallback(prompt, t), source: 'rate_limited' };
      }
    }
  }
  return { ...buildFallback(prompt, t), source: 'builtin' };
}

export default function SmartAssistant() {
  const { currentOrg } = useOrg();
  const { t } = useTranslation('assistant');
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState<AssistantResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!prompt.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const generated = await generateRecommendation(prompt, currentOrg?.id, t);
      setResult(generated);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failed'));
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
          <h2 className="text-lg font-semibold text-ink">{t('describe')}</h2>
          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">{t('prompt')}</label>
              <textarea maxLength={2000} value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={6} className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" placeholder={t('promptPlaceholder')} />
            </div>
            <Button type="submit" loading={busy}>{t('generate')}</Button>
            {error && <p className="text-sm text-status-crit">{error}</p>}
          </div>
        </form>

        <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">{t('suggested')}</h2>
          {result ? (
            <div className="mt-4 space-y-4">
              {result.source !== 'ai' && (
                <p className="text-xs text-ink-muted">
                  {result.source === 'rate_limited'
                    ? t('rateLimited')
                    : t('builtin')}
                </p>
              )}
              <div className="rounded-xl bg-brand/10 p-4 text-sm text-brand">{result.summary}</div>
              <div>
                <p className="text-sm font-semibold text-ink">{t('actions')}</p>
                <ul className="mt-2 space-y-2 text-sm text-ink-muted">
                  {result.actions.map((action) => (
                    <li key={action} className="rounded-lg border border-line bg-surface px-3 py-2">{action}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-line bg-surface p-8 text-sm text-ink-muted">
              {t('empty')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
