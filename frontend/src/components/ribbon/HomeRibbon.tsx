import React, { useEffect, useReducer, useState } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import type { Editor } from '@tiptap/react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowUpDown,
  Baseline,
  Bold,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  MoreHorizontal,
  Redo,
  Strikethrough,
  Underline,
  Undo,
} from 'lucide-react';
import {
  editorInstanceState,
  isDarkModeState,
  selectedRangeState,
  selectedTextState,
  showAIMenuState,
} from '../../stores/recoilState';
import {
  changeCase,
  FONT_SIZES,
  pasteFromClipboard,
  selectParagraph,
  selectSentence,
  sortSelection,
  stepFontSize,
} from '../../editor/commands';
import { useFormatPainter } from '../../editor/useFormatPainter';
import { useDictation } from '../../editor/useDictation';
import { GHOST_TEXT_TOGGLED, setGhostTextEnabled } from '../../extensions/ghostText';
import FindReplaceBar from './FindReplaceBar';
import {
  ColorMenu,
  HIGHLIGHTS,
  MenuItem,
  PALETTE,
  RibbonButton,
  RibbonGroup,
  RibbonMenu,
  RibbonSelect,
  RibbonTheme,
} from './RibbonParts';

const FONTS = ['Default', 'Arial', 'Calibri', 'Cambria', 'Courier New', 'Garamond', 'Georgia', 'Segoe UI',
  'Times New Roman', 'Trebuchet MS', 'Verdana'];
const LINE_SPACINGS = ['1.0', '1.15', '1.5', '2.0', '2.5', '3.0'];
const NUMBER_FORMATS = [
  { type: null, label: '1. 2. 3.' },
  { type: 'a', label: 'a. b. c.' },
  { type: 'A', label: 'A. B. C.' },
  { type: 'i', label: 'i. ii. iii.' },
  { type: 'I', label: 'I. II. III.' },
];
const STYLES: { label: string; apply: (editor: Editor) => void; active: (editor: Editor) => boolean }[] = [
  { label: 'Normal', apply: (editor) => editor.chain().focus().setParagraph().run(), active: (editor) => editor.isActive('paragraph') },
  ...[1, 2, 3, 4].map((level) => ({
    label: `Heading ${level}`,
    apply: (editor: Editor) => editor.chain().focus().setNode('heading', { level }).run(),
    active: (editor: Editor) => editor.isActive('heading', { level }),
  })),
  { label: 'Quote', apply: (editor) => editor.chain().focus().toggleBlockquote().run(), active: (editor) => editor.isActive('blockquote') },
  { label: 'Code', apply: (editor) => editor.chain().focus().toggleCodeBlock().run(), active: (editor) => editor.isActive('codeBlock') },
];

const ToolSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="border-b border-line/70 py-1.5 last:border-b-0">
    <h3 className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-soft">{title}</h3>
    {children}
  </section>
);

const useEditorRefresh = (editor: Editor | null) => {
  const [, refresh] = useReducer((count: number) => count + 1, 0);
  useEffect(() => {
    if (!editor) return undefined;
    editor.on('transaction', refresh);
    window.addEventListener(GHOST_TEXT_TOGGLED, refresh);
    return () => {
      editor.off('transaction', refresh);
      window.removeEventListener(GHOST_TEXT_TOGGLED, refresh);
    };
  }, [editor]);
};

