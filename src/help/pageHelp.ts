import type { Role } from '../lib/database.types';
import { PAGE_HELP } from './pageHelpData';

// Contextual help (the "? Help" panel): which entry of PAGE_HELP describes
// the page at `pathname`. Patterns use ":id" for any single path segment.

export interface PageHelp {
  /** e.g. ['/work-orders/:id'] */
  patterns: string[];
  /** Only for these roles (e.g. the tenant home differs from the staff dashboard). */
  roles?: Role[];
  title: string;
  what: string;
  canDo: string[];
  fields: [string, string][];
  tip?: string;
  /** Guide section, e.g. '/help/guide/work-orders#closing-a-work-order'. */
  guide?: string;
}

/** The translatable part of a PageHelp entry (Vietnamese in pageHelpData.vi.ts, same order as PAGE_HELP). */
export type PageHelpText = Pick<PageHelp, 'title' | 'what' | 'canDo' | 'fields' | 'tip'>;

export function matchPattern(pattern: string, pathname: string): boolean {
  const a = pattern.split('/').filter(Boolean);
  const b = pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  return a.length === b.length && a.every((seg, i) => seg === ':id' || seg === b[i]);
}

export function pageHelpFor(pathname: string, role: Role | null, entries: PageHelp[] = PAGE_HELP): PageHelp | null {
  return (
    entries.find((e) => (!e.roles || (role !== null && e.roles.includes(role))) && e.patterns.some((p) => matchPattern(p, pathname))) ?? null
  );
}
