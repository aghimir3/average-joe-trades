'use client';

/**
 * Chat Messages
 *
 * Scrollable message list with auto-scroll to bottom.
 */

import { useEffect, useRef } from 'react';
import type { UIMessage } from 'ai';
import { ChatMessage } from './chat-message';

interface ChatMessagesProps {
  messages: UIMessage[];
  isLoading: boolean;
}

export function ChatMessages({ messages, isLoading }: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-3 sm:px-6 py-4">
      <div className="max-w-3xl mx-auto space-y-4">
        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}

        {/* Loading indicator */}
        {isLoading && messages.length > 0 && messages[messages.length - 1]?.role === 'user' && (
          <div className="flex gap-3">
            <div className="shrink-0 mt-1">
              <div className="h-8 w-8 rounded-lg bg-linear-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm shadow-emerald-500/20">
                <div className="h-3 w-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
              </div>
            </div>
            <div className="bg-white/90 dark:bg-zinc-800/70 border border-zinc-200/60 dark:border-zinc-700/50 px-4 py-3 rounded-2xl rounded-bl-md shadow-sm backdrop-blur-sm">
              <div className="flex gap-1.5">
                <span className="w-1.5 h-1.5 bg-emerald-400 dark:bg-emerald-500 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-emerald-400 dark:bg-emerald-500 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-emerald-400 dark:bg-emerald-500 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
