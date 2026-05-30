'use client';

/**
 * Journal History Tab
 *
 * Displays journal entries in chronological order (newest first).
 * Each entry shows date, mood, notes preview, health stats, and market condition.
 * Links to the journal page for full editing.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { parseApiJson, apiData } from '@/lib/api/client';
import {
  ChevronDown,
  Loader2,
  BookOpen,
  Moon,
  Heart,
  Dumbbell,
  Coffee,
  ExternalLink,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

// ============================================================================
// Types
// ============================================================================

interface JournalEntry {
  id: string;
  date: string;
  preMarketNotes: string | null;
  preMarketMood: string | null;
  watchlist: string | null;
  keyLevels: string | null;
  hoursSlept: number | null;
  sleepQuality: string | null;
  exercised: boolean | null;
  caffeineIntake: string | null;
  stressLevel: number | null;
  postMarketNotes: string | null;
  emotionalState: string | null;
  followedPlan: boolean | null;
  biggestWin: string | null;
  biggestMistake: string | null;
  lessonsLearned: string | null;
  marketCondition: string | null;
  createdAt: string;
  updatedAt: string;
}

interface JournalResponse {
  entries: JournalEntry[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

// ============================================================================
// Helpers
// ============================================================================

const ITEMS_PER_PAGE = 20;

function formatFullDate(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00Z');
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00Z');
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function truncate(text: string | null, maxLen: number): string {
  if (!text) return '';
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
}

const MOOD_CONFIG: Record<string, { label: string; variant: 'profit' | 'warning' | 'loss' | 'secondary' }> = {
  confident: { label: 'Confident', variant: 'profit' },
  neutral: { label: 'Neutral', variant: 'secondary' },
  cautious: { label: 'Cautious', variant: 'warning' },
  anxious: { label: 'Anxious', variant: 'loss' },
};

const MARKET_CONFIG: Record<string, { label: string; variant: 'profit' | 'loss' | 'warning' | 'secondary' }> = {
  bullish: { label: 'Bullish', variant: 'profit' },
  bearish: { label: 'Bearish', variant: 'loss' },
  choppy: { label: 'Choppy', variant: 'warning' },
  trending: { label: 'Trending', variant: 'secondary' },
  ranging: { label: 'Ranging', variant: 'secondary' },
};

const EMOTION_CONFIG: Record<string, { label: string; variant: 'profit' | 'loss' | 'warning' | 'secondary' }> = {
  calm: { label: 'Calm', variant: 'profit' },
  disciplined: { label: 'Disciplined', variant: 'profit' },
  frustrated: { label: 'Frustrated', variant: 'loss' },
  greedy: { label: 'Greedy', variant: 'warning' },
  fearful: { label: 'Fearful', variant: 'loss' },
};

function hasContent(entry: JournalEntry): boolean {
  return !!(
    entry.preMarketNotes ||
    entry.postMarketNotes ||
    entry.preMarketMood ||
    entry.emotionalState ||
    entry.marketCondition ||
    entry.biggestWin ||
    entry.biggestMistake ||
    entry.lessonsLearned
  );
}

// ============================================================================
// Component
// ============================================================================

export function JournalHistoryTab() {
  const router = useRouter();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<JournalResponse>({
    queryKey: ['journalHistory', page],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(ITEMS_PER_PAGE),
      });
      const res = await fetch(`/api/journal?${params}`);
      const json = await parseApiJson(res);
      return apiData<JournalResponse>(json);
    },
    staleTime: 2 * 60 * 1000,
  });

  const entries = data?.entries ?? [];
  const pagination = data?.pagination;

  const handleViewEntry = (date: string) => {
    router.push(`/journal?date=${date}`);
  };

  return (
    <Card className="border-zinc-200 dark:border-zinc-700">
      <CardContent className="p-4 pb-6">
        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          </div>
        )}

        {/* Empty state */}
        {!isLoading && entries.length === 0 && (
          <div className="text-center py-12">
            <BookOpen className="h-10 w-10 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No journal entries yet. Start writing in your Journal to see your history here.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => router.push('/journal')}
            >
              Go to Journal
            </Button>
          </div>
        )}

        {/* Journal entries list */}
        {!isLoading && entries.length > 0 && (
          <>
            <div className="space-y-3">
              {entries.map(entry => (
                <div
                  key={entry.id}
                  className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-blue-300 dark:hover:border-blue-700 transition-colors cursor-pointer"
                  onClick={() => handleViewEntry(entry.date)}
                >
                  {/* Header: date + badges */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <h3 className="font-semibold text-zinc-900 dark:text-zinc-50 text-sm sm:text-base">
                        <span className="hidden sm:inline">{formatFullDate(entry.date)}</span>
                        <span className="sm:hidden">{formatShortDate(entry.date)}</span>
                      </h3>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {entry.preMarketMood && MOOD_CONFIG[entry.preMarketMood] && (
                        <Badge variant={MOOD_CONFIG[entry.preMarketMood].variant} className="text-[10px]">
                          {MOOD_CONFIG[entry.preMarketMood].label}
                        </Badge>
                      )}
                      {entry.marketCondition && MARKET_CONFIG[entry.marketCondition] && (
                        <Badge variant={MARKET_CONFIG[entry.marketCondition].variant} className="text-[10px]">
                          {MARKET_CONFIG[entry.marketCondition].label}
                        </Badge>
                      )}
                      {entry.emotionalState && EMOTION_CONFIG[entry.emotionalState] && (
                        <Badge variant={EMOTION_CONFIG[entry.emotionalState].variant} className="text-[10px]">
                          {EMOTION_CONFIG[entry.emotionalState].label}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Notes preview */}
                  {hasContent(entry) && (
                    <div className="space-y-1.5 mb-2">
                      {entry.preMarketNotes && (
                        <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2">
                          <span className="font-medium text-zinc-500">Pre-market:</span>{' '}
                          {truncate(entry.preMarketNotes, 120)}
                        </p>
                      )}
                      {entry.postMarketNotes && (
                        <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2">
                          <span className="font-medium text-zinc-500">Post-market:</span>{' '}
                          {truncate(entry.postMarketNotes, 120)}
                        </p>
                      )}
                      {entry.lessonsLearned && (
                        <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-1">
                          <span className="font-medium text-zinc-500">Lessons:</span>{' '}
                          {truncate(entry.lessonsLearned, 100)}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Health & wellness quick stats */}
                  <div className="flex items-center gap-3 text-[10px] text-zinc-400">
                    {entry.hoursSlept !== null && (
                      <span className="flex items-center gap-1">
                        <Moon className="h-3 w-3" />
                        {entry.hoursSlept}h
                        {entry.sleepQuality && ` (${entry.sleepQuality})`}
                      </span>
                    )}
                    {entry.exercised !== null && (
                      <span className="flex items-center gap-1">
                        <Dumbbell className="h-3 w-3" />
                        {entry.exercised ? 'Yes' : 'No'}
                      </span>
                    )}
                    {entry.stressLevel !== null && (
                      <span className="flex items-center gap-1">
                        <Heart className="h-3 w-3" />
                        Stress: {entry.stressLevel}/10
                      </span>
                    )}
                    {entry.caffeineIntake && (
                      <span className="flex items-center gap-1">
                        <Coffee className="h-3 w-3" />
                        {entry.caffeineIntake}
                      </span>
                    )}
                    <span className="ml-auto flex items-center gap-1 text-blue-500 hover:text-blue-600">
                      <ExternalLink className="h-3 w-3" />
                      View
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {pagination && (
              <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-center gap-3">
                {pagination.hasPrevPage && (
                  <button
                    onClick={() => setPage(p => p - 1)}
                    className="px-3 py-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                  >
                    Previous
                  </button>
                )}
                <span className="text-xs text-zinc-400">
                  Page {pagination.page} of {pagination.totalPages}
                  {' '}({pagination.total} entries)
                </span>
                {pagination.hasNextPage && (
                  <button
                    onClick={() => setPage(p => p + 1)}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                  >
                    Next
                    <ChevronDown className="h-4 w-4 -rotate-90" />
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
