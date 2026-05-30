/**
 * Shared constants for Import page components
 */

import type { DateRangeOption } from './types';

/** Format date in local timezone (YYYY-MM-DD) */
export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Get start of week (Monday) in local timezone */
function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export const DATE_RANGE_OPTIONS: DateRangeOption[] = [
  {
    label: 'Today',
    value: 'today',
    forceRefresh: true,
    getRange: () => {
      const today = formatLocalDate(new Date());
      return { startDate: today, endDate: today };
    },
  },
  {
    label: 'This Week',
    value: 'this_week',
    forceRefresh: true,
    getRange: () => {
      const end = new Date();
      const start = getStartOfWeek(end);
      return { startDate: formatLocalDate(start), endDate: formatLocalDate(end) };
    },
  },
  {
    label: 'Last 7 Days',
    value: '7d',
    forceRefresh: true,
    getRange: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 7);
      return { startDate: formatLocalDate(start), endDate: formatLocalDate(end) };
    },
  },
  {
    label: 'Last Week',
    value: 'last_week',
    getRange: () => {
      const thisWeekStart = getStartOfWeek(new Date());
      const lastWeekEnd = new Date(thisWeekStart);
      lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
      const lastWeekStart = getStartOfWeek(lastWeekEnd);
      return { startDate: formatLocalDate(lastWeekStart), endDate: formatLocalDate(lastWeekEnd) };
    },
  },
  {
    label: 'Everything',
    value: 'everything',
    getRange: () => ({ startDate: null, endDate: null }),
  },
  {
    label: 'Last Year',
    value: '1y',
    getRange: () => {
      const end = new Date();
      const start = new Date();
      start.setFullYear(start.getFullYear() - 1);
      return { startDate: formatLocalDate(start), endDate: formatLocalDate(end) };
    },
  },
  {
    label: 'Last 6 Months',
    value: '6m',
    getRange: () => {
      const end = new Date();
      const start = new Date();
      start.setMonth(start.getMonth() - 6);
      return { startDate: formatLocalDate(start), endDate: formatLocalDate(end) };
    },
  },
  {
    label: 'Last 3 Months',
    value: '3m',
    getRange: () => {
      const end = new Date();
      const start = new Date();
      start.setMonth(start.getMonth() - 3);
      return { startDate: formatLocalDate(start), endDate: formatLocalDate(end) };
    },
  },
  {
    label: 'Last Month',
    value: '1m',
    getRange: () => {
      const end = new Date();
      const start = new Date();
      start.setMonth(start.getMonth() - 1);
      return { startDate: formatLocalDate(start), endDate: formatLocalDate(end) };
    },
  },
  {
    label: 'Year to Date',
    value: 'ytd',
    getRange: () => {
      const end = new Date();
      const start = new Date(end.getFullYear(), 0, 1);
      return { startDate: formatLocalDate(start), endDate: formatLocalDate(end) };
    },
  },
  {
    label: 'Custom Range',
    value: 'custom',
    getRange: () => ({ startDate: null, endDate: null }),
  },
];

export const BROKER_CONFIG = {
  robinhood: {
    name: 'Robinhood',
    color: 'bg-green-500',
    textColor: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-950/30',
    borderColor: 'border-green-200 dark:border-green-800',
    supported: true,
    supportsSync: true,
    fileType: 'CSV',
    fileExtension: '.csv',
    instructions: [
      'Log in to Robinhood on the web',
      'Go to Account → Statements & History',
      'Click "Generate New" under Reports',
      'Select your date range and download CSV',
    ],
  },
  schwab: {
    name: 'Charles Schwab',
    color: 'bg-blue-600',
    textColor: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    borderColor: 'border-blue-200 dark:border-blue-800',
    supported: true,
    supportsSync: true,
    fileType: 'JSON',
    fileExtension: '.json',
    instructions: [
      'Log in to Schwab.com',
      'Go to Accounts → History',
      'Set your date range and click Search',
      'Click Export and select JSON format',
    ],
  },
  fidelity: {
    name: 'Fidelity',
    color: 'bg-emerald-600',
    textColor: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
    borderColor: 'border-emerald-200 dark:border-emerald-800',
    supported: true,
    supportsSync: true,
    fileType: null,
    fileExtension: null,
    instructions: [] as readonly string[],
  },
  interactive_brokers: {
    name: 'Interactive Brokers',
    color: 'bg-red-600',
    textColor: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-950/30',
    borderColor: 'border-red-200 dark:border-red-800',
    supported: true,
    supportsSync: true,
    fileType: null,
    fileExtension: null,
    instructions: [] as readonly string[],
  },
  td_ameritrade: {
    name: 'TD Ameritrade',
    color: 'bg-green-700',
    textColor: 'text-green-700 dark:text-green-500',
    bgColor: 'bg-green-50 dark:bg-green-950/30',
    borderColor: 'border-green-200 dark:border-green-800',
    supported: false,
    supportsSync: false,
    fileType: 'CSV',
    fileExtension: '.csv',
    instructions: [] as readonly string[],
  },
  etrade: {
    name: 'E*TRADE',
    color: 'bg-purple-600',
    textColor: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-50 dark:bg-purple-950/30',
    borderColor: 'border-purple-200 dark:border-purple-800',
    supported: false,
    supportsSync: false,
    fileType: 'CSV',
    fileExtension: '.csv',
    instructions: [] as readonly string[],
  },
} as const;
