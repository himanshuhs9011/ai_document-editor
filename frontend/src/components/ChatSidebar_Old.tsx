import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Lightbulb, Check, X, Edit3 } from 'lucide-react';
import { useAppStore } from '../stores/simpleStore';
import { API_BASE_URL } from '../config/api';

interface ChatSidebarProps {
  onResize?: (width: number) => void;
}

interface AIResponse {
  suggestions?: Array<{
    type: string;
    original_text: string;
    new_text: string;
    position: any;
    confidence: number;
    explanation: string;
  }>;
  summary?: string;
}

const formatAIResponse = (content: string, suggestions?: any[]) => {
  // If we have suggestions in the message object, use them for structured display
  if (suggestions && suggestions.length > 0) {
    return { type: 'structured', data: { suggestions, summary: content } };
  }
  
  // Try to parse as JSON for backward compatibility
  try {
    const parsed: AIResponse = JSON.parse(content);
    if (parsed.suggestions) {
      return { type: 'structured', data: parsed };
    }
  } catch (e) {
    // Not JSON, return as regular text
  }
  
  // Return as normal text with formatting
  return { type: 'text', data: content };
};

const SuggestionCard: React.FC<{ suggestion: any; index: number }> = ({ suggestion, index }) => {
  const [isApplied, setIsApplied] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const { currentDocument, applySuggestion } = useAppStore();
  
  const handleApplySuggestion = async () => {
    if (!currentDocument || isApplying) return;
    
    setIsApplying(true);
    try {
      // Apply the suggestion using the store
      const success = await applySuggestion(suggestion);
      if (success) {
        setIsApplied(true);
      }
    } catch (error) {
      console.error('Failed to apply suggestion:', error);
    } finally {
      setIsApplying(false);
    }
  };
  
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'replace': return <Edit3 className="h-4 w-4 text-blue-500" />;
      case 'delete': return <X className="h-4 w-4 text-red-500" />;
      case 'insert': return <Check className="h-4 w-4 text-green-500" />;
      default: return <Edit3 className="h-4 w-4 text-gray-500" />;
    }
  };

  const getTypeBg = (type: string) => {
    switch (type) {
      case 'replace': return 'bg-blue-50 border-blue-200';
      case 'delete': return 'bg-red-50 border-red-200';
      case 'insert': return 'bg-green-50 border-green-200';
      default: return 'bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className={`border rounded-lg p-3 mb-3 suggestion-card ${getTypeBg(suggestion.type)}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          {getTypeIcon(suggestion.type)}
          <span className="text-sm font-medium capitalize">{suggestion.type}</span>
          <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded">
            {Math.round(suggestion.confidence * 100)}% confidence
          </span>
        </div>
        <button
          onClick={handleApplySuggestion}
          disabled={isApplied || isApplying}
          className={`text-xs px-2 py-1 rounded transition-colors ${
            isApplied 
              ? 'bg-green-100 text-green-700 cursor-not-allowed' 
              : isApplying
              ? 'bg-yellow-100 text-yellow-700 cursor-wait'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer'
          }`}
        >
          {isApplying ? 'Applying...' : isApplied ? 'Applied ✓' : 'Apply'}
        </button>
      </div>
      
      {suggestion.original_text && (
        <div className="mb-2">
          <span className="text-xs text-gray-500 font-medium">Original:</span>
          <div className="text-sm bg-white p-2 rounded border mt-1 line-through text-gray-500">
            "{suggestion.original_text}"
          </div>
        </div>
      )}
      
      {suggestion.new_text && (
        <div className="mb-2">
          <span className="text-xs text-gray-500 font-medium">Suggested:</span>
          <div className="text-sm bg-white p-2 rounded border mt-1 text-green-700">
            "{suggestion.new_text}"
          </div>
        </div>
      )}
      
      <div className="text-xs text-gray-600 italic">
        {suggestion.explanation}
      </div>
    </div>
  );
};

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

  const handleApplyAllSuggestions = async (suggestions: any[]) => {
    if (!currentDocument) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/documents/${currentDocument.document_id}/apply-suggestions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(suggestions),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('All suggestions applied successfully:', result);
        // The individual suggestion cards will handle their own state updates
        // You might want to show a success notification here
      } else {
        console.error('Failed to apply all suggestions');
      }
    } catch (error) {
      console.error('Failed to apply all suggestions:', error);
    }
  };

  const handleExportModified = async () => {
    if (!currentDocument?.modified_document_id) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/documents/${currentDocument.modified_document_id}/export?format=pdf`, {
        method: 'POST',
      });

      if (response.ok) {
        // Create download link
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `modified_${currentDocument.filename.replace(/\.[^/.]+$/, "")}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        console.error('Failed to export modified document');
      }
    } catch (error) {
      console.error('Failed to export modified document:', error);
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
    <div className="w-96 bg-white border-l border-gray-200 flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Bot className="h-6 w-6 text-blue-500" />
            <h2 className="text-lg font-semibold text-gray-900">AI Assistant</h2>
          </div>
          {currentDocument?.modified_document_id && (
            <button
              onClick={handleExportModified}
              className="text-xs px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
            >
              Export Modified
            </button>
          )}
        </div>
        {currentDocument && (
          <p className="text-sm text-gray-500 mt-1">
            Analyzing: {currentDocument.filename}
            {currentDocument.modified_document_id && (
              <span className="ml-2 text-green-600 font-medium">(Modified)</span>
            )}
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
      <div className="flex-1 chat-messages">
        <div className="p-4 space-y-4">
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
                <div className="flex-1 min-w-0">
                  <div className={`rounded-lg p-3 ${
                    message.role === 'user'
                      ? 'bg-blue-500 text-white ml-8'
                      : 'bg-gray-100 text-gray-900'
                  }`}>
                    {message.role === 'assistant' ? (
                      (() => {
                        const formatted = formatAIResponse(message.content, message.suggestions);
                        if (formatted.type === 'structured') {
                          const data = formatted.data as AIResponse;
                          return (
                            <div>
                              {data.summary && (
                                <div className="mb-4 p-3 bg-blue-50 rounded border">
                                  <h4 className="font-medium text-blue-900 mb-1">AI Analysis</h4>
                                  <div className="text-sm text-blue-800 whitespace-pre-wrap">{data.summary}</div>
                                </div>
                              )}
                              {data.suggestions && (
                                <div>
                                  <div className="flex items-center justify-between mb-3">
                                    <h4 className="font-medium flex items-center">
                                      <Lightbulb className="h-4 w-4 mr-1" />
                                      Apply Changes ({data.suggestions.length})
                                    </h4>
                                    {data.suggestions.length > 1 && (
                                      <button
                                        onClick={() => handleApplyAllSuggestions(data.suggestions || [])}
                                        className="text-xs px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                                      >
                                        Apply All
                                      </button>
                                    )}
                                  </div>
                                  {data.suggestions.map((suggestion, index) => (
                                    <SuggestionCard key={index} suggestion={suggestion} index={index} />
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        } else {
                          // Display as formatted normal text response
                          return (
                            <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                              {String(formatted.data)}
                            </div>
                          );
                        }
                        return <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>;
                      })()
                    ) : (
                      <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                    )}
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
