import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './LanguageSwitcher';

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export default function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-surface">
      <div className="flex justify-end p-4">
        <LanguageSwitcher />
      </div>
      <div className="mx-auto flex max-w-md flex-col px-6 pt-6">
        <div className="mb-8 flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand font-bold text-white">
            F
          </div>
          <span className="text-lg font-semibold text-ink">{t('app.name')}</span>
        </div>
        <h1 className="text-2xl font-semibold text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
        <div className="mt-6 rounded-xl border border-line bg-white p-6 shadow-sm">
          {children}
        </div>
      </div>
    </div>
  );
}
