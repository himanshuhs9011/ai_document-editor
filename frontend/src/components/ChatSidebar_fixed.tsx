import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Lightbulb } from 'lucide-react';
import { useAppStore } from '../stores/simpleStore';

interface ChatSidebarProps {
  onResize?: (width: number) => void;
}

const ChatSidebar: React.FC<ChatSidebarProps> = ({ onResize }) => {
  const { 
    messages, 
    isTyping, 
    currentDocument,
    sendMessage 
  } = useAppStore();
  
  const [inputValue, setInputValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isTyping) return;

    const message = inputValue.trim();
    setInputValue('');
    await sendMessage(message);
  };

  const handleQuickAction = (action: string) => {
    const quickMessages = {
      'improve': 'Please improve the readability and structure of this document.',
      'summarize': 'Can you provide a summary of this document?',
      'grammar': 'Please check and fix any grammar issues in this document.',
      'format': 'Help me format this document better with proper headings and structure.'
    };
    
    const message = quickMessages[action as keyof typeof quickMessages];
    if (message) {
      setInputValue(message);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [inputValue]);

  return (
    <div className="w-80 bg-white border-l border-gray-200 flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 p-4">
        <div className="flex items-center space-x-2">
          <Bot className="h-6 w-6 text-blue-500" />
          <h2 className="text-lg font-semibold text-gray-900">AI Assistant</h2>
        </div>
        {currentDocument && (
          <p className="text-sm text-gray-500 mt-1">
            Analyzing: {currentDocument.filename}
          </p>
        )}
      </div>

      {/* Quick Actions */}
      {currentDocument && (
        <div className="border-b border-gray-200 p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleQuickAction('improve')}
              className="p-2 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100 text-left"
            >
              <Lightbulb className="h-3 w-3 inline mr-1" />
              Improve
            </button>
            <button
              onClick={() => handleQuickAction('summarize')}
              className="p-2 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100 text-left"
            >
              📄 Summary
            </button>
            <button
              onClick={() => handleQuickAction('grammar')}
              className="p-2 text-xs bg-yellow-50 text-yellow-700 rounded hover:bg-yellow-100 text-left"
            >
              ✓ Grammar
            </button>
            <button
              onClick={() => handleQuickAction('format')}
              className="p-2 text-xs bg-purple-50 text-purple-700 rounded hover:bg-purple-100 text-left"
            >
              🎨 Format
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <Bot className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p className="text-sm">
              {currentDocument 
                ? "Start a conversation about your document!"
                : "Upload a document to start chatting with AI"
              }
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <div key={message.id} className="flex space-x-3">
              <div className="flex-shrink-0">
                {message.role === 'user' ? (
                  <User className="h-6 w-6 text-gray-600" />
                ) : (
                  <Bot className="h-6 w-6 text-blue-500" />
                )}
              </div>
              <div className="flex-1">
                <div className={`rounded-lg p-3 ${
                  message.role === 'user'
                    ? 'bg-blue-500 text-white ml-8'
                    : 'bg-gray-100 text-gray-900'
                }`}>
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {new Date(message.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))
        )}
        
        {isTyping && (
          <div className="flex space-x-3">
            <Bot className="h-6 w-6 text-blue-500 flex-shrink-0" />
            <div className="bg-gray-100 rounded-lg p-3">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 p-4">
        <form onSubmit={handleSubmit} className="space-y-2">
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={currentDocument ? "Ask about your document..." : "Upload a document first..."}
              disabled={!currentDocument || isTyping}
              className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 min-h-[40px] max-h-32"
              rows={1}
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || !currentDocument || isTyping}
              className="absolute right-2 bottom-2 p-1 text-blue-500 hover:text-blue-600 disabled:text-gray-400 disabled:cursor-not-allowed"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Press Enter to send, Shift+Enter for new line
          </p>
        </form>
      </div>
    </div>
  );
};

export default ChatSidebar;
