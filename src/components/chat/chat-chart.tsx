'use client';

/**
 * Chat Chart Renderer
 *
 * Renders interactive Chart.js charts inline in Joey's chat responses.
 * Accepts a JSON spec from a ```chart code block and renders line, bar,
 * or doughnut charts with dark/light mode support and currency formatting.
 */

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  type ChartOptions,
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { chartTooltipStyle } from '@/lib/utils';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
);

export interface ChatChartSpec {
  type: 'line' | 'bar' | 'doughnut';
  title?: string;
  data: {
    labels: string[];
    datasets: Array<{
      label: string;
      data: number[];
      backgroundColor?: string | string[];
      borderColor?: string | string[];
    }>;
  };
  options?: {
    formatAsCurrency?: boolean;
    stacked?: boolean;
  };
}

const CHART_COLORS = [
  '#10b981', // emerald-500
  '#3b82f6', // blue-500
  '#8b5cf6', // violet-500
  '#f59e0b', // amber-500
  '#ec4899', // pink-500
  '#06b6d4', // cyan-500
];

const POSITIVE_COLOR = '#10b981';
const NEGATIVE_COLOR = '#ef4444';

function formatCurrencyValue(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/** Max data points to render — prevents browser hang from oversized payloads */
const MAX_LABELS = 100;
const MAX_DATASETS = 10;

function isValidSpec(spec: unknown): spec is ChatChartSpec {
  if (!spec || typeof spec !== 'object') return false;
  const s = spec as Record<string, unknown>;
  if (!['line', 'bar', 'doughnut'].includes(s.type as string)) return false;
  if (!s.data || typeof s.data !== 'object') return false;
  const d = s.data as Record<string, unknown>;
  if (!Array.isArray(d.labels) || !Array.isArray(d.datasets)) return false;
  if (d.datasets.length === 0 || d.datasets.length > MAX_DATASETS) return false;
  if (d.labels.length > MAX_LABELS) return false;
  return true;
}

function applyDefaultColors(spec: ChatChartSpec): ChatChartSpec {
  const datasets = spec.data.datasets.map((ds, i) => {
    if (ds.backgroundColor || ds.borderColor) return ds;

    if (spec.type === 'doughnut') {
      return {
        ...ds,
        backgroundColor: CHART_COLORS.slice(0, ds.data.length),
        borderColor: 'transparent',
      };
    }

    if (spec.type === 'bar' && ds.data.some((v) => v < 0)) {
      return {
        ...ds,
        backgroundColor: ds.data.map((v) =>
          v >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR,
        ),
        borderColor: 'transparent',
      };
    }

    const color = CHART_COLORS[i % CHART_COLORS.length];
    return {
      ...ds,
      backgroundColor:
        spec.type === 'line' ? `${color}1a` : color,
      borderColor: color,
    };
  });

  return { ...spec, data: { ...spec.data, datasets } };
}

interface ChatChartProps {
  spec: ChatChartSpec;
}

export default function ChatChart({ spec: rawSpec }: ChatChartProps) {
  if (!isValidSpec(rawSpec)) {
    return (
      <div className="text-sm text-zinc-500 italic py-2">
        Could not render chart — invalid data format.
      </div>
    );
  }

  const spec = applyDefaultColors(rawSpec);
  const isCurrency = spec.options?.formatAsCurrency ?? false;

  const baseCartesianOptions: ChartOptions<'line' | 'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: spec.data.datasets.length > 1,
        labels: { color: '#a1a1aa', font: { size: 11 } },
      },
      title: spec.title
        ? {
            display: true,
            text: spec.title,
            color: '#a1a1aa',
            font: { size: 13, weight: 'bold' as const },
            padding: { bottom: 8 },
          }
        : { display: false },
      tooltip: {
        ...chartTooltipStyle,
        callbacks: isCurrency
          ? { label: (ctx) => `${ctx.dataset.label}: ${formatCurrencyValue(ctx.raw as number)}` }
          : undefined,
      },
    },
    scales: {
      x: {
        ticks: { color: '#71717a', font: { size: 10 } },
        grid: { display: false },
        stacked: spec.options?.stacked,
      },
      y: {
        ticks: {
          color: '#71717a',
          font: { size: 10 },
          callback: isCurrency
            ? (value) => formatCurrencyValue(value as number)
            : undefined,
        },
        grid: { color: 'rgba(63, 63, 70, 0.15)' },
        stacked: spec.options?.stacked,
      },
    },
  };

  const doughnutOptions: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'right',
        labels: { color: '#a1a1aa', font: { size: 11 }, padding: 8 },
      },
      title: spec.title
        ? {
            display: true,
            text: spec.title,
            color: '#a1a1aa',
            font: { size: 13, weight: 'bold' as const },
            padding: { bottom: 8 },
          }
        : { display: false },
      tooltip: {
        ...chartTooltipStyle,
        callbacks: isCurrency
          ? { label: (ctx) => `${ctx.label}: ${formatCurrencyValue(ctx.raw as number)}` }
          : undefined,
      },
    },
  };

  return (
    <div className="h-52 w-full my-2">
      {spec.type === 'line' && (
        <Line
          data={{
            labels: spec.data.labels,
            datasets: spec.data.datasets.map((ds) => ({
              ...ds,
              tension: 0.3,
              pointRadius: spec.data.labels.length > 20 ? 0 : 3,
              borderWidth: 2,
              fill: spec.data.datasets.length === 1,
            })),
          }}
          options={baseCartesianOptions as ChartOptions<'line'>}
        />
      )}
      {spec.type === 'bar' && (
        <Bar
          data={{
            labels: spec.data.labels,
            datasets: spec.data.datasets.map((ds) => ({
              ...ds,
              borderRadius: 4,
              borderWidth: 0,
            })),
          }}
          options={baseCartesianOptions as ChartOptions<'bar'>}
        />
      )}
      {spec.type === 'doughnut' && (
        <Doughnut
          data={{
            labels: spec.data.labels,
            datasets: spec.data.datasets.map((ds) => ({
              ...ds,
              borderWidth: 2,
              borderColor: 'rgba(39, 39, 42, 0.3)',
            })),
          }}
          options={doughnutOptions}
        />
      )}
    </div>
  );
}
