'use client';

/**
 * Chat Client
 *
 * Main orchestrator for the Joey chat page.
 * Desktop: sidebar + chat area side by side.
 * Mobile: full-width chat with sidebar as overlay.
 *
 * Uses optimistic message display — user messages appear instantly
 * before the API stream starts.
 */

import { useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PanelLeftClose, PanelLeft, Sparkles, ChevronDown } from 'lucide-react';
import { motion } from 'motion/react';
import { useMediaQuery } from '@/hooks/use-media-query';
import type { UIMessage } from 'ai';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChatSidebar } from './chat-sidebar';
import { ChatMessages } from './chat-messages';
import { ChatInput } from './chat-input';
import { ChatEmptyState } from './chat-empty-state';
import {
  fetchConversations,
  fetchConversation,
  deleteConversation,
  updateConversation,
  archiveAllConversations,
} from './lib/api';
import { CHAT_MODELS, DEFAULT_MODEL_ID, JOEY_MODES, DEFAULT_MODE_ID } from './lib/constants';
import type { ConversationSummary } from './lib/types';

export function ChatClient() {
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const showSidebar = sidebarOpen || isDesktop;
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_MODEL_ID);
  const [selectedMode, setSelectedMode] = useState<string>(DEFAULT_MODE_ID);
  const [showArchived, setShowArchived] = useState(false);
  const queryClient = useQueryClient();

  // Optimistic user message — shown immediately while API streams
  const [pendingUserMessage, setPendingUserMessage] = useState<UIMessage | null>(null);

  // Fetch active conversations
  const activeQuery = useQuery({
    queryKey: ['chat-conversations', false],
    queryFn: () => fetchConversations(50, 0, false),
    staleTime: 30_000,
  });

  // Fetch archived conversations
  const archivedQuery = useQuery({
    queryKey: ['chat-conversations', true],
    queryFn: () => fetchConversations(50, 0, true),
    staleTime: 30_000,
  });

  const conversationsQuery = showArchived ? archivedQuery : activeQuery;
  const conversations: ConversationSummary[] = conversationsQuery.data?.conversations ?? [];
  const activeCount = activeQuery.data?.pagination.total ?? 0;
  const archivedCount = archivedQuery.data?.pagination.total ?? 0;

  // Static transport — created once to avoid stale body data (AI SDK guidance).
  // Dynamic values (conversationId, modelId) are passed per-request via sendMessage.
  const [transport] = useState(
    () => new DefaultChatTransport({ api: '/api/chat' }),
  );

  // useChat hook — single message store (no id), we manage conversation switching via setMessages
  const chat = useChat({
    transport,
    onFinish: async () => {
      setPendingUserMessage(null);

      // Refetch active conversations and invalidate archived so both stay fresh
      await queryClient.refetchQueries({ queryKey: ['chat-conversations', false] });
      queryClient.invalidateQueries({ queryKey: ['chat-conversations', true] });
      if (!activeConversationId) {
        const result = queryClient.getQueryData<{ conversations: ConversationSummary[] }>(['chat-conversations', false]);
        const newest = result?.conversations?.[0];
        if (newest) {
          setActiveConversationId(newest.id);
        }
      }
    },
    onError: (error) => {
      setPendingUserMessage(null);
      console.error('Chat error:', error);
    },
  });

  // Show optimistic message only until the hook picks up a real user message.
  // We compare text content (not ID) because the hook assigns its own ID.
  const chatMessages = chat.messages;
  const pendingText = pendingUserMessage?.parts?.find(
    (p): p is { type: 'text'; text: string } => p.type === 'text',
  )?.text;
  const hookHasUserMessage = pendingText && chatMessages.some(
    (m) => m.role === 'user' && m.parts?.some(
      (p) => p.type === 'text' && 'text' in p && p.text === pendingText,
    ),
  );
  const showPending = pendingUserMessage && !hookHasUserMessage;

  // Merge: show chat messages + pending optimistic user message at the end
  const displayMessages: UIMessage[] = showPending
    ? [...chatMessages, pendingUserMessage]
    : chatMessages;

  // Delete conversation
  const deleteMutation = useMutation({
    mutationFn: deleteConversation,
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['chat-conversations'] });
      if (activeConversationId === deletedId) {
        setActiveConversationId(null);
        chat.setMessages([]);
      }
    },
  });

  // Archive/unarchive conversation
  const archiveMutation = useMutation({
    mutationFn: ({ id, archive }: { id: string; archive: boolean }) =>
      updateConversation(id, { isArchived: archive }),
    onSuccess: (_, { id, archive }) => {
      queryClient.invalidateQueries({ queryKey: ['chat-conversations'] });
      // If archiving the active conversation, clear chat area
      if (archive && activeConversationId === id) {
        setActiveConversationId(null);
        chat.setMessages([]);
      }
    },
  });

  // Bulk archive all active conversations
  const archiveAllMutation = useMutation({
    mutationFn: archiveAllConversations,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-conversations'] });
      // Clear active conversation since it was just archived
      setActiveConversationId(null);
      chat.setMessages([]);
    },
  });

  // Load a conversation's messages when selected
  async function handleSelectConversation(id: string) {
    setActiveConversationId(id);
    setPendingUserMessage(null);
    if (!isDesktop) setSidebarOpen(false);

    try {
      const detail = await fetchConversation(id);
      const uiMessages = detail.messages.map((m) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        parts: [{ type: 'text' as const, text: m.content }],
        createdAt: new Date(m.createdAt),
      }));
      chat.setMessages(uiMessages);
    } catch (err) {
      console.error('Failed to load conversation:', err);
    }
  }

  function handleNewChat() {
    setActiveConversationId(null);
    setPendingUserMessage(null);
    chat.setMessages([]);
    setInput('');
    if (!isDesktop) setSidebarOpen(false);
    // Switch to active view when starting a new chat
    if (showArchived) setShowArchived(false);
  }

  function handleSend() {
    const text = input.trim();
    if (!text) return;

    // Optimistic: show user message immediately
    setPendingUserMessage({
      id: `pending-${Date.now()}`,
      role: 'user',
      parts: [{ type: 'text', text }],
      createdAt: new Date(),
    } as UIMessage);

    // Pass dynamic values per-request (avoids stale transport body)
    chat.sendMessage(
      { text },
      { body: { conversationId: activeConversationId, modelId: selectedModel, modeId: selectedMode } },
    );
    setInput('');
  }

  function handleSendPrompt(prompt: string) {
    setPendingUserMessage({
      id: `pending-${Date.now()}`,
      role: 'user',
      parts: [{ type: 'text', text: prompt }],
      createdAt: new Date(),
    } as UIMessage);

    setInput('');
    chat.sendMessage(
      { text: prompt },
      { body: { conversationId: activeConversationId, modelId: selectedModel, modeId: selectedMode } },
    );
  }

  const hasMessages = displayMessages.length > 0;
  const isStreaming = chat.status === 'streaming';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex h-[calc(100vh-64px)] overflow-hidden bg-zinc-50 dark:bg-zinc-950"
    >
      {/* Sidebar */}
      {showSidebar && (
        <>
          {!isDesktop && sidebarOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
              onClick={() => setSidebarOpen(false)}
              aria-hidden
            />
          )}
          <div
            className={
              isDesktop
                ? 'w-70 shrink-0 border-r border-zinc-200/50 dark:border-zinc-800/50'
                : 'fixed inset-y-0 left-0 z-50 w-70 shadow-2xl'
            }
          >
            <ChatSidebar
              conversations={conversations}
              activeId={activeConversationId}
              onSelect={handleSelectConversation}
              onNew={handleNewChat}
              onDelete={(id) => deleteMutation.mutate(id)}
              onArchive={(id, archive) => archiveMutation.mutate({ id, archive })}
              onArchiveAll={() => archiveAllMutation.mutate()}
              showArchived={showArchived}
              onToggleArchived={() => setShowArchived((prev) => !prev)}
              activeCount={activeCount}
              archivedCount={archivedCount}
              isLoading={conversationsQuery.isLoading}
              archiveAllPending={archiveAllMutation.isPending}
            />
          </div>
        </>
      )}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header bar */}
        <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 border-b border-zinc-200/50 dark:border-zinc-800/50 bg-white/80 dark:bg-zinc-900/60 backdrop-blur-xl">
          <button
            type="button"
            onClick={() => setSidebarOpen((prev) => !prev)}
            className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-500 dark:text-zinc-400 md:hidden"
            aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          >
            {sidebarOpen ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeft className="h-5 w-5" />}
          </button>
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-linear-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm shadow-emerald-500/20">
              <Sparkles className="h-3 w-3 text-white" />
            </div>
            <h1 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Joey</h1>
          </div>
          {isStreaming && (
            <div className="flex items-center gap-1.5 ml-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                Thinking...
              </span>
            </div>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium border border-zinc-200/60 dark:border-zinc-700/60 bg-zinc-50/50 dark:bg-zinc-800/50 hover:bg-zinc-100/80 dark:hover:bg-zinc-700/50 transition-colors text-zinc-700 dark:text-zinc-300"
                >
                  {JOEY_MODES.find((m) => m.id === selectedMode)?.label ?? 'Mode'}
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="text-xs text-zinc-500 dark:text-zinc-400">Personality</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup value={selectedMode} onValueChange={setSelectedMode}>
                  {JOEY_MODES.map((m) => (
                    <DropdownMenuRadioItem key={m.id} value={m.id} className="text-xs cursor-pointer">
                      <span className="font-medium">{m.label}</span>
                      <span className="ml-auto text-zinc-400 dark:text-zinc-500">{m.description}</span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium border border-zinc-200/60 dark:border-zinc-700/60 bg-zinc-50/50 dark:bg-zinc-800/50 hover:bg-zinc-100/80 dark:hover:bg-zinc-700/50 transition-colors text-zinc-700 dark:text-zinc-300"
                >
                  {CHAT_MODELS.find((m) => m.id === selectedModel)?.label ?? 'Model'}
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="text-xs text-zinc-500 dark:text-zinc-400">Model</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup value={selectedModel} onValueChange={setSelectedModel}>
                  {CHAT_MODELS.map((m) => (
                    <DropdownMenuRadioItem key={m.id} value={m.id} className="text-xs cursor-pointer">
                      <span className="font-medium">{m.label}</span>
                      <span className="ml-auto text-zinc-400 dark:text-zinc-500">{m.description}</span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Messages or empty state */}
        {hasMessages ? (
          <ChatMessages
            messages={displayMessages}
            isLoading={isStreaming}
          />
        ) : (
          <ChatEmptyState onSendPrompt={handleSendPrompt} />
        )}

        {/* Input bar */}
        <div className="pb-12 md:pb-0">
          <ChatInput
            value={input}
            onChange={setInput}
            onSend={handleSend}
            onStop={chat.stop}
            isLoading={isStreaming}
          />
        </div>
      </div>
    </motion.div>
  );
}
