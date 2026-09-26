import { useTranslation } from 'react-i18next';
import type { FeatureGroup, FeatureItem, Resource, Solution } from './content';

/** The public site's language, with menu names looked up by slug (English in content.ts is the fallback). */
export function useMarketingT() {
  const { t, i18n } = useTranslation('marketing');
  const lang: 'en' | 'vi' = i18n.resolvedLanguage === 'vi' ? 'vi' : 'en';
  return {
    t,
    lang,
    group: (g: FeatureGroup) => t(`groups.${g.key}`, { defaultValue: g.label }),
    feature: (f: FeatureItem) => t(`features.${f.slug}`, { defaultValue: f.title }),
    solution: (s: Solution) => t(`solutions.${s.slug}`, { defaultValue: s.title }),
    resource: (r: Resource) => t(`resources.${r.slug}`, { defaultValue: r.title }),
    resourceSummary: (r: Resource) => t(`resourceSummaries.${r.slug}`, { defaultValue: r.summary ?? '' }),
  };
}

/** The brochure PDF in the reader's language (files in public/brochure). */
export function brochureHref(lang: 'en' | 'vi') {
  return `/brochure/FacilityPro-brochure-${lang}.pdf`;
}
