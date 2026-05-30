'use client';

import dynamic from 'next/dynamic';
import { parseApiJson, apiData } from '@/lib/api/client';

/**
 * Trade View Modal Component
 *
 * A responsive trade detail view that shows:
 * - Drawer (bottom sheet) on mobile for natural swipe gestures
 * - Dialog (modal) on desktop for traditional interaction
 *
 * Features:
 * - Visual horizontal timeline of all entries/exits
 * - Position summary with key metrics
 * - Scale In, Edit, and Close actions
 * - Editable notes section
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Edit3,
  X,
  Loader2,
  AlertCircle,
  MessageSquare,
  Check,
  TrendingUp,
  TrendingDown,
  Zap,
  Activity,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { cn, formatCurrency } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/use-media-query';
import type { TradeMarkerInput, PriceLineInput } from '@/lib/charts/tradingview-utils';

const SymbolChart = dynamic(() => import('@/components/charts/symbol-chart'), {
  ssr: false,
  loading: () => (
    <div className="h-50 rounded-lg bg-zinc-100 dark:bg-zinc-800/50 animate-pulse" />
  ),
});

interface PositionEntry {
  id: string;
  date: string;
  time: string | null;
  action: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  amount: number;
  fees: number;
  transCode: string;
}

interface PositionDetails {
  id: string;
  symbol: string;
  positionType: 'stock' | 'option' | 'future';
  side: string;
  quantity: number;
  avgPrice: number;
  costBasis: number;
  optionType: string | null;
  strike: number | null;
  expiration: string | null;
  strategy: string | null;
  firstEntryDate: string;
  account: {
    id: string;
    name: string;
    broker: string;
  };
}

interface PositionStats {
  totalEntries: number;
  totalQuantity: number;
  avgEntryPrice: number;
  totalCostBasis: number;
}

interface TradeNote {
  id: string;
  content: string;
  noteType: string;
  entryReason: string | null;
  createdAt: string;
}

interface PositionApiResponse {
  data: {
    position: PositionDetails;
    entries: PositionEntry[];
    stats: PositionStats;
    notes?: TradeNote[];
  };
}

interface TradeViewModalProps {
  positionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}


function formatShortDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(time: string | null): string {
  if (!time) return '';
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
}

function getDaysHeld(firstEntryDate: string): number {
  const start = new Date(firstEntryDate);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - start.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

async function fetchPositionDetails(positionId: string): Promise<PositionApiResponse['data']> {
  const response = await fetch(`/api/positions/${positionId}`);
  if (!response.ok) {
    throw new Error('Failed to fetch position details');
  }
  const result = await parseApiJson(response);
  return apiData(result);
}

interface NoteData {
  notes: Array<{
    id: string;
    content: string;
    noteType: string;
    ledgerEventId: string | null;
  }>;
}

async function fetchNotesForEntry(ledgerEventId: string): Promise<NoteData> {
  const response = await fetch(`/api/notes?ledgerEventId=${ledgerEventId}&limit=1`);
  if (!response.ok) {
    throw new Error('Failed to fetch notes');
  }
  return apiData(await parseApiJson(response));
}

async function saveNote(data: { ledgerEventId: string; content: string }): Promise<void> {
  const response = await fetch('/api/notes', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ledgerEventId: data.ledgerEventId,
      content: data.content,
      noteType: 'general',
    }),
  });
  if (!response.ok) {
    throw new Error('Failed to save note');
  }
}

/**
 * The main content of the trade view, shared between Dialog and Drawer
 */
