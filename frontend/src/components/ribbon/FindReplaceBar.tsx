import React, { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { searchReplaceKey } from '../../extensions/searchReplace';

/** Find & Replace bar shown under the ribbon; matches are highlighted in the document. */
const FindReplaceBar: React.FC<{ editor: Editor; withReplace: boolean; dark: boolean; onClose: () => void }> = ({
  editor, withReplace, dark, onClose,
}) => {
  const [term, setTerm] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const search = searchReplaceKey.getState(editor.state);
  const count = search?.matches.length || 0;

  useEffect(() => inputRef.current?.focus(), [withReplace]);
  useEffect(() => { editor.commands.setSearchTerm(term, caseSensitive); }, [editor, term, caseSensitive]);
  useEffect(() => () => { editor.commands.setSearchTerm(''); }, [editor]);

  const field = `h-7 rounded border px-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 ${
    dark ? 'border-gray-700 bg-gray-900 text-gray-100' : 'border-gray-300 bg-white text-gray-900'
  }`;
  const button = `h-7 rounded px-2 text-xs disabled:opacity-40 ${dark ? 'hover:bg-gray-800 text-gray-200' : 'hover:bg-gray-100 text-gray-700'}`;

  return (
    <div className={`flex flex-wrap items-center gap-2 border-t px-3 py-1.5 ${dark ? 'border-gray-800' : 'border-gray-200'}`}>
      <input
        ref={inputRef}
        className={`${field} w-48`}
        placeholder="Find in document"
        aria-label="Find in document"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') (event.shiftKey ? editor.commands.findPrevious() : editor.commands.findNext());
          if (event.key === 'Escape') onClose();
        }}
      />
      <span className={`min-w-[64px] text-xs ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
        {term ? (count ? `${(search?.current || 0) + 1} of ${count}` : 'No results') : ''}
      </span>
      <button type="button" className={button} title="Previous match" aria-label="Previous match" disabled={!count} onClick={() => editor.commands.findPrevious()}>
        <ChevronUp className="h-4 w-4" />
      </button>
      <button type="button" className={button} title="Next match" aria-label="Next match" disabled={!count} onClick={() => editor.commands.findNext()}>
        <ChevronDown className="h-4 w-4" />
      </button>
      <label className={`flex items-center gap-1 text-xs ${dark ? 'text-gray-300' : 'text-gray-600'}`}>
        <input type="checkbox" checked={caseSensitive} onChange={(event) => setCaseSensitive(event.target.checked)} /> Match case
      </label>
      {withReplace && (
        <>
          <input
            className={`${field} w-48`}
            placeholder="Replace with"
            aria-label="Replace with"
            value={replacement}
            onChange={(event) => setReplacement(event.target.value)}
          />
          <button type="button" className={button} disabled={!count} onClick={() => editor.commands.replaceCurrent(replacement)}>Replace</button>
          <button type="button" className={button} disabled={!count} onClick={() => editor.commands.replaceAll(replacement)}>Replace All</button>
        </>
      )}
      <button type="button" className={`${button} ml-auto`} title="Close" aria-label="Close find" onClick={onClose}>
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

export default FindReplaceBar;
