/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Dark mode is used by the admin panel (/admin), which sets the class.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#E8552D',
          600: '#C9461F',
          50: '#FDEDE8',
        },
        // Theme tokens are CSS variables (src/index.css) so the admin panel
        // can switch to dark; the light values are unchanged.
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        panel: 'rgb(var(--c-panel) / <alpha-value>)',
        ink: {
          DEFAULT: 'rgb(var(--c-ink) / <alpha-value>)',
          muted: 'rgb(var(--c-ink-muted) / <alpha-value>)',
        },
        line: 'rgb(var(--c-line) / <alpha-value>)',
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
