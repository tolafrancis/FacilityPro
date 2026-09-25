import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';

export const SUPPORTED = [
  { code: 'en', label: 'English', dir: 'ltr' as const },
  { code: 'vi', label: 'Tiếng Việt', dir: 'ltr' as const },
];

void i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: ['en', 'vi'],
    load: 'languageOnly',
    ns: ['common', 'auth', 'locations', 'settings', 'assets', 'requests', 'workorders', 'checklists', 'maintenance', 'parts', 'vendors', 'reports', 'security', 'approvals', 'jobsheet', 'inbox', 'billing', 'report', 'devices'],
    defaultNS: 'common',
    backend: { loadPath: `/locales/{{lng}}/{{ns}}.json?v=${__LOCALES_VERSION__}` },
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
    },
    interpolation: { escapeValue: false },
  });

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
  const dir = SUPPORTED.find((s) => s.code === lng)?.dir ?? 'ltr';
  document.documentElement.dir = dir;
});

export default i18n;
