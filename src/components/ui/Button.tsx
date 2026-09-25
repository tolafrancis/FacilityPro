import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'inverse';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-600',
  secondary: 'bg-white text-ink border border-line hover:bg-surface',
  ghost: 'text-ink hover:bg-surface',
  danger: 'bg-status-crit text-white hover:opacity-90',
  // On the brand colour (auth screens).
  inverse: 'bg-white text-brand-600 hover:bg-brand-50',
};

export default function Button({
  variant = 'primary',
  loading = false,
  className = '',
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition lg:min-h-0 disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? '…' : children}
    </button>
  );
}
