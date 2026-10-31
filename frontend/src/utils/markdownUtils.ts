/**
 * Markdown <-> HTML helpers for the TipTap editor
 */

import { marked } from 'marked';

// Configure marked for GitHub-style rendering
marked.setOptions({
  gfm: true, // GitHub Flavored Markdown
  breaks: false,
  pedantic: false,
});

/**
 * Convert Markdown to HTML for Tiptap editor
 * Uses the tiptap-markdown extension's built-in conversion
 */
export function markdownToHTML(markdown: string): string {
  // The Markdown extension handles this automatically when setting content
  // This is just a passthrough for clarity
  return markdown;
}

/**
 * Extract Markdown from Tiptap editor
 * Note: This requires the editor instance with Markdown extension
 */
export function getMarkdownFromEditor(editor: any): string {
  if (!editor) {
    return '';
  }
  
  try {
    // The Markdown extension provides getMarkdown() method
    const storage = editor.storage.markdown;
    if (storage && storage.getMarkdown) {
      return storage.getMarkdown();
    }
    
    // Fallback: use getText() if Markdown storage not available
    return editor.getText();
  } catch (error) {
    console.error('Error extracting Markdown from editor:', error);
    return editor.getText() || '';
  }
}

/**
 * Convert Markdown to HTML (GitHub-flavored)
 */
export function convertMarkdownToHtml(markdown: string): string {
  return marked.parse(markdown) as string;
}

/**
 * Load Markdown into Tiptap editor
 * Converts Markdown to HTML first, then loads into editor
 * Returns the HTML that was loaded for further use (state sync, etc.)
 */
export function loadMarkdownIntoEditor(editor: any, markdown: string): string | null {
  if (!editor) return null;
  try {
    const html = convertMarkdownToHtml(markdown);
    editor.commands.setContent(html);
    return html;
  } catch (error) {
    console.error('Could not load Markdown into the editor; loading it as plain text', error);
    const escaped = markdown.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    try {
      editor.commands.setContent(`<p>${escaped}</p>`);
      return `<p>${escaped}</p>`;
    } catch (fallbackError) {
      console.error('Plain-text fallback also failed', fallbackError);
      return null;
    }
  }
}
