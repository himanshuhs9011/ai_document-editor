import React, { useState } from 'react';
import { Plus, Calendar, Trash2, MessageSquare } from 'lucide-react';
import { useAppStore } from '../stores/simpleStore';

interface SidebarProps {
  onResize?: (width: number) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onResize }) => {
  const { 
    sessions, 
    currentSession, 
    setCurrentSession, 
    createNewSession, 
    deleteSession,
    loadSessions
  } = useAppStore();
  
  const [newSessionName, setNewSessionName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  React.useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSessionName.trim()) return;

    setIsCreating(true);
    await createNewSession(newSessionName.trim());
    setNewSessionName('');
    setIsCreating(false);
  };

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this session?')) {
      await deleteSession(sessionId);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 1) {
      return 'Just now';
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h ago`;
    } else if (diffInHours < 48) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString();
    }
  };

  return (
    <div className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 p-4">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center">
          <MessageSquare className="h-5 w-5 mr-2" />
          Sessions
        </h2>
      </div>

      {/* New Session Form */}
      <div className="p-4 border-b border-gray-200">
        <form onSubmit={handleCreateSession} className="space-y-2">
          <input
            type="text"
            value={newSessionName}
            onChange={(e) => setNewSessionName(e.target.value)}
            placeholder="New session name..."
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
          <button
            type="submit"
            disabled={!newSessionName.trim() || isCreating}
            className="w-full flex items-center justify-center px-3 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="h-4 w-4 mr-1" />
            {isCreating ? 'Creating...' : 'New Session'}
          </button>
        </form>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            <MessageSquare className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p className="text-sm">No sessions yet</p>
            <p className="text-xs text-gray-400 mt-1">
              Create your first session to get started
            </p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {sessions.map((session) => (
              <div
                key={session.id}
                onClick={() => setCurrentSession(session)}
                className={`group relative p-3 rounded-lg cursor-pointer transition-colors ${
                  currentSession?.id === session.id
                    ? 'bg-blue-100 border border-blue-200'
                    : 'hover:bg-white hover:shadow-sm border border-transparent'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-gray-900 truncate">
                      {session.name}
                    </h3>
                    <div className="flex items-center mt-1 text-xs text-gray-500">
                      <Calendar className="h-3 w-3 mr-1" />
                      {formatDate(session.created_at)}
                    </div>
                  </div>
                  
                  <button
                    onClick={(e) => handleDeleteSession(session.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-opacity"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                
                {currentSession?.id === session.id && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 rounded-r-sm"></div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 p-4">
        <div className="text-xs text-gray-500 text-center">
          {sessions.length} session{sessions.length !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
