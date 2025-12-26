import React from 'react';
import { Toaster } from 'react-hot-toast';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import ChatSidebar from './components/ChatSidebar';
import { useAppStore } from './stores/simpleStore';

function App() {
  const { ui, updateUI } = useAppStore();

  const handleLeftResize = (newWidth: number) => {
    updateUI({ leftSidebarWidth: newWidth });
  };

  const handleRightResize = (newWidth: number) => {
    updateUI({ rightSidebarWidth: newWidth });
  };

  return (
    <div className="h-screen flex bg-gray-100">
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#363636',
            color: '#fff',
          },
        }}
      />
      
      {/* Left Sidebar */}
      {!ui.isLeftSidebarCollapsed && (
        <div 
          className="flex-shrink-0"
          style={{ width: ui.leftSidebarWidth }}
        >
          <Sidebar onResize={handleLeftResize} />
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 min-w-0">
        <MainContent />
      </div>

      {/* Right Sidebar */}
      {!ui.isRightSidebarCollapsed && (
        <div 
          className="flex-shrink-0"
          style={{ width: ui.rightSidebarWidth }}
        >
          <ChatSidebar onResize={handleRightResize} />
        </div>
      )}
    </div>
  );
}

export default App;
