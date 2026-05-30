'use client';

/**
 * Chat Markdown Renderer
 *
 * Beautiful markdown rendering for Joey's AI responses using
 * react-markdown + remark-gfm + Tailwind Typography (prose).
 */

import dynamic from 'next/dynamic';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { ChatCodeBlock } from './chat-code-block';

const ChatChart = dynamic(() => import('./chat-chart'), { ssr: false });

interface ChatMarkdownProps {
  content: string;
}

const components: Components = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || '');

    if (!match) {
      return (
        <code
          className="bg-zinc-100 dark:bg-zinc-700 px-1.5 py-0.5 rounded text-sm font-mono"
          {...props}
        >
          {children}
        </code>
      );
    }

    const code = String(children).replace(/\n$/, '');

    if (match[1] === 'chart') {
      try {
        const spec = JSON.parse(code);
        return <ChatChart spec={spec} />;
      } catch {
        return <ChatCodeBlock code={code} language="json" />;
      }
    }

    return <ChatCodeBlock code={code} language={match[1]} />;
  },
  a({ children, href, ...props }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
        {children}
      </a>
    );
  },
  pre({ children }) {
    return <>{children}</>;
  },
};

export function ChatMarkdown({ content }: ChatMarkdownProps) {
  return (
    <article
      className={[
        'prose dark:prose-invert prose-sm sm:prose-base max-w-none',
        'prose-headings:font-semibold prose-headings:mb-2 prose-headings:mt-3',
        'prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5',
        'prose-a:text-emerald-600 dark:prose-a:text-emerald-400 prose-a:no-underline hover:prose-a:underline',
        'prose-code:before:content-none prose-code:after:content-none',
        '[&_table]:block [&_table]:overflow-x-auto',
        '[&_pre]:overflow-x-auto',
        'prose-blockquote:border-zinc-300 dark:prose-blockquote:border-zinc-600',
      ].join(' ')}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </article>
  );
}
