import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SearchX } from 'lucide-react';

/**
 * Shown for unknown URLs and for records that don't exist or that the
 * signed-in user isn't allowed to see (RLS returns nothing in both cases, so
 * the two are deliberately indistinguishable).
 */
export default function NotFound({ backTo = '/', backLabel }: { backTo?: string; backLabel?: string }) {
  const { t } = useTranslation('common');
  return (
    <div className="mx-auto mt-10 max-w-md rounded-xl border border-dashed border-line bg-white p-8 text-center">
      <SearchX className="mx-auto text-ink-muted" aria-hidden />
      <h1 className="mt-3 text-base font-semibold text-ink">{t('notFound.title')}</h1>
      <p className="mt-1 text-sm text-ink-muted">{t('notFound.body')}</p>
      <Link to={backTo} className="mt-4 inline-block text-sm font-medium text-brand hover:text-brand-600">
        {backLabel ?? t('notFound.back')}
      </Link>
    </div>
  );
}
