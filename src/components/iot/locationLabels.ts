import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocations, useSites } from '../../lib/queries';
import { resolveI18n } from '../../i18n/resolver';

/** "Site › Building › Floor › Room" labels for the location tree (the building's digital-twin path). */
export function useLocationLabels() {
  const { i18n } = useTranslation();
  const lng = i18n.resolvedLanguage ?? 'en';
  const locations = useLocations();
  const sites = useSites();

  return useMemo(() => {
    const byId = new Map((locations.data ?? []).map((l) => [l.id, l]));
    const siteName = new Map((sites.data ?? []).map((s) => [s.id, resolveI18n(s.name_i18n, lng)]));
    const path = (id: string): string[] => {
      const seen = new Set<string>();
      const parts: string[] = [];
      let cur = byId.get(id);
      while (cur && !seen.has(cur.id)) {
        seen.add(cur.id);
        parts.unshift(resolveI18n(cur.name_i18n, lng));
        if (!cur.parent_id) {
          const s = cur.site_id ? siteName.get(cur.site_id) : undefined;
          if (s) parts.unshift(s);
        }
        cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
      }
      return parts;
    };
    const options = (locations.data ?? [])
      .map((l) => ({ id: l.id, kind: l.kind, label: path(l.id).join(' › ') }))
      .sort((a, b) => a.label.localeCompare(b.label));
    /** Building (top of the path under the site) for filtering. */
    const building = (id: string | null) => {
      let cur = id ? byId.get(id) : undefined;
      const seen = new Set<string>();
      while (cur && cur.parent_id && !seen.has(cur.id)) {
        seen.add(cur.id);
        if (cur.kind === 'building') break;
        cur = byId.get(cur.parent_id);
      }
      return cur?.id ?? null;
    };
    return {
      options,
      buildings: options.filter((o) => o.kind === 'building'),
      label: (id: string | null) => (id ? path(id).join(' › ') : '—'),
      building,
      siteName: (id: string | null) => (id ? siteName.get(id) ?? '—' : '—'),
    };
  }, [locations.data, sites.data, lng]);
}
