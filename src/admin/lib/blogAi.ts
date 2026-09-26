import { supabase } from '../../lib/supabase';

// "AI Generate Blog" (admin console → Blog editor). The draft is written by
// the smart-assistant Edge Function (task: 'blog_post'); this file calls it
// and decides which editor fields the result may fill.

export interface AiBlogDraft {
  title: string;
  excerpt: string;
  body: string;
  tags: string[];
  seo_title: string;
  seo_description: string;
}
export type AiField = keyof AiBlogDraft;
/** Fields the AI fills in the editor (the title stays the user's topic). */
export const AI_FILL_FIELDS = ['excerpt', 'body', 'tags', 'seo_title', 'seo_description'] as const;
export type AiFillField = (typeof AI_FILL_FIELDS)[number];

export interface AiResult {
  draft: AiBlogDraft;
  missing: AiField[];
  truncated: boolean;
}

export class AiBlogError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

/** Vietnamese if the topic has Vietnamese letters, else English. */
export function detectLng(topic: string): 'en' | 'vi' {
  return /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i.test(topic) ? 'vi' : 'en';
}

export async function generateBlogDraft(
  args: { topic: string; lng: 'en' | 'vi'; links: { path: string; title: string }[]; variation: number },
): Promise<AiResult> {
  const { data, error } = await supabase.functions.invoke('smart-assistant', { body: { task: 'blog_post', ...args } });
  let code = (data as { error?: string } | null)?.error;
  if (error && !code) {
    // functions.invoke hides the body of non-2xx replies in error.context.
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') code = (await ctx.json().catch(() => null))?.error;
    code ??= /fetch|network/i.test(String((error as Error).message)) ? 'network' : 'upstream_failed';
  }
  if (code) throw new AiBlogError(code);
  const r = data as Partial<AiResult> | null;
  if (!r?.draft?.body) throw new AiBlogError('invalid_output');
  return { draft: r.draft as AiBlogDraft, missing: (r.missing ?? []) as AiField[], truncated: !!r.truncated };
}

type Values = { [K in AiFillField]: K extends 'tags' ? string[] : string };

function isEmpty(v: string | string[]) {
  return Array.isArray(v) ? v.length === 0 : !v.trim();
}

/**
 * Which fields a draft fills. A field is filled when it's empty, or when it
 * still holds what the AI wrote last time (`aiOwned`, dropped as soon as the
 * user edits it); anything the user wrote is kept unless `replace` names it.
 */
export function mergeDraft<T extends Values>(
  current: T,
  aiOwned: ReadonlySet<AiFillField>,
  draft: AiBlogDraft,
  replace: ReadonlySet<AiFillField> = new Set(),
): { next: T; filled: AiFillField[]; kept: AiFillField[]; owned: Set<AiFillField> } {
  const next = { ...current };
  const filled: AiFillField[] = [];
  const kept: AiFillField[] = [];
  const owned = new Set(aiOwned);
  for (const f of AI_FILL_FIELDS) {
    const value = draft[f];
    if (isEmpty(value)) continue; // nothing generated: leave the field as it is
    if (isEmpty(current[f]) || aiOwned.has(f) || replace.has(f)) {
      (next as Record<string, unknown>)[f] = Array.isArray(value) ? [...value] : value;
      filled.push(f);
      owned.add(f);
    } else {
      kept.push(f);
    }
  }
  return { next, filled, kept, owned };
}
