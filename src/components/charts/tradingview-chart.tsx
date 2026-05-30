/**
 * TradingView Lightweight Charts Component
 *
 * Low-level imperative React wrapper around Lightweight Charts v5.
 * This is the only file that imports `lightweight-charts` directly.
 * Uses refs for React Compiler compatibility (no useMemo/useCallback).
 */

'use client';

import { useRef, useEffect, useState } from 'react';
import {
  createChart,
  ColorType,
  CandlestickSeries,
  HistogramSeries,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type CandlestickData,
  type Time,
} from 'lightweight-charts';
import {
  getChartTheme,
  toPriceLineOptions,
  type LWCandlestickData,
  type LWVolumeData,
  type LWMarker,
  type PriceLineInput,
} from '@/lib/charts/tradingview-utils';

interface TradingViewChartProps {
  candlestickData: LWCandlestickData[];
  volumeData?: LWVolumeData[];
  markers?: LWMarker[];
  priceLines?: PriceLineInput[];
  height?: number;
  isDark: boolean;
  autoFit?: boolean;
}

// Use string-based series type keys matching the actual ISeriesApi generic
type CandleSeriesApi = ISeriesApi<'Candlestick'>;
type HistogramSeriesApi = ISeriesApi<'Histogram'>;

export function TradingViewChart({
  candlestickData,
  volumeData,
  markers,
  priceLines,
  height = 300,
  isDark,
  autoFit = true,
}: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<CandleSeriesApi | null>(null);
  const volumeSeriesRef = useRef<HistogramSeriesApi | null>(null);
  const markersHandleRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Create chart on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const theme = getChartTheme(isDark);
    const chart = createChart(containerRef.current, {
      layout: {
        textColor: theme.layout.textColor,
        background: { type: ColorType.Solid, color: theme.layout.background.color },
        attributionLogo: false,
      },
      grid: theme.grid,
      crosshair: theme.crosshair,
      width: containerRef.current.clientWidth,
      height,
      handleScale: { axisPressedMouseMove: true },
      handleScroll: { pressedMouseMove: true },
      timeScale: {
        borderColor: isDark ? '#27272a' : '#e4e4e7',
      },
      rightPriceScale: {
        borderColor: isDark ? '#27272a' : '#e4e4e7',
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, theme.candlestick);

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    setIsReady(true);

    // Resize observer
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        chart.applyOptions({ width: entry.contentRect.width });
      }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      markersHandleRef.current = null;
      setIsReady(false);
    };
    // Only run on mount/unmount — theme changes handled separately
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update theme
  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current) return;
    const theme = getChartTheme(isDark);
    chartRef.current.applyOptions({
      layout: {
        textColor: theme.layout.textColor,
        background: { type: ColorType.Solid, color: theme.layout.background.color },
      },
      grid: theme.grid,
      crosshair: theme.crosshair,
      timeScale: { borderColor: isDark ? '#27272a' : '#e4e4e7' },
      rightPriceScale: { borderColor: isDark ? '#27272a' : '#e4e4e7' },
    });
    candleSeriesRef.current.applyOptions(theme.candlestick);
  }, [isDark]);

  // Update candlestick data
  useEffect(() => {
    if (!isReady || !candleSeriesRef.current) return;
    candleSeriesRef.current.setData(candlestickData as CandlestickData<Time>[]);
    if (autoFit) {
      chartRef.current?.timeScale().fitContent();
    }
  }, [candlestickData, isReady, autoFit]);

  // Update volume data
  useEffect(() => {
    if (!isReady || !volumeSeriesRef.current || !volumeData) return;
    volumeSeriesRef.current.setData(
      volumeData as Array<{ time: Time; value: number; color: string }>
    );
  }, [volumeData, isReady]);

  // Update markers
  useEffect(() => {
    if (!isReady || !candleSeriesRef.current) return;

    // Clean up old markers
    if (markersHandleRef.current) {
      markersHandleRef.current.setMarkers([]);
      markersHandleRef.current = null;
    }

    if (markers && markers.length > 0) {
      markersHandleRef.current = createSeriesMarkers(
        candleSeriesRef.current,
        markers as SeriesMarker<Time>[]
      );
    }
  }, [markers, isReady]);

  // Update price lines
  useEffect(() => {
    if (!isReady || !candleSeriesRef.current) return;
    const series = candleSeriesRef.current;

    // Remove existing price lines
    const existingLines = series.priceLines();
    for (const line of existingLines) {
      series.removePriceLine(line);
    }

    // Add new price lines
    if (priceLines) {
      for (const line of priceLines) {
        series.createPriceLine(toPriceLineOptions(line));
      }
    }
  }, [priceLines, isReady]);

  return (
    <div
      ref={containerRef}
      className="w-full rounded-lg overflow-hidden"
      style={{ height }}
    />
  );
}
