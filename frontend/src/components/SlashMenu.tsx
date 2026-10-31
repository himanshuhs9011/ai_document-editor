import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import type { SuggestionProps } from '@tiptap/suggestion';
import { Sparkles } from 'lucide-react';
import type { SlashItem } from '../editor/slashItems';

/** The popup list for the "/" menu; arrow keys move, Enter runs, Escape closes. */

export interface SlashMenuHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

const SlashMenu = forwardRef<SlashMenuHandle, SuggestionProps<SlashItem>>(({ items, command }, ref) => {
  const [chosen, setChosen] = useState(0);
  useEffect(() => setChosen(0), [items]);
  // The reset above lands a render late; until then a hover-picked index can point past a freshly filtered list.
  const selected = chosen < items.length ? chosen : 0;

  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      if (!items.length) return false;
      if (event.key === 'ArrowDown') { setChosen((selected + 1) % items.length); return true; }
      if (event.key === 'ArrowUp') { setChosen((selected + items.length - 1) % items.length); return true; }
      if (event.key === 'Enter' || event.key === 'Tab') { command(items[selected]); return true; }
      return false;
    },
  }), [items, selected, command]);

  if (!items.length) return null;

  return (
    <div role="listbox" aria-label="Commands" className="max-h-80 w-72 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 text-gray-800 shadow-xl">
      {items.map((item, index) => (
        <React.Fragment key={item.id}>
          {(index === 0 || items[index - 1].group !== item.group) && (
            <div className="px-2 pb-1 pt-2 text-xs font-semibold text-gray-500">{item.group}</div>
          )}
          <button
            type="button"
            role="option"
            aria-selected={index === selected}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => command(item)}
            onMouseEnter={() => setChosen(index)}
            className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left ${index === selected ? 'bg-blue-50' : ''}`}
          >
            {item.group === 'AI' && <Sparkles className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-blue-600" />}
            <span>
              <span className="block text-sm font-medium">{item.title}{item.argument ? `: ${item.argument}` : ''}</span>
              <span className="block text-xs text-gray-500">{item.hint}</span>
            </span>
          </button>
        </React.Fragment>
      ))}
    </div>
  );
});

SlashMenu.displayName = 'SlashMenu';

export default SlashMenu;
