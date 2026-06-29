/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#E8552D',
          600: '#C9461F',
          50: '#FDEDE8',
        },
        surface: '#F7F7F8',
        ink: {
          DEFAULT: '#1F2430',
          muted: '#6B7280',
        },
        line: '#E5E7EB',
        status: {
          ok: '#16A34A',
          warn: '#F59E0B',
          crit: '#DC2626',
          info: '#2563EB',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl: '0.875rem',
      },
    },
  },
  plugins: [],
};
