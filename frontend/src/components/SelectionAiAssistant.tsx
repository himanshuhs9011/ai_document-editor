import React, { useMemo, useState } from 'react';
import { useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil';
import {
  showAIMenuState,
  selectedTextState,
  selectedRangeState,
  editorInstanceState,
  isDarkModeState,
} from '../stores/recoilState';
import { useAppStore } from '../stores/simpleStore';
import { Bot, CheckCircle2, Loader2, Sparkles, X } from 'lucide-react';
import { apiJson } from '../services/http';

const QUICK_ACTIONS: Array<{ id: string; label: string; instruction: string }> = [
  {
    id: 'improve-grammar',
    label: 'Improve Grammar',
    instruction:
      'Improve the grammar, clarity, and flow of the passage while preserving the original meaning.',
  },
  {
    id: 'make-concise',
    label: 'Make Concise',
    instruction:
      'Rewrite the passage to be more concise and direct without losing key information.',
  },
  {
    id: 'expand-detail',
    label: 'Add Detail',
    instruction:
      'Expand the passage with richer detail and supporting context while maintaining relevance.',
  },
  {
    id: 'formal-tone',
    label: 'Formal Tone',
    instruction:
      'Rewrite the passage using a polished, professional, and formal tone.',
  },
  {
    id: 'friendly-tone',
    label: 'Friendly Tone',
    instruction:
      'Rewrite the passage using a friendly, approachable, and conversational tone.',
  },
  {
    id: 'summarize',
    label: 'Summarize',
    instruction:
      'Provide a concise summary of the passage highlighting the main idea.',
  },
];

const SelectionAiAssistant: React.FC = () => {
  const [isOpen, setIsOpen] = useRecoilState(showAIMenuState);
  const selectedText = useRecoilValue(selectedTextState);
  const selectionRange = useRecoilValue(selectedRangeState);
  const editor = useRecoilValue(editorInstanceState);
  const isDarkMode = useRecoilValue(isDarkModeState);
  const setSelectedText = useSetRecoilState(selectedTextState);
  const setSelectionRange = useSetRecoilState(selectedRangeState);
  const { currentDocument, currentSession } = useAppStore();

  const [customInstruction, setCustomInstruction] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [activeAction, setActiveAction] = useState<string | null>(null);

  const trimmedSelection = useMemo(() => selectedText.trim(), [selectedText]);

  const closeAssistant = () => {
    setIsOpen(false);
    setSelectedText('');
    setSelectionRange(null);
    setActiveAction(null);
    setCustomInstruction('');
    setStatus('idle');
    setStatusMessage('');
  };

  const runInstruction = async (instruction: string) => {
    if (!editor || !selectionRange) {
      setStatus('error');
      setStatusMessage('No active selection found in the editor.');
      return;
    }

    if (!trimmedSelection) {
      setStatus('error');
      setStatusMessage('Select some text in the document before invoking AI.');
      return;
    }

    try {
      setStatus('loading');
      setStatusMessage('Asking the AI to craft an update...');

      const payload = {
        content: [
          'You are assisting inside a rich text editor. Rewrite the selected passage according to the instruction.',
          'Return only the rewritten passage with no commentary, labels, or quotation marks.',
          '',
          `Instruction: ${instruction}`,
          '',
          'Selected passage:',
          trimmedSelection,
        ].join('\n'),
        document_id: currentDocument?.document_id,
        session_id: currentSession?.id,
      };

      const sessionAtStart = currentSession?.id;
      const data = await apiJson('/api/chat', { method: 'POST', body: JSON.stringify(payload) });
      const aiText = (data?.response || '').trim();

      // The rewrite belongs to the passage it was asked about; if another session opened meanwhile, it is not applied.
      if (useAppStore.getState().currentSession?.id !== sessionAtStart) {
        setStatus('error');
        setStatusMessage('The session changed before the AI answered, so nothing was changed.');
        return;
      }

      if (!aiText) {
        throw new Error('AI returned an empty response.');
      }

      // Replace the original selection with the AI-provided text
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tiptapEditor = editor as any;
      tiptapEditor?.chain?.()
        ?.focus()
        ?.insertContentAt({ from: selectionRange.from, to: selectionRange.to }, aiText)
        ?.run();

      setStatus('success');
      setStatusMessage('Applied change to the document.');

      setTimeout(() => {
        closeAssistant();
      }, 800);
    } catch (error) {
      console.error('AI rewrite failed:', error);
      setStatus('error');
      setStatusMessage(
        error instanceof Error ? error.message : 'Failed to apply AI changes.'
      );
    }
  };

  const handleQuickAction = async (actionId: string, instruction: string) => {
    setActiveAction(actionId);
    await runInstruction(instruction);
  };

  const handleCustomInstruction = async () => {
    if (!customInstruction.trim()) {
      setStatus('error');
      setStatusMessage('Please enter a custom instruction.');
      return;
    }
    setActiveAction('custom');
    await runInstruction(customInstruction.trim());
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm ${
        isDarkMode ? 'text-gray-100' : 'text-gray-900'
      }`}
      role="dialog"
      aria-modal="true"
      onClick={closeAssistant}
    >
      <div
        className={`relative w-full max-w-2xl rounded-2xl border shadow-xl transition-colors ${
          isDarkMode
            ? 'border-gray-800 bg-gray-950'
            : 'border-gray-200 bg-white'
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/10">
              <Bot className="h-5 w-5 text-blue-500" />
            </span>
            <div>
              <h2 className="text-lg font-semibold">AI Rewrite Assistant</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Selected {trimmedSelection.length} characters
              </p>
            </div>
          </div>
          <button
            onClick={closeAssistant}
            className="rounded-full p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-4">
          <div
            className={`max-h-40 overflow-y-auto rounded-lg border px-4 py-3 text-sm leading-relaxed ${
              isDarkMode
                ? 'border-gray-800 bg-gray-900 text-gray-200'
                : 'border-gray-200 bg-gray-50 text-gray-800'
            }`}
          >
            {trimmedSelection || 'No text selected.'}
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400">
              Quick actions
            </h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.id}
                  onClick={() => handleQuickAction(action.id, action.instruction)}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm font-medium transition ${
                    activeAction === action.id && status === 'loading'
                      ? 'border-blue-500 bg-blue-500/10 text-blue-500'
                      : isDarkMode
                      ? 'border-gray-800 bg-gray-900 text-gray-200 hover:border-gray-700 hover:bg-gray-800'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-100'
                  }`}
                  disabled={status === 'loading'}
                >
                  <span>{action.label}</span>
                  <Sparkles className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <label className="text-sm font-semibold text-gray-600 dark:text-gray-300">
              Custom instruction
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={customInstruction}
                onChange={(event) => setCustomInstruction(event.target.value)}
                placeholder="e.g., Rewrite this in a persuasive tone for executives"
                className={`flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  isDarkMode
                    ? 'border-gray-800 bg-gray-900 text-gray-200 placeholder-gray-500'
                    : 'border-gray-200 bg-white text-gray-800 placeholder-gray-500'
                }`}
                disabled={status === 'loading'}
              />
              <button
                onClick={handleCustomInstruction}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
                disabled={status === 'loading'}
              >
                {status === 'loading' && activeAction === 'custom' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Apply
              </button>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 px-6 py-3 text-sm dark:border-gray-800">
          {status === 'loading' && (
            <div className="flex items-center gap-2 text-blue-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{statusMessage || 'Processing selection...'}</span>
            </div>
          )}
          {status === 'success' && (
            <div className="flex items-center gap-2 text-emerald-500">
              <CheckCircle2 className="h-4 w-4" />
              <span>{statusMessage || 'Applied changes successfully.'}</span>
            </div>
          )}
          {status === 'error' && (
            <div className="text-red-500">{statusMessage || 'Something went wrong.'}</div>
          )}
          {status === 'idle' && (
            <div className="text-gray-500 dark:text-gray-400">
              Select text in the document, then choose an AI action to rewrite it instantly.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SelectionAiAssistant;
