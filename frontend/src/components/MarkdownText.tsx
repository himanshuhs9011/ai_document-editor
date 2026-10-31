import React from 'react';

/**
 * Model output as React elements, never as HTML, so nothing it writes can run in the page.
 * Covers what the backend's prompts produce: headings, paragraphs, lists, quotes, code, simple tables,
 * bold/italic/inline code, https links, and [n] source citations.
 */

type Block =
  | { kind: 'heading'; depth: number; text: string }
  | { kind: 'paragraph'; lines: string[] }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'quote'; lines: string[] }
  | { kind: 'code'; text: string }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'rule' };

const LIST_ITEM = /^\s*(?:([-*+])|(\d{1,3})[.)])\s+(.*)$/;
const TABLE_DIVIDER = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    if (/^\s*```/.test(line)) {
      const body: string[] = [];
      for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) body.push(lines[i]);
      blocks.push({ kind: 'code', text: body.join('\n') });
      i++;
      continue;
    }
    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      blocks.push({ kind: 'heading', depth: heading[1].length, text: heading[2] });
      i++;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ kind: 'rule' });
      i++;
      continue;
    }
    if (line.includes('|') && TABLE_DIVIDER.test(lines[i + 1] || '')) {
      const head = cells(line);
      const rows: string[][] = [];
      for (i += 2; i < lines.length && lines[i].includes('|') && lines[i].trim(); i++) rows.push(cells(lines[i]));
      blocks.push({ kind: 'table', head, rows });
      continue;
    }
    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      for (; i < lines.length && /^\s*>/.test(lines[i]); i++) quote.push(lines[i].replace(/^\s*>\s?/, ''));
      blocks.push({ kind: 'quote', lines: quote });
      continue;
    }
    const first = LIST_ITEM.exec(line);
    if (first) {
      const ordered = !!first[2];
      const items: string[] = [];
      for (; i < lines.length; i++) {
        const item = LIST_ITEM.exec(lines[i]);
        if (item && !!item[2] === ordered) items.push(item[3]);
        // An indented line continues the item above it.
        else if (items.length && /^\s{2,}\S/.test(lines[i]) && !LIST_ITEM.test(lines[i])) items[items.length - 1] += ` ${lines[i].trim()}`;
        else break;
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }
    const paragraph: string[] = [];
    for (; i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*```|\s*>)/.test(lines[i]) && !LIST_ITEM.test(lines[i]); i++) {
      paragraph.push(lines[i].trim());
    }
    // A line no rule claimed still has to move the cursor forward.
    if (!paragraph.length) paragraph.push(lines[i++].trim());
    blocks.push({ kind: 'paragraph', lines: paragraph });
  }
  return blocks;
}

const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+?\*\*|__[^_\n]+?__)|(\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\))|(\[(\d{1,3})\])|(\*[^*\s][^*\n]*?\*|(?<![\w])_[^_\s][^_\n]*?_(?![\w]))/g;

// Colours come from the surrounding bubble or sheet; tints use gray at low opacity so they work on either theme.
const CODE = 'rounded-sm bg-gray-500/15 px-1 py-px font-mono text-[0.9em]';
const CITE = 'mx-0.5 inline-block min-w-[1.4em] rounded-sm bg-accent-tint px-1 align-super text-[0.75em] font-semibold leading-normal text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus';

const VARIANTS = {
  // A chat answer: compact, evenly spaced blocks.
  chat: {
    root: 'space-y-2',
    heading: { h4: 'mt-3 font-semibold', h5: 'mt-3 font-semibold', h6: 'mt-3 font-semibold' } as Record<string, string>,
    block: '',
  },
  // A Studio draft: reading type with a heading scale.
  paper: {
    root: '',
    heading: {
      h2: 'mb-3 break-words text-read-xl font-semibold',
      h3: 'mb-2 mt-6 text-lg font-semibold',
      h4: 'mb-2 mt-4 text-base font-semibold',
    } as Record<string, string>,
    block: 'mb-3',
  },
};

type Cite = { has: (n: number) => boolean; onCite: (n: number) => void };

