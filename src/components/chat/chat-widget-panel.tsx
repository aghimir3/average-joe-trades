'use client';

/**
 * Chat Widget Panel
 *
 * Expanded chat panel that appears above the floating bubble.
 * Desktop: fixed-size panel anchored bottom-right.
 * Mobile: full-width bottom drawer (80vh).
 */

import { useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { X, ExternalLink, Sparkles, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import type { UIMessage } from 'ai';
import { useMediaQuery } from '@/hooks/use-media-query';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChatMessages } from './chat-messages';
import { ChatInput } from './chat-input';
import { ChatEmptyState } from './chat-empty-state';
import { JOEY_MODES, DEFAULT_MODE_ID } from './lib/constants';

interface ChatWidgetPanelProps {
  onClose: () => void;
}

export function ChatWidgetPanel({ onClose }: ChatWidgetPanelProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [input, setInput] = useState('');
  const [selectedMode, setSelectedMode] = useState<string>(DEFAULT_MODE_ID);
  const [pendingUserMessage, setPendingUserMessage] = useState<UIMessage | null>(null);

  // Static transport — created once to avoid stale reference issues
  const [transport] = useState(
    () => new DefaultChatTransport({ api: '/api/chat' }),
  );

  const chat = useChat({
    transport,
    onFinish: () => setPendingUserMessage(null),
    onError: (error) => {
      setPendingUserMessage(null);
      console.error('Widget chat error:', error);
    },
  });

  const pendingText = pendingUserMessage?.parts?.find(
    (p): p is { type: 'text'; text: string } => p.type === 'text',
  )?.text;
  const hookHasUserMessage = pendingText && chat.messages.some(
    (m) => m.role === 'user' && m.parts?.some(
      (p) => p.type === 'text' && 'text' in p && p.text === pendingText,
    ),
  );
  const showPending = pendingUserMessage && !hookHasUserMessage;
  const displayMessages: UIMessage[] = showPending
    ? [...chat.messages, pendingUserMessage]
    : chat.messages;

  function handleSend() {
    const text = input.trim();
    if (!text) return;
    setPendingUserMessage({
      id: `pending-${Date.now()}`,
      role: 'user',
      parts: [{ type: 'text', text }],
      createdAt: new Date(),
    } as UIMessage);
    chat.sendMessage({ text }, { body: { modeId: selectedMode } });
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
    chat.sendMessage({ text: prompt }, { body: { modeId: selectedMode } });
  }

  const hasMessages = displayMessages.length > 0;

  const header = (
    <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200/50 dark:border-zinc-800/50">
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 rounded-md bg-linear-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm shadow-emerald-500/20">
          <Sparkles className="h-3 w-3 text-white" />
        </div>
        <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Joey</span>
      </div>
      <div className="flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 h-7 px-2 rounded-lg text-xs font-medium border border-zinc-200/60 dark:border-zinc-700/60 bg-zinc-50/50 dark:bg-zinc-800/50 hover:bg-zinc-100/80 dark:hover:bg-zinc-700/50 transition-colors text-zinc-700 dark:text-zinc-300"
            >
              {JOEY_MODES.find((m) => m.id === selectedMode)?.label ?? 'Mode'}
              <ChevronDown className="h-3 w-3 opacity-50" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
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
        <Link
          href="/chat"
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-400"
          title="Open full chat"
        >
          <ExternalLink className="h-4 w-4" />
        </Link>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-400"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  if (isDesktop) {
    return (
      <div className="fixed bottom-20 right-6 z-50 w-100 h-137.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl shadow-2xl flex flex-col overflow-hidden">
        {header}
        {hasMessages ? (
          <ChatMessages messages={displayMessages} isLoading={chat.status === 'streaming'} />
        ) : (
          <ChatEmptyState onSendPrompt={handleSendPrompt} />
        )}
        <ChatInput value={input} onChange={setInput} onSend={handleSend} onStop={chat.stop} isLoading={chat.status === 'streaming'} />
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} aria-hidden />
      <div className="fixed inset-x-0 bottom-0 z-50 h-[80vh] rounded-t-2xl border-t border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl shadow-2xl flex flex-col overflow-hidden">
        {header}
        {hasMessages ? (
          <ChatMessages messages={displayMessages} isLoading={chat.status === 'streaming'} />
        ) : (
          <ChatEmptyState onSendPrompt={handleSendPrompt} />
        )}
        <div className="pb-safe">
          <ChatInput value={input} onChange={setInput} onSend={handleSend} onStop={chat.stop} isLoading={chat.status === 'streaming'} />
        </div>
      </div>
    </>
  );
}
