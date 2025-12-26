import React, { useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import DocumentToolbar from './components/DocumentToolbar';
import ChatSidebar from './components/ChatSidebar_New';
import SelectionAiAssistant from './components/SelectionAiAssistant';
import { useAppStore } from './stores/simpleStore';

function App() {
  const { ui, updateUI } = useAppStore();

  // Handle responsive sidebar behavior based on screen size
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      
      // Auto-collapse sidebars on smaller screens
      if (width < 768) {
        // On mobile, collapse both sidebars - chat input will appear at bottom
        updateUI({ 
          isLeftSidebarCollapsed: true, 
          isRightSidebarCollapsed: true 
        });
      } else if (width < 1024) {
        // On tablets, collapse both sidebars by default
        updateUI({ 
          isLeftSidebarCollapsed: true, 
          isRightSidebarCollapsed: true 
        });
      } else if (width < 1280) {
        // On smaller laptops, show left sidebar only
        updateUI({ 
          isLeftSidebarCollapsed: false, 
          isRightSidebarCollapsed: true 
        });
      }
      // On larger screens (>= 1280px), keep user preference
    };

    // Run on mount
    handleResize();

    // Add resize listener
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => window.removeEventListener('resize', handleResize);
  }, [updateUI]);

  const handleLeftResize = (newWidth: number) => {
    updateUI({ leftSidebarWidth: newWidth });
  };

  const handleRightResize = (newWidth: number) => {
    updateUI({ rightSidebarWidth: newWidth });
  };

  return (
    <div className={`h-screen flex overflow-hidden ${ui.isDarkMode ? 'bg-black' : 'bg-gray-100'}`}>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: ui.isDarkMode ? '#000000' : '#363636',
            color: '#fff',
          },
        }}
      />
      
      {/* Left Sidebar - Sessions */}
      {/* Desktop: inline sidebar */}
      <div 
        className={`hidden lg:block flex-shrink-0 overflow-hidden transition-all duration-500 ease-in-out ${
          ui.isLeftSidebarCollapsed ? 'w-0 opacity-0' : 'opacity-100'
        }`}
        style={{ 
          width: ui.isLeftSidebarCollapsed ? 0 : Math.min(ui.leftSidebarWidth, window.innerWidth * 0.3),
          minWidth: ui.isLeftSidebarCollapsed ? 0 : '250px',
          transform: ui.isLeftSidebarCollapsed ? 'translateX(-100%)' : 'translateX(0)',
          animation: ui.isLeftSidebarCollapsed ? 'slideOutLeft 0.4s ease-in-out' : 'slideInLeft 0.4s ease-in-out'
        }}
      >
        <div className="h-full" style={{ width: '250px', minWidth: '250px' }}>
          <Sidebar onResize={handleLeftResize} />
        </div>
      </div>

      {/* Mobile: Left sidebar as overlay */}
      {!ui.isLeftSidebarCollapsed && (
        <>
          <div 
            className="lg:hidden fixed inset-0 z-40 bg-black transition-opacity duration-300 ease-in-out"
            style={{ opacity: 0.5 }}
            onClick={() => updateUI({ isLeftSidebarCollapsed: true })} 
          />
          <div 
            className="lg:hidden fixed inset-y-0 left-0 z-50 w-72 sm:w-80"
          >
            <Sidebar onResize={handleLeftResize} />
          </div>
        </>
      )}

      {/* Center Stack: toolbar + main content */}
      <div className="flex-1 min-w-0 transition-all duration-500 ease-in-out">
        <div className="flex h-full flex-col">
          <DocumentToolbar />
          <div className="flex-1 min-h-0 overflow-hidden">
            <MainContent />
          </div>
        </div>
      </div>

      {/* Right Sidebar (Chat) - Animated slide in/out */}
      {!ui.isRightSidebarCollapsed && (
        <>
          {/* Mobile: Fixed overlay with fade animation */}
          <div 
            className="lg:hidden fixed inset-0 z-40 bg-black transition-opacity duration-300 ease-in-out overlay-enter"
            style={{
              opacity: 0.5
            }}
            onClick={() => updateUI({ isRightSidebarCollapsed: true })} 
          />
          <div 
            className="lg:relative fixed inset-y-0 right-0 z-50 flex-shrink-0 w-full sm:w-96 lg:w-auto chat-sidebar-enter"
            style={{ 
              width: window.innerWidth >= 1024 ? Math.min(ui.rightSidebarWidth, window.innerWidth * 0.35) : undefined,
              minWidth: window.innerWidth >= 1024 ? '300px' : undefined
            }}
          >
            <ChatSidebar onResize={handleRightResize} />
          </div>
        </>
      )}
      <SelectionAiAssistant />
    </div>
  );
}



export default App;
