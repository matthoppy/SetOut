import type { Config } from 'tailwindcss';

// SetOut's own look: plain and legible, one accent, light and dark from the
// device. Colours are channels in CSS variables so they can take an alpha.
const channel = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ground: channel('ground'),
        surface: channel('surface'),
        ink: channel('ink'),
        quiet: channel('quiet'),
        rule: channel('rule'),
        accent: channel('accent'),
        'accent-ink': channel('accent-ink'),
        good: channel('good'),
        warn: channel('warn'),
        bad: channel('bad'),
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