const HomeRibbon: React.FC = () => {
  const editor = useRecoilValue(editorInstanceState) as Editor | null;
  const dark = useRecoilValue(isDarkModeState);
  const setShowAIMenu = useSetRecoilState(showAIMenuState);
  const setSelectedText = useSetRecoilState(selectedTextState);
  const setSelectedRange = useSetRecoilState(selectedRangeState);
  const [findMode, setFindMode] = useState<'find' | 'replace' | null>(null);
  const [showMarks, setShowMarks] = useState(false);
  const [spellcheck, setSpellcheck] = useState(true);
  const [clipboardError, setClipboardError] = useState('');
  const painter = useFormatPainter(editor);
  const dictation = useDictation(editor);
  useEditorRefresh(editor);

  useEffect(() => {
    if (!editor) return;
    editor.view.dom.classList.toggle('show-marks', showMarks);
    editor.view.dom.setAttribute('spellcheck', String(spellcheck));
  }, [editor, showMarks, spellcheck]);

  useEffect(() => {
    if (!editor) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (!(event.ctrlKey || event.metaKey) || (key !== 'f' && key !== 'h')) return;
      event.preventDefault();
      setFindMode(key === 'f' ? 'find' : 'replace');
    };
    const dom = editor.view.dom;
    dom.addEventListener('keydown', onKeyDown);
    return () => dom.removeEventListener('keydown', onKeyDown);
  }, [editor]);

  const off = !editor;
  const run = (action: (instance: Editor) => void) => () => { if (editor) action(editor); };
  const is = (name: string, attrs?: Record<string, unknown>) => Boolean(editor?.isActive(name, attrs));
  const textStyle = editor?.getAttributes('textStyle') || {};
  const fontSize: string = textStyle.fontSize || '';
  const block = editor?.isActive('heading') ? editor.getAttributes('heading') : editor?.getAttributes('paragraph') || {};
  const activeStyle = STYLES.find((style) => editor && style.active(editor))?.label || 'Normal';

  const clipboard = (action: 'cut' | 'copy') => run((instance) => {
    instance.commands.focus();
    document.execCommand(action);
  });
  const paste = (textOnly: boolean) => run((instance) => {
    setClipboardError('');
    pasteFromClipboard(instance, textOnly).catch(() => setClipboardError('Allow clipboard access, or press Ctrl+V.'));
  });

  const openAiAssistant = run((instance) => {
    const { from, to, empty } = instance.state.selection;
    const text = empty ? '' : instance.state.doc.textBetween(from, to, '\n\n');
    setSelectedText(text);
    setSelectedRange(text.trim() ? { from, to } : null);
    setShowAIMenu(Boolean(text.trim()));
  });

  return (
    <RibbonTheme.Provider value={dark}>
      <div className="toolbar-scroll flex h-11 items-center overflow-x-auto overflow-y-hidden px-2">
        <RibbonGroup label="History">
          <RibbonButton title="Undo (Ctrl+Z)" onClick={run((instance) => instance.chain().focus().undo().run())} disabled={off || !editor?.can().undo()}>
            <Undo className="h-4 w-4" />
          </RibbonButton>
          <RibbonButton title="Redo (Ctrl+Y)" onClick={run((instance) => instance.chain().focus().redo().run())} disabled={off || !editor?.can().redo()}>
            <Redo className="h-4 w-4" />
          </RibbonButton>
        </RibbonGroup>

        <RibbonGroup label="Style">
          <RibbonSelect
            title="Paragraph style"
            width="w-28"
            disabled={off}
            value={activeStyle}
            options={STYLES.map((style) => ({ value: style.label, label: style.label }))}
            onChange={(label) => {
              const style = STYLES.find((item) => item.label === label);
              if (editor && style) style.apply(editor);
            }}
          />
        </RibbonGroup>

        <RibbonGroup label="Font">
          <RibbonSelect
            title="Font"
            width="w-28"
            disabled={off}
            value={textStyle.fontFamily || 'Default'}
            options={FONTS.map((font) => ({ value: font, label: font, style: { fontFamily: font === 'Default' ? undefined : font } }))}
            onChange={(font) => editor && (font === 'Default'
              ? editor.chain().focus().unsetFontFamily().run()
              : editor.chain().focus().setFontFamily(font).run())}
          />
          <RibbonSelect
            title="Font size"
            width="w-16"
            disabled={off}
            value={fontSize}
            options={[
              { value: '', label: 'Size' },
              ...(FONT_SIZES.includes(fontSize) || !fontSize ? [] : [{ value: fontSize, label: fontSize }]),
              ...FONT_SIZES.map((size) => ({ value: size, label: size.replace('pt', '') })),
            ]}
            onChange={(size) => editor && (size
              ? editor.chain().focus().setFontSize(size).run()
              : editor.chain().focus().unsetFontSize().run())}
          />
          <RibbonButton title="Bold (Ctrl+B)" onClick={run((instance) => instance.chain().focus().toggleBold().run())} active={is('bold')} disabled={off}>
            <Bold className="h-4 w-4" />
          </RibbonButton>
          <RibbonButton title="Italic (Ctrl+I)" onClick={run((instance) => instance.chain().focus().toggleItalic().run())} active={is('italic')} disabled={off}>
            <Italic className="h-4 w-4" />
          </RibbonButton>
          <RibbonButton title="Underline (Ctrl+U)" onClick={run((instance) => instance.chain().focus().toggleUnderline().run())} active={is('underline')} disabled={off}>
            <Underline className="h-4 w-4" />
          </RibbonButton>
          <RibbonButton title="Strikethrough" onClick={run((instance) => instance.chain().focus().toggleStrike().run())} active={is('strike')} disabled={off}>
            <Strikethrough className="h-4 w-4" />
          </RibbonButton>
          <ColorMenu
            title="Text highlight color"
            icon={<Highlighter className="h-4 w-4" />}
            colors={HIGHLIGHTS}
            current={editor?.getAttributes('highlight').color}
            noneLabel="No highlight"
            disabled={off}
            onPick={(color) => editor && (color
              ? editor.chain().focus().toggleHighlight({ color }).run()
              : editor.chain().focus().unsetHighlight().run())}
          />
          <ColorMenu
            title="Font color"
            icon={<Baseline className="h-4 w-4" />}
            colors={PALETTE}
            current={textStyle.color}
            noneLabel="Automatic"
            disabled={off}
            onPick={(color) => editor && (color
              ? editor.chain().focus().setColor(color).run()
              : editor.chain().focus().unsetColor().run())}
          />
        </RibbonGroup>

        <RibbonGroup label="Paragraph">
          <RibbonButton title="Bullets" onClick={run((instance) => instance.chain().focus().toggleBulletList().run())} active={is('bulletList')} disabled={off}>
            <List className="h-4 w-4" />
          </RibbonButton>
          <RibbonMenu title="Numbering" label={<ListOrdered className="h-4 w-4" />} active={is('orderedList')} disabled={off}>
            {(close) => (
              <>
                {NUMBER_FORMATS.map(({ type, label }) => (
                  <MenuItem key={label} onClick={() => {
                    run((instance) => {
                      const chain = instance.chain().focus();
                      (instance.isActive('orderedList') ? chain : chain.toggleOrderedList()).updateAttributes('orderedList', { type }).run();
                    })();
                    close();
                  }}>{label}</MenuItem>
                ))}
                <MenuItem onClick={() => {
                  run((instance) => { if (instance.isActive('orderedList')) instance.chain().focus().toggleOrderedList().run(); })();
                  close();
                }}>None</MenuItem>
              </>
            )}
          </RibbonMenu>
          {([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight], ['justify', AlignJustify]] as const).map(([align, Icon]) => (
            <RibbonButton
              key={align}
              title={`Align ${align}`}
              onClick={run((instance) => instance.chain().focus().setTextAlign(align).run())}
              active={Boolean(editor?.isActive({ textAlign: align }))}
              disabled={off}
            >
              <Icon className="h-4 w-4" />
            </RibbonButton>
          ))}
          <RibbonMenu title="Line and paragraph spacing" label={<ArrowUpDown className="h-4 w-4" />} disabled={off}>
            {(close) => (
              <>
                {LINE_SPACINGS.map((value) => (
                  <MenuItem key={value} onClick={() => {
                    run((instance) => instance.chain().focus().setLineHeight(value === '1.0' ? null : value).run())();
                    close();
                  }}>
                    {(block.lineHeight || '1.0') === value ? '✓ ' : ''}{value}
                  </MenuItem>
                ))}
                <MenuItem onClick={() => {
                  run((instance) => instance.chain().focus().setParagraphSpacing({ before: block.spaceBefore ? null : '12pt' }).run())();
                  close();
                }}>{block.spaceBefore ? 'Remove space before' : 'Add space before'}</MenuItem>
                <MenuItem onClick={() => {
                  run((instance) => instance.chain().focus().setParagraphSpacing({ after: block.spaceAfter === '0' ? null : '0' }).run())();
                  close();
                }}>{block.spaceAfter === '0' ? 'Add space after' : 'Remove space after'}</MenuItem>
              </>
            )}
          </RibbonMenu>
        </RibbonGroup>

        <div className="sticky right-0 z-10 ml-auto border-l border-line/70 bg-panel/95 pl-1 shadow-[-12px_0_18px_-14px_rgba(15,23,42,0.35)] backdrop-blur">
          <RibbonGroup label="More">
          <RibbonMenu title="More tools" label={<><MoreHorizontal className="h-4 w-4" /><span className="hidden 2xl:inline">More</span></>} disabled={off} active={painter.active}>
            {(close) => (
              <div className="w-72">
                <ToolSection title="Clipboard">
                  <div className="grid grid-cols-2 gap-0.5">
                    <MenuItem onClick={() => { paste(false)(); close(); }}>Paste</MenuItem>
                    <MenuItem onClick={() => { paste(true)(); close(); }}>Paste text only</MenuItem>
                    <MenuItem onClick={() => { clipboard('cut')(); close(); }}>Cut</MenuItem>
                    <MenuItem onClick={() => { clipboard('copy')(); close(); }}>Copy</MenuItem>
                  </div>
                  <MenuItem onClick={() => { painter.toggle(); close(); }}>{painter.active ? '✓ ' : ''}Format painter</MenuItem>
                </ToolSection>

                <ToolSection title="Text">
                  <div className="grid grid-cols-2 gap-0.5">
                    <MenuItem onClick={() => { run((instance) => stepFontSize(instance, 1))(); close(); }}>Grow font</MenuItem>
                    <MenuItem onClick={() => { run((instance) => stepFontSize(instance, -1))(); close(); }}>Shrink font</MenuItem>
                    <MenuItem onClick={() => { run((instance) => instance.chain().focus().toggleSubscript().run())(); close(); }}>{is('subscript') ? '✓ ' : ''}Subscript</MenuItem>
                    <MenuItem onClick={() => { run((instance) => instance.chain().focus().toggleSuperscript().run())(); close(); }}>{is('superscript') ? '✓ ' : ''}Superscript</MenuItem>
                  </div>
                  <div className="px-2.5 pb-1 pt-2 text-[10px] font-medium text-ink-soft">Change case</div>
                  <div className="grid grid-cols-2 gap-0.5">
                    {([
                      ['sentence', 'Sentence case'],
                      ['lower', 'lowercase'],
                      ['upper', 'UPPERCASE'],
                      ['title', 'Title Case'],
                      ['toggle', 'tOGGLE cASE'],
                    ] as const).map(([mode, label]) => (
                      <MenuItem key={mode} onClick={() => { run((instance) => changeCase(instance, mode))(); close(); }}>{label}</MenuItem>
                    ))}
                  </div>
                  <MenuItem onClick={() => { run((instance) => instance.chain().focus().unsetAllMarks().clearNodes().run())(); close(); }}>Clear formatting</MenuItem>
                </ToolSection>

                <ToolSection title="Paragraph">
                  <div className="grid grid-cols-2 gap-0.5">
                    <MenuItem onClick={() => { run((instance) => instance.chain().focus().outdent().run())(); close(); }}>Decrease indent</MenuItem>
                    <MenuItem onClick={() => { run((instance) => instance.chain().focus().indent().run())(); close(); }}>Increase indent</MenuItem>
                    <MenuItem onClick={() => { run((instance) => sortSelection(instance))(); close(); }}>Sort A → Z</MenuItem>
                    <MenuItem onClick={() => { run((instance) => sortSelection(instance, true))(); close(); }}>Sort Z → A</MenuItem>
                  </div>
                  <MenuItem onClick={() => { setShowMarks(!showMarks); close(); }}>{showMarks ? '✓ ' : ''}Show paragraph marks</MenuItem>
                  <MenuItem onClick={() => { run((instance) => instance.chain().focus().setHorizontalRule().run())(); close(); }}>Insert horizontal line</MenuItem>
                  <div className="px-2.5 pb-1 pt-2 text-[10px] font-medium text-ink-soft">Paragraph shading</div>
                  <div className="flex flex-wrap gap-1.5 px-2.5 pb-1.5">
                    {[null, ...HIGHLIGHTS, ...PALETTE.slice(5)].map((color, index) => (
                      <button
                        key={color || `none-${index}`}
                        type="button"
                        title={color || 'No shading'}
                        aria-label={color || 'No shading'}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => { editor?.chain().focus().setShading(color).run(); close(); }}
                        className="h-6 w-6 rounded-md border border-line shadow-sm transition-transform hover:scale-110"
                        style={{ background: color || 'transparent' }}
                      />
                    ))}
                  </div>
                </ToolSection>

                <ToolSection title="Find and select">
                  <div className="grid grid-cols-2 gap-0.5">
                    <MenuItem onClick={() => { setFindMode('find'); close(); }}>Find</MenuItem>
                    <MenuItem onClick={() => { setFindMode('replace'); close(); }}>Find and replace</MenuItem>
                    <MenuItem onClick={() => { run((instance) => instance.chain().focus().selectAllText().run())(); close(); }}>Select all</MenuItem>
                    <MenuItem onClick={() => { run(selectParagraph)(); close(); }}>Select paragraph</MenuItem>
                    <MenuItem onClick={() => { run(selectSentence)(); close(); }}>Select sentence</MenuItem>
                  </div>
                </ToolSection>

                <ToolSection title="Writing tools">
                  <MenuItem onClick={() => { openAiAssistant(); close(); }}>Rewrite selected text with AI</MenuItem>
                  <MenuItem disabled={!dictation.supported} onClick={() => { dictation.toggle(); close(); }}>
                    {dictation.listening ? '✓ Stop dictation' : 'Dictate'}
                  </MenuItem>
                  <MenuItem onClick={() => { setSpellcheck(!spellcheck); close(); }}>{spellcheck ? '✓ ' : ''}Check spelling as you type</MenuItem>
                  <MenuItem onClick={() => {
                    if (editor) setGhostTextEnabled(editor.storage.ghostText, !editor.storage.ghostText.enabled);
                    close();
                  }}>{editor?.storage.ghostText?.enabled ? '✓ ' : ''}AI autocomplete</MenuItem>
                </ToolSection>
              </div>
            )}
          </RibbonMenu>
          </RibbonGroup>
        </div>
      </div>

      {clipboardError && <p role="alert" className="border-t border-line/70 px-3 py-1 text-[11px] text-danger">{clipboardError}</p>}
      {editor && findMode && (
        <FindReplaceBar editor={editor} withReplace={findMode === 'replace'} dark={dark} onClose={() => setFindMode(null)} />
      )}
    </RibbonTheme.Provider>
  );
};

export default HomeRibbon;
