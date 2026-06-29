import { forwardRef, type SelectHTMLAttributes } from 'react';

const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className = '', children, ...rest }, ref) => (
    <select
      ref={ref}
      className={`w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 ${className}`}
      {...rest}
    >
      {children}
    </select>
  )
);

Select.displayName = 'Select';
export default Select;
