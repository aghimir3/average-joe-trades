'use client';

/**
 * Chat Code Block
 *
 * Syntax-highlighted code block using shiki with copy-to-clipboard,
 * language label, and light/dark theme support.
 */

import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface ChatCodeBlockProps {
  code: string;
  language?: string;
}

export function ChatCodeBlock({ code, language = 'text' }: ChatCodeBlockProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function highlight() {
      try {
        const { codeToHtml } = await import('shiki');
        const result = await codeToHtml(code, {
          lang: language,
          themes: {
            light: 'github-light',
            dark: 'github-dark',
          },
        });
        if (!cancelled) setHtml(result);
      } catch {
        // If shiki fails (unsupported language, etc.), fall back to plain
        if (!cancelled) setHtml(null);
      }
    }

    highlight();
    return () => { cancelled = true; };
  }, [code, language]);

  function handleCopy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="group relative rounded-lg overflow-hidden my-2">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-200 dark:bg-zinc-800 text-xs text-zinc-600 dark:text-zinc-400">
        <span className="font-mono">{language}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors"
          aria-label="Copy code"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-500" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      {/* Code content */}
      {html ? (
        <div
          className="overflow-x-auto text-sm [&_pre]:rounded-none! [&_pre]:m-0! [&_pre]:px-4! [&_pre]:py-3!"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="overflow-x-auto bg-zinc-100 dark:bg-zinc-900 px-4 py-3 text-sm">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}
