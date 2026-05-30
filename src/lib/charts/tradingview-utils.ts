/**
 * TradingView Lightweight Charts Utility Functions
 *
 * Pure data conversion between app types and Lightweight Charts v5 format.
 * No React code — just data transformation.
 */

import { LineStyle } from 'lightweight-charts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LWCandlestickData {
  time: string; // 'YYYY-MM-DD'
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface LWVolumeData {
  time: string;
  value: number;
  color: string;
}

export interface TradeMarkerInput {
  date: string; // ISO date or 'YYYY-MM-DD'
  action: 'BUY' | 'SELL';
  price: number;
  label?: string;
}

export interface LWMarker {
  time: string;
  position: 'belowBar' | 'aboveBar';
  color: string;
  shape: 'arrowUp' | 'arrowDown';
  text: string;
  price: number;
}

export interface PriceLineInput {
  price: number;
  title: string;
  color: string;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
}

export interface LWChartTheme {
  layout: {
    textColor: string;
    background: { type: 'solid'; color: string };
  };
  grid: {
    vertLines: { color: string };
    horzLines: { color: string };
  };
  crosshair: {
    vertLine: { color: string; labelBackgroundColor: string };
    horzLine: { color: string; labelBackgroundColor: string };
  };
  candlestick: {
    upColor: string;
    downColor: string;
    wickUpColor: string;
    wickDownColor: string;
    borderVisible: boolean;
  };
  volumeUp: string;
  volumeDown: string;
}

// ---------------------------------------------------------------------------
// Data Conversion
// ---------------------------------------------------------------------------

/** Extract YYYY-MM-DD from an ISO timestamp or date string. */
function toDateStr(isoOrDate: string): string {
  return isoOrDate.slice(0, 10);
}

/** Convert API bar response to Lightweight Charts candlestick format. */
export function barsToLWCandlestick(
  bars: Array<{ timestamp: string; open: number; high: number; low: number; close: number }>
): LWCandlestickData[] {
  return bars.map((b) => ({
    time: toDateStr(b.timestamp),
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
  }));
}

/** Convert API bar response to volume histogram format with up/down coloring. */
export function barsToLWVolume(
  bars: Array<{ timestamp: string; open: number; close: number; volume: number }>,
  upColor: string,
  downColor: string
): LWVolumeData[] {
  return bars.map((b) => ({
    time: toDateStr(b.timestamp),
    value: b.volume,
    color: b.close >= b.open ? upColor : downColor,
  }));
}

// ---------------------------------------------------------------------------
// Trade Markers
// ---------------------------------------------------------------------------

/**
 * Convert trade entries to Lightweight Charts markers.
 * BUY = green arrowUp below bar, SELL = red arrowDown above bar.
 */
export function tradesToMarkers(trades: TradeMarkerInput[]): LWMarker[] {
  return trades
    .map((t) => ({
      time: toDateStr(t.date),
      position: (t.action === 'BUY' ? 'belowBar' : 'aboveBar') as 'belowBar' | 'aboveBar',
      color: t.action === 'BUY' ? '#10b981' : '#ef4444',
      shape: (t.action === 'BUY' ? 'arrowUp' : 'arrowDown') as 'arrowUp' | 'arrowDown',
      text: t.label ?? t.action,
      price: t.price,
    }))
    .sort((a, b) => a.time.localeCompare(b.time));
}

// ---------------------------------------------------------------------------
// Price Lines
// ---------------------------------------------------------------------------

const LINE_STYLE_MAP: Record<string, LineStyle> = {
  solid: LineStyle.Solid,
  dashed: LineStyle.Dashed,
  dotted: LineStyle.Dotted,
};

/** Convert a PriceLineInput to Lightweight Charts createPriceLine options. */
export function toPriceLineOptions(input: PriceLineInput) {
  return {
    price: input.price,
    color: input.color,
    lineWidth: 1 as const,
    lineStyle: LINE_STYLE_MAP[input.lineStyle ?? 'dashed'] ?? LineStyle.Dashed,
    axisLabelVisible: true,
    title: input.title,
  };
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

/** Return chart theme matching the app's Tailwind zinc palette. */
export function getChartTheme(isDark: boolean): LWChartTheme {
  if (isDark) {
    return {
      layout: {
        textColor: '#a1a1aa', // zinc-400
        background: { type: 'solid', color: '#09090b' }, // zinc-950
      },
      grid: {
        vertLines: { color: 'rgba(39, 39, 42, 0.5)' }, // zinc-800 @ 50%
        horzLines: { color: 'rgba(39, 39, 42, 0.5)' },
      },
      crosshair: {
        vertLine: { color: '#71717a', labelBackgroundColor: 'rgba(39, 39, 42, 0.95)' },
        horzLine: { color: '#71717a', labelBackgroundColor: 'rgba(39, 39, 42, 0.95)' },
      },
      candlestick: {
        upColor: '#10b981',
        downColor: '#ef4444',
        wickUpColor: '#10b981',
        wickDownColor: '#ef4444',
        borderVisible: false,
      },
      volumeUp: 'rgba(16, 185, 129, 0.3)',
      volumeDown: 'rgba(239, 68, 68, 0.3)',
    };
  }

  return {
    layout: {
      textColor: '#71717a', // zinc-500
      background: { type: 'solid', color: '#ffffff' },
    },
    grid: {
      vertLines: { color: 'rgba(228, 228, 231, 0.5)' }, // zinc-200 @ 50%
      horzLines: { color: 'rgba(228, 228, 231, 0.5)' },
    },
    crosshair: {
      vertLine: { color: '#a1a1aa', labelBackgroundColor: 'rgba(250, 250, 250, 0.95)' },
      horzLine: { color: '#a1a1aa', labelBackgroundColor: 'rgba(250, 250, 250, 0.95)' },
    },
    candlestick: {
      upColor: '#10b981',
      downColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
      borderVisible: false,
    },
    volumeUp: 'rgba(16, 185, 129, 0.2)',
    volumeDown: 'rgba(239, 68, 68, 0.2)',
  };
}
