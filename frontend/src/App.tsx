import React, { useEffect, useRef } from 'react';
import { Toaster } from 'react-hot-toast';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import DocumentToolbar from './components/DocumentToolbar';
import ChatSidebar from './components/ChatSidebar';
import SelectionAiAssistant from './components/SelectionAiAssistant';
import Studio from './components/studio/Studio';
import { useAppStore } from './stores/simpleStore';

function App() {
  const { ui, updateUI, loadSessions, initializeCurrentSession } = useAppStore();
  const booted = useRef(false);

  useEffect(() => {
    document.documentElement.dataset.theme = ui.isDarkMode ? 'dark' : 'light';
    return () => { delete document.documentElement.dataset.theme; };
  }, [ui.isDarkMode]);

  // Session bootstrap belongs to the always-mounted shell, not a responsive drawer.
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    let cancelled = false;

    const start = async () => {
      await loadSessions();
      if (cancelled) return;
      await initializeCurrentSession();
      if (cancelled) return;

      const state = useAppStore.getState();
      if (state.currentSession) return;
      if (state.sessions[0]) {
        await state.setCurrentSession(state.sessions[0]);
      } else {
        await state.createNewSession(`Session ${new Date().toLocaleString()}`);
      }
    };

    start();
    return () => { cancelled = true; };
  }, [initializeCurrentSession, loadSessions]);

  // Entering a narrow breakpoint closes panels that would cover the editor.
  // We never force them open again, so the user's preference remains intact.
  useEffect(() => {
    const narrow = window.matchMedia('(max-width: 1023px)');
    const medium = window.matchMedia('(min-width: 1024px) and (max-width: 1279px)');
    const adapt = () => {
      if (narrow.matches) {
        updateUI({ isLeftSidebarCollapsed: true, isRightSidebarCollapsed: true });
      } else if (medium.matches) {
        updateUI({ isRightSidebarCollapsed: true });
      }
    };
    adapt();
    narrow.addEventListener('change', adapt);
    medium.addEventListener('change', adapt);
    return () => {
      narrow.removeEventListener('change', adapt);
      medium.removeEventListener('change', adapt);
    };
  }, [updateUI]);

  const leftOpen = !ui.isLeftSidebarCollapsed;
  const rightOpen = !ui.isRightSidebarCollapsed;

  return (
    <div className="relative flex h-dvh min-h-0 w-full overflow-hidden bg-sunken font-ui text-ink">
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: 'oklch(var(--ink))',
            color: 'oklch(var(--paper))',
            borderRadius: '12px',
            fontSize: '0.8125rem',
          },
        }}
      />

      {leftOpen && (
        <button
          type="button"
          aria-label="Dismiss sessions overlay"
          onClick={() => updateUI({ isLeftSidebarCollapsed: true })}
          className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[1px] lg:hidden"
        />
      )}
      <aside
        aria-label="Sessions"
        className={`fixed inset-y-0 left-0 z-50 overflow-hidden shadow-2xl transition-[width,transform,opacity] duration-300 ease-out lg:relative lg:z-auto lg:shadow-none ${
          leftOpen
            ? 'w-[280px] translate-x-0 lg:w-[272px] lg:opacity-100'
            : 'pointer-events-none w-[280px] -translate-x-full lg:w-0 lg:translate-x-0 lg:opacity-0'
        }`}
      >
        <div className="h-full w-[280px] lg:w-[272px]">
          <Sidebar />
        </div>
      </aside>

      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <DocumentToolbar />
        <div className="min-h-0 flex-1 overflow-hidden">
          <MainContent />
        </div>
      </main>

      {rightOpen && (
        <button
          type="button"
          aria-label="Dismiss assistant overlay"
          onClick={() => updateUI({ isRightSidebarCollapsed: true })}
          className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[1px] xl:hidden"
        />
      )}
      <aside
        aria-label="AI assistant"
        className={`fixed inset-y-0 right-0 z-50 overflow-hidden shadow-2xl transition-[width,transform,opacity] duration-300 ease-out xl:relative xl:z-auto xl:shadow-none ${
          rightOpen
            ? 'w-full translate-x-0 sm:w-[400px] xl:w-[380px] xl:opacity-100'
            : 'pointer-events-none w-full translate-x-full sm:w-[400px] xl:w-0 xl:translate-x-0 xl:opacity-0'
        }`}
      >
        <div className="h-full w-full sm:w-[400px] xl:w-[380px]">
          <ChatSidebar />
        </div>
      </aside>

      <SelectionAiAssistant />
      <Studio />
    </div>
  );
}

export default App;