function TradeViewContent({
  data,
  isLoading,
  error,
  onScaleIn,
  onEdit,
  onClose,
}: {
  data: PositionApiResponse['data'] | undefined;
  isLoading: boolean;
  error: Error | null;
  onScaleIn: () => void;
  onEdit: () => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const firstEntryId = data?.entries?.[0]?.id;

  // Local draft state - tracks user edits separately from server state
  const [localDraft, setLocalDraft] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Fetch existing note for this entry
  const { data: noteData } = useQuery({
    queryKey: ['trade-note', firstEntryId],
    queryFn: () => fetchNotesForEntry(firstEntryId!),
    enabled: !!firstEntryId,
    staleTime: 30000,
  });

  // Derive the current content: use local draft if user has edited, otherwise server content
  const serverContent = noteData?.notes?.[0]?.content || '';
  const displayContent = localDraft !== null ? localDraft : serverContent;
  const hasChanges = localDraft !== null && localDraft !== serverContent;

  // Save note mutation
  const saveMutation = useMutation({
    mutationFn: saveNote,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trade-note', firstEntryId] });
      setLocalDraft(null); // Clear draft after successful save
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    },
  });

  const handleNoteChange = (value: string) => {
    setLocalDraft(value);
  };

  const handleSaveNote = () => {
    if (!firstEntryId || localDraft === null) return;
    saveMutation.mutate({ ledgerEventId: firstEntryId, content: localDraft });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-4">
        <AlertCircle className="h-12 w-12 text-red-400 mb-4" />
        <p className="text-zinc-600 dark:text-zinc-400 text-lg">
          Unable to load position details
        </p>
        <p className="text-zinc-400 dark:text-zinc-500 text-sm mt-1">
          Please try again later
        </p>
      </div>
    );
  }

  const isStock = data.position.positionType === 'stock';
  const isOption = data.position.positionType === 'option';
  const isFuture = data.position.positionType === 'future';
  const daysHeld = getDaysHeld(data.position.firstEntryDate);

  return (
    <div className="flex flex-col">
      {/* Header Section - pt-6 to clear the dialog close button */}
      <div className="px-4 sm:px-6 pt-6 pb-4">
        {/* Symbol & Type Badge */}
        <div className="flex items-start justify-between gap-3 pr-6">
          <div className="flex items-center gap-3">
            {/* Icon */}
            <div className={cn(
              'p-3 rounded-2xl shrink-0',
              isStock
                ? data.position.side === 'long'
                  ? 'bg-emerald-100 dark:bg-emerald-900/30'
                  : 'bg-orange-100 dark:bg-orange-900/30'
                : isFuture
                  ? 'bg-cyan-100 dark:bg-cyan-900/30'
                  : data.position.optionType === 'call'
                    ? 'bg-blue-100 dark:bg-blue-900/30'
                    : 'bg-purple-100 dark:bg-purple-900/30'
            )}>
              {isStock ? (
                data.position.side === 'long' ? (
                  <TrendingUp className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <TrendingDown className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                )
              ) : isFuture ? (
                <Activity className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
              ) : (
                <Zap className={cn(
                  'h-6 w-6',
                  data.position.optionType === 'call'
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-purple-600 dark:text-purple-400'
                )} />
              )}
            </div>

            {/* Symbol & Details */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                {data.position.symbol}
              </h2>
              {isOption && data.position.strike && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  ${data.position.strike} {data.position.optionType?.toUpperCase()}
                  {data.position.expiration && (
                    <span className="ml-1">
                      - Exp {formatShortDate(data.position.expiration)}
                    </span>
                  )}
                </p>
              )}
              {isStock && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {data.position.side === 'long' ? 'Long' : 'Short'} Position
                </p>
              )}
              {isFuture && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {data.position.side === 'long' ? 'Long' : 'Short'} Futures Position
                </p>
              )}
            </div>
          </div>

          {/* Badges */}
          <div className="flex flex-col items-end gap-1.5">
            <span className={cn(
              'px-2.5 py-1 rounded-full text-xs font-semibold',
              isStock
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                : isFuture
                  ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400'
                  : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
            )}>
              {isStock ? 'STOCK' : isFuture ? 'FUTURE' : 'OPTION'}
            </span>
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              {daysHeld} {daysHeld === 1 ? 'day' : 'days'} held
            </span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="px-4 sm:px-6 py-4 bg-zinc-50 dark:bg-zinc-800/50 border-y border-zinc-200 dark:border-zinc-700">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1">
              {isStock ? 'Shares' : 'Contracts'}
            </p>
            <p className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
              {data.stats.totalQuantity}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1">
              Avg Price
            </p>
            <p className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
              {formatCurrency(data.stats.avgEntryPrice)}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1">
              Cost Basis
            </p>
            <p className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
              {formatCurrency(data.stats.totalCostBasis)}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1">
              Entries
            </p>
            <p className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
              {data.stats.totalEntries}
            </p>
          </div>
        </div>
      </div>

      {/* Price Action Chart */}
      <div className="px-4 sm:px-6 py-4">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">
          Price Action
        </h3>
        <SymbolChart
          symbol={data.position.symbol}
          startDate={data.position.firstEntryDate}
          defaultTimeRange="custom"
          showTimeControls={false}
          showVolume={false}
          height={200}
          trades={data.entries.map((entry) => ({
            date: entry.date,
            action: entry.action,
            price: entry.price,
            label: `${entry.transCode} ${entry.quantity} @ ${formatCurrency(entry.price)}`,
          } satisfies TradeMarkerInput))}
          priceLines={[
            {
              price: data.stats.avgEntryPrice,
              title: 'Avg Entry',
              color: '#10b981',
              lineStyle: 'dashed',
            } satisfies PriceLineInput,
            ...(isOption && data.position.strike
              ? [{
                  price: data.position.strike,
                  title: `$${data.position.strike} Strike`,
                  color: '#8b5cf6',
                  lineStyle: 'dotted' as const,
                } satisfies PriceLineInput]
              : []),
          ]}
        />
      </div>

      {/* Timeline Section */}
      <div className="px-4 sm:px-6 py-5">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4">
          Trade Timeline
        </h3>

        {data.entries.length === 0 ? (
          <div className="py-8 text-center text-zinc-400 dark:text-zinc-500">
            No entries found
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:-mx-6 px-4 sm:px-6">
            <div className="inline-flex items-center gap-0 min-w-max pb-2">
              {data.entries.map((entry, index) => {
                const isBuy = entry.action === 'BUY' || ['BTO', 'STO', 'BUY'].includes(entry.transCode);
                const isLast = index === data.entries.length - 1;

                return (
                  <div key={entry.id} className="flex items-center">
                    {/* Entry Point */}
                    <div className="flex flex-col items-center">
                      {/* Date & Time */}
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-2 whitespace-nowrap text-center">
                        <div className="font-medium">{formatShortDate(entry.date)}</div>
                        {entry.time && (
                          <div className="text-zinc-400 dark:text-zinc-500">{formatTime(entry.time)}</div>
                        )}
                      </div>

                      {/* Circle */}
                      <div className={cn(
                        'w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-sm font-bold shadow-lg',
                        isBuy
                          ? 'bg-emerald-500 text-white ring-4 ring-emerald-500/20'
                          : 'bg-red-500 text-white ring-4 ring-red-500/20'
                      )}>
                        {isBuy ? 'B' : 'S'}
                      </div>

                      {/* Quantity & Price */}
                      <div className="mt-2 text-center">
                        <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          {entry.quantity}
                        </div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400">
                          @ {formatCurrency(entry.price)}
                        </div>
                      </div>
                    </div>

                    {/* Connector Line */}
                    {!isLast && (
                      <div className="w-8 sm:w-12 h-0.5 bg-zinc-300 dark:bg-zinc-600 mx-1" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Notes Section - Always visible and editable */}
      <div className="border-t border-zinc-200 dark:border-zinc-700 px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
            <MessageSquare className="h-4 w-4" />
            <span className="text-sm font-semibold">Notes</span>
          </div>
          {hasChanges && (
            <Button
              size="sm"
              onClick={handleSaveNote}
              disabled={saveMutation.isPending}
              className="h-7 px-3 text-xs gap-1.5 bg-rh-green hover:bg-rh-green/90"
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : saveSuccess ? (
                <Check className="h-3 w-3" />
              ) : null}
              {saveSuccess ? 'Saved!' : 'Save'}
            </Button>
          )}
          {!hasChanges && saveSuccess && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <Check className="h-3 w-3" />
              Saved
            </span>
          )}
        </div>
        <Textarea
          placeholder="Add notes about this trade... (entry thesis, market conditions, lessons learned)"
          value={displayContent}
          onChange={(e) => handleNoteChange(e.target.value)}
          className="min-h-20 resize-none text-sm bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700 focus:ring-rh-green"
        />
      </div>

      {/* Action Buttons */}
      <div className="px-4 sm:px-6 py-4 border-t border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Scale In - Secondary Action */}
          {!isFuture && (
            <Button
              variant="outline"
              onClick={onScaleIn}
              className="flex-1 h-12 sm:h-11 gap-2 text-blue-600 border-blue-200 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:hover:bg-blue-900/20"
            >
              <Plus className="h-4 w-4" />
              Scale In
            </Button>
          )}

          {/* Edit */}
          {!isFuture && (
            <Button
              variant="outline"
              onClick={onEdit}
              className="flex-1 h-12 sm:h-11 gap-2"
            >
              <Edit3 className="h-4 w-4" />
              Edit
            </Button>
          )}

          {/* Close Position - Primary Action */}
          <Button
            onClick={onClose}
            className="flex-1 h-12 sm:h-11 gap-2 bg-orange-500 hover:bg-orange-600 text-white"
          >
            <X className="h-4 w-4" />
            Close Position
          </Button>
        </div>
      </div>
    </div>
  );
}

export function TradeViewModal({ positionId, open, onOpenChange }: TradeViewModalProps) {
  const router = useRouter();
  const isDesktop = useMediaQuery('(min-width: 768px)');

  const { data, isLoading, error } = useQuery({
    queryKey: ['positionDetails', positionId],
    queryFn: () => fetchPositionDetails(positionId),
    enabled: open && !!positionId,
  });

  const handleScaleIn = () => {
    if (!data?.position) return;
    const position = data.position;

    if (position.positionType === 'future') {
      return;
    }
    if (position.positionType === 'stock') {
      router.push(`/trade/new/stock?symbol=${position.symbol}&side=${position.side}&scaleIn=${position.id}`);
    } else {
      const strategy = position.strategy || 'long_call';
      router.push(`/trade/new/option/${strategy}?symbol=${position.symbol}&scaleIn=${position.id}`);
    }
    onOpenChange(false);
  };

  const handleEdit = () => {
    if (!data?.position || !data.entries || data.entries.length === 0) return;
    const position = data.position;

    // Use the first entry's ID (LedgerEvent ID), not the position ID
    const firstEntryId = data.entries[0].id;

    if (position.positionType === 'future') {
      return;
    }
    if (position.positionType === 'stock') {
      router.push(`/trade/edit/stock/${firstEntryId}`);
    } else {
      router.push(`/trade/edit/option/${firstEntryId}`);
    }
    onOpenChange(false);
  };

  const handleClose = () => {
    if (!data?.position) return;
    router.push(`/trade/close?positionId=${data.position.id}`);
    onOpenChange(false);
  };

  // Desktop: Use Dialog
  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>
              {data?.position ? `${data.position.symbol} Position Details` : 'Position Details'}
            </DialogTitle>
          </DialogHeader>
          <TradeViewContent
            data={data}
            isLoading={isLoading}
            error={error}
            onScaleIn={handleScaleIn}
            onEdit={handleEdit}
            onClose={handleClose}
          />
        </DialogContent>
      </Dialog>
    );
  }

  // Mobile: Use Drawer (bottom sheet)
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader className="sr-only">
          <DrawerTitle>
            {data?.position ? `${data.position.symbol} Position Details` : 'Position Details'}
          </DrawerTitle>
        </DrawerHeader>
        <div className="overflow-y-auto">
          <TradeViewContent
            data={data}
            isLoading={isLoading}
            error={error}
            onScaleIn={handleScaleIn}
            onEdit={handleEdit}
            onClose={handleClose}
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
