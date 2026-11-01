/** Tailwind for the download page: black, monospace headings, hairline borders (the raglib site's look). */
module.exports = {
  content: ['./public/**/*.html'],
  theme: {
    extend: {
      colors: {
        ground: '#000000',
        surface: '#0b0b0b',
        raised: '#141414',
        line: '#262626',
        ink: '#f2f2f2',
        soft: '#a3a3a3',
        dim: '#737373',
        pass: '#4ade80',
      },
      fontFamily: {
        ui: ['system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        mono: ['ui-monospace', '"Cascadia Mono"', '"JetBrains Mono"', 'Consolas', 'monospace'],
      },
      maxWidth: { page: '65rem' },
    },
  },
  plugins: [],
};
