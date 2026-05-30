/**
 * Help Tooltip Component
 *
 * A simple help icon with tooltip for explaining dashboard modules.
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { HelpCircle, X } from 'lucide-react';

interface HelpTooltipProps {
  title: string;
  description: string;
}

export function HelpTooltip({ title, description }: HelpTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div className="relative inline-block">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="p-1 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        aria-label="Help"
      >
        <HelpCircle className="h-4 w-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" />
      </button>

      {isOpen && (
        <>
          {/* Mobile: Bottom sheet */}
          <div className="sm:hidden fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/50" onClick={() => setIsOpen(false)} />
            <div className="absolute bottom-0 left-0 right-0 bg-white dark:bg-zinc-900 rounded-t-2xl p-5 shadow-xl">
              <div className="flex items-start justify-between mb-3">
                <h4 className="font-semibold text-zinc-900 dark:text-zinc-50">{title}</h4>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <X className="h-5 w-5 text-zinc-400" />
                </button>
              </div>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">{description}</p>
            </div>
          </div>

          {/* Desktop: Dropdown */}
          <div
            ref={tooltipRef}
            className="hidden sm:block absolute left-0 top-full mt-2 w-64 p-4 bg-white dark:bg-zinc-800 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-700 z-50"
          >
            <h4 className="font-semibold text-zinc-900 dark:text-zinc-50 mb-2 text-sm">{title}</h4>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">{description}</p>
          </div>
        </>
      )}
    </div>
  );
}
