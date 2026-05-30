'use client';

/**
 * Chat Empty State
 *
 * Welcome screen shown when no conversation is active.
 * Pulsing avatar, gradient text, cascading glassmorphic prompt cards.
 */

import { Sparkles, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';
import { SUGGESTED_PROMPTS } from './lib/constants';

interface ChatEmptyStateProps {
  onSendPrompt: (prompt: string) => void;
}

export function ChatEmptyState({ onSendPrompt }: ChatEmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col items-center justify-center h-full px-4 text-center"
    >
      {/* Pulsing avatar */}
      <div className="relative mb-8">
        <div className="absolute inset-0 animate-ping opacity-20 rounded-full bg-emerald-500" />
        <div className="relative h-16 w-16 rounded-2xl bg-linear-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
          <Sparkles className="h-8 w-8 text-white" />
        </div>
      </div>

      {/* Gradient heading */}
      <h2 className="text-2xl font-bold bg-linear-to-r from-emerald-500 to-teal-400 bg-clip-text text-transparent mb-1">
        Hi, I&apos;m Joey
      </h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-8 max-w-sm">
        Your AI trading assistant. I can help you understand your portfolio,
        analyze trades, and find opportunities.
      </p>

      {/* Cascading glassmorphic prompt cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg w-full">
        {SUGGESTED_PROMPTS.map((prompt, index) => (
          <motion.div
            key={prompt}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 + index * 0.1 }}
          >
            <button
              type="button"
              onClick={() => onSendPrompt(prompt)}
              className="group text-left w-full px-4 py-3.5 rounded-xl border border-zinc-200/50 dark:border-zinc-700/40 bg-white/80 dark:bg-zinc-800/60 backdrop-blur-sm text-sm text-zinc-600 dark:text-zinc-300 hover:border-emerald-300/50 dark:hover:border-emerald-600/30 hover:shadow-md hover:shadow-emerald-500/5 transition-all duration-200 flex items-center justify-between gap-2"
            >
              <span>{prompt}</span>
              <ArrowRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 group-hover:opacity-50 group-hover:translate-x-0 transition-all duration-200 shrink-0 text-emerald-500" />
            </button>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