function inline(text: string, cite: Cite | undefined, key = ''): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const at = match.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const k = `${key}${at}`;
    const [whole, code, bold, link, linkText, href, citation, number, italic] = match;
    if (code) out.push(<code key={k} className={CODE}>{code.slice(1, -1)}</code>);
    else if (bold) out.push(<strong key={k}>{inline(bold.slice(2, -2), cite, `${k}-`)}</strong>);
    else if (link) out.push(<a key={k} href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{linkText}</a>);
    else if (citation && cite?.has(Number(number))) {
      out.push(
        <button key={k} type="button" className={CITE} onClick={() => cite.onCite(Number(number))} aria-label={`Show source ${number}`}>
          {number}
        </button>
      );
    } else if (italic) out.push(<em key={k}>{inline(italic.slice(1, -1), cite, `${k}-`)}</em>);
    else out.push(whole);
    last = at + whole.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const withBreaks = (lines: string[], cite: Cite | undefined) =>
  lines.flatMap((line, index) => (index ? [<br key={`br${index}`} />, ...inline(line, cite, `${index}:`)] : inline(line, cite, '0:')));

interface Props {
  markdown: string;
  /** chat: compact answer in a bubble; paper: a document draft with reading type. */
  variant?: keyof typeof VARIANTS;
  /** Heading level a single # becomes; deeper headings step down from it (capped at h6). */
  baseLevel?: number;
  /** Source numbers that exist; matching [n] in the text become buttons that call onCite. */
  citations?: number[];
  onCite?: (n: number) => void;
}

const MarkdownText: React.FC<Props> = ({ markdown, variant = 'chat', baseLevel = 2, citations, onCite }) => {
  const known = new Set(citations || []);
  const cite = onCite && known.size ? { has: (n: number) => known.has(n), onCite } : undefined;
  const style = VARIANTS[variant];
  const cell = 'border border-gray-500/30 px-2 py-1 text-left align-top';
  return (
    <div className={style.root}>
      {parseBlocks(markdown).map((block, index) => {
        switch (block.kind) {
          case 'heading': {
            const level = `h${Math.min(6, baseLevel + block.depth - 1)}`;
            const Tag = level as keyof JSX.IntrinsicElements;
            return <Tag key={index} className={`text-balance leading-snug ${style.heading[level] || 'font-semibold'}`}>{inline(block.text, cite)}</Tag>;
          }
          case 'list': {
            const Tag = block.ordered ? 'ol' : 'ul';
            return (
              <Tag key={index} className={`${style.block} space-y-1 pl-5 ${block.ordered ? 'list-decimal' : 'list-disc'}`}>
                {block.items.map((item, n) => <li key={n}>{inline(item, cite)}</li>)}
              </Tag>
            );
          }
          case 'quote':
            return <blockquote key={index} className={`${style.block} border-l-[3px] border-gray-500/40 pl-3 opacity-90`}>{withBreaks(block.lines, cite)}</blockquote>;
          case 'code':
            return (
              <pre key={index} className={`${style.block} overflow-x-auto rounded bg-gray-500/10 px-3 py-2`}>
                <code className="font-mono text-[0.9em]">{block.text}</code>
              </pre>
            );
          case 'table':
            return (
              <div key={index} className={`${style.block} overflow-x-auto`}>
                <table className="border-collapse text-[0.95em]">
                  <thead><tr>{block.head.map((text, n) => <th key={n} scope="col" className={`${cell} font-semibold`}>{inline(text, cite)}</th>)}</tr></thead>
                  <tbody>
                    {block.rows.map((row, r) => <tr key={r}>{row.map((text, n) => <td key={n} className={cell}>{inline(text, cite)}</td>)}</tr>)}
                  </tbody>
                </table>
              </div>
            );
          case 'rule':
            return <hr key={index} className="border-0 border-t border-gray-500/30" />;
          default:
            return <p key={index} className={style.block}>{withBreaks(block.lines, cite)}</p>;
        }
      })}
    </div>
  );
};

export default MarkdownText;
