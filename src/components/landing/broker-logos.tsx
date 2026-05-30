'use client';

/**
 * Broker Logos Section
 *
 * Shows supported brokerages with animated appearance.
 * Mobile: horizontal scroll
 * Desktop: centered row
 */

import { motion } from 'motion/react';
import { useInView } from 'react-intersection-observer';
import { Link2, Check, FileEdit } from 'lucide-react';

// Broker-specific icon components with brand colors
function RobinhoodIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      {/* Stylized feather/leaf - Robinhood green */}
      <path
        d="M12 3C7.5 3 4 7 4 12c0 3 1.5 5.5 3.5 7 .5.4 1 .2 1.2-.3l2.3-6c.2-.5.5-.7 1-.7s.8.2 1 .7l2.3 6c.2.5.7.7 1.2.3 2-1.5 3.5-4 3.5-7 0-5-3.5-9-8-9z"
        fill="currentColor"
      />
    </svg>
  );
}

function SchwabIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      {/* Stylized S shape - Schwab blue */}
      <path
        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm2 14c0 1.1-.9 2-2 2h-2c-1.1 0-2-.9-2-2v-1h2v1h2v-2H9c-1.1 0-2-.9-2-2V9c0-1.1.9-2 2-2h2c1.1 0 2 .9 2 2v1h-2V9h-2v2h3c1.1 0 2 .9 2 2v3z"
        fill="currentColor"
      />
    </svg>
  );
}

function FidelityIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      {/* Stylized pyramid/triangle - Fidelity green */}
      <path
        d="M12 2L2 20h20L12 2zm0 4l6 12H6l6-12z"
        fill="currentColor"
      />
    </svg>
  );
}

function IBKRIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      {/* Stylized bars + dot - IBKR red */}
      <rect x="3" y="6" width="3" height="12" rx="1" fill="currentColor" />
      <rect x="8" y="4" width="3" height="14" rx="1" fill="currentColor" />
      <rect x="13" y="8" width="3" height="10" rx="1" fill="currentColor" />
      <circle cx="20" cy="9" r="2" fill="currentColor" />
    </svg>
  );
}

function TDAIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      {/* Stylized TD - TD Ameritrade green */}
      <rect x="3" y="6" width="8" height="12" rx="1" fill="currentColor" />
      <path
        d="M13 6h8v3h-2.5v9h-3V9H13V6z"
        fill="currentColor"
      />
    </svg>
  );
}

function ETradeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      {/* Stylized E with star - E*TRADE purple */}
      <path
        d="M4 4h10v3H7v3h6v3H7v4h7v3H4V4z"
        fill="currentColor"
      />
      <path
        d="M18 5l1 2 2 .5-1.5 1.5.5 2-2-1-2 1 .5-2L15 7.5l2-.5 1-2z"
        fill="currentColor"
      />
    </svg>
  );
}

const brokers = [
  {
    name: 'Robinhood',
    availability: 'live' as const,
    icon: RobinhoodIcon,
    color: 'text-[#00C805]', // Robinhood green
  },
  {
    name: 'Charles Schwab',
    availability: 'live' as const,
    icon: SchwabIcon,
    color: 'text-[#00A0DF]', // Schwab blue
  },
  {
    name: 'Fidelity',
    availability: 'live' as const,
    icon: FidelityIcon,
    color: 'text-[#4AA74A]', // Fidelity green
  },
  {
    name: 'Interactive Brokers',
    availability: 'live' as const,
    icon: IBKRIcon,
    color: 'text-[#EA4335]', // IBKR red accent
  },
  {
    name: 'TD Ameritrade',
    availability: 'roadmap' as const,
    icon: TDAIcon,
    color: 'text-[#2D8B2D]', // TD green
  },
  {
    name: 'E*TRADE',
    availability: 'roadmap' as const,
    icon: ETradeIcon,
    color: 'text-[#6633CC]', // E*TRADE purple
  },
  {
    name: 'Manual Entry',
    availability: 'live' as const,
    icon: FileEdit,
    color: 'text-zinc-400',
  },
];

export function BrokerLogos() {
  const { ref, inView } = useInView({
    triggerOnce: true,
    threshold: 0.2,
  });

  return (
    <section ref={ref} className="relative py-12 sm:py-16 border-y border-white/5">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-linear-to-r from-transparent via-emerald-500/5 to-transparent" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
        {/* Section header */}
        <motion.div
          className="text-center mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          <div className="inline-flex items-center gap-2 text-sm text-zinc-400">
            <Link2 className="h-4 w-4" />
            <span>Live sync brokers today: Robinhood, Schwab, Fidelity, Interactive Brokers</span>
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            Roadmap brokers are shown below so you can plan ahead.
          </p>
        </motion.div>

        {/* Broker logos - horizontal scroll on mobile, centered on desktop */}
        <div className="relative">
          {/* Fade edges on mobile */}
          <div className="absolute left-0 top-0 bottom-0 w-8 bg-linear-to-r from-zinc-950 to-transparent z-10 sm:hidden" />
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-linear-to-l from-zinc-950 to-transparent z-10 sm:hidden" />

          <div className="flex gap-3 sm:gap-4 overflow-x-auto sm:overflow-visible sm:flex-wrap sm:justify-center pb-2 sm:pb-0 scrollbar-hide">
            {brokers.map((broker, index) => {
              const Icon = broker.icon;
              return (
                <motion.div
                  key={broker.name}
                  className="shrink-0 flex items-center gap-3 px-4 py-2.5 sm:px-5 sm:py-3 rounded-xl bg-white/5 border border-white/10 hover:border-emerald-500/30 hover:bg-white/[0.07] transition-all duration-300"
                  initial={{ opacity: 0, y: 20 }}
                  animate={inView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.4, delay: index * 0.1 }}
                >
                  {/* Broker icon */}
                  <Icon className={`h-5 w-5 ${broker.color}`} />

                  <span className="text-sm font-medium text-white whitespace-nowrap">
                    {broker.name}
                  </span>

                  {/* Status badge */}
                  {broker.availability === 'live' ? (
                    <div className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/20">
                      <Check className="h-3 w-3 text-emerald-400" />
                    </div>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium">
                      Roadmap
                    </span>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
