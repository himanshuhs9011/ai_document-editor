import React, { useEffect } from 'react';
import { MessageSquare, FileText, Clock, Plus, Trash2 } from 'lucide-react';
import { useAppStore } from '../stores/appStore';

interface SidebarProps {
  onResize: (width: number) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onResize }) => {
  const { 
    sessions, 
    currentSession, 
    currentDocument,
    setCurrentSession, 
    loadSessions, 
    createNewSession,
    isLoading 
  } = useAppStore();

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleSessionSelect = (session: any) => {
    setCurrentSession(session);
  };

  const handleNewSession = () => {
    createNewSession(currentDocument?.id);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInDays === 0) {
      return 'Today';
    } else if (diffInDays === 1) {
      return 'Yesterday';
    } else if (diffInDays < 7) {
      return `${diffInDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  return (
    <div className="h-full flex flex-col bg-vscode-sidebar">
      {/* Header */}
      <div className="p-4 border-b border-vscode-border">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-vscode-text">Chat Sessions</h2>
          <button
            onClick={handleNewSession}
            disabled={!currentDocument}
            className="p-1 text-vscode-accent hover:text-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
            title="New Chat Session"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        {currentDocument && (
          <p className="text-xs text-vscode-textSecondary mt-1">
            Document: {currentDocument.filename}
          </p>
        )}
      </div>

      {/* Session List */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-4 text-center text-vscode-textSecondary text-sm">
            <div className="loading-spinner w-4 h-4 border-2 border-vscode-accent border-t-transparent rounded-full mx-auto mb-2"></div>
            Loading sessions...
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-4 text-center text-vscode-textSecondary text-sm">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No chat sessions yet</p>
            <p className="text-xs mt-1">Upload a document and start chatting</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {sessions.map((session) => (
              <div
                key={session.id}
                onClick={() => handleSessionSelect(session)}
                className={`
                  p-3 rounded cursor-pointer transition-colors group
                  ${currentSession?.id === session.id 
                    ? 'bg-vscode-active text-vscode-text' 
                    : 'hover:bg-vscode-hover text-vscode-textSecondary hover:text-vscode-text'
                  }
                `}
              >
                <div className="flex items-start gap-2">
                  <MessageSquare className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 mb-1">
                      <Clock className="w-3 h-3" />
                      <span className="text-xs">
                        {formatDate(session.lastAccessed)}
                      </span>
                    </div>
                    
                    {session.documentId && (
                      <div className="flex items-center gap-1 mb-1">
                        <FileText className="w-3 h-3" />
                        <span className="text-xs truncate">
                          {session.documentId}
                        </span>
                      </div>
                    )}
                    
                    <div className="text-xs opacity-75">
                      Session {session.id.slice(-6)}
                    </div>
                  </div>
                  
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      // TODO: Implement delete session
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-300 transition-opacity"
                    title="Delete Session"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="border-t border-vscode-border p-3">
        <div className="text-xs text-vscode-textSecondary space-y-1">
          <div className="flex items-center justify-between">
            <span>Sessions:</span>
            <span>{sessions.length}</span>
          </div>
          {currentSession && (
            <div className="flex items-center justify-between">
              <span>Current:</span>
              <span className="text-vscode-accent">
                {currentSession.id.slice(-6)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
