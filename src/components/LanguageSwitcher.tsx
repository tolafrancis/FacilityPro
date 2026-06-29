import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import { SUPPORTED } from '../i18n';

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = i18n.resolvedLanguage ?? 'en';

  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-line bg-white p-0.5">
      <Languages size={16} className="ml-1.5 text-ink-muted" aria-hidden />
      {SUPPORTED.map((s) => (
        <button
          key={s.code}
          type="button"
          onClick={() => void i18n.changeLanguage(s.code)}
          aria-pressed={current === s.code}
          className={`rounded-md px-2 py-1 text-xs font-medium transition ${
            current === s.code ? 'bg-brand text-white' : 'text-ink-muted hover:text-ink'
          }`}
        >
          {s.code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
