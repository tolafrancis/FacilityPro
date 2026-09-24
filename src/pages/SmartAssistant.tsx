import { useState, type FormEvent } from 'react';
import Button from '../components/ui/Button';
import { supabase } from '../lib/supabase';
import { useOrg } from '../contexts/OrgContext';

type AssistantResult = {
  summary: string;
  actions: string[];
  source?: 'ai' | 'builtin' | 'rate_limited';
};

function buildFallback(prompt: string): Omit<AssistantResult, 'source'> {
  const lower = prompt.toLowerCase();
  if (lower.includes('fault') || lower.includes('repair')) {
    return {
      summary: 'A maintenance ticket should be created and assigned to the most relevant technician based on the asset type.',
      actions: ['Open a new request', 'Attach photos and asset details', 'Set priority based on disruption'],
    };
  }
  if (lower.includes('checklist') || lower.includes('inspection')) {
    return {
      summary: 'A checklist template can be generated from the description and reused for future inspections.',
      actions: ['Draft a checklist', 'Link it to the relevant asset', 'Assign it to the next shift'],
    };
  }
  return {
    summary: 'The request looks operationally important. Start by creating a concise work brief and routing it to the right team.',
    actions: ['Summarize the issue in plain English', 'Attach any evidence', 'Set a follow-up time'],
  };
}

// The AI call runs server-side in the smart-assistant Edge Function, which
// holds the provider key (it must never be shipped in the web app bundle).
// Without it (not deployed / not configured / rate limited) the page falls
// back to built-in guidance, clearly labelled as such.
async function generateRecommendation(prompt: string, orgId: string | undefined): Promise<AssistantResult> {
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
        return { ...buildFallback(prompt), source: 'rate_limited' };
      }
    }
  }
  return { ...buildFallback(prompt), source: 'builtin' };
}

export default function SmartAssistant() {
  const { currentOrg } = useOrg();
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
      const generated = await generateRecommendation(prompt, currentOrg?.id);
      setResult(generated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate guidance right now.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Smart assistant</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          Use a guided AI assistant to turn a natural-language request into an action plan for maintenance, inspections, and follow-up.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <form onSubmit={submit} className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">Describe the situation</h2>
          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">Prompt</label>
              <textarea maxLength={2000} value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={6} className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" placeholder="Example: The HVAC unit in room 3 has been making a loud noise and the tenant reported it this morning." />
            </div>
            <Button type="submit" loading={busy}>Generate recommendation</Button>
            {error && <p className="text-sm text-status-crit">{error}</p>}
          </div>
        </form>

        <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">Suggested response</h2>
          {result ? (
            <div className="mt-4 space-y-4">
              {result.source !== 'ai' && (
                <p className="text-xs text-ink-muted">
                  {result.source === 'rate_limited'
                    ? 'AI limit reached for this hour — showing built-in guidance instead.'
                    : 'Built-in guidance (the AI assistant is not configured).'}
                </p>
              )}
              <div className="rounded-xl bg-brand/10 p-4 text-sm text-brand">{result.summary}</div>
              <div>
                <p className="text-sm font-semibold text-ink">Recommended actions</p>
                <ul className="mt-2 space-y-2 text-sm text-ink-muted">
                  {result.actions.map((action) => (
                    <li key={action} className="rounded-lg border border-line bg-surface px-3 py-2">{action}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-line bg-surface p-8 text-sm text-ink-muted">
              Ask the assistant to create a work brief, inspection checklist, or next-step plan.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
