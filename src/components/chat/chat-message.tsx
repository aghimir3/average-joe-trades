'use client';

/**
 * Chat Message
 *
 * Individual message bubble for user and assistant messages.
 * Renders markdown for assistant, plain text for user.
 * Neutral palette with subtle emerald accents.
 */

import { Sparkles } from 'lucide-react';
import type { UIMessage } from 'ai';
import { ChatMarkdown } from './chat-markdown';
import { ChatToolCard } from './chat-tool-card';

interface ChatMessageProps {
  message: UIMessage;
}

interface ToolPartShape {
  type: string;
  toolCallId: string;
  state: string;
  input?: unknown;
  output?: unknown;
  toolName?: string;
}

function isToolPart(part: { type: string }): part is ToolPartShape {
  return part.type.startsWith('tool-') || part.type === 'dynamic-tool';
}

function getToolName(part: ToolPartShape): string {
  if (part.toolName) return part.toolName;
  if (part.type.startsWith('tool-')) return part.type.slice(5);
  return part.type;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      {!isUser && (
        <div className="shrink-0 mt-1">
          <div className="h-8 w-8 rounded-lg bg-linear-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm shadow-emerald-500/20">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
        </div>
      )}

      {/* Content */}
      <div className={`min-w-0 max-w-[85%] sm:max-w-[75%] ${isUser ? 'ml-auto' : ''}`}>
        {message.parts.map((part, i) => {
          const key = `${message.id}-${i}`;

          if (part.type === 'text') {
            if (isUser) {
              return (
                <div
                  key={key}
                  className="bg-zinc-200/90 dark:bg-zinc-700/90 text-zinc-900 dark:text-zinc-100 px-4 py-2.5 rounded-2xl rounded-br-md text-sm whitespace-pre-wrap shadow-sm"
                >
                  {part.text}
                </div>
              );
            }
            return (
              <div
                key={key}
                className="bg-white/90 dark:bg-zinc-800/70 border border-zinc-200/60 dark:border-zinc-700/50 px-4 py-2.5 rounded-2xl rounded-bl-md shadow-sm backdrop-blur-sm"
              >
                <ChatMarkdown content={part.text} />
              </div>
            );
          }

          if (isToolPart(part)) {
            const toolName = getToolName(part);
            return (
              <ChatToolCard
                key={key}
                toolName={toolName}
                args={part.input as Record<string, unknown> | undefined}
                result={part.state === 'output-available' ? part.output : undefined}
                state={
                  part.state === 'output-available'
                    ? 'result'
                    : part.state === 'input-streaming'
                      ? 'partial-call'
                      : 'call'
                }
              />
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}
