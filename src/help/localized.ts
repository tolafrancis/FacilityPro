import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Role } from '../lib/database.types';
import { GUIDE, KNOWN_ISSUES, QUICK_STARTS, type GuideSection, type QuickStart } from './guide';
import { GUIDE_VI, KNOWN_ISSUES_VI, QUICK_STARTS_VI } from './guide.vi';
import { FEATURES, type Feature } from './features';
import { FEATURES_VI, FEATURE_AREAS_VI } from './features.vi';
import { PAGE_HELP } from './pageHelpData';
import { PAGE_HELP_VI } from './pageHelpData.vi';
import { pageHelpFor, type PageHelp } from './pageHelp';

// Help content in the reader's language. English is the source; Vietnamese
// replaces the text and keeps ids, links, paths and screenshots.

export interface HelpContent {
  guide: GuideSection[];
  quickStarts: QuickStart[];
  knownIssues: string;
  features: Feature[];
  pageHelp: PageHelp[];
  areaLabel: (area: string) => string;
}

const EN: HelpContent = { guide: GUIDE, quickStarts: QUICK_STARTS, knownIssues: KNOWN_ISSUES, features: FEATURES, pageHelp: PAGE_HELP, areaLabel: (a) => a };

const VI: HelpContent = {
  guide: GUIDE.map((s) => ({ ...s, ...GUIDE_VI[s.id] })),
  quickStarts: QUICK_STARTS.map((q) => ({ ...q, ...QUICK_STARTS_VI[q.role] })),
  knownIssues: KNOWN_ISSUES_VI,
  features: FEATURES.map((f) => ({ ...f, ...FEATURES_VI[f.id] })),
  pageHelp: PAGE_HELP.map((p, i) => ({ ...p, ...PAGE_HELP_VI[i] })),
  areaLabel: (a) => FEATURE_AREAS_VI[a] ?? a,
};

export function helpContent(lng: string | undefined): HelpContent {
  return lng === 'vi' ? VI : EN;
}

export function useHelpContent(): HelpContent {
  const { i18n } = useTranslation();
  const lng = i18n.resolvedLanguage;
  return useMemo(() => helpContent(lng), [lng]);
}

export function localizedPageHelp(pathname: string, role: Role | null, lng: string | undefined): PageHelp | null {
  return pageHelpFor(pathname, role, helpContent(lng).pageHelp);
}
