import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2 } from 'lucide-react';
import { useAppStore } from '../stores/appStore';

interface ChatSidebarProps {
  onResize: (width: number) => void;
}

const ChatSidebar: React.FC<ChatSidebarProps> = ({ onResize }) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const { 
    currentDocument, 
    currentSession,
    messages, 
    sendMessage, 
    isTyping,
    createNewSession 
  } = useAppStore();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isTyping) return;

    // Create session if none exists
    if (!currentSession && currentDocument) {
      createNewSession(currentDocument.id);
    }

    if (!currentSession) {
      return;
    }

    const message = input.trim();
    setInput('');
    
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    await sendMessage(message);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    
    // Auto-resize textarea
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  };

  const formatMessage = (content: string) => {
    return content.split('\n').map((line, index) => (
      <React.Fragment key={index}>
        {line}
        {index < content.split('\n').length - 1 && <br />}
      </React.Fragment>
    ));
  };

  return (
    <div className="h-full flex flex-col bg-vscode-sidebar">
      {/* Header */}
      <div className="p-4 border-b border-vscode-border">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-vscode-accent" />
          <h2 className="text-sm font-semibold text-vscode-text">AI Assistant</h2>
        </div>
        {currentDocument && (
          <p className="text-xs text-vscode-textSecondary mt-1">
            Chatting about: {currentDocument.filename}
          </p>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!currentDocument ? (
          <div className="text-center text-vscode-textSecondary text-sm">
            Upload a document to start chatting
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-vscode-textSecondary text-sm">
            <Bot className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>Start a conversation about your document</p>
            <p className="text-xs mt-1">Ask questions, request edits, or get summaries</p>
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={index}
              className={`flex gap-3 ${
                message.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {message.role === 'assistant' && (
                <div className="w-6 h-6 rounded-full bg-vscode-accent flex items-center justify-center flex-shrink-0 mt-1">
                  <Bot className="w-3 h-3 text-white" />
                </div>
              )}
              
              <div
                className={`max-w-[80%] rounded-lg p-3 text-sm ${
                  message.role === 'user'
                    ? 'bg-vscode-accent text-white'
                    : 'bg-vscode-border text-vscode-text'
                }`}
              >
                <div className="whitespace-pre-wrap">
                  {formatMessage(message.content)}
                </div>
                <div className="text-xs opacity-70 mt-1">
                  {new Date(message.timestamp).toLocaleTimeString()}
                </div>
              </div>

              {message.role === 'user' && (
                <div className="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center flex-shrink-0 mt-1">
                  <User className="w-3 h-3 text-white" />
                </div>
              )}
            </div>
          ))
        )}

        {/* Typing indicator */}
        {isTyping && (
          <div className="flex gap-3 justify-start">
            <div className="w-6 h-6 rounded-full bg-vscode-accent flex items-center justify-center flex-shrink-0 mt-1">
              <Bot className="w-3 h-3 text-white" />
            </div>
            <div className="bg-vscode-border text-vscode-text rounded-lg p-3 text-sm">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>AI is thinking...</span>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-vscode-border p-4">
        <form onSubmit={handleSubmit} className="space-y-2">
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyPress={handleKeyPress}
              placeholder={
                currentDocument 
                  ? "Ask about the document, request edits, or get a summary..."
                  : "Upload a document first to start chatting"
              }
              disabled={!currentDocument || isTyping}
              className="w-full textarea-field resize-none min-h-[40px] max-h-[120px] pr-10"
              rows={1}
            />
            <button
              type="submit"
              disabled={!input.trim() || !currentDocument || isTyping}
              className="absolute right-2 top-2 p-1 text-vscode-accent hover:text-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          
          <div className="text-xs text-vscode-textSecondary">
            Press Enter to send, Shift+Enter for new line
          </div>
        </form>

        {/* Quick actions */}
        {currentDocument && messages.length === 0 && (
          <div className="mt-3 space-y-1">
            <p className="text-xs text-vscode-textSecondary mb-2">Quick actions:</p>
            <div className="grid grid-cols-1 gap-1">
              {[
                "Summarize this document",
                "What are the key points?",
                "Make this more concise",
                "Improve the writing style"
              ].map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => setInput(suggestion)}
                  className="text-left text-xs p-2 rounded bg-vscode-border hover:bg-vscode-hover text-vscode-text transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatSidebar;
