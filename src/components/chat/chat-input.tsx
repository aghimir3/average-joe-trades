'use client';

/**
 * Chat Input
 *
 * Auto-resizing textarea with send button.
 * Enter to send, Shift+Enter for newline.
 */

import { useRef, useEffect } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { MAX_MESSAGE_LENGTH, MAX_INPUT_ROWS } from './lib/constants';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  isLoading: boolean;
  disabled?: boolean;
}

export function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  isLoading,
  disabled = false,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const lineHeight = parseInt(getComputedStyle(ta).lineHeight) || 20;
    const maxHeight = lineHeight * MAX_INPUT_ROWS;
    ta.style.height = `${Math.min(ta.scrollHeight, maxHeight)}px`;
  }, [value]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && value.trim()) {
        onSend();
      }
    }
  }

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <div className="border-t border-zinc-200/50 dark:border-zinc-800/50 bg-white/80 dark:bg-zinc-900/60 backdrop-blur-xl p-3 sm:p-4">
      <div className="flex items-end gap-2 max-w-3xl mx-auto">
        <div className="flex-1 min-w-0 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 focus-within:ring-2 focus-within:ring-emerald-400/50 dark:focus-within:ring-emerald-500/40 focus-within:border-transparent transition-all overflow-hidden">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              if (e.target.value.length <= MAX_MESSAGE_LENGTH) {
                onChange(e.target.value);
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder="Ask Joey anything..."
            rows={1}
            disabled={disabled}
            className="w-full resize-none bg-transparent px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none disabled:opacity-50"
          />
        </div>

        {isLoading ? (
          <button
            type="button"
            onClick={onStop}
            className="shrink-0 h-10 w-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors mb-px"
            aria-label="Stop generating"
          >
            <Square className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            className={`shrink-0 h-10 w-10 rounded-xl flex items-center justify-center transition-colors active:scale-95 mb-px ${canSend ? 'bg-linear-to-br from-emerald-500 to-teal-600 text-white shadow-sm shadow-emerald-500/20 hover:from-emerald-600 hover:to-teal-700' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-400 dark:text-zinc-500 cursor-not-allowed'}`}
            aria-label="Send message"
          >
            <ArrowUp className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
}
