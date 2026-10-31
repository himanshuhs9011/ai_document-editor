import plugin from 'tailwindcss/plugin';

// Design tokens as OKLCH channels: warm paper, slate ink, one deep blue accent. Dark swaps the values, not the names.
const light = {
  paper: '0.985 0.004 85',
  panel: '0.962 0.006 85',
  sunken: '0.935 0.007 85',
  line: '0.885 0.008 85',
  ink: '0.245 0.014 255',
  'ink-soft': '0.47 0.012 255',
  accent: '0.47 0.12 252',
  'accent-hover': '0.41 0.12 252',
  'accent-ink': '0.985 0.006 252',
  'accent-tint': '0.94 0.03 252',
  danger: '0.5 0.17 28',
  warn: '0.53 0.12 70',
  done: '0.47 0.1 155',
  focus: '0.47 0.12 252',
};

const dark = {
  paper: '0.195 0.009 255',
  panel: '0.225 0.01 255',
  sunken: '0.155 0.008 255',
  line: '0.31 0.012 255',
  ink: '0.93 0.006 85',
  'ink-soft': '0.74 0.01 85',
  accent: '0.72 0.11 252',
  'accent-hover': '0.78 0.1 252',
  'accent-ink': '0.2 0.02 252',
  'accent-tint': '0.3 0.05 252',
  danger: '0.72 0.15 28',
  warn: '0.78 0.12 75',
  done: '0.76 0.11 155',
  focus: '0.78 0.1 252',
};

const vars = (theme) => Object.fromEntries(Object.entries(theme).map(([name, value]) => [`--${name}`, value]));
const colors = Object.fromEntries(Object.keys(light).map((name) => [name, `oklch(var(--${name}) / <alpha-value>)`]));

/** @type {import('tailwindcss').Config} */
export default {
  // dark: utilities follow the app's own theme toggle (App sets data-theme on <html>), not the OS setting.
  darkMode: ['selector', '[data-theme="dark"]'],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ...colors,
        vscode: {
          bg: '#1e1e1e',
          sidebar: '#252526',
          border: '#2d2d30',
          text: '#cccccc',
          textSecondary: '#969696',
          accent: '#007acc',
          hover: '#2a2d2e',
          active: '#094771',
        }
      },
      fontFamily: {
        ui: ['system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        read: ['"Iowan Old Style"', 'Georgia', '"Times New Roman"', 'serif'],
        mono: ['Consolas', 'Monaco', 'Courier New', 'monospace'],
      },
      fontSize: {
        'ui-xs': '0.8125rem',
        'read-xl': ['1.375rem', '1.25'],
      },
      keyframes: {
        'slide-in-right': { from: { transform: 'translateX(100%)', opacity: '0' }, to: { transform: 'translateX(0)', opacity: '1' } },
        'slide-in-left': { from: { transform: 'translateX(-100%)', opacity: '0' }, to: { transform: 'translateX(0)', opacity: '1' } },
        'slide-out-left': { from: { transform: 'translateX(0)', opacity: '1' }, to: { transform: 'translateX(-100%)', opacity: '0' } },
        'fade-in-half': { from: { opacity: '0' }, to: { opacity: '0.5' } },
      },
      animation: {
        'slide-in-right': 'slide-in-right 0.4s ease-in-out',
        'slide-in-left': 'slide-in-left 0.4s ease-in-out',
        'slide-out-left': 'slide-out-left 0.4s ease-in-out',
        'fade-in-half': 'fade-in-half 0.4s ease-in-out',
      },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      addBase({
        ':root': vars(light),
        // Signed-out pages have no data-theme yet, so they follow the system setting.
        '@media (prefers-color-scheme: dark)': { ':root:not([data-theme])': vars(dark) },
        '[data-theme="dark"]': vars(dark),
        // Thin scrollbars in the theme's own colours (they were dark grey even in light mode).
        '::-webkit-scrollbar': { width: '8px', height: '8px' },
        '::-webkit-scrollbar-track': { background: 'transparent' },
        '::-webkit-scrollbar-thumb': { background: 'oklch(var(--line))', borderRadius: '4px' },
        '::-webkit-scrollbar-thumb:hover': { background: 'oklch(var(--ink-soft) / 0.5)' },
        '@media (prefers-reduced-motion: reduce)': {
          '*, *::before, *::after': {
            animationDuration: '0.01ms !important',
            animationIterationCount: '1 !important',
            transitionDuration: '0.01ms !important',
            scrollBehavior: 'auto !important',
          },
        },
      });
    }),
  ],
}
