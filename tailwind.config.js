import colors from 'tailwindcss/colors';

/** Colour tokens live as RGB triplets in index.css (:root), so the whole theme can change in one place. */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        gray: colors.neutral,
        ink: token('ink'),
        field: token('field'),
        panel: token('panel'),
        fg: token('fg'),
        muted: token('muted'),
        accent: token('accent'),
        'accent-fg': token('accent-fg'),
        pos: token('pos'),
        neg: token('neg'),
        sim: token('sim'),
        ref: token('ref'),
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
