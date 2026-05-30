'use client';

/**
 * App Header Component
 *
 * Shared sticky header used across all authenticated pages.
 * Desktop: Clean top navigation with dropdowns
 * Mobile: Bottom tab bar with center Trade action sheet
 */

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useTheme } from 'next-themes';
import {
  Upload,
  LayoutDashboard,
  TrendingDown,
  Bell,
  Plus,
  FileUp,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  ArrowUpCircle,
  ArrowDownCircle,
  ShieldCheck,
  X,
  User,
  LogOut,
  Sun,
  Moon,
  Monitor,
  Building2,
  Shield,
  BookOpen,
  ClipboardList,
  Briefcase,
  Menu,
  BarChart3,
  PieChart,
  Target,
  Compass,
  LineChart,
  Landmark,
  Settings,
  HelpCircle,
  Zap,
  Sparkles,
  Trophy,
  Crosshair,
  Brain,
  Wallet,
  ScanLine,
  Users,
  ScrollText,
} from 'lucide-react';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Logo } from '@/components/icons/logo';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface AppHeaderProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  /** Number of unresolved issues to show in badge */
  issueCount?: number;
}

// Dashboard section configuration with sub-items for mobile navigation
interface MobileSectionSubItem {
  id: string;
  label: string;
}

interface MobileSectionConfig {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  color: 'emerald' | 'blue' | 'purple' | 'orange' | 'indigo' | 'zinc' | 'amber';
  subItems: MobileSectionSubItem[];
}

const MOBILE_SECTIONS: MobileSectionConfig[] = [
  {
    id: 'live-portfolio',
    title: 'Live Portfolio',
    icon: Zap,
    color: 'blue',
    subItems: [{ id: 'portfolio-realtime', label: 'Portfolio Overview' }],
  },
  {
    id: 'charts-calendar',
    title: 'Charts & Calendar',
    icon: LineChart,
    color: 'blue',
    subItems: [
      { id: 'pnl-chart', label: 'P&L Chart' },
      { id: 'pnl-calendar', label: 'Calendar' },
      { id: 'scatter-plots', label: 'Scatter Plots' },
      { id: 'time-analytics', label: 'Time Analytics' },
    ],
  },
  {
    id: 'positions-trades',
    title: 'Positions & Trades',
    icon: Briefcase,
    color: 'emerald',
    subItems: [
      { id: 'portfolio-summary', label: 'Summary' },
      { id: 'recent-trades', label: 'Recent Trades' },
      { id: 'portfolio-allocation', label: 'Allocation' },
    ],
  },
  {
    id: 'performance',
    title: 'Performance',
    icon: BarChart3,
    color: 'purple',
    subItems: [
      { id: 'ticker-performance', label: 'By Ticker' },
      { id: 'monthly-breakdown', label: 'Monthly' },
      { id: 'trade-size', label: 'Trade Size' },
      { id: 'cash-flow', label: 'Cash Flow' },
    ],
  },
  {
    id: 'options-analytics',
    title: 'Options Deep Dive',
    icon: Target,
    color: 'orange',
    subItems: [
      { id: 'options-analytics-tabs', label: 'Analytics' },
      { id: 'options-seasonality', label: 'Seasonality' },
      { id: 'options-rolls', label: 'Roll Analysis' },
      { id: 'ml-insights', label: 'ML Insights' },
    ],
  },
  {
    id: 'goals-streaks',
    title: 'Goals & Streaks',
    icon: Trophy,
    color: 'emerald',
    subItems: [
      { id: 'streak-tracker', label: 'Streaks' },
      { id: 'goals-tracker', label: 'Goals' },
    ],
  },
];

type ExploreContext = 'dashboard' | 'ai' | 'strategies' | 'default';

interface ExploreCardItem {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: 'emerald' | 'blue' | 'purple' | 'orange' | 'indigo' | 'zinc' | 'amber' | 'violet';
}

interface ExploreNavItem {
  id: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: 'emerald' | 'blue' | 'purple' | 'orange' | 'indigo' | 'zinc' | 'amber' | 'violet';
}

const AI_INSIGHTS_ITEMS: ExploreCardItem[] = [
  {
    id: 'actions',
    label: 'Actions',
    description: 'Recommendations & alerts',
    href: '/ai-insights#actions',
    icon: Zap,
    tone: 'violet',
  },
  {
    id: 'models',
    label: 'Your Models',
    description: 'Status & readiness',
    href: '/ai-insights#models',
    icon: Brain,
    tone: 'purple',
  },
  {
    id: 'community',
    label: 'Community',
    description: 'Crowd wisdom',
    href: '/ai-insights#community',
    icon: Users,
    tone: 'blue',
  },
  {
    id: 'train',
    label: 'Train',
    description: 'Run model training',
    href: '/ai-insights#train',
    icon: Sparkles,
    tone: 'amber',
  },
];

