/**
 * Dashboard Types
 * Centralized type definitions for all dashboard components
 */

import type { LucideIcon } from 'lucide-react';

// ============================================================================
// Brokerage Account Types
// ============================================================================

export interface BrokerageAccount {
  id: string;
  name: string;
  broker: string;
  isDefault: boolean;
  isActive: boolean;
  externalAccountId?: string | null;
}

export interface SnapTradeAccount {
  id: string;
  name: string;
  institutionName: string;
  isSynced: boolean;
  brokerageAccountId: string | null;
  snaptradeSync?: {
    isInitialSyncComplete: boolean;
    firstTransactionDate: string | null;
    lastSuccessfulSync: string | null;
    status: 'ready' | 'syncing' | 'limited';
  };
}

export interface SnapTradeStatus {
  configured: boolean;
  isConnected: boolean;
  connections?: Array<{
    id: string;
    brokerageName: string;
    brokerageSlug?: string;
    brokerageDisplayName?: string;
    connectionName?: string;
    createdDate?: string | null;
    disabled?: boolean;
    type?: string;
  }>;
  accounts: SnapTradeAccount[];
}

// ============================================================================
// Dashboard Stats Types
// ============================================================================

export interface ChartDataPoint {
  date: string;
  realizedPnL: number;
  cumulativePnL: number;
  tradeCount: number;
  winCount: number;
  dailyWinRate: number;
}

export interface DashboardSampleNotice {
  isActive: boolean;
  title: string;
  message: string;
}

export interface DashboardStats {
  totalPnL: number;
  openPositions: number;
  closedTrades: number;
  winRate: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  avgTradeSizeStock: number;
  avgTradeSizeOption: number;
  stockTradeCount: number;
  optionTradeCount: number;
  totalVolumeStock: number;
  totalVolumeOption: number;
  wins: number;
  losses: number;
  breakeven: number;
  chartData: ChartDataPoint[];
  sampleData?: DashboardSampleNotice | null;
}

// ============================================================================
// Performance Types
// ============================================================================

export interface TickerPerformance {
  symbol: string;
  totalPnL: number;
  tradeCount: number;
  winRate: number;
}

export interface MonthlyPerformance {
  month: string;
  totalPnL: number;
  tradeCount: number;
  wins: number;
  losses: number;
  winRate: number;
  avgTradeSizeStock: number;
  avgTradeSizeOption: number;
  stockTradeCount: number;
  optionTradeCount: number;
}

export interface ExtremeTrade {
  id: string;
  symbol: string;
  type: string;
  pnl: number;
  date: string;
}

export interface PerformanceData {
  topPerformers: TickerPerformance[];
  needsImprovement: TickerPerformance[];
  monthlyBreakdown: MonthlyPerformance[];
  extremeTrades: {
    biggestWins: ExtremeTrade[];
    biggestLosses: ExtremeTrade[];
  };
}

// ============================================================================
// Scatter/Chart Types
// ============================================================================

export interface OpenPositionPoint {
  id: string;
  symbol: string;
  type: string;
  avgPrice: number;
  costBasis: number;
  entryTimestamp: number;
}

export interface ClosedTradePoint {
  id: string;
  symbol: string;
  type: string;
  pnl: number;
  closeTimestamp: number;
  isWin: boolean;
  isLoss: boolean;
}

export interface ScatterData {
  openPositions: {
    points: OpenPositionPoint[];
    meta: {
      count: number;
      priceRange: { min: number; max: number } | null;
      dateRange: { min: string; max: string } | null;
    };
  };
  closedTrades: {
    points: ClosedTradePoint[];
    meta: {
      count: number;
      pnlRange: { min: number; max: number } | null;
      dateRange: { min: string; max: string } | null;
      wins: number;
      losses: number;
    };
  };
}

// ============================================================================
// Positions Types
// ============================================================================

export interface StockPosition {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
  avgPrice: number;
  costBasis: number;
  firstEntryDate: string;
}

export interface OptionPosition {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
  avgPrice: number;
  costBasis: number;
  optionType: string | null;
  strike: number | null;
  expiration: string | null;
  strategy: string | null;
  firstEntryDate: string;
}

export interface FuturePosition {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
  avgPrice: number;
  costBasis: number;
  firstEntryDate: string;
}

export interface PositionsSummary {
  stockCount: number;
  optionCount: number;
  futureCount: number;
  stockCostBasis: number;
  optionCostBasis: number;
  futureCostBasis: number;
  totalCostBasis: number;
}

export interface PositionsData {
  stocks: StockPosition[];
  options: OptionPosition[];
  futures: FuturePosition[];
  summary: PositionsSummary;
}

// ============================================================================
// Goals & Streaks Types
// ============================================================================

export type GoalType = 'weekly' | 'monthly' | 'premium_weekly' | 'premium_monthly';

export interface GoalProgress {
  goalType: GoalType;
  targetPnL: number;
  currentPnL: number;
  progress: number;
  isAchieved: boolean;
}

export interface GoalsPreviewData {
  goals: GoalProgress[];
}

export interface StreaksPreviewData {
  currentStreak: {
    type: 'win' | 'loss' | 'none';
    count: number;
  };
}

// ============================================================================
// Realtime Types
// ============================================================================

export interface RealtimeCheckData {
  hasRealTimeData: boolean;
  positionCount: number;
}

// ============================================================================
// Sync Types
// ============================================================================

export interface DailySyncResult {
  syncTriggered: boolean;
  reason?: string;
  accountsSynced?: number;
  transactionsImported?: number;
  positionsSynced?: number;
  durationMs?: number;
}

export interface QuickSyncResult {
  success: boolean;
  transactionsImported?: number;
  error?: string;
}

export interface UserSettings {
  autoSyncEnabled: boolean;
  dashboardTourSeen: boolean;
}

// ============================================================================
// Section Configuration
// ============================================================================

export type DashboardSectionId =
  | 'live-portfolio'
  | 'charts-calendar'
  | 'positions-trades'
  | 'performance'
  | 'options-analytics'
  | 'goals-streaks'
  | 'wheel-strategy'
  | 'market-scanner';

export type SectionAccentColor = 'blue' | 'emerald' | 'purple' | 'amber' | 'zinc';

export interface SectionSubItem {
  id: string;
  label: string;
}

export interface SectionConfig {
  id: DashboardSectionId;
  title: string;
  icon: LucideIcon;
  accentColor: SectionAccentColor;
  shortLabel: string;
  subItems?: SectionSubItem[];
}
