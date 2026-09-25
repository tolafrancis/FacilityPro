import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './LanguageSwitcher';
import AuthIllustration from './AuthIllustration';

interface AuthLayoutProps {
  title: string;
  /** Line under the title (text or a link). */
  subtitle?: ReactNode;
  /** Left panel (large screens): uppercase headline and a short paragraph. */
  headline?: string;
  blurb?: string;
  children: ReactNode;
}

/**
 * Split screen: illustration and message on white (large screens), the form
 * on the brand colour. On phones the form panel fills the screen and the
 * message sits under the form.
 */
export default function AuthLayout({ title, subtitle, headline, blurb, children }: AuthLayoutProps) {
  const { t } = useTranslation();
  return (
    <div className="min-h-dvh bg-brand-600 lg:grid lg:grid-cols-2 lg:bg-white">
      <aside className="hidden flex-col items-center justify-center px-12 py-10 text-center lg:flex">
        <AuthIllustration className="w-full max-w-md" />
        {headline && <h2 className="mt-8 max-w-sm text-xl font-bold uppercase tracking-wide text-ink">{headline}</h2>}
        {blurb && <p className="mt-4 max-w-md text-lg leading-relaxed text-ink">{blurb}</p>}
      </aside>

      <main className="flex min-h-dvh flex-col bg-brand-600 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-white sm:px-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-white font-bold text-brand-600">F</div>
            <span className="text-lg font-semibold">{t('app.name')}</span>
          </div>
          <div className="rounded-lg bg-white">
            <LanguageSwitcher />
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-8">
          <h1 className="text-center text-3xl font-semibold">{title}</h1>
          {subtitle && <div className="mt-2 text-center text-sm text-white/90">{subtitle}</div>}
          <div className="mt-8">{children}</div>
          {headline && (
            <div className="mt-10 border-t border-white/20 pt-6 text-center lg:hidden">
              <p className="text-sm font-bold uppercase tracking-wide">{headline}</p>
              {blurb && <p className="mt-2 text-sm leading-relaxed text-white/85">{blurb}</p>}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/** Form building blocks on the brand panel. */
export function AuthField({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-white">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-white/80">{hint}</p>}
    </div>
  );
}

export function AuthError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-status-crit">
      {children}
    </p>
  );
}

export function AuthNotice({ children }: { children: ReactNode }) {
  return <div className="rounded-lg bg-white/15 px-3 py-2.5 text-sm text-white">{children}</div>;
}

// 16px text: smaller inputs make iOS zoom in on focus.
const inputClass =
  'h-12 w-full rounded-lg border-2 border-transparent bg-white px-3 text-base text-ink placeholder:text-ink-muted/60 focus:border-ink focus:outline-none';

export const AuthInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>((props, ref) => (
  <input ref={ref} className={inputClass} {...props} />
));
AuthInput.displayName = 'AuthInput';

export function AuthPassword(props: InputHTMLAttributes<HTMLInputElement> & { showLabel: string; hideLabel: string }) {
  const { showLabel, hideLabel, ...rest } = props;
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input {...rest} type={shown ? 'text' : 'password'} className={`${inputClass} pr-12`} />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? hideLabel : showLabel}
        aria-pressed={shown}
        className="absolute inset-y-0 right-0 grid w-12 place-items-center text-ink-muted hover:text-ink"
      >
        {shown ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
      </button>
    </div>
  );
}

export const authButtonClass = 'h-12 w-full';
