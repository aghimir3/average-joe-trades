'use client';

/**
 * Chat Tool Card
 *
 * Collapsible card showing tool invocations in the chat.
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, Wrench } from 'lucide-react';
import { TOOL_DISPLAY_NAMES } from './lib/constants';

interface ChatToolCardProps {
  toolName: string;
  args?: Record<string, unknown>;
  result?: unknown;
  state?: 'call' | 'result' | 'partial-call';
}

export function ChatToolCard({ toolName, args, result, state }: ChatToolCardProps) {
  const [expanded, setExpanded] = useState(false);
  const displayName = TOOL_DISPLAY_NAMES[toolName] ?? toolName;
  const isLoading = state === 'call' || state === 'partial-call';

  return (
    <div className="my-1.5 rounded-lg border border-emerald-200/30 dark:border-emerald-700/20 bg-white/60 dark:bg-zinc-800/40 backdrop-blur-sm text-sm overflow-hidden">
      <button
        type="button"
        onClick={() => !isLoading && setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
      >
        {isLoading ? (
          <div className="h-3.5 w-3.5 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin shrink-0" />
        ) : (
          <Wrench className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />
        )}
        <span className="flex-1 truncate text-xs font-medium">{displayName}</span>
        {!isLoading && result !== undefined && (
          expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-2.5 space-y-2 border-t border-emerald-200/20 dark:border-emerald-700/15 pt-2">
          {args && Object.keys(args).length > 0 && (
            <div>
              <div className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 mb-1 uppercase tracking-wide">Input</div>
              <pre className="text-xs bg-white dark:bg-zinc-900 rounded-lg p-2.5 overflow-x-auto border border-zinc-200/50 dark:border-zinc-700/30 font-mono">
                {JSON.stringify(args, null, 2)}
              </pre>
            </div>
          )}
          {result !== undefined && (
            <div>
              <div className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 mb-1 uppercase tracking-wide">Result</div>
              <pre className="text-xs bg-white dark:bg-zinc-900 rounded-lg p-2.5 overflow-x-auto max-h-60 overflow-y-auto border border-zinc-200/50 dark:border-zinc-700/30 font-mono">
                {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
