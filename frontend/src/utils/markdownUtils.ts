/**
 * Utility functions for Markdown operations with the backend
 */

import { marked } from 'marked';
import { API_BASE_URL } from '../config/api';

// Configure marked for GitHub-style rendering
marked.setOptions({
  gfm: true, // GitHub Flavored Markdown
  breaks: false,
  pedantic: false,
});

/**
 * Fetch the generated Markdown document from the backend
 */
export async function fetchMarkdownDocument(): Promise<{
  content: string;
  filename: string;
  timestamp: string;
}> {
  const response = await fetch(`${API_BASE_URL}/api/get_doc`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch Markdown document: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data;
}

/**
 * Generate a new Markdown document from a query
 */
export async function generateMarkdownDocument(query: string): Promise<{
  content: string;
  filename: string;
  timestamp: string;
  message: string;
}> {
  const response = await fetch(`${API_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to generate Markdown: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data;
}

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
  if (!editor) {
    console.error('❌ Editor instance not available');
    return null;
  }
  
  try {
    console.log('🔄 Converting Markdown to HTML...');
    console.log('📄 Input Markdown (first 500 chars):', markdown.substring(0, 500));
    
    // Convert Markdown to HTML using marked (synchronous)
    const html = convertMarkdownToHtml(markdown);
    
    console.log('✅ Markdown converted to HTML');
    console.log('📄 Output HTML (first 500 chars):', html.substring(0, 500));
    
    // Load the HTML into TipTap editor
    editor.commands.setContent(html);
    
    console.log('✅ Content loaded into editor successfully');
    console.log('📄 Editor content (first 500 chars):', editor.getHTML().substring(0, 500));

    return html;
  } catch (error) {
    console.error('❌ Error loading Markdown into editor:', error);
    // Fallback: try loading as plain text wrapped in paragraph
    try {
      const escapedMarkdown = markdown
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
      editor.commands.setContent(`<p>${escapedMarkdown}</p>`);
      console.log('⚠️ Loaded as plain text fallback');
      return `<p>${escapedMarkdown}</p>`;
    } catch (e) {
      console.error('❌ Fallback also failed:', e);
      return null;
    }
  }
}