const STRATEGY_ITEMS: ExploreCardItem[] = [
  {
    id: 'income',
    label: 'Income',
    description: 'Premium tracking',
    href: '/strategies#income',
    icon: Wallet,
    tone: 'amber',
  },
  {
    id: 'dashboard',
    label: 'Wheel Dashboard',
    description: 'Performance metrics',
    href: '/strategies#dashboard',
    icon: BarChart3,
    tone: 'purple',
  },
  {
    id: 'ai-insights',
    label: 'AI Insights',
    description: 'ML recommendations',
    href: '/strategies#ai-insights',
    icon: Brain,
    tone: 'violet',
  },
  {
    id: 'scanner',
    label: 'Scanner',
    description: 'Find options',
    href: '/strategies#scanner',
    icon: ScanLine,
    tone: 'blue',
  },
];

const GLOBAL_NAV_ITEMS: ExploreNavItem[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, tone: 'emerald' },
  { id: 'positions', label: 'Positions', href: '/positions', icon: Briefcase, tone: 'zinc' },
  { id: 'strategies', label: 'Strategies', href: '/strategies', icon: Crosshair, tone: 'amber' },
  { id: 'ai', label: 'AI', href: '/ai-insights', icon: Brain, tone: 'violet' },
  { id: 'joey', label: 'Ask Joey', href: '/chat', icon: Sparkles, tone: 'blue' },
  { id: 'journal', label: 'Journal', href: '/journal', icon: BookOpen, tone: 'blue' },
  { id: 'history', label: 'History', href: '/history', icon: ScrollText, tone: 'zinc' },
  { id: 'import', label: 'Import', href: '/import', icon: Upload, tone: 'zinc' },
  { id: 'tax', label: 'Tax', href: '/tax-center', icon: Landmark, tone: 'blue' },
  { id: 'accounts', label: 'Accounts', href: '/accounts', icon: Building2, tone: 'zinc' },
  { id: 'settings', label: 'Settings', href: '/settings', icon: Settings, tone: 'zinc' },
];

const EXPLORE_BUTTON_CONFIG: Record<ExploreContext, {
  label: string;
  sheetTitle: string;
  icon: React.ComponentType<{ className?: string }>;
  buttonClass: string;
  labelClass: string;
}> = {
  dashboard: {
    label: 'Explore',
    sheetTitle: 'Dashboard',
    icon: Compass,
    buttonClass: 'bg-rh-green shadow-lg shadow-rh-green/30',
    labelClass: 'text-rh-green',
  },
  ai: {
    label: 'AI',
    sheetTitle: 'AI Insights',
    icon: Brain,
    buttonClass: 'bg-violet-500 shadow-lg shadow-violet-500/30',
    labelClass: 'text-violet-500',
  },
  strategies: {
    label: 'Wheel',
    sheetTitle: 'Strategies',
    icon: Crosshair,
    buttonClass: 'bg-amber-500 shadow-lg shadow-amber-500/30',
    labelClass: 'text-amber-600',
  },
  default: {
    label: 'Explore',
    sheetTitle: 'Explore',
    icon: Compass,
    buttonClass: 'bg-rh-green shadow-lg shadow-rh-green/30',
    labelClass: 'text-rh-green',
  },
};

