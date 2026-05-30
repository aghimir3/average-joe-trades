'use client';

/**
 * Sentiment Tab
 *
 * Allows users to log their market sentiment (bullish/neutral/bearish)
 * for specific timeframes, with edit history tracking.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  History,
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  fetchSentimentEntries,
  createOrUpdateSentiment,
  updateSentimentEntry,
  deleteSentimentEntry,
} from './lib/api';
import type {
  SentimentEntry,
  SentimentValue,
  SentimentTimeframe,
  SentimentEditHistoryItem,
} from './lib/types';

// ============================================================================
// Constants
// ============================================================================

const TIMEFRAME_CONFIG: {
  id: SentimentTimeframe;
  label: string;
  shortLabel: string;
}[] = [
  { id: 'eod', label: 'End of Day', shortLabel: 'EOD' },
  { id: 'this_week', label: 'This Week', shortLabel: 'Week' },
  { id: 'this_month', label: 'This Month', shortLabel: 'Month' },
  { id: 'this_quarter', label: 'This Quarter', shortLabel: 'Quarter' },
];

const SENTIMENT_CONFIG: {
  value: SentimentValue;
  label: string;
  icon: typeof TrendingUp;
  color: string;
  bgColor: string;
  borderColor: string;
  ringColor: string;
}[] = [
  {
    value: 'bullish',
    label: 'Bullish',
    icon: TrendingUp,
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
    borderColor: 'border-emerald-200 dark:border-emerald-800',
    ringColor: 'ring-emerald-500',
  },
  {
    value: 'neutral',
    label: 'Neutral',
    icon: Minus,
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-950/30',
    borderColor: 'border-amber-200 dark:border-amber-800',
    ringColor: 'ring-amber-500',
  },
  {
    value: 'bearish',
    label: 'Bearish',
    icon: TrendingDown,
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-950/30',
    borderColor: 'border-red-200 dark:border-red-800',
    ringColor: 'ring-red-500',
  },
];

function getSentimentConfig(value: SentimentValue) {
  return SENTIMENT_CONFIG.find((s) => s.value === value) ?? SENTIMENT_CONFIG[1];
}

function getTimeframeConfig(id: SentimentTimeframe) {
  return TIMEFRAME_CONFIG.find((t) => t.id === id) ?? TIMEFRAME_CONFIG[0];
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ============================================================================
// Sentiment Selector Buttons
// ============================================================================

function SentimentSelector({
  selected,
  onSelect,
}: {
  selected: SentimentValue | null;
  onSelect: (value: SentimentValue) => void;
}) {
  return (
    <div className="flex gap-2">
      {SENTIMENT_CONFIG.map((config) => {
        const Icon = config.icon;
        const isSelected = selected === config.value;
        return (
          <button
            key={config.value}
            onClick={() => onSelect(config.value)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all',
              isSelected
                ? `${config.bgColor} ${config.borderColor} ${config.color} ring-2 ${config.ringColor}`
                : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{config.label}</span>
            <span className="sm:hidden">{config.label.charAt(0)}</span>
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// Edit History Drawer
// ============================================================================

function EditHistorySection({ history }: { history: SentimentEditHistoryItem[] }) {
  const [expanded, setExpanded] = useState(false);

  if (history.length === 0) return null;

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-[11px] text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
      >
        <History className="h-3 w-3" />
        <span>{history.length} edit{history.length !== 1 ? 's' : ''}</span>
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {expanded && (
        <div className="mt-1.5 space-y-1 pl-4 border-l-2 border-zinc-200 dark:border-zinc-700">
          {history.map((edit) => {
            const config = getSentimentConfig(edit.previousSentiment);
            return (
              <div key={edit.id} className="text-[11px] text-zinc-500 dark:text-zinc-400">
                <span className={config.color}>{config.label}</span>
                {edit.previousNotes && (
                  <span className="text-zinc-400 dark:text-zinc-500"> — {edit.previousNotes}</span>
                )}
                <span className="text-zinc-400 dark:text-zinc-500 ml-1">
                  ({formatRelativeTime(edit.editedAt)})
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Sentiment Card (existing entry)
// ============================================================================

function SentimentCard({
  entry,
  onEdit,
  onDelete,
  isDeleting,
}: {
  entry: SentimentEntry;
  onEdit: (entry: SentimentEntry) => void;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}) {
  const sentimentConfig = getSentimentConfig(entry.sentiment);
  const timeframeConfig = getTimeframeConfig(entry.timeframe);
  const Icon = sentimentConfig.icon;

  return (
    <div
      className={cn(
        'rounded-xl border p-4 transition-all',
        sentimentConfig.borderColor,
        sentimentConfig.bgColor
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-lg',
              sentimentConfig.color,
              'bg-white/60 dark:bg-zinc-900/40'
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={cn('text-sm font-semibold', sentimentConfig.color)}>
                {sentimentConfig.label}
              </span>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {timeframeConfig.label}
              </Badge>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
              <Clock className="h-3 w-3" />
              <span>{formatRelativeTime(entry.updatedAt)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => onEdit(entry)}
            className="rounded-md p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-white/50 dark:hover:bg-zinc-800/50 transition-colors"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDelete(entry.id)}
            disabled={isDeleting}
            className="rounded-md p-1.5 text-zinc-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-white/50 dark:hover:bg-zinc-800/50 transition-colors disabled:opacity-50"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {entry.notes && (
        <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
          {entry.notes}
        </p>
      )}

      <EditHistorySection history={entry.editHistory} />
    </div>
  );
}

// ============================================================================
// New/Edit Sentiment Form
// ============================================================================

function SentimentForm({
  initialSentiment,
  initialNotes,
  timeframe,
  onSubmit,
  onCancel,
  isSubmitting,
  mode,
}: {
  initialSentiment?: SentimentValue;
  initialNotes?: string;
  timeframe?: SentimentTimeframe;
  onSubmit: (sentiment: SentimentValue, notes: string, timeframe?: SentimentTimeframe) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  mode: 'create' | 'edit';
}) {
  const [sentiment, setSentiment] = useState<SentimentValue | null>(initialSentiment ?? null);
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [selectedTimeframe, setSelectedTimeframe] = useState<SentimentTimeframe | null>(
    timeframe ?? null
  );

  const canSubmit = sentiment !== null && (mode === 'edit' || selectedTimeframe !== null);

  return (
    <Card className="border-violet-200 dark:border-violet-800/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {mode === 'create' ? 'Log New Sentiment' : 'Edit Sentiment'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pb-6">
        {/* Timeframe selector (only for create) */}
        {mode === 'create' && (
          <div>
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5 block">
              Timeframe
            </label>
            <div className="flex gap-2 flex-wrap">
              {TIMEFRAME_CONFIG.map((tf) => (
                <button
                  key={tf.id}
                  onClick={() => setSelectedTimeframe(tf.id)}
                  className={cn(
                    'rounded-lg border px-3 py-1.5 text-xs font-medium transition-all',
                    selectedTimeframe === tf.id
                      ? 'border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300 ring-2 ring-violet-500'
                      : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600'
                  )}
                >
                  {tf.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Sentiment selector */}
        <div>
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5 block">
            Sentiment
          </label>
          <SentimentSelector selected={sentiment} onSelect={setSentiment} />
        </div>

        {/* Notes */}
        <div>
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5 block">
            Notes (optional)
          </label>
          <Textarea
            placeholder="Why do you feel this way about the market?"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="min-h-16 resize-none text-sm"
            maxLength={500}
          />
          <p className="text-[10px] text-zinc-400 mt-1 text-right">{notes.length}/500</p>
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              if (sentiment && (mode === 'edit' || selectedTimeframe)) {
                onSubmit(sentiment, notes, selectedTimeframe ?? undefined);
              }
            }}
            disabled={!canSubmit || isSubmitting}
            className="bg-violet-600 hover:bg-violet-700 text-white"
          >
            {isSubmitting ? 'Saving...' : mode === 'create' ? 'Log Sentiment' : 'Update'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main Sentiment Tab
// ============================================================================

export function SentimentTab() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<SentimentEntry | null>(null);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['sentiment-entries'],
    queryFn: fetchSentimentEntries,
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: (params: {
      sentiment: SentimentValue;
      timeframe: SentimentTimeframe;
      notes?: string;
    }) => createOrUpdateSentiment(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sentiment-entries'] });
      setShowForm(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (params: { id: string; sentiment: SentimentValue; notes?: string }) =>
      updateSentimentEntry(params.id, {
        sentiment: params.sentiment,
        notes: params.notes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sentiment-entries'] });
      setEditingEntry(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSentimentEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sentiment-entries'] });
    },
  });

  const handleCreate = (sentiment: SentimentValue, notes: string, timeframe?: SentimentTimeframe) => {
    if (!timeframe) return;
    createMutation.mutate({ sentiment, timeframe, notes: notes || undefined });
  };

  const handleUpdate = (sentiment: SentimentValue, notes: string) => {
    if (!editingEntry) return;
    updateMutation.mutate({ id: editingEntry.id, sentiment, notes: notes || undefined });
  };

  const handleEdit = (entry: SentimentEntry) => {
    setEditingEntry(entry);
    setShowForm(false);
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  // Find which timeframes already have entries
  const usedTimeframes = new Set(entries.map((e) => e.timeframe));
  const hasAvailableTimeframes = TIMEFRAME_CONFIG.some((tf) => !usedTimeframes.has(tf.id));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Sentiment Logger
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Track your market outlook across different timeframes
          </p>
        </div>
        {hasAvailableTimeframes && !showForm && !editingEntry && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowForm(true)}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Log Sentiment</span>
            <span className="sm:hidden">Log</span>
          </Button>
        )}
      </div>

      {/* Create Form */}
      {showForm && (
        <SentimentForm
          mode="create"
          onSubmit={handleCreate}
          onCancel={() => setShowForm(false)}
          isSubmitting={createMutation.isPending}
        />
      )}

      {/* Edit Form */}
      {editingEntry && (
        <SentimentForm
          mode="edit"
          initialSentiment={editingEntry.sentiment}
          initialNotes={editingEntry.notes ?? ''}
          timeframe={editingEntry.timeframe}
          onSubmit={handleUpdate}
          onCancel={() => setEditingEntry(null)}
          isSubmitting={updateMutation.isPending}
        />
      )}

      {/* Entries */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-xl bg-zinc-100 dark:bg-zinc-800/50 animate-pulse"
            />
          ))}
        </div>
      ) : entries.length === 0 && !showForm ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 pb-6">
            <div className="rounded-full bg-violet-100 dark:bg-violet-950/30 p-3 mb-3">
              <TrendingUp className="h-6 w-6 text-violet-500" />
            </div>
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              No sentiment logged yet
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 text-center max-w-xs">
              Start tracking your market outlook to build a record of your trading intuition
            </p>
            <Button
              size="sm"
              onClick={() => setShowForm(true)}
              className="mt-4 bg-violet-600 hover:bg-violet-700 text-white gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Log Your First Sentiment
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {entries.map((entry) => (
            <SentimentCard
              key={entry.id}
              entry={entry}
              onEdit={handleEdit}
              onDelete={handleDelete}
              isDeleting={deleteMutation.isPending}
            />
          ))}
        </div>
      )}

      {/* Summary bar when entries exist */}
      {entries.length > 0 && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3">
          <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-2">
            Current Outlook
          </p>
          <div className="flex gap-3">
            {(['bullish', 'neutral', 'bearish'] as const).map((s) => {
              const config = getSentimentConfig(s);
              const count = entries.filter((e) => e.sentiment === s).length;
              return (
                <div key={s} className="flex items-center gap-1.5">
                  <div
                    className={cn(
                      'h-2 w-2 rounded-full',
                      count > 0
                        ? s === 'bullish'
                          ? 'bg-emerald-500'
                          : s === 'neutral'
                            ? 'bg-amber-500'
                            : 'bg-red-500'
                        : 'bg-zinc-300 dark:bg-zinc-600'
                    )}
                  />
                  <span
                    className={cn(
                      'text-xs',
                      count > 0 ? config.color : 'text-zinc-400 dark:text-zinc-500'
                    )}
                  >
                    {config.label}: {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
