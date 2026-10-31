import React from 'react';

/** The sheet both sign-in pages sit on: title, a line of context, then the form. */
export function AuthShell({ title, lede, children, footer }: {
  title: string;
  lede: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    // The body never scrolls (the editor manages its own panes), so this page scrolls itself on short screens.
    <main className="grid h-screen items-start overflow-y-auto bg-panel p-4 font-ui text-sm leading-normal text-ink sm:place-items-center sm:px-4 sm:py-8">
      <div className="w-full max-w-[26rem] rounded-md border border-line bg-paper px-4 py-6 sm:px-8 sm:pb-6 sm:pt-8">
        <h1 className="text-balance font-read text-read-xl font-semibold">{title}</h1>
        <p className="mb-6 mt-2 text-ink-soft">{lede}</p>
        {children}
        <p className="mt-6 border-t border-line pt-4 text-ink-soft [&_a:focus-visible]:outline [&_a:focus-visible]:outline-2 [&_a:focus-visible]:outline-offset-2 [&_a:focus-visible]:outline-focus [&_a]:font-medium [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2">
          {footer}
        </p>
      </div>
    </main>
  );
}

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  optional?: boolean;
  hint?: string;
};

export function AuthField({ id, label, optional, hint, ...input }: FieldProps) {
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="font-medium">
        {label} {optional && <span className="font-normal text-ink-soft">(optional)</span>}
      </label>
      <input
        id={id}
        name={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="h-9 rounded-md border border-line bg-paper px-3 text-ink placeholder:text-ink-soft/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-[invalid=true]:border-danger"
        {...input}
      />
      {hint && <small id={`${id}-hint`} className="text-ui-xs text-ink-soft">{hint}</small>}
    </div>
  );
}

export function AuthError({ message }: { message: string }) {
  return message ? <p role="alert" className="rounded-md border border-danger bg-sunken px-3 py-2 text-danger">{message}</p> : null;
}

/** The form's one action; while submitting it changes fill, ink and cursor, not just opacity. */
export function AuthSubmit({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="mt-2 h-9 rounded-md bg-accent font-semibold text-accent-ink transition-colors duration-[120ms] ease-out hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:translate-y-px active:bg-accent-hover disabled:cursor-progress disabled:bg-sunken disabled:text-ink-soft"
    >
      {children}
    </button>
  );
}