export function AppHeader({ user, issueCount = 0 }: AppHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [tradeSheetOpen, setTradeSheetOpen] = useState(false);
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
  const [sectionsSheetOpen, setSectionsSheetOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const { theme, setTheme } = useTheme();

  // Toggle section expansion in mobile menu
  const toggleSectionExpand = (sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  // Navigate to dashboard section with scroll behavior
  const navigateToSection = (sectionId: string, subItemId?: string) => {
    setSectionsSheetOpen(false);

    const targetId = subItemId || sectionId;

    // If already on dashboard, just scroll to section
    if (pathname === '/dashboard') {
      // Expand section if collapsed (dispatch custom event)
      window.dispatchEvent(new CustomEvent('expandSection', { detail: sectionId }));
      // Small delay to allow section to expand before scrolling
      setTimeout(() => {
        const element = document.getElementById(targetId);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    } else {
      // Navigate to dashboard with hash
      router.push(`/dashboard#${targetId}`);
    }
  };

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/');

  const exploreContext: ExploreContext = pathname.startsWith('/dashboard')
    ? 'dashboard'
    : pathname.startsWith('/ai-insights')
      ? 'ai'
      : pathname.startsWith('/strategies')
        ? 'strategies'
        : 'default';
  const exploreConfig = EXPLORE_BUTTON_CONFIG[exploreContext];
  const ExploreIcon = exploreConfig.icon;

  return (
    <>
      {/* Desktop Header - Fixed at top, always visible when scrolling */}
      <header className="hidden md:block fixed top-0 left-0 right-0 z-40 bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo */}
          <div className="flex items-center gap-10">
            <Link href="/dashboard" className="flex items-center gap-2.5 group">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rh-green">
                <Logo className="h-5 w-5 text-white" />
              </div>
              <span className="hidden font-semibold text-zinc-900 dark:text-zinc-100 lg:block">
                Average Joe Trades
              </span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl p-1 border border-zinc-200 dark:border-zinc-800">
              <Link
                href="/dashboard"
                className={cn(
                  'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all',
                  isActive('/dashboard')
                    ? 'text-zinc-900 bg-white dark:text-zinc-100 dark:bg-zinc-900 shadow-sm'
                    : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                )}
              >
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </Link>

              <Link
                href="/positions"
                className={cn(
                  'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all',
                  isActive('/positions')
                    ? 'text-zinc-900 bg-white dark:text-zinc-100 dark:bg-zinc-900 shadow-sm'
                    : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                )}
              >
                <Briefcase className="h-4 w-4" />
                Positions
              </Link>

              {/* Trade Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger
                  className={cn(
                    'flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-all',
                    isActive('/trade')
                      ? 'text-zinc-900 bg-white dark:text-zinc-100 dark:bg-zinc-900 shadow-sm'
                      : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                  )}
                >
                  <Plus className="h-4 w-4" />
                  Trade
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52 p-2">
                  <DropdownMenuItem asChild className="rounded-lg">
                    <Link href="/trade/new/stock" className="flex items-center gap-3 py-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                        <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div>
                        <p className="font-medium">Stock Trade</p>
                        <p className="text-xs text-zinc-500">Buy or sell shares</p>
                      </div>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="rounded-lg">
                    <Link href="/trade/new/option/long_call" className="flex items-center gap-3 py-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                        <ArrowUpCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <p className="font-medium">Long Call</p>
                        <p className="text-xs text-zinc-500">Bullish option bet</p>
                      </div>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="rounded-lg">
                    <Link href="/trade/new/option/long_put" className="flex items-center gap-3 py-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
                        <ArrowDownCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                      </div>
                      <div>
                        <p className="font-medium">Long Put</p>
                        <p className="text-xs text-zinc-500">Bearish option bet</p>
                      </div>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="rounded-lg">
                    <Link href="/trade/new/option/covered_call" className="flex items-center gap-3 py-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
                        <ShieldCheck className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                      </div>
                      <div>
                        <p className="font-medium">Covered Call</p>
                        <p className="text-xs text-zinc-500">Sell calls on shares you own</p>
                      </div>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="rounded-lg">
                    <Link href="/trade/new/option/cash_secured_put" className="flex items-center gap-3 py-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
                        <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div>
                        <p className="font-medium">Cash-Secured Put</p>
                        <p className="text-xs text-zinc-500">Sell puts with cash backing</p>
                      </div>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="my-2" />
                  <DropdownMenuItem asChild className="rounded-lg">
                    <Link href="/trade/close" className="flex items-center gap-3 py-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
                        <TrendingDown className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
                      </div>
                      <div>
                        <p className="font-medium">Exit Position</p>
                        <p className="text-xs text-zinc-500">Close an open trade</p>
                      </div>
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Link
                href="/import"
                className={cn(
                  'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all',
                  isActive('/import')
                    ? 'text-zinc-900 bg-white dark:text-zinc-100 dark:bg-zinc-900 shadow-sm'
                    : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                )}
              >
                <Upload className="h-4 w-4" />
                Import
              </Link>

              <Link
                href="/strategies"
                className={cn(
                  'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all',
                  isActive('/strategies')
                    ? 'text-zinc-900 bg-white dark:text-zinc-100 dark:bg-zinc-900 shadow-sm'
                    : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                )}
              >
                <Crosshair className="h-4 w-4" />
                Strategies
              </Link>

              <Link
                href="/ai-insights"
                className={cn(
                  'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all',
                  isActive('/ai-insights')
                    ? 'text-zinc-900 bg-white dark:text-zinc-100 dark:bg-zinc-900 shadow-sm'
                    : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                )}
              >
                <Brain className="h-4 w-4" />
                AI Insights
              </Link>

              <Link
                href="/chat"
                className={cn(
                  'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all',
                  isActive('/chat')
                    ? 'text-zinc-900 bg-white dark:text-zinc-100 dark:bg-zinc-900 shadow-sm'
                    : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                )}
              >
                <Sparkles className="h-4 w-4" />
                Ask Joey
              </Link>

              <Link
                href="/accounts"
                className={cn(
                  'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all',
                  isActive('/accounts')
                    ? 'text-zinc-900 bg-white dark:text-zinc-100 dark:bg-zinc-900 shadow-sm'
                    : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                )}
              >
                <Building2 className="h-4 w-4" />
                Accounts
              </Link>

              <Link
                href="/tax-center"
                className={cn(
                  'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all',
                  isActive('/tax-center')
                    ? 'text-zinc-900 bg-white dark:text-zinc-100 dark:bg-zinc-900 shadow-sm'
                    : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                )}
              >
                <Landmark className="h-4 w-4" />
                Tax Center
              </Link>
            </nav>
          </div>

          {/* Right side: Issues badge, Theme, User */}
          <div className="flex items-center gap-1">
            {/* Issues/Notifications */}
            <Link
              href="/issues"
              className={cn(
                'relative flex items-center justify-center h-9 w-9 rounded-lg transition-colors',
                isActive('/issues')
                  ? 'text-zinc-900 bg-zinc-100 dark:text-zinc-100 dark:bg-zinc-800'
                  : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800'
              )}
              title={issueCount > 0 ? `${issueCount} items need attention` : 'Review'}
            >
              <Bell className="h-5 w-5" />
              {issueCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
                  {issueCount > 9 ? '9+' : issueCount}
                </span>
              )}
            </Link>

            <ThemeToggle />

            {/* Divider */}
            <div className="h-6 w-px bg-zinc-200 dark:bg-zinc-800 mx-2" />

            {/* User menu dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                <div className="hidden lg:flex flex-col items-end">
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {user.name?.split(' ')[0] || 'Trader'}
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    Trader
                  </span>
                </div>
                <div className="h-9 w-9 rounded-lg bg-rh-green flex items-center justify-center">
                  <span className="text-sm font-bold text-white">
                    {user.name?.charAt(0) || 'T'}
                  </span>
                </div>
                <ChevronDown className="h-4 w-4 text-zinc-500 hidden lg:block" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 p-2">
                {/* User info header */}
                <div className="px-2 py-2 mb-2">
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">
                    {user.name || 'Trader'}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                    {user.email}
                  </p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild className="rounded-lg">
                  <Link href="/journal" className="flex items-center gap-3 py-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                      <BookOpen className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="font-medium">Journal</p>
                      <p className="text-xs text-zinc-500">Daily notes & reflections</p>
                    </div>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="rounded-lg">
                  <Link href="/history" className="flex items-center gap-3 py-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-900/30">
                      <ScrollText className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                    </div>
                    <div>
                      <p className="font-medium">History</p>
                      <p className="text-xs text-zinc-500">Trades & journal entries</p>
                    </div>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="rounded-lg">
                  <Link href="/policy" className="flex items-center gap-3 py-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
                      <ClipboardList className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <p className="font-medium">Policy</p>
                      <p className="text-xs text-zinc-500">Trading rules & risk</p>
                    </div>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="rounded-lg">
                  <Link href="/accounts" className="flex items-center gap-3 py-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
                      <Building2 className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <p className="font-medium">Accounts</p>
                      <p className="text-xs text-zinc-500">Manage brokerages</p>
                    </div>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="rounded-lg">
                  <Link href="/tax-center" className="flex items-center gap-3 py-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                      <Landmark className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="font-medium">Tax Center</p>
                      <p className="text-xs text-zinc-500">Gains, losses & wash sales</p>
                    </div>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="rounded-lg">
                  <Link href="/settings" className="flex items-center gap-3 py-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
                      <Settings className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
                    </div>
                    <div>
                      <p className="font-medium">Settings</p>
                      <p className="text-xs text-zinc-500">Auto-sync & preferences</p>
                    </div>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="rounded-lg">
                  <Link href="/features" className="flex items-center gap-3 py-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rh-green/10">
                      <HelpCircle className="h-4 w-4 text-rh-green" />
                    </div>
                    <div>
                      <p className="font-medium">Features Guide</p>
                      <p className="text-xs text-zinc-500">Learn how to use the app</p>
                    </div>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    if (pathname === '/dashboard') {
                      window.dispatchEvent(new CustomEvent('startDashboardTour'));
                    } else {
                      router.push('/dashboard#tour');
                    }
                  }}
                  className="rounded-lg cursor-pointer"
                >
                  <div className="flex items-center gap-3 py-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                      <Compass className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <p className="font-medium">Dashboard Tour</p>
                      <p className="text-xs text-zinc-500">Guided walkthrough</p>
                    </div>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="my-2" />
                <DropdownMenuItem
                  onClick={() => signOut({ callbackUrl: '/' })}
                  className="rounded-lg text-red-600 dark:text-red-400 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/30"
                >
                  <div className="flex items-center gap-3 py-1">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
                      <LogOut className="h-4 w-4" />
                    </div>
                    <span className="font-medium">Sign Out</span>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Desktop header spacer - pushes content below fixed header */}
      <div className="hidden md:block h-16" aria-hidden="true" />

      {/* Mobile Bottom Navigation - Insights-First Design */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-200/80 bg-white/90 backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-950/90 safe-area-bottom shadow-[0_-8px_30px_rgba(0,0,0,0.08)] dark:shadow-[0_-8px_30px_rgba(0,0,0,0.6)]">
        <div className="flex items-center justify-around h-16 px-2">
          <MobileNavItem
            href="/dashboard"
            icon={BarChart3}
            label="Insights"
            isActive={isActive('/dashboard')}
          />
          <MobileNavItem
            href="/positions"
            icon={PieChart}
            label="Portfolio"
            isActive={isActive('/positions')}
          />

          {/* Center Explore Button - Quick Navigation to Dashboard Sections */}
          <button
            onClick={() => setSectionsSheetOpen(true)}
            aria-expanded={sectionsSheetOpen}
            className="relative flex flex-col items-center justify-center gap-0.5 min-w-14 py-1.5"
          >
            <div
              className={cn(
                'flex items-center justify-center h-12 w-12 -mt-4 rounded-full border-4 border-white dark:border-zinc-950 transition-transform',
                exploreConfig.buttonClass,
                sectionsSheetOpen && 'scale-105'
              )}
            >
              <ExploreIcon className="h-6 w-6 text-white" />
            </div>
            <span className={cn('text-[10px] font-medium', exploreConfig.labelClass)}>
              {exploreConfig.label}
            </span>
          </button>

          <MobileNavItem
            href="/journal"
            icon={BookOpen}
            label="Journal"
            isActive={isActive('/journal')}
          />

          {/* More Button - Opens Action Sheet */}
          <button
            onClick={() => setMoreSheetOpen(true)}
            className={cn(
              'relative flex flex-col items-center justify-center gap-0.5 min-w-14 py-1.5 rounded-xl transition-colors',
              'text-zinc-500 dark:text-zinc-400'
            )}
          >
            <div className="relative">
              <Menu className="h-5 w-5" />
              {issueCount > 0 && (
                <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
                  {issueCount > 9 ? '9+' : issueCount}
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium">More</span>
          </button>
        </div>
      </nav>

      {/* Trade Action Sheet */}
      {tradeSheetOpen && (
        <MobileSheet onClose={() => setTradeSheetOpen(false)} title="New Trade">
          <div className="grid grid-cols-2 gap-3">
            <TradeOption
              href="/trade/new/stock"
              icon={TrendingUp}
              label="Stock"
              description="Buy or sell shares"
              color="emerald"
              onClick={() => setTradeSheetOpen(false)}
            />
            <TradeOption
              href="/trade/new/option/long_call"
              icon={ArrowUpCircle}
              label="Long Call"
              description="Bullish bet"
              color="green"
              onClick={() => setTradeSheetOpen(false)}
            />
            <TradeOption
              href="/trade/new/option/long_put"
              icon={ArrowDownCircle}
              label="Long Put"
              description="Bearish bet"
              color="red"
              onClick={() => setTradeSheetOpen(false)}
            />
            <TradeOption
              href="/trade/new/option/covered_call"
              icon={ShieldCheck}
              label="Covered Call"
              description="Income on shares"
              color="blue"
              onClick={() => setTradeSheetOpen(false)}
            />
            <TradeOption
              href="/trade/new/option/cash_secured_put"
              icon={ShieldCheck}
              label="Cash Secured Put"
              description="Get paid to wait"
              color="purple"
              onClick={() => setTradeSheetOpen(false)}
            />
            <TradeOption
              href="/trade/close"
              icon={TrendingDown}
              label="Exit Position"
              description="Close a trade"
              color="zinc"
              onClick={() => setTradeSheetOpen(false)}
            />
          </div>
        </MobileSheet>
      )}

      {/* Profile Action Sheet */}
      {profileSheetOpen && (
        <MobileSheet onClose={() => setProfileSheetOpen(false)} title="Profile">
          <div className="space-y-4">
            {/* User Info */}
            <div className="flex items-center gap-3 pb-4 border-b border-zinc-200 dark:border-zinc-800">
              <div className="h-12 w-12 rounded-full bg-rh-green flex items-center justify-center">
                <span className="text-lg font-bold text-white">
                  {user.name?.charAt(0) || 'T'}
                </span>
              </div>
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-100">
                  {user.name || 'Trader'}
                </p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {user.email}
                </p>
              </div>
            </div>

            {/* Journal Link */}
            <Link
              href="/journal"
              onClick={() => setProfileSheetOpen(false)}
              className="flex items-center gap-3 py-3 px-4 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
            >
              <BookOpen className="h-5 w-5" />
              <div>
                <span className="font-medium">Trading Journal</span>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Daily notes & reflections</p>
              </div>
            </Link>

            {/* History Link */}
            <Link
              href="/history"
              onClick={() => setProfileSheetOpen(false)}
              className="flex items-center gap-3 py-3 px-4 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
            >
              <ScrollText className="h-5 w-5" />
              <div>
                <span className="font-medium">Trade History</span>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Trades & journal entries</p>
              </div>
            </Link>

            {/* Portfolio Policy Link */}
            <Link
              href="/policy"
              onClick={() => setProfileSheetOpen(false)}
              className="flex items-center gap-3 py-3 px-4 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
            >
              <ClipboardList className="h-5 w-5" />
              <div>
                <span className="font-medium">Portfolio Policy</span>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Trading rules & risk management</p>
              </div>
            </Link>

            {/* Account Management Link */}
            <Link
              href="/accounts"
              onClick={() => setProfileSheetOpen(false)}
              className="flex items-center gap-3 py-3 px-4 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
            >
              <Building2 className="h-5 w-5" />
              <div>
                <span className="font-medium">Accounts</span>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Manage your accounts</p>
              </div>
            </Link>

            {/* Settings Link */}
            <Link
              href="/settings"
              onClick={() => setProfileSheetOpen(false)}
              className="flex items-center gap-3 py-3 px-4 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
            >
              <Settings className="h-5 w-5" />
              <div>
                <span className="font-medium">Settings</span>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Auto-sync & preferences</p>
              </div>
            </Link>

            {/* Import Link */}
            <Link
              href="/import"
              onClick={() => setProfileSheetOpen(false)}
              className="flex items-center gap-3 py-3 px-4 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
            >
              <FileUp className="h-5 w-5" />
              <div>
                <span className="font-medium">Import Trades</span>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Import CSV from brokerages</p>
              </div>
            </Link>

            {/* Privacy Policy Link */}
            <Link
              href="/privacy"
              onClick={() => setProfileSheetOpen(false)}
              className="flex items-center gap-3 py-3 px-4 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
            >
              <Shield className="h-5 w-5" />
              <span className="font-medium">Privacy Policy</span>
            </Link>

            {/* Theme Selector */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-(--text-primary)">Theme</p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setTheme('light')}
                  className={cn(
                    'flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl transition-all',
                    theme === 'light'
                      ? 'bg-rh-green/15 text-rh-green ring-2 ring-rh-green'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-(--text-secondary)'
                  )}
                >
                  <Sun className="h-5 w-5" />
                  <span className="text-xs font-medium">Light</span>
                </button>
                <button
                  onClick={() => setTheme('dark')}
                  className={cn(
                    'flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl transition-all',
                    theme === 'dark'
                      ? 'bg-rh-green/15 text-rh-green ring-2 ring-rh-green'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-(--text-secondary)'
                  )}
                >
                  <Moon className="h-5 w-5" />
                  <span className="text-xs font-medium">Dark</span>
                </button>
                <button
                  onClick={() => setTheme('system')}
                  className={cn(
                    'flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl transition-all',
                    theme === 'system'
                      ? 'bg-rh-green/15 text-rh-green ring-2 ring-rh-green'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-(--text-secondary)'
                  )}
                >
                  <Monitor className="h-5 w-5" />
                  <span className="text-xs font-medium">System</span>
                </button>
              </div>
            </div>

            {/* Sign Out */}
            <button
              onClick={() => {
                setProfileSheetOpen(false);
                signOut({ callbackUrl: '/' });
              }}
              className="w-full flex items-center gap-3 py-3 px-4 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors"
            >
              <LogOut className="h-5 w-5" />
              <span className="font-medium">Sign Out</span>
            </button>
          </div>
        </MobileSheet>
      )}

      {/* Explore Sheet - Contextual */}
      {sectionsSheetOpen && (
        <MobileSheet onClose={() => setSectionsSheetOpen(false)} title={exploreConfig.sheetTitle}>
          <div className="space-y-4">
            {exploreContext === 'dashboard' && (
              <>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-medium mb-3">
                  Dashboard Sections
                </p>
                {MOBILE_SECTIONS.map((section) => {
                  const Icon = section.icon;
                  const isExpanded = expandedSections.has(section.id);
                  const hasSubItems = section.subItems.length > 0;

                  return (
                    <div key={section.id} className="rounded-xl overflow-hidden">
                      <div className="flex items-center">
                        <button
                          onClick={() => navigateToSection(section.id)}
                          className={cn(
                            'flex-1 flex items-center gap-3 py-3 px-4 transition-colors',
                            sectionColorStyles[section.color],
                            'rounded-l-xl'
                          )}
                        >
                          <Icon className="h-5 w-5 shrink-0" />
                          <span className="font-medium text-sm">{section.title}</span>
                        </button>
                        {hasSubItems && (
                          <button
                            onClick={() => toggleSectionExpand(section.id)}
                            className={cn(
                              'px-4 py-3 transition-colors rounded-r-xl',
                              sectionColorStyles[section.color]
                            )}
                            aria-label={isExpanded ? 'Collapse' : 'Expand'}
                          >
                            <ChevronRight
                              className={cn(
                                'h-4 w-4 transition-transform duration-200',
                                isExpanded && 'rotate-90'
                              )}
                            />
                          </button>
                        )}
                      </div>

                      {hasSubItems && isExpanded && (
                        <div className="ml-4 mt-1 space-y-1 border-l-2 border-zinc-200 dark:border-zinc-700 pl-4 pb-2">
                          {section.subItems.map((subItem) => (
                            <button
                              key={subItem.id}
                              onClick={() => navigateToSection(section.id, subItem.id)}
                              className="w-full text-left py-2 px-3 rounded-lg text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            >
                              {subItem.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}

            {exploreContext === 'ai' && (
              <>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-medium">
                  AI Insights
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {AI_INSIGHTS_ITEMS.map((item) => (
                    <ExploreCard
                      key={item.id}
                      item={item}
                      onClick={() => setSectionsSheetOpen(false)}
                    />
                  ))}
                </div>
              </>
            )}

            {exploreContext === 'strategies' && (
              <>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-medium">
                  Wheel Strategy
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {STRATEGY_ITEMS.map((item) => (
                    <ExploreCard
                      key={item.id}
                      item={item}
                      onClick={() => setSectionsSheetOpen(false)}
                    />
                  ))}
                </div>
              </>
            )}

            {exploreContext === 'default' && (
              <>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-medium">
                  Quick Jump
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {AI_INSIGHTS_ITEMS.slice(0, 2).map((item) => (
                    <ExploreCard
                      key={`default-${item.id}`}
                      item={item}
                      onClick={() => setSectionsSheetOpen(false)}
                    />
                  ))}
                  <ExploreCard
                    item={{
                      id: 'dashboard',
                      label: 'Dashboard',
                      description: 'Portfolio insights',
                      href: '/dashboard',
                      icon: LayoutDashboard,
                      tone: 'emerald',
                    }}
                    onClick={() => setSectionsSheetOpen(false)}
                  />
                  <ExploreCard
                    item={{
                      id: 'strategies',
                      label: 'Strategies',
                      description: 'Wheel playbook',
                      href: '/strategies',
                      icon: Crosshair,
                      tone: 'amber',
                    }}
                    onClick={() => setSectionsSheetOpen(false)}
                  />
                </div>
              </>
            )}

            <div className="mt-2 pt-4 border-t border-zinc-200 dark:border-zinc-700">
              <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-medium mb-2">
                All Pages
              </p>
              <div className="grid grid-cols-3 gap-2">
                {GLOBAL_NAV_ITEMS.map((item) => (
                  <ExploreNavCard
                    key={item.id}
                    item={item}
                    onClick={() => setSectionsSheetOpen(false)}
                  />
                ))}
              </div>
            </div>
          </div>
        </MobileSheet>
      )}

      {/* More Actions Sheet */}
      {moreSheetOpen && (
        <MobileSheet onClose={() => setMoreSheetOpen(false)} title="More">
          <div className="space-y-4">
            {/* Trade Actions */}
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-medium mb-2">
                Trade Actions
              </p>
              <div className="space-y-2">
                <Link
                  href="/trade/new/stock"
                  onClick={() => setMoreSheetOpen(false)}
                  className="flex items-center gap-3 py-3 px-4 rounded-xl bg-rh-green/10 text-rh-green hover:bg-rh-green/20 transition-colors"
                >
                  <TrendingUp className="h-5 w-5" />
                  <span className="font-medium">New Stock Trade</span>
                </Link>
                <button
                  onClick={() => {
                    setMoreSheetOpen(false);
                    setTradeSheetOpen(true);
                  }}
                  className="w-full flex items-center gap-3 py-3 px-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                >
                  <Plus className="h-5 w-5" />
                  <span className="font-medium">All Trade Types...</span>
                </button>
              </div>
            </div>

            {/* Management */}
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-medium mb-2">
                Management
              </p>
              <div className="space-y-2">
                <Link
                  href="/issues"
                  onClick={() => setMoreSheetOpen(false)}
                  className="flex items-center justify-between py-3 px-4 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                >
                  <div className="flex items-center gap-3 text-zinc-700 dark:text-zinc-300">
                    <Bell className="h-5 w-5" />
                    <span className="font-medium">Review Issues</span>
                  </div>
                  {issueCount > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-bold text-white">
                      {issueCount > 9 ? '9+' : issueCount}
                    </span>
                  )}
                </Link>
                <Link
                  href="/import"
                  onClick={() => setMoreSheetOpen(false)}
                  className="flex items-center gap-3 py-3 px-4 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                >
                  <FileUp className="h-5 w-5" />
                  <span className="font-medium">Import Trades</span>
                </Link>
                <Link
                  href="/accounts"
                  onClick={() => setMoreSheetOpen(false)}
                  className="flex items-center gap-3 py-3 px-4 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                >
                  <Building2 className="h-5 w-5" />
                  <span className="font-medium">Accounts</span>
                </Link>
                <Link
                  href="/policy"
                  onClick={() => setMoreSheetOpen(false)}
                  className="flex items-center gap-3 py-3 px-4 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                >
                  <ClipboardList className="h-5 w-5" />
                  <span className="font-medium">Portfolio Policy</span>
                </Link>
                <Link
                  href="/settings"
                  onClick={() => setMoreSheetOpen(false)}
                  className="flex items-center gap-3 py-3 px-4 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                >
                  <Settings className="h-5 w-5" />
                  <span className="font-medium">Settings</span>
                </Link>
                <Link
                  href="/tax-center"
                  onClick={() => setMoreSheetOpen(false)}
                  className="flex items-center gap-3 py-3 px-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                >
                  <Landmark className="h-5 w-5" />
                  <span className="font-medium">Tax Center</span>
                </Link>
                <Link
                  href="/features"
                  onClick={() => setMoreSheetOpen(false)}
                  className="flex items-center gap-3 py-3 px-4 rounded-xl bg-rh-green/10 text-rh-green hover:bg-rh-green/20 transition-colors"
                >
                  <HelpCircle className="h-5 w-5" />
                  <span className="font-medium">Features Guide</span>
                </Link>
                <button
                  onClick={() => {
                    setMoreSheetOpen(false);
                    if (pathname === '/dashboard') {
                      setTimeout(() => window.dispatchEvent(new CustomEvent('startDashboardTour')), 300);
                    } else {
                      router.push('/dashboard#tour');
                    }
                  }}
                  className="w-full flex items-center gap-3 py-3 px-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
                >
                  <Compass className="h-5 w-5" />
                  <span className="font-medium">Dashboard Tour</span>
                </button>
              </div>
            </div>

            {/* Profile */}
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-medium mb-2">
                Profile
              </p>
              <button
                onClick={() => {
                  setMoreSheetOpen(false);
                  setProfileSheetOpen(true);
                }}
                className="w-full flex items-center gap-3 py-3 px-4 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
              >
                <User className="h-5 w-5" />
                <div className="flex-1 text-left">
                  <span className="font-medium">{user.name || 'Profile'}</span>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Theme & settings</p>
                </div>
              </button>
            </div>
          </div>
        </MobileSheet>
      )}
    </>
  );
}

interface MobileNavItemProps {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  isActive: boolean;
  badge?: number;
}

function MobileNavItem({
  href,
  icon: Icon,
  label,
  isActive,
  badge,
}: MobileNavItemProps) {
  return (
    <Link
      href={href}
      className={cn(
        'relative flex flex-col items-center justify-center gap-0.5 min-w-14 py-1.5 rounded-xl transition-colors',
        isActive
          ? 'text-rh-green bg-rh-green/10'
          : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
      )}
    >
      <div className="relative">
        <Icon className="h-5 w-5" />
        {badge !== undefined && badge > 0 && (
          <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </div>
      <span className="text-[10px] font-medium">{label}</span>
    </Link>
  );
}

interface MobileSheetProps {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}

function MobileSheet({ children, onClose, title }: MobileSheetProps) {
  return (
    <div className="md:hidden fixed inset-0 z-60">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 z-0"
        onClick={onClose}
      />

      {/* Sheet - z-10 ensures it's above backdrop, touch-action for responsive taps */}
      <div className="absolute bottom-0 left-0 right-0 max-h-[calc(100dvh-4rem)] bg-white dark:bg-zinc-900 rounded-t-2xl shadow-xl animate-in slide-in-from-bottom duration-300 safe-area-top safe-area-bottom flex flex-col z-10 touch-manipulation">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3 shrink-0">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-2 -mr-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="h-5 w-5 text-zinc-500" />
          </button>
        </div>

        {/* Content - scrollable */}
        <div className="px-4 pb-6 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}

const exploreToneStyles: Record<string, string> = {
  emerald: 'bg-rh-green/10 text-rh-green',
  blue: 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400',
  purple: 'bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400',
  violet: 'bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-400',
  orange: 'bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400',
  indigo: 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400',
  amber: 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400',
  zinc: 'bg-zinc-100 dark:bg-zinc-800 text-(--text-secondary)',
};

interface ExploreCardProps {
  item: ExploreCardItem;
  onClick: () => void;
}

function ExploreCard({ item, onClick }: ExploreCardProps) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        'flex flex-col gap-1.5 p-3 rounded-xl transition-all active:scale-95',
        exploreToneStyles[item.tone]
      )}
    >
      <Icon className="h-5 w-5" />
      <div>
        <p className="text-xs font-semibold">{item.label}</p>
        <p className="text-[10px] opacity-70">{item.description}</p>
      </div>
    </Link>
  );
}

interface ExploreNavCardProps {
  item: ExploreNavItem;
  onClick: () => void;
}

function ExploreNavCard({ item, onClick }: ExploreNavCardProps) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-1.5 p-3 rounded-xl transition-colors',
        exploreToneStyles[item.tone]
      )}
    >
      <Icon className="h-5 w-5" />
      <span className="text-[10px] font-medium">{item.label}</span>
    </Link>
  );
}

interface TradeOptionProps {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  color: 'emerald' | 'green' | 'red' | 'blue' | 'purple' | 'zinc';
  onClick: () => void;
}

const colorStyles = {
  emerald: 'bg-rh-green/10 text-rh-green',
  green: 'bg-rh-green/10 text-rh-green',
  red: 'bg-rh-red/10 text-rh-red',
  blue: 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400',
  purple: 'bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400',
  zinc: 'bg-zinc-100 dark:bg-zinc-800 text-(--text-secondary)',
};

function TradeOption({
  href,
  icon: Icon,
  label,
  description,
  color,
  onClick,
}: TradeOptionProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-2 p-4 rounded-xl transition-all active:scale-95',
        colorStyles[color]
      )}
    >
      <Icon className="h-7 w-7" />
      <div className="text-center">
        <p className="font-medium text-sm">{label}</p>
        <p className="text-[10px] opacity-70">{description}</p>
      </div>
    </Link>
  );
}

const sectionColorStyles: Record<string, string> = {
  emerald: 'bg-rh-green/10 text-rh-green',
  blue: 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400',
  purple: 'bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400',
  orange: 'bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400',
  indigo: 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400',
  amber: 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400',
  zinc: 'bg-zinc-100 dark:bg-zinc-800 text-(--text-secondary)',
};
