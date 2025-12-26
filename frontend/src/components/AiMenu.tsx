import React, { useState } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import { showAIMenuState, isDarkModeState } from '../stores/recoilState';
import { useAppStore } from '../stores/simpleStore';
import { X, Send, Bot } from 'lucide-react';

const AiMenu: React.FC = () => {
  const [show, setShow] = useRecoilState(showAIMenuState);
  const isDark = useRecoilValue(isDarkModeState);
  const { sendMessage, currentSession } = useAppStore();
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);

  if (!show) return null;

  const handleClose = () => setShow(false);

  const handleSend = async () => {
    if (!prompt.trim() || !currentSession) return;
    setLoading(true);
    try {
      await sendMessage(prompt.trim());
      setPrompt('');
      // keep menu open so user can continue interacting
    } catch (err) {
      console.error('AI request failed', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`fixed bottom-6 right-6 z-50 w-[380px] max-w-[95%] rounded-lg shadow-lg transition-all ${isDark ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900'}`}>
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-blue-500" />
          <div className="text-sm font-medium">AI Assistant</div>
        </div>
        <button onClick={handleClose} title="Close" className="p-1">
          <X className={`h-4 w-4 ${isDark ? 'text-gray-300' : 'text-gray-700'}`} />
        </button>
      </div>
      <div className="p-3">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={currentSession ? 'Ask the AI to edit or generate content...' : 'Select a session first'}
          className={`w-full min-h-[80px] rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDark ? 'border-gray-800 bg-black text-gray-200' : 'border-gray-200 bg-white text-gray-900'}`}
          disabled={!currentSession || loading}
        />

        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            onClick={() => setPrompt('')}
            disabled={loading}
            className="rounded-md px-3 py-1 text-sm text-gray-500 hover:bg-gray-100 disabled:opacity-50"
          >
            Clear
          </button>

          <button
            onClick={handleSend}
            disabled={!prompt.trim() || !currentSession || loading}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {loading ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AiMenu;
