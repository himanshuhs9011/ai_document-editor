export type DocumentSaveState = 'ready' | 'dirty' | 'saving' | 'saved' | 'error';

export const DOCUMENT_SAVE_EVENT = 'document-save-state';

export const announceDocumentSaveState = (state: DocumentSaveState) => {
  window.dispatchEvent(new CustomEvent<DocumentSaveState>(DOCUMENT_SAVE_EVENT, { detail: state }));
};

// The editor registers how to send its pending autosaves now; uploads and sign-out wait for it so nothing is lost
// or lands on top of a document that just replaced it.
let flushPendingSaves: () => Promise<void> = async () => undefined;

export const registerAutosaveFlush = (flush: () => Promise<void>) => {
  flushPendingSaves = flush;
};

export const flushAutosave = () => flushPendingSaves();
