/** Tailwind class sets shared by the Studio screens. */

const buttonBase = 'min-h-9 whitespace-nowrap rounded-md border px-4 font-semibold transition-colors duration-[120ms] ease-out '
  + 'disabled:cursor-not-allowed disabled:border-line disabled:bg-sunken disabled:text-ink-soft';

export const button = `${buttonBase} border-line bg-paper text-ink hover:bg-sunken active:bg-line`;
export const primaryButton = `${buttonBase} border-accent bg-accent text-accent-ink hover:bg-accent-hover active:bg-accent-hover`;

export const input = 'w-full min-h-9 rounded-md border border-line bg-paper px-3 py-2 text-ink hover:border-ink-soft '
  + 'disabled:cursor-not-allowed disabled:opacity-60';
export const textarea = `${input} min-h-24 resize-y`;

export const field = 'grid gap-1';
export const fieldLabel = 'font-semibold';
export const hint = 'text-ui-xs text-ink-soft';
export const notice = 'max-w-[65ch] rounded-md bg-sunken px-4 py-3';
export const error = 'text-danger';
export const link = 'cursor-pointer text-accent underline underline-offset-2';
export const actions = 'flex flex-wrap items-center gap-3';
