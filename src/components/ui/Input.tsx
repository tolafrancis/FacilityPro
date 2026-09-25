import { forwardRef, type InputHTMLAttributes } from 'react';

const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...rest }, ref) => (
    <input
      ref={ref}
      className={`min-h-[44px] w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm lg:min-h-0 text-ink placeholder:text-ink-muted/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 ${className}`}
      {...rest}
    />
  )
);

Input.displayName = 'Input';
export default Input;
