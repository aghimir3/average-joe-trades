'use client';

/**
 * Demo Section
 *
 * Interactive demo with tabs showing:
 * - Dashboard preview with animated P&L chart and stats
 * - AI Insights preview with action-first recommendations
 * - Calendar preview with color-coded days
 * - Brokerage sync flow animation
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useInView } from 'react-intersection-observer';
import {
  LayoutDashboard,
  Sparkles,
  ShieldAlert,
  Calendar,
  Link2,
  TrendingUp,
  TrendingDown,
  Trophy,
  Target,
  Activity,
  Check,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { id: 'dashboard', label: 'Dashboard', shortLabel: 'Stats', icon: LayoutDashboard },
  { id: 'ai-insights', label: 'AI Insights', shortLabel: 'AI', icon: Sparkles },
  { id: 'calendar', label: 'Calendar', shortLabel: 'Cal', icon: Calendar },
  { id: 'sync', label: 'Sync', shortLabel: 'Sync', icon: Link2 },
];

// Sample data for demos
const demoStats = {
  totalPnL: 12450.75,
  winRate: 68,
  totalTrades: 247,
  profitFactor: 2.3,
};

const demoTrades = [
  { symbol: 'AAPL', type: 'stock', pnl: 450, isWin: true },
  { symbol: 'TSLA 250C', type: 'option', pnl: -120, isWin: false },
  { symbol: 'NVDA', type: 'stock', pnl: 890, isWin: true },
  { symbol: 'SPY 580P', type: 'option', pnl: 340, isWin: true },
];

export function DemoSection() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const { ref, inView } = useInView({
    triggerOnce: true,
    threshold: 0.2,
  });

  return (
    <section id="demo" ref={ref} className="relative py-16 sm:py-24">
      {/* Background accent */}
      <div className="absolute inset-0 bg-linear-to-b from-transparent via-emerald-500/5 to-transparent" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
        {/* Section header */}
        <motion.div
          className="text-center mb-8 sm:mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-4">
            See it in action
          </h2>
          <p className="text-zinc-400 max-w-2xl mx-auto text-sm sm:text-base">
            Interactive preview of your future trading dashboard
          </p>
        </motion.div>

        {/* Tab navigation */}
        <motion.div
          className="flex justify-center mb-6 sm:mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <div className="inline-flex p-1 rounded-xl bg-white/5 border border-white/10">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'relative flex items-center gap-1.5 sm:gap-2 px-3 py-2 sm:px-5 sm:py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200',
                  activeTab === tab.id
                    ? 'text-white'
                    : 'text-zinc-400 hover:text-zinc-200'
                )}
              >
                {activeTab === tab.id && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute inset-0 bg-emerald-500/20 border border-emerald-500/30 rounded-lg"
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <tab.icon className="relative h-4 w-4" />
                <span className="relative sm:hidden">{tab.shortLabel}</span>
                <span className="relative hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </motion.div>

        {/* Demo container */}
        <motion.div
          className="relative rounded-2xl sm:rounded-3xl bg-zinc-900/80 border border-white/10 overflow-hidden shadow-2xl shadow-black/50"
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          {/* Browser chrome */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-zinc-900">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-amber-500/80" />
              <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
            </div>
            <div className="flex-1 flex justify-center">
              <div className="px-4 py-1 rounded-md bg-white/5 text-xs text-zinc-500">
                /dashboard
              </div>
            </div>
          </div>

          {/* Demo content */}
          <div className="p-4 sm:p-6 min-h-75 sm:min-h-100">
            <AnimatePresence mode="wait">
              {activeTab === 'dashboard' && <DashboardDemo key="dashboard" />}
              {activeTab === 'ai-insights' && <AiInsightsDemo key="ai-insights" />}
              {activeTab === 'calendar' && <CalendarDemo key="calendar" />}
              {activeTab === 'sync' && <SyncDemo key="sync" />}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Full demo CTA */}
        <motion.div
          className="text-center mt-6 sm:mt-8"
          initial={{ opacity: 0, y: 10 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <a
            href="/demo/dashboard"
            className="group inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-semibold hover:bg-emerald-500/20 hover:border-emerald-500/50 transition-all duration-300"
          >
            Try the full interactive demo
            <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </a>
          <p className="text-xs text-zinc-500 mt-2">No sign-up required — explore with sample data</p>
        </motion.div>
      </div>
    </section>
  );
}

// Dashboard Demo Component
function DashboardDemo() {
  const [animatedPnL, setAnimatedPnL] = useState(0);

  useEffect(() => {
    const duration = 2000;
    const target = demoStats.totalPnL;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setAnimatedPnL(target * eased);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4 sm:space-y-6"
    >
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Total P&L"
          value={`$${animatedPnL.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          icon={TrendingUp}
          color="emerald"
          delay={0}
        />
        <StatCard
          label="Win Rate"
          value={`${demoStats.winRate}%`}
          icon={Trophy}
          color="amber"
          delay={0.1}
        />
        <StatCard
          label="Trades"
          value={demoStats.totalTrades.toString()}
          icon={Activity}
          color="cyan"
          delay={0.2}
        />
        <StatCard
          label="Profit Factor"
          value={demoStats.profitFactor.toFixed(1)}
          icon={Target}
          color="violet"
          delay={0.3}
        />
      </div>

      {/* Chart area */}
      <div className="h-32 sm:h-48 rounded-xl bg-white/5 border border-white/10 p-4 relative overflow-hidden">
        <AnimatedChart />
      </div>

      {/* Recent trades */}
      <div className="space-y-2">
        <p className="text-xs text-zinc-500 font-medium">Recent Trades</p>
        <div className="space-y-2">
          {demoTrades.map((trade, index) => (
            <motion.div
              key={trade.symbol}
              className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.5 + index * 0.1 }}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold',
                  trade.type === 'stock' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'
                )}>
                  {trade.type === 'stock' ? 'S' : 'O'}
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{trade.symbol}</p>
                  <p className="text-xs text-zinc-500">{trade.type === 'stock' ? 'Stock' : 'Option'}</p>
                </div>
              </div>
              <div className={cn(
                'flex items-center gap-1 text-sm font-semibold',
                trade.isWin ? 'text-emerald-400' : 'text-red-400'
              )}>
                {trade.isWin ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {trade.isWin ? '+' : ''}{trade.pnl < 0 ? '-' : ''}${Math.abs(trade.pnl).toLocaleString()}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// AI Insights Demo Component
function AiInsightsDemo() {
  const aiActions = [
    {
      symbol: 'TSLA',
      action: 'Reduce Position Size',
      rationale: 'Short-term volatility is elevated and your position risk is above target.',
      confidence: 86,
      riskFlag: 'Concentration',
      horizon: 'Today',
    },
    {
      symbol: 'AAPL',
      action: 'Hold and Monitor',
      rationale: 'Trend is stable; no urgent risk signal. Keep current plan and wait for confirmation.',
      confidence: 78,
      riskFlag: 'Normal',
      horizon: '1-3 Days',
    },
    {
      symbol: 'SPY 585C',
      action: 'Roll or Close Soon',
      rationale: 'DTE is tight and decay risk is rising. Lock gains or move risk out in time.',
      confidence: 83,
      riskFlag: 'Expiry',
      horizon: 'Within 24h',
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4 sm:space-y-5"
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-3">
          <p className="text-lg sm:text-xl font-bold text-violet-300">4</p>
          <p className="text-[10px] sm:text-xs text-zinc-400">Priority Actions</p>
        </div>
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
          <p className="text-lg sm:text-xl font-bold text-emerald-300">82%</p>
          <p className="text-[10px] sm:text-xs text-zinc-400">Avg Confidence</p>
        </div>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
          <p className="text-lg sm:text-xl font-bold text-amber-300">2</p>
          <p className="text-[10px] sm:text-xs text-zinc-400">Risk Flags</p>
        </div>
        <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3">
          <p className="text-lg sm:text-xl font-bold text-cyan-300">Live</p>
          <p className="text-[10px] sm:text-xs text-zinc-400">Data Freshness</p>
        </div>
      </div>

      <div className="rounded-xl border border-violet-500/30 bg-gradient-to-r from-violet-500/15 via-indigo-500/10 to-transparent p-3 sm:p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] sm:text-xs font-medium text-violet-300 uppercase tracking-wide">Top Action Right Now</p>
            <p className="text-sm sm:text-base font-semibold text-white">SPY 585C: Roll or Close Soon</p>
            <p className="text-xs sm:text-sm text-zinc-300 mt-1">High confidence signal based on time decay pressure and current risk context.</p>
          </div>
          <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 text-violet-300 shrink-0" />
        </div>
      </div>

      <div className="space-y-2.5 sm:space-y-3">
        {aiActions.map((item, index) => (
          <motion.div
            key={item.symbol}
            className="rounded-xl border border-white/10 bg-white/5 p-3 sm:p-4"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: index * 0.08 }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm sm:text-base font-semibold text-white">{item.symbol}</p>
                <p className="text-xs sm:text-sm text-emerald-300 mt-0.5">{item.action}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-white">{item.confidence}%</p>
                <p className="text-[10px] sm:text-xs text-zinc-500">Confidence</p>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-zinc-300 mt-2.5">{item.rationale}</p>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] sm:text-xs">
              <span className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-1',
                item.riskFlag === 'Normal'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
              )}>
                {item.riskFlag === 'Normal' ? <Check className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
                {item.riskFlag} Risk
              </span>
              <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-2 py-1 text-zinc-300">
                Horizon: {item.horizon}
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

// Stat Card Component
function StatCard({
  label,
  value,
  icon: Icon,
  color,
  delay,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  delay: number;
}) {
  const colorClasses = {
    emerald: 'text-emerald-400 bg-emerald-500/20',
    amber: 'text-amber-400 bg-amber-500/20',
    cyan: 'text-cyan-400 bg-cyan-500/20',
    violet: 'text-violet-400 bg-violet-500/20',
  };

  const classes = colorClasses[color as keyof typeof colorClasses];

  return (
    <motion.div
      className="p-3 sm:p-4 rounded-xl bg-white/5 border border-white/10"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className={cn('p-1.5 rounded-lg', classes.split(' ')[1])}>
          <Icon className={cn('h-3 w-3 sm:h-4 sm:w-4', classes.split(' ')[0])} />
        </div>
      </div>
      <p className="text-lg sm:text-xl font-bold text-white tabular-nums">{value}</p>
      <p className="text-[10px] sm:text-xs text-zinc-500">{label}</p>
    </motion.div>
  );
}

// Animated Chart Component
function AnimatedChart() {
  return (
    <svg className="w-full h-full" viewBox="0 0 400 150" preserveAspectRatio="none">
      {/* Grid lines */}
      {[0, 1, 2, 3].map((i) => (
        <line
          key={i}
          x1="0"
          y1={i * 50}
          x2="400"
          y2={i * 50}
          stroke="rgba(255,255,255,0.05)"
          strokeDasharray="4 4"
        />
      ))}

      {/* Chart line with animation */}
      <motion.path
        d="M 0,120 L 50,100 L 100,110 L 150,80 L 200,60 L 250,70 L 300,40 L 350,30 L 400,20"
        fill="none"
        stroke="url(#chartGradient)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 2, ease: 'easeOut' }}
      />

      {/* Gradient fill under the line */}
      <motion.path
        d="M 0,120 L 50,100 L 100,110 L 150,80 L 200,60 L 250,70 L 300,40 L 350,30 L 400,20 L 400,150 L 0,150 Z"
        fill="url(#areaGradient)"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 1 }}
      />

      {/* Gradient definitions */}
      <defs>
        <linearGradient id="chartGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="50%" stopColor="#14b8a6" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
        <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="rgba(16, 185, 129, 0.3)" />
          <stop offset="100%" stopColor="rgba(16, 185, 129, 0)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// Calendar Demo Component - Enhanced with weekly summaries like actual app
interface CalendarDayData {
  day: number;
  pnl: number;
  trades: number;
  wins: number;
  losses: number;
}

const calendarDays: CalendarDayData[] = [
  // Week 1 (Thu-Sat): Jan 1-3
  { day: 1, pnl: 0, trades: 0, wins: 0, losses: 0 },
  { day: 2, pnl: 340, trades: 2, wins: 2, losses: 0 },
  { day: 3, pnl: -120, trades: 1, wins: 0, losses: 1 },
  // Week 2 (Sun-Sat): Jan 4-10
  { day: 4, pnl: 0, trades: 0, wins: 0, losses: 0 },
  { day: 5, pnl: 0, trades: 0, wins: 0, losses: 0 },
  { day: 6, pnl: 450, trades: 3, wins: 2, losses: 1 },
  { day: 7, pnl: 0, trades: 0, wins: 0, losses: 0 },
  { day: 8, pnl: 285, trades: 2, wins: 2, losses: 0 },
  { day: 9, pnl: -85, trades: 1, wins: 0, losses: 1 },
  { day: 10, pnl: 0, trades: 0, wins: 0, losses: 0 },
  // Week 3 (Sun-Sat): Jan 11-17
  { day: 11, pnl: 0, trades: 0, wins: 0, losses: 0 },
  { day: 12, pnl: 620, trades: 4, wins: 3, losses: 1 },
  { day: 13, pnl: 180, trades: 2, wins: 2, losses: 0 },
  { day: 14, pnl: 0, trades: 0, wins: 0, losses: 0 },
  { day: 15, pnl: -200, trades: 2, wins: 0, losses: 2 },
  { day: 16, pnl: 340, trades: 2, wins: 2, losses: 0 },
  { day: 17, pnl: 0, trades: 0, wins: 0, losses: 0 },
  // Week 4 (Sun-Sat): Jan 18-24
  { day: 18, pnl: 0, trades: 0, wins: 0, losses: 0 },
  { day: 19, pnl: 0, trades: 0, wins: 0, losses: 0 },
  { day: 20, pnl: 890, trades: 5, wins: 4, losses: 1 },
  { day: 21, pnl: -45, trades: 1, wins: 0, losses: 1 },
  { day: 22, pnl: 520, trades: 3, wins: 3, losses: 0 },
  { day: 23, pnl: 0, trades: 0, wins: 0, losses: 0 },
  { day: 24, pnl: 0, trades: 0, wins: 0, losses: 0 },
  // Week 5 (Sun-Sat): Jan 25-31
  { day: 25, pnl: 0, trades: 0, wins: 0, losses: 0 },
  { day: 26, pnl: 415, trades: 2, wins: 2, losses: 0 },
  { day: 27, pnl: 180, trades: 2, wins: 1, losses: 1 },
  { day: 28, pnl: 0, trades: 0, wins: 0, losses: 0 },
  { day: 29, pnl: -75, trades: 1, wins: 0, losses: 1 },
  { day: 30, pnl: 0, trades: 0, wins: 0, losses: 0 },
  { day: 31, pnl: 0, trades: 0, wins: 0, losses: 0 },
];

// Calculate weekly totals
const weeklyTotals = [
  { pnl: 220, trades: 3 },   // Week 1: Jan 1-3
  { pnl: 650, trades: 6 },   // Week 2: Jan 4-10
  { pnl: 940, trades: 10 },  // Week 3: Jan 11-17
  { pnl: 1365, trades: 9 },  // Week 4: Jan 18-24
  { pnl: 520, trades: 5 },   // Week 5: Jan 25-31
];

function CalendarDemo() {
  const [selectedDay, setSelectedDay] = useState<CalendarDayData | null>(null);
  const [animatedPnL, setAnimatedPnL] = useState(0);

  // Calculate monthly stats
  const monthlyStats = {
    totalPnL: 3695,
    tradingDays: 14,
    profitDays: 11,
    lossDays: 6,
    winRate: 65,
  };

  // Animate the monthly P&L number
  useEffect(() => {
    const duration = 1500;
    const target = monthlyStats.totalPnL;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setAnimatedPnL(Math.round(target * eased));

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [monthlyStats.totalPnL]);

  // Get background opacity based on P&L magnitude
  const getPnLIntensity = (pnl: number) => {
    const absPnl = Math.abs(pnl);
    if (absPnl >= 500) return '40';
    if (absPnl >= 300) return '30';
    if (absPnl >= 100) return '20';
    return '15';
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-3 sm:space-y-4"
    >
      {/* Month header with nav */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
            <svg className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h3 className="text-base sm:text-lg font-semibold text-white">January 2026</h3>
          <button className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
            <svg className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <div className="hidden sm:flex gap-3 text-[10px] text-zinc-500">
          <span className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded bg-emerald-500/40" /> Profit
          </span>
          <span className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded bg-red-500/40" /> Loss
          </span>
        </div>
      </div>

      {/* Calendar grid with weekly totals */}
      <div className="grid grid-cols-8 gap-0.5 sm:gap-1">
        {/* Day headers */}
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
          <div key={`header-${i}`} className="text-center text-[9px] sm:text-[10px] text-zinc-500 py-1 font-medium">
            <span className="sm:hidden">{day}</span>
            <span className="hidden sm:inline">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i]}</span>
          </div>
        ))}
        <div className="text-center text-[9px] sm:text-[10px] text-zinc-500 py-1 font-medium">
          <span className="sm:hidden">Wk</span>
          <span className="hidden sm:inline">Week</span>
        </div>

        {/* Week 1: Empty cells (Wed) + Jan 1-3 (Thu-Sat) + Weekly total */}
        {[...Array(4)].map((_, i) => <div key={`empty1-${i}`} className="aspect-square" />)}
        {calendarDays.slice(0, 3).map((day, i) => (
          <CalendarDayCell key={day.day} day={day} index={i} getPnLIntensity={getPnLIntensity} onClick={() => setSelectedDay(day)} />
        ))}
        <WeeklyTotalCell week={weeklyTotals[0]} index={0} />

        {/* Week 2: Jan 4-10 */}
        {calendarDays.slice(3, 10).map((day, i) => (
          <CalendarDayCell key={day.day} day={day} index={i + 3} getPnLIntensity={getPnLIntensity} onClick={() => setSelectedDay(day)} />
        ))}
        <WeeklyTotalCell week={weeklyTotals[1]} index={1} />

        {/* Week 3: Jan 11-17 */}
        {calendarDays.slice(10, 17).map((day, i) => (
          <CalendarDayCell key={day.day} day={day} index={i + 10} getPnLIntensity={getPnLIntensity} onClick={() => setSelectedDay(day)} />
        ))}
        <WeeklyTotalCell week={weeklyTotals[2]} index={2} />

        {/* Week 4: Jan 18-24 */}
        {calendarDays.slice(17, 24).map((day, i) => (
          <CalendarDayCell key={day.day} day={day} index={i + 17} getPnLIntensity={getPnLIntensity} onClick={() => setSelectedDay(day)} />
        ))}
        <WeeklyTotalCell week={weeklyTotals[3]} index={3} />

        {/* Week 5: Jan 25-31 + empty cells */}
        {calendarDays.slice(24, 31).map((day, i) => (
          <CalendarDayCell key={day.day} day={day} index={i + 24} getPnLIntensity={getPnLIntensity} onClick={() => setSelectedDay(day)} />
        ))}
        <WeeklyTotalCell week={weeklyTotals[4]} index={4} />
      </div>

      {/* Monthly summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="p-2.5 sm:p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <p className="text-lg sm:text-xl font-bold text-emerald-400 tabular-nums">+${animatedPnL.toLocaleString()}</p>
          <p className="text-[10px] sm:text-xs text-zinc-500">Monthly P&L</p>
        </div>
        <div className="p-2.5 sm:p-3 rounded-xl bg-white/5 border border-white/10">
          <p className="text-lg sm:text-xl font-bold text-white">{monthlyStats.winRate}%</p>
          <p className="text-[10px] sm:text-xs text-zinc-500">Win Rate</p>
        </div>
        <div className="p-2.5 sm:p-3 rounded-xl bg-white/5 border border-white/10">
          <p className="text-lg sm:text-xl font-bold text-emerald-400">{monthlyStats.profitDays}</p>
          <p className="text-[10px] sm:text-xs text-zinc-500">Green Days</p>
        </div>
        <div className="p-2.5 sm:p-3 rounded-xl bg-white/5 border border-white/10">
          <p className="text-lg sm:text-xl font-bold text-red-400">{monthlyStats.lossDays}</p>
          <p className="text-[10px] sm:text-xs text-zinc-500">Red Days</p>
        </div>
      </div>

      {/* Day detail popup (mini version) */}
      <AnimatePresence>
        {selectedDay && selectedDay.trades > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="p-3 rounded-xl bg-zinc-800/90 border border-white/10 backdrop-blur-sm"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-white">Jan {selectedDay.day}, 2026</span>
              <button onClick={() => setSelectedDay(null)} className="text-zinc-400 hover:text-white">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className={selectedDay.pnl >= 0 ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
                {selectedDay.pnl >= 0 ? '+' : ''}${selectedDay.pnl}
              </span>
              <span className="text-zinc-400">{selectedDay.trades} trades</span>
              <span className="text-emerald-400">{selectedDay.wins}W</span>
              <span className="text-red-400">{selectedDay.losses}L</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// Calendar Day Cell Component
function CalendarDayCell({
  day,
  index,
  getPnLIntensity,
  onClick,
}: {
  day: CalendarDayData;
  index: number;
  getPnLIntensity: (pnl: number) => string;
  onClick: () => void;
}) {
  const intensity = getPnLIntensity(day.pnl);

  return (
    <motion.div
      onClick={day.trades > 0 ? onClick : undefined}
      className={cn(
        'aspect-square rounded-md sm:rounded-lg flex flex-col items-center justify-center text-[10px] sm:text-xs transition-all duration-200',
        day.trades > 0 && 'cursor-pointer hover:scale-105',
        day.pnl > 0 && `bg-emerald-500/${intensity} text-emerald-400 hover:bg-emerald-500/${parseInt(intensity) + 10}`,
        day.pnl < 0 && `bg-red-500/${intensity} text-red-400 hover:bg-red-500/${parseInt(intensity) + 10}`,
        day.pnl === 0 && 'bg-white/5 text-zinc-500'
      )}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.15, delay: index * 0.015 }}
    >
      <span className="font-medium leading-none">{day.day}</span>
      {day.pnl !== 0 && (
        <span className="text-[7px] sm:text-[9px] font-medium leading-tight mt-0.5">
          {day.pnl > 0 ? '+' : ''}{day.pnl}
        </span>
      )}
      {day.trades > 0 && (
        <span className="text-[6px] sm:text-[8px] text-zinc-400 leading-none">
          {day.trades}t
        </span>
      )}
    </motion.div>
  );
}

// Weekly Total Cell Component
function WeeklyTotalCell({ week, index }: { week: { pnl: number; trades: number }; index: number }) {
  return (
    <motion.div
      className={cn(
        'aspect-square rounded-md sm:rounded-lg flex flex-col items-center justify-center text-[9px] sm:text-[10px] border',
        week.pnl >= 0
          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
          : 'bg-red-500/10 border-red-500/20 text-red-400'
      )}
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, delay: 0.3 + index * 0.1 }}
    >
      <span className="font-bold leading-none">
        {week.pnl >= 0 ? '+' : ''}{week.pnl}
      </span>
      <span className="text-[6px] sm:text-[7px] text-zinc-500 leading-none mt-0.5">
        {week.trades}t
      </span>
    </motion.div>
  );
}

// Sync Demo Component
function SyncDemo() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setStep(1), 500),
      setTimeout(() => setStep(2), 1200),
      setTimeout(() => setStep(3), 2100),
      setTimeout(() => setStep(4), 3000),
      setTimeout(() => setStep(5), 3900),
    ];

    return () => timers.forEach(clearTimeout);
  }, []);

  const brokers = [
    { name: 'Robinhood', connectAt: 2, connected: step >= 2 },
    { name: 'Schwab', connectAt: 3, connected: step >= 3 },
    { name: 'Fidelity', connectAt: 4, connected: step >= 4 },
    { name: 'IBKR', connectAt: 5, connected: step >= 5 },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center justify-center min-h-62.5 sm:min-h-75 space-y-6"
    >
      {/* Connection flow */}
      <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-8">
              {brokers.map((broker, index) => (
          <motion.div
            key={broker.name}
            className="flex items-center gap-3 px-5 py-4 rounded-xl bg-white/5 border border-white/10"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.3 }}
          >
            <div className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg',
              broker.connected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-zinc-400'
            )}>
              {broker.name[0]}
            </div>
            <div>
              <p className="font-medium text-white">{broker.name}</p>
              <p className="text-xs text-zinc-500">
                {broker.connected ? (
                  <span className="flex items-center gap-1 text-emerald-400">
                    <Check className="h-3 w-3" /> Connected
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {step >= broker.connectAt - 1 ? 'Syncing...' : 'Queued...'}
                  </span>
                )}
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Sync progress */}
      {step >= 2 && (
        <motion.div
          className="w-full max-w-md space-y-2"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex justify-between text-xs text-zinc-500">
            <span>Importing trades...</span>
            <span>{step >= 5 ? '2,984' : step === 2 ? '562' : step === 3 ? '1,341' : '2,167'} trades</span>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <motion.div
              className="h-full bg-linear-to-r from-emerald-500 to-teal-500"
              initial={{ width: '0%' }}
              animate={{ width: step >= 5 ? '100%' : step === 4 ? '82%' : '55%' }}
              transition={{ duration: 1.5 }}
            />
          </div>
        </motion.div>
      )}

      {/* Success state */}
      {step >= 5 && (
        <motion.div
          className="text-center"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/20 mb-3">
            <Check className="h-6 w-6 text-emerald-400" />
          </div>
          <p className="text-lg font-semibold text-white">All synced!</p>
          <p className="text-sm text-zinc-400">2,984 trades imported from 4 brokerages</p>
        </motion.div>
      )}
    </motion.div>
  );
}
