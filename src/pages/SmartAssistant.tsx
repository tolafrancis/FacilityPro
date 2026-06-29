import { useState, type FormEvent } from 'react';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';

type AssistantResult = {
  summary: string;
  actions: string[];
};

function buildFallback(prompt: string): AssistantResult {
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

async function generateRecommendation(prompt: string): Promise<AssistantResult> {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
  if (apiKey) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: (import.meta.env.VITE_OPENAI_MODEL as string | undefined) || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are FacilitySpace Smart Assistant. Return a short summary and 3 bullet-point actions for a maintenance or facilities request.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });
    if (response.ok) {
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content as string | undefined;
      if (content) {
        const lines = content.split('\n').filter(Boolean);
        return {
          summary: lines[0] || 'AI-generated summary',
          actions: lines.slice(1, 4).map((line) => line.replace(/^[-*]\s*/, '')),
        };
      }
    }
  }
  return buildFallback(prompt);
}

export default function SmartAssistant() {
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
      const generated = await generateRecommendation(prompt);
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
              <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={6} className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" placeholder="Example: The HVAC unit in room 3 has been making a loud noise and the tenant reported it this morning." />
            </div>
            <Input value={import.meta.env.VITE_OPENAI_API_KEY ? 'OpenAI integration enabled' : 'Using built-in guidance'} readOnly />
            <Button type="submit" loading={busy}>Generate recommendation</Button>
            {error && <p className="text-sm text-status-crit">{error}</p>}
          </div>
        </form>

        <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">Suggested response</h2>
          {result ? (
            <div className="mt-4 space-y-4">
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
