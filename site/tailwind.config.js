/** Tailwind for the download page: the app's own palette (warm paper, slate ink, one deep blue accent). */
module.exports = {
  content: ['./public/**/*.html'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        paper: { DEFAULT: '#faf8f4', dark: '#181b22' },
        panel: { DEFAULT: '#f1eee8', dark: '#20242c' },
        line: { DEFAULT: '#e1dcd2', dark: '#323844' },
        ink: { DEFAULT: '#262b36', dark: '#ecebe7' },
        soft: { DEFAULT: '#5b616d', dark: '#aeb0b5' },
        accent: { DEFAULT: '#22579b', hover: '#1b4680', dark: '#8db4ea', 'dark-hover': '#a9c6f0' },
        tint: { DEFAULT: '#e6edf7', dark: '#24324a' },
      },
      fontFamily: {
        ui: ['system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        read: ['"Iowan Old Style"', 'Georgia', '"Times New Roman"', 'serif'],
        mono: ['Consolas', '"Cascadia Mono"', 'monospace'],
      },
      maxWidth: { page: '72rem' },
      boxShadow: { screenshot: '0 24px 60px -28px rgb(15 23 42 / 0.35)' },
    },
  },
  plugins: [],
};
