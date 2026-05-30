'use client';

/**
 * Chat Sidebar
 *
 * Conversation list with search, date grouping, and CRUD actions.
 * Supports toggling between active and archived conversations.
 * Clean neutral styling with subtle emerald accents.
 */

import { useState } from 'react';
import { Plus, Search, Trash2, Archive, ArchiveRestore, MessageSquare, Sparkles } from 'lucide-react';
import type { ConversationSummary } from './lib/types';

interface ChatSidebarProps {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onArchive: (id: string, archive: boolean) => void;
  onArchiveAll: () => void;
  showArchived: boolean;
  onToggleArchived: () => void;
  activeCount: number;
  archivedCount: number;
  isLoading?: boolean;
  archiveAllPending?: boolean;
}

function groupByDate(conversations: ConversationSummary[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;
  const lastWeek = today - 7 * 86400000;

  const groups: { label: string; items: ConversationSummary[] }[] = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Last 7 days', items: [] },
    { label: 'Older', items: [] },
  ];

  for (const conv of conversations) {
    const updated = new Date(conv.updatedAt).getTime();
    if (updated >= today) groups[0].items.push(conv);
    else if (updated >= yesterday) groups[1].items.push(conv);
    else if (updated >= lastWeek) groups[2].items.push(conv);
    else groups[3].items.push(conv);
  }

  return groups.filter((g) => g.items.length > 0);
}

export function ChatSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onArchive,
  onArchiveAll,
  showArchived,
  onToggleArchived,
  activeCount,
  archivedCount,
  isLoading,
  archiveAllPending,
}: ChatSidebarProps) {
  const [search, setSearch] = useState('');

  const filtered = search
    ? conversations.filter((c) => c.title.toLowerCase().includes(search.toLowerCase()))
    : conversations;

  const groups = groupByDate(filtered);

  return (
    <div className="flex flex-col h-full bg-white/80 dark:bg-zinc-900/60 backdrop-blur-xl border-r border-zinc-200/50 dark:border-zinc-800/50">
      {/* Header */}
      <div className="p-3 space-y-2">
        <button
          type="button"
          onClick={onNew}
          className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl border border-emerald-200/50 dark:border-emerald-800/30 bg-linear-to-r from-emerald-500/10 to-teal-500/5 text-sm font-medium text-emerald-700 dark:text-emerald-300 hover:from-emerald-500/15 hover:to-teal-500/10 transition-colors active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          New chat
        </button>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chats..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-emerald-400/50 dark:focus:ring-emerald-500/40 transition-colors"
          />
        </div>

        {/* Active / Archived toggle */}
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-zinc-100 dark:bg-zinc-800">
          <button
            type="button"
            onClick={() => showArchived && onToggleArchived()}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
              !showArchived
                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            <MessageSquare className="h-3 w-3" />
            Active{activeCount > 0 && ` (${activeCount})`}
          </button>
          <button
            type="button"
            onClick={() => !showArchived && onToggleArchived()}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
              showArchived
                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            <Archive className="h-3 w-3" />
            Archived{archivedCount > 0 && ` (${archivedCount})`}
          </button>
        </div>
      </div>

      {/* Archive All button — only when viewing active chats with items */}
      {!showArchived && activeCount > 0 && (
        <div className="px-3 pb-2">
          <button
            type="button"
            onClick={onArchiveAll}
            disabled={archiveAllPending}
            className="flex items-center justify-center gap-1.5 w-full px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Archive className="h-3 w-3" />
            {archiveAllPending ? 'Archiving...' : 'Archive all'}
          </button>
        </div>
      )}

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {isLoading ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 bg-zinc-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
            <div className="h-10 w-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-3">
              {showArchived ? <Archive className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />}
            </div>
            <span className="text-sm">
              {search
                ? 'No results'
                : showArchived
                  ? 'No archived chats'
                  : 'No conversations yet'}
            </span>
            <span className="text-xs mt-0.5 text-zinc-400/70">
              {search
                ? 'Try a different search'
                : showArchived
                  ? 'Archived chats will appear here'
                  : 'Start a chat with Joey'}
            </span>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="mb-3">
              <div className="px-2 py-1.5 text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                {group.label}
              </div>
              {group.items.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conversation={conv}
                  isActive={conv.id === activeId}
                  onSelect={() => onSelect(conv.id)}
                  onDelete={() => onDelete(conv.id)}
                  onArchive={() => onArchive(conv.id, !conv.isArchived)}
                />
              ))}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-zinc-200/50 dark:border-zinc-800/50">
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
          <Sparkles className="h-3 w-3 text-emerald-500" />
          <span>Powered by AI</span>
        </div>
      </div>
    </div>
  );
}

function ConversationItem({
  conversation,
  isActive,
  onSelect,
  onDelete,
  onArchive,
}: {
  conversation: ConversationSummary;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onArchive: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
      className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-all duration-150 border-l-2 ${
        isActive
          ? 'bg-emerald-50/50 dark:bg-emerald-500/10 border-l-emerald-500 text-zinc-900 dark:text-zinc-100'
          : 'border-l-transparent text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
      }`}
    >
      <MessageSquare className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-emerald-500' : 'opacity-40'}`} />
      <span className="flex-1 truncate text-sm">{conversation.title}</span>

      <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onArchive(); }}
          className="p-1 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
          aria-label={conversation.isArchived ? 'Unarchive' : 'Archive'}
          title={conversation.isArchived ? 'Unarchive' : 'Archive'}
        >
          {conversation.isArchived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1 rounded-md hover:bg-red-100 dark:hover:bg-red-950/30 text-red-500 transition-colors"
          aria-label="Delete"
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
