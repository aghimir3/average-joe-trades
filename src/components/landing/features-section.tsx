'use client';

/**
 * Features Section
 *
 * Displays feature cards with scroll-triggered stagger animations.
 * Mobile: single column stack
 * Desktop: 2x3 grid
 */

import { motion } from 'motion/react';
import { useInView } from 'react-intersection-observer';
import {
  FlaskConical,
  Brain,
  Shield,
  Users,
  Search,
  Sparkles,
  RefreshCw,
  BarChart3,
  Calendar,
} from 'lucide-react';

const aiCommandTabs = [
  'Actions',
  'Alpha Lab',
  'Risk',
  'Your Models',
  'Community',
  'Train',
];

const features = [
  {
    icon: Brain,
    title: 'AI Actions',
    description: 'Get clear next-step recommendations for your positions with simple explanations and optional advanced quant detail.',
    color: 'emerald',
  },
  {
    icon: FlaskConical,
    title: 'Alpha Lab',
    description: 'Run walk-forward strategy tests with no-lookahead windows, transaction costs, and slippage assumptions.',
    color: 'teal',
  },
  {
    icon: Shield,
    title: 'Risk Dashboard',
    description: 'See exposure, concentration pressure, and drawdown flags before risk turns into account damage.',
    color: 'cyan',
  },
  {
    icon: Search,
    title: 'Ticker Advisor',
    description: 'Analyze any symbol on demand and get an action suggestion with confidence and rationale.',
    color: 'violet',
  },
  {
    icon: Users,
    title: 'Community Insights',
    description: 'Compare your setup with anonymized, aggregate platform behavior to add context to your decisions.',
    color: 'amber',
  },
  {
    icon: Sparkles,
    title: 'Model Health and Training',
    description: 'Track model freshness and run retraining when needed so insights stay reliable.',
    color: 'rose',
  },
  {
    icon: RefreshCw,
    title: 'Manual + Broker Connected',
    description: 'Start with manual entry anytime, then connect Robinhood, Schwab, Fidelity, or Interactive Brokers when ready.',
    color: 'cyan',
  },
  {
    icon: BarChart3,
    title: 'FIFO Performance Engine',
    description: 'Use immutable ledger records and FIFO-derived closes for consistent P&L and cleaner portfolio analytics.',
    color: 'emerald',
  },
  {
    icon: Calendar,
    title: 'Review and Improve Loop',
    description: 'Use calendar, goals, journal, and policy tooling to build better weekly decision habits over time.',
    color: 'teal',
  },
];

const colorClasses = {
  emerald: {
    bg: 'bg-emerald-500/10',
    border: 'group-hover:border-emerald-500/30',
    icon: 'text-emerald-400',
    glow: 'group-hover:shadow-emerald-500/10',
  },
  teal: {
    bg: 'bg-teal-500/10',
    border: 'group-hover:border-teal-500/30',
    icon: 'text-teal-400',
    glow: 'group-hover:shadow-teal-500/10',
  },
  cyan: {
    bg: 'bg-cyan-500/10',
    border: 'group-hover:border-cyan-500/30',
    icon: 'text-cyan-400',
    glow: 'group-hover:shadow-cyan-500/10',
  },
  violet: {
    bg: 'bg-violet-500/10',
    border: 'group-hover:border-violet-500/30',
    icon: 'text-violet-400',
    glow: 'group-hover:shadow-violet-500/10',
  },
  amber: {
    bg: 'bg-amber-500/10',
    border: 'group-hover:border-amber-500/30',
    icon: 'text-amber-400',
    glow: 'group-hover:shadow-amber-500/10',
  },
  rose: {
    bg: 'bg-rose-500/10',
    border: 'group-hover:border-rose-500/30',
    icon: 'text-rose-400',
    glow: 'group-hover:shadow-rose-500/10',
  },
};

export function FeaturesSection() {
  const { ref, inView } = useInView({
    triggerOnce: true,
    threshold: 0.1,
    rootMargin: '-50px',
  });

  return (
    <section id="features" className="relative py-16 sm:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Section header */}
        <motion.div
          className="text-center mb-12 sm:mb-16"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-4">
            Your trading platform +{' '}
            <span className="text-transparent bg-clip-text bg-linear-to-r from-emerald-400 to-teal-400">
              AI command center
            </span>
          </h2>
          <p className="text-zinc-400 max-w-2xl mx-auto text-sm sm:text-base">
            Built for retail investors who want simple actions first and deeper
            quant evidence only when needed, with both manual entry and broker integration paths.
          </p>
        </motion.div>

        <motion.div
          className="mb-8 sm:mb-10 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.05 }}
        >
          <p className="text-sm text-zinc-300 font-medium mb-3">
            AI Command Center includes:
          </p>
          <div className="flex flex-wrap gap-2">
            {aiCommandTabs.map((tab) => (
              <span
                key={tab}
                className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-300"
              >
                {tab}
              </span>
            ))}
          </div>
        </motion.div>

        {/* Features grid */}
        <div
          ref={ref}
          className="grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          {features.map((feature, index) => {
            const colors = colorClasses[feature.color as keyof typeof colorClasses];
            return (
              <motion.div
                key={feature.title}
                className={`group relative p-5 sm:p-6 rounded-2xl bg-white/[0.03] border border-white/10 ${colors.border} ${colors.glow} hover:bg-white/[0.05] hover:shadow-xl transition-all duration-300`}
                initial={{ opacity: 0, y: 30 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                {/* Icon */}
                <div className={`inline-flex p-2.5 sm:p-3 rounded-xl ${colors.bg} mb-4`}>
                  <feature.icon className={`h-5 w-5 sm:h-6 sm:w-6 ${colors.icon}`} />
                </div>

                {/* Content */}
                <h3 className="text-lg sm:text-xl font-semibold text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  {feature.description}
                </p>

                {/* Hover gradient line */}
                <div className="absolute bottom-0 left-6 right-6 h-px bg-linear-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
