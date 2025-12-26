import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Copy, Check, FileText, ChevronRight } from 'lucide-react';
import { useAppStore } from '../stores/simpleStore';

interface ChatSidebarProps {
  onResize?: (width: number) => void;
}

const ChatSidebar: React.FC<ChatSidebarProps> = ({ onResize }) => {
  const { ui, currentSession, messages, sendMessage, applySuggestion, createDocumentFromContent, updateUI } = useAppStore();
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Copy message content to clipboard
  const copyMessageToClipboard = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  // Apply content as suggestion
  const handleApplySuggestion = async (content: string) => {
    try {
      const suggestion = {
        type: 'content_replacement',
        content: content,
        description: 'Apply generated content'
      };
      await applySuggestion(suggestion);
    } catch (error) {
      console.error('Failed to apply suggestion:', error);
    }
  };

  // Parse message content to extract actionable sections
  const parseMessageContent = (content: string) => {
    const lines = content.split('\n');
    const sections: { type: string; content: string; lines: string[] }[] = [];
    let currentSection = { type: 'text', content: '', lines: [] as string[] };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.match(/^(Subject:|Dear |Hi |Thanks|Sincerely|Best regards|---)/i) || 
          line.includes('**') || 
          line.includes('Option') ||
          line.trim().startsWith('*')) {
        if (currentSection.content.trim()) {
          sections.push(currentSection);
        }
        currentSection = {
          type: line.includes('**Option') ? 'option' : 'actionable',
          content: line,
          lines: [line] as string[]
        };
      } else {
        currentSection.content += '\n' + line;
        currentSection.lines.push(line);
      }
    }
    if (currentSection.content.trim()) {
      sections.push(currentSection);
    }
    return sections;
  };

  // Render actionable content with a single Apply button per assistant message
  const renderMessageContent = (content: string, messageRole: string) => {
    if (messageRole !== 'assistant') {
      return <div className="whitespace-pre-wrap text-sm">{content}</div>;
    }
    const sections = parseMessageContent(content);
    const hasActionable = sections.some(s => s.type === 'actionable' && s.content.trim().length > 20) || sections.some(s => s.type === 'option');
    return (
      <div className="text-sm">
        {sections.map((section, index) => (
          <div key={index} className="mb-3">
            <div className="whitespace-pre-wrap">{section.content}</div>
          </div>
        ))}
        {hasActionable && (
            <div className="flex gap-2 mt-2">
            <button
              onClick={() => createDocumentFromContent(content, 'Leave_Application.docx')}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              <FileText className="h-3 w-3" />
              Apply
            </button>
            <button
              onClick={() => copyMessageToClipboard(content)}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
            >
              <Copy className="h-3 w-3" />
              Copy
            </button>
          </div>
        )}
      </div>
    );
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!message.trim() || isLoading) return;
    setIsLoading(true);
    try {
      await sendMessage(message.trim());
      setMessage('');
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className={`h-screen flex flex-col ${ui.isDarkMode ? 'bg-black border-gray-900' : 'bg-white border-gray-200'} border-l relative`}>
      {/* Collapse Button */}
      <button
        onClick={() => updateUI({ isRightSidebarCollapsed: true })}
        className={`absolute top-4 -left-3 z-10 p-1.5 rounded-full shadow-lg transition-colors ${
          ui.isDarkMode 
            ? 'bg-black hover:bg-gray-900 text-gray-300 border border-gray-800' 
            : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-300'
        }`}
        title="Collapse chat"
      >
        <ChevronRight className="h-4 w-4" />
      </button>

      {/* Header */}
      <div className={`flex-shrink-0 border-b p-4 ${ui.isDarkMode ? 'border-gray-900' : 'border-gray-200'}`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className={`text-lg font-semibold flex items-center ${ui.isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
              <Bot className="h-5 w-5 mr-2" />
              AI Assistant
            </h2>
            {currentSession && (
              <p className={`text-sm mt-1 ${ui.isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                Session: {currentSession.name || 'Untitled'}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className={`text-center ${ui.isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
              <Bot className={`h-12 w-12 mx-auto mb-4 ${ui.isDarkMode ? 'text-gray-700' : 'text-gray-300'}`} />
              <p>Start a conversation with the AI assistant</p>
              {!currentSession && (
                <p className="text-sm mt-2">Create or select a session to begin</p>
              )}
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex items-start space-x-3 ${
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {msg.role === 'assistant' && (
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    ui.isDarkMode ? 'bg-blue-950 border border-gray-800' : 'bg-blue-100'
                  }`}>
                    <Bot className={`h-5 w-5 ${ui.isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                  </div>
                )}
                <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg group relative ${
                  msg.role === 'user'
                    ? ui.isDarkMode
                      ? 'bg-blue-950 text-gray-100 border border-blue-900'
                      : 'bg-blue-500 text-white'
                    : ui.isDarkMode
                      ? 'bg-gray-900 text-gray-200 border border-gray-800'
                      : 'bg-gray-100 text-gray-900'
                }`}>
                  {renderMessageContent(msg.content, msg.role)}
                  <button
                    onClick={() => copyMessageToClipboard(msg.content)}
                    className={`absolute top-1 right-1 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
                      msg.role === 'user'
                        ? ui.isDarkMode
                          ? 'hover:bg-blue-900'
                          : 'hover:bg-blue-600'
                        : ui.isDarkMode
                          ? 'hover:bg-gray-800'
                          : 'hover:bg-gray-200'
                    }`}
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                  {msg.timestamp && (
                    <div className={`text-xs mt-1 ${
                      msg.role === 'user'
                        ? ui.isDarkMode
                          ? 'text-gray-400'
                          : 'text-blue-100'
                        : ui.isDarkMode
                          ? 'text-gray-500'
                          : 'text-gray-500'
                    }`}>
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </div>
                  )}
                </div>
                {msg.role === 'user' && (
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    ui.isDarkMode ? 'bg-green-950 border border-gray-800' : 'bg-green-100'
                  }`}>
                    <User className={`h-5 w-5 ${ui.isDarkMode ? 'text-green-400' : 'text-green-600'}`} />
                  </div>
                )}
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex items-start space-x-3">
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                ui.isDarkMode ? 'bg-blue-950 border border-gray-800' : 'bg-blue-100'
              }`}>
                <Bot className={`h-5 w-5 ${ui.isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
              </div>
              <div className={`px-4 py-2 rounded-lg border ${
                ui.isDarkMode ? 'bg-gray-900 text-gray-200 border-gray-800' : 'bg-gray-100 text-gray-900'
              }`}>
                <div className="flex space-x-1">
                  <div className="w-2 h-2 rounded-full bg-current animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 rounded-full bg-current animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 rounded-full bg-current animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>
      {/* Input Area */}
      <div className={`flex-shrink-0 border-t p-4 ${ui.isDarkMode ? 'border-gray-800' : 'border-gray-200'}`}>
        <div className="flex space-x-2">
          <div className="flex-1">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={currentSession ? "Type your message..." : "Select a session first..."}
              disabled={!currentSession || isLoading}
              className={`w-full resize-none rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent max-h-32 ${
                ui.isDarkMode
                  ? 'border-gray-800 bg-black text-gray-200 placeholder-gray-600'
                  : 'border-gray-300 bg-white text-gray-900 placeholder-gray-500'
              } ${(!currentSession || isLoading) ? 'opacity-50 cursor-not-allowed' : ''}`}
              rows={1}
            />
          </div>
          <button
            onClick={handleSendMessage}
            disabled={!message.trim() || !currentSession || isLoading}
            className="flex-shrink-0 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        {!currentSession && (
          <p className={`text-xs mt-2 ${ui.isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
            Create or select a session to start chatting
          </p>
        )}
      </div>
    </div>
  );
};

export default ChatSidebar;
