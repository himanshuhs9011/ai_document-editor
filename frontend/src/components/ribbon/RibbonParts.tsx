import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

export const RibbonTheme = createContext(false);

const useDark = () => useContext(RibbonTheme);

export const RibbonGroup: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div role="group" aria-label={label} className="flex flex-shrink-0 items-center gap-1 border-r border-line/70 px-1.5 last:border-r-0">
    <span className="sr-only">{label}</span>
    <div className="flex items-center gap-1">{children}</div>
  </div>
);

export const RibbonRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex items-center gap-0.5">{children}</div>
);

export const RibbonButton: React.FC<{
  title: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ title, onClick, active, disabled, children }) => {
  const tone = active
    ? 'bg-accent-tint text-accent'
    : 'text-ink-soft hover:bg-paper hover:text-ink';
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`flex h-8 min-w-8 items-center justify-center gap-1 rounded-lg px-2 text-xs font-medium transition-colors ${tone} ${disabled ? 'cursor-not-allowed opacity-35' : ''}`}
    >
      {children}
    </button>
  );
};

const MENU_WIDTH = 220;

export const RibbonMenu: React.FC<{
  title: string;
  label: React.ReactNode;
  disabled?: boolean;
  active?: boolean;
  children: (close: () => void) => React.ReactNode;
}> = ({ title, label, disabled, active, children }) => {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const close = () => setPosition(null);

  useEffect(() => {
    if (!position) return undefined;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!anchorRef.current?.contains(target) && !menuRef.current?.contains(target)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', close);
    };
  }, [position]);

  const toggle = () => {
    if (position || !anchorRef.current) {
      close();
      return;
    }
    const rect = anchorRef.current.getBoundingClientRect();
    setPosition({ top: rect.bottom + 6, left: Math.max(8, Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8)) });
  };

  return (
    <div ref={anchorRef}>
      <RibbonButton title={title} onClick={toggle} disabled={disabled} active={active}>
        {label}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </RibbonButton>
      {position && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={title}
          style={{ top: position.top, left: position.left, minWidth: MENU_WIDTH }}
          className="fixed z-[90] max-h-[calc(100vh-80px)] overflow-y-auto rounded-xl border border-line bg-paper p-1.5 text-ink shadow-2xl"
        >
          {children(close)}
        </div>,
        document.body,
      )}
    </div>
  );
};

export const MenuItem: React.FC<{ onClick: () => void; children: React.ReactNode; disabled?: boolean }> = ({ onClick, children, disabled }) => (
  <button
    type="button"
    role="menuitem"
    disabled={disabled}
    onMouseDown={(event) => event.preventDefault()}
    onClick={onClick}
    className="flex w-full items-center rounded-lg px-2.5 py-2 text-left text-xs text-ink transition-colors hover:bg-sunken focus-visible:bg-sunken focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
  >
    {children}
  </button>
);

export const PALETTE = [
  '#000000', '#434343', '#666666', '#999999', '#ffffff',
  '#c00000', '#ff0000', '#ffc000', '#ffff00', '#92d050',
  '#00b050', '#00b0f0', '#0070c0', '#002060', '#7030a0',
];

export const HIGHLIGHTS = ['#fff59d', '#c5e1a5', '#80deea', '#f8bbd0', '#ffcc80', '#e0e0e0'];

export const ColorMenu: React.FC<{
  title: string;
  icon: React.ReactNode;
  colors: string[];
  current?: string | null;
  noneLabel: string;
  disabled?: boolean;
  onPick: (color: string | null) => void;
}> = ({ title, icon, colors, current, noneLabel, disabled, onPick }) => (
  <RibbonMenu
    title={title}
    disabled={disabled}
    label={(
      <span className="flex flex-col items-center leading-none">
        {icon}
        <span className="mt-0.5 h-0.5 w-4 rounded-full" style={{ background: current || 'transparent' }} />
      </span>
    )}
  >
    {(close) => (
      <div className="p-1">
        <div className="grid grid-cols-5 gap-1.5 pb-1.5">
          {colors.map((color) => (
            <button
              key={color}
              type="button"
              title={color}
              aria-label={color}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => { onPick(color); close(); }}
              className="h-7 w-7 rounded-lg border border-line shadow-sm transition-transform hover:scale-110"
              style={{ background: color }}
            />
          ))}
        </div>
        <MenuItem onClick={() => { onPick(null); close(); }}>{noneLabel}</MenuItem>
      </div>
    )}
  </RibbonMenu>
);

export const RibbonSelect: React.FC<{
  title: string;
  value: string;
  options: { value: string; label: string; style?: React.CSSProperties }[];
  width: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}> = ({ title, value, options, width, disabled, onChange }) => {
  useDark();
  return (
    <select
      title={title}
      aria-label={title}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className={`h-8 rounded-lg border border-line bg-paper px-2 text-xs text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15 disabled:cursor-not-allowed disabled:opacity-40 ${width}`}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value} style={option.style}>{option.label}</option>
      ))}
    </select>
  );
};
