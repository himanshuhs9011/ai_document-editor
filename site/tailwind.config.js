/** Tailwind for the download page: pure black and white, monospace heads, hard shadows, grid lines. */
module.exports = {
  content: ['./public/**/*.html'],
  theme: {
    extend: {
      colors: {
        ground: '#000000',
        surface: '#0a0a0a',
        raised: '#161616',
        line: '#2e2e2e',
        ink: '#ffffff',
        soft: '#b3b3b3',
        dim: '#808080',
      },
      fontFamily: {
        ui: ['system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        mono: ['ui-monospace', '"Cascadia Mono"', '"JetBrains Mono"', 'Consolas', 'monospace'],
        // Outlined numbers need a static font: variable fonts draw their overlapping contours.
        outline: ['Consolas', '"SF Mono"', 'Menlo', '"DejaVu Sans Mono"', 'monospace'],
      },
      maxWidth: { page: '65rem' },
      boxShadow: {
        hard: '6px 6px 0 0 #ffffff',
        'hard-lg': '12px 12px 0 0 #ffffff',
        'hard-ink': '6px 6px 0 0 #000000',
        // An outlined offset box, for white-filled things a solid white shadow would merge into.
        'hard-line': '8px 8px 0 0 #000000, 8px 8px 0 1px #ffffff',
        'hard-line-lg': '14px 14px 0 0 #000000, 14px 14px 0 1px #ffffff',
      },
      backgroundImage: {
        grid: 'linear-gradient(to right, rgb(255 255 255 / 0.08) 1px, transparent 1px), linear-gradient(to bottom, rgb(255 255 255 / 0.08) 1px, transparent 1px)',
        dots: 'radial-gradient(rgb(0 0 0 / 0.16) 1px, transparent 1px)',
      },
      backgroundSize: { grid: '48px 48px', dots: '16px 16px' },
      keyframes: {
        marquee: { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
        blink: { '0%, 49%': { opacity: '1' }, '50%, 100%': { opacity: '0' } },
      },
      animation: {
        marquee: 'marquee 40s linear infinite',
        blink: 'blink 1.1s step-end infinite',
      },
    },
  },
  plugins: [],
};
