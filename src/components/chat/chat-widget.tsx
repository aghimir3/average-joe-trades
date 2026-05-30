'use client';

/**
 * Chat Widget
 *
 * Floating chat bubble that appears on all authenticated pages.
 * Clicking opens the ChatWidgetPanel overlay.
 */

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { MessageCircle, X } from 'lucide-react';
import { ChatWidgetPanel } from './chat-widget-panel';

export function ChatWidget() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (!session?.user || pathname === '/chat') return null;

  return (
    <>
      {open && <ChatWidgetPanel onClose={() => setOpen(false)} />}

      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={[
          'fixed z-40',
          'bottom-6 right-6',
          'max-md:bottom-20 max-md:right-4',
          'h-12 w-12 rounded-full',
          'bg-linear-to-br from-emerald-500 to-teal-600',
          'text-white',
          'shadow-lg shadow-emerald-500/25',
          'flex items-center justify-center',
          'hover:scale-105 active:scale-95 transition-transform duration-150',
        ].join(' ')}
        aria-label={open ? 'Close chat' : 'Open chat'}
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </button>
    </>
  );
}
