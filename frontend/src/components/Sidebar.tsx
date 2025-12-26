import React, { useState } from 'react';
import { Plus, Calendar, Trash2, MessageSquare, ChevronLeft, LogOut, User, Moon, Sun } from 'lucide-react';
import { useAppStore } from '../stores/simpleStore';
import { useAuthStore } from '../stores/authStore';
import { useNavigate } from 'react-router-dom';

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
    loadSessions,
    initializeCurrentSession,
    ui,
    updateUI
  } = useAppStore();
  
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  
  const [newSessionName, setNewSessionName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleLogout = () => {
    if (confirm('Are you sure you want to logout?')) {
      logout();
      navigate('/login');
    }
  };

  React.useEffect(() => {
    const initialized = { current: false } as { current: boolean };
    const initializeApp = async () => {
      if (initialized.current) return;
      initialized.current = true;
      await loadSessions();
      await initializeCurrentSession();
    };
    initializeApp();
  }, [loadSessions, initializeCurrentSession]);

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
      // If the deleted session was active, re-initialize session selection
      if (currentSession?.id === sessionId) {
        await initializeCurrentSession();
      }
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
    <div className={`h-screen flex flex-col ${ui.isDarkMode ? 'bg-black border-gray-900' : 'bg-gray-50 border-gray-200'} border-r relative`}>
      {/* Collapse Button */}
      <button
        onClick={() => updateUI({ isLeftSidebarCollapsed: true })}
        className={`btn-collapse absolute top-4 -right-3 z-10 p-1.5 rounded-full shadow-lg transition-all duration-300 ease-in-out hover:scale-110 active:scale-95 ${
          ui.isDarkMode 
            ? 'bg-black hover:bg-gray-900 text-gray-300 border border-gray-800' 
            : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-300'
        }`}
        title="Collapse sidebar"
      >
        <ChevronLeft className="h-4 w-4 transition-transform duration-300" />
      </button>

      {/* Header - Fixed */}
      <div className={`flex-shrink-0 border-b p-4 ${ui.isDarkMode ? 'border-gray-900' : 'border-gray-200'}`}>
        <h2 className={`text-lg font-semibold flex items-center ${ui.isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
          <MessageSquare className="h-5 w-5 mr-2" />
          Sessions
        </h2>
      </div>

      {/* New Session Form - Fixed */}
      <div className={`flex-shrink-0 p-4 border-b ${ui.isDarkMode ? 'border-gray-900' : 'border-gray-200'}`}>
        <form onSubmit={handleCreateSession} className="space-y-2">
          <input
            type="text"
            value={newSessionName}
            onChange={(e) => setNewSessionName(e.target.value)}
            placeholder="New session name..."
            className={`w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${
              ui.isDarkMode 
                ? 'border-gray-800 bg-black text-gray-200 placeholder-gray-600' 
                : 'border-gray-300 bg-white text-gray-900 placeholder-gray-500'
            }`}
          />
          <button
            type="submit"
            disabled={!newSessionName.trim() || isCreating}
            className="w-full flex items-center justify-center px-3 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Plus className="h-4 w-4 mr-1" />
            {isCreating ? 'Creating...' : 'New Session'}
          </button>
        </form>
      </div>

      {/* Sessions List - Scrollable Area */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto px-2">
          {sessions.length === 0 ? (
            <div className={`p-4 text-center ${ui.isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
              <MessageSquare className={`h-12 w-12 mx-auto mb-4 ${ui.isDarkMode ? 'text-gray-700' : 'text-gray-300'}`} />
              <p className="text-sm">No sessions yet</p>
              <p className={`text-xs mt-1 ${ui.isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                Create your first session to get started
              </p>
            </div>
          ) : (
            <div className="py-2 space-y-1">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  onClick={async () => await setCurrentSession(session)}
                  className={`group relative p-3 rounded-lg cursor-pointer transition-colors ${
                    currentSession?.id === session.id
                      ? ui.isDarkMode 
                        ? 'bg-gray-900 border border-gray-800' 
                        : 'bg-blue-100 border border-blue-200'
                      : ui.isDarkMode
                        ? 'hover:bg-gray-900 hover:shadow-sm border border-transparent'
                        : 'hover:bg-white hover:shadow-sm border border-transparent'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className={`text-sm font-medium truncate ${
                        ui.isDarkMode ? 'text-gray-200' : 'text-gray-900'
                      }`}>
                        {session.name}
                      </h3>
                      <div className={`flex items-center mt-1 text-xs ${
                        ui.isDarkMode ? 'text-gray-500' : 'text-gray-500'
                      }`}>
                        <Calendar className="h-3 w-3 mr-1" />
                        {formatDate(session.created_at)}
                      </div>
                    </div>
                    
                    <button
                      onClick={(e) => handleDeleteSession(session.id, e)}
                      className={`opacity-0 group-hover:opacity-100 p-1 transition-opacity ${
                        ui.isDarkMode 
                          ? 'text-gray-600 hover:text-red-400' 
                          : 'text-gray-400 hover:text-red-500'
                      }`}
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
      </div>

      {/* Footer - Fixed with User Profile */}
      <div className={`flex-shrink-0 border-t ${ui.isDarkMode ? 'border-gray-900' : 'border-gray-200'}`}>
        {/* User Profile */}
        <div className={`p-3 border-b ${ui.isDarkMode ? 'border-gray-900' : 'border-gray-200'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3 flex-1 min-w-0">
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                ui.isDarkMode ? 'bg-gray-900 text-gray-400' : 'bg-gray-200 text-gray-600'
              }`}>
                <User className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${
                  ui.isDarkMode ? 'text-gray-200' : 'text-gray-900'
                }`}>
                  {user?.full_name || user?.username}
                </p>
                <p className={`text-xs truncate ${
                  ui.isDarkMode ? 'text-gray-500' : 'text-gray-500'
                }`}>
                  {user?.email}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2 flex-shrink-0">
              {/* Dark Mode Toggle */}
              <button
                onClick={() => updateUI({ isDarkMode: !ui.isDarkMode })}
                className={`p-1.5 rounded-md transition-colors ${
                  ui.isDarkMode 
                    ? 'text-gray-500 hover:text-gray-300 hover:bg-gray-900' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
                title={ui.isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {ui.isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              
              {/* Logout Button */}
              <button
                onClick={handleLogout}
                className={`p-1.5 rounded-md transition-colors ${
                  ui.isDarkMode 
                    ? 'text-gray-500 hover:text-red-400 hover:bg-gray-900' 
                    : 'text-gray-600 hover:text-red-600 hover:bg-gray-100'
                }`}
                title="Logout"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
        
        {/* Session Count */}
        <div className="p-4">
          <div className={`text-xs text-center ${ui.isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
            {sessions.length} session{sessions.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
