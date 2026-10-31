import React, { useState } from 'react';
import {
  FileText,
  LogOut,
  Moon,
  PanelLeftClose,
  Pencil,
  Plus,
  Sun,
  Trash2,
} from 'lucide-react';
import { flushAutosave } from '../editor/saveStatus';
import { useAppStore } from '../stores/simpleStore';
import { useAuthStore } from '../stores/authStore';
import type { Session } from '../types/simple';

const editedLabel = (iso: string) => {
  const date = new Date(iso);
  const minutes = (Date.now() - date.getTime()) / 60000;
  if (Number.isNaN(minutes)) return '';
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${Math.floor(minutes)}m ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h ago`;
  if (minutes < 48 * 60) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const initials = (name?: string) => (name || 'User')
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0]?.toUpperCase())
  .join('');

const Sidebar: React.FC = () => {
  const {
    sessions,
    currentSession,
    setCurrentSession,
    createNewSession,
    deleteSession,
    renameSession,
    ui,
    updateUI,
  } = useAppStore();
  const { user, logout } = useAuthStore();
  const [newSessionName, setNewSessionName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleLogout = async () => {
    if (!confirm('Sign out of this browser?')) return;
    // Edits from the last two seconds are saved while the sign-in is still valid.
    await flushAutosave();
    logout();
  };

  const handleCreateSession = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isCreating) return;
    setIsCreating(true);
    await createNewSession(newSessionName.trim());
    setNewSessionName('');
    setIsCreating(false);
  };

  const handleDeleteSession = async (session: Session) => {
    if (!confirm(`Delete "${session.name}"? Its chat and document will also be deleted. This can't be undone.`)) return;
    await deleteSession(session.id);
    if (currentSession?.id === session.id) {
      const next = useAppStore.getState().sessions[0];
      if (next) await setCurrentSession(next);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-line bg-panel text-ink">
      <header className="flex h-14 flex-shrink-0 items-center gap-3 border-b border-line/80 px-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-accent-ink shadow-sm">
          <FileText className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold tracking-[-0.01em]">Workspace</h2>
          <p className="text-[11px] text-ink-soft">{sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}</p>
        </div>
        <button
          type="button"
          onClick={() => updateUI({ isLeftSidebarCollapsed: true })}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-soft transition hover:bg-sunken hover:text-ink lg:hidden"
          aria-label="Close sessions"
          title="Close sessions"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-shrink-0 px-3 pb-3 pt-3">
        <form onSubmit={handleCreateSession} className="flex items-center gap-2">
          <input
            type="text"
            value={newSessionName}
            onChange={(event) => setNewSessionName(event.target.value)}
            placeholder="Name a new session…"
            aria-label="New session name"
            maxLength={200}
            className="h-9 min-w-0 flex-1 rounded-xl border border-line bg-paper px-3 text-xs text-ink outline-none transition placeholder:text-ink-soft/70 focus:border-accent focus:ring-2 focus:ring-accent/15"
          />
          <button
            type="submit"
            disabled={isCreating}
            aria-label="New session"
            title="New session"
            className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-accent text-accent-ink shadow-sm transition hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className={`h-4 w-4 ${isCreating ? 'animate-pulse' : ''}`} aria-hidden="true" />
          </button>
        </form>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-4 pb-1 pt-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-soft">Recent</span>
          <span className="text-[10px] tabular-nums text-ink-soft">{sessions.length}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {sessions.length === 0 ? (
            <div className="mx-2 mt-6 rounded-2xl border border-dashed border-line px-4 py-8 text-center">
              <FileText className="mx-auto mb-3 h-6 w-6 text-ink-soft/60" />
              <p className="text-xs font-medium">No sessions yet</p>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">Create one to keep a document and its AI conversation together.</p>
            </div>
          ) : (
            <ul className="space-y-1 py-1">
              {sessions.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  active={currentSession?.id === session.id}
                  onOpen={() => setCurrentSession(session)}
                  onRename={(name) => renameSession(session.id, name)}
                  onDelete={() => handleDeleteSession(session)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      <footer className="flex-shrink-0 border-t border-line/80 p-2.5">
        <div className="flex items-center gap-2 rounded-xl px-1.5 py-1.5">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accent-tint text-[11px] font-semibold text-accent">
            {initials(user?.full_name || user?.username)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">{user?.full_name || user?.username}</p>
            <p className="truncate text-[10px] text-ink-soft">{user?.email}</p>
          </div>
          <button
            type="button"
            onClick={() => updateUI({ isDarkMode: !ui.isDarkMode })}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-soft transition hover:bg-sunken hover:text-ink"
            title={ui.isDarkMode ? 'Use light theme' : 'Use dark theme'}
            aria-label={ui.isDarkMode ? 'Use light theme' : 'Use dark theme'}
          >
            {ui.isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-soft transition hover:bg-danger/10 hover:text-danger"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </footer>
    </div>
  );
};

const SessionRow: React.FC<{
  session: Session;
  active: boolean;
  onOpen: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}> = ({ session, active, onOpen, onRename, onDelete }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(session.name);

  const startEditing = () => {
    setDraft(session.name);
    setEditing(true);
  };
  const finish = (save: boolean) => {
    setEditing(false);
    if (save && draft.trim() && draft.trim() !== session.name) onRename(draft.trim());
  };

  const action = 'inline-flex h-7 w-7 items-center justify-center rounded-lg text-ink-soft opacity-0 transition hover:bg-paper hover:text-ink focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100';

  return (
    <li
      className={`group relative flex items-center gap-1 rounded-xl p-2 transition-colors ${
        active ? 'bg-accent-tint' : 'hover:bg-paper/80'
      }`}
    >
      <span className={`h-8 w-1 flex-shrink-0 rounded-full transition-colors ${active ? 'bg-accent' : 'bg-transparent'}`} aria-hidden="true" />
      {editing ? (
        <input
          autoFocus
          value={draft}
          maxLength={200}
          aria-label="Rename session"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => finish(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') finish(true);
            if (event.key === 'Escape') finish(false);
          }}
          className="h-8 min-w-0 flex-1 rounded-lg border border-accent bg-paper px-2 text-xs text-ink outline-none ring-2 ring-accent/15"
        />
      ) : (
        <button
          type="button"
          onClick={onOpen}
          onDoubleClick={startEditing}
          aria-current={active ? 'true' : undefined}
          className="min-w-0 flex-1 rounded-lg px-1 py-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
        >
          <span className="block truncate text-xs font-medium">{session.name}</span>
          <span className="mt-0.5 block text-[10px] text-ink-soft">{editedLabel(session.updated_at)}</span>
        </button>
      )}
      {!editing && (
        <div className="flex flex-shrink-0">
          <button type="button" onClick={startEditing} className={action} title="Rename" aria-label={`Rename ${session.name}`}>
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={onDelete} className={`${action} hover:bg-danger/10 hover:text-danger`} title="Delete" aria-label={`Delete ${session.name}`}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </li>
  );
};

export default Sidebar;
