'use client';

/**
 * CTA Section
 *
 * Final call-to-action with trust/safety proof and strong sign-up action.
 */

import { motion } from 'motion/react';
import { useInView } from 'react-intersection-observer';
import {
  ArrowRight,
  Sparkles,
  Database,
  ShieldCheck,
  LockKeyhole,
  Gauge,
} from 'lucide-react';

export function CtaSection() {
  const { ref, inView } = useInView({
    triggerOnce: true,
    threshold: 0.3,
  });

  const trustBlocks = [
    {
      icon: Database,
      title: 'Immutable ledger records',
      description: 'Trades are preserved as source-of-truth events for reliable audit history.',
    },
    {
      icon: Gauge,
      title: 'FIFO-derived analytics',
      description: 'Positions and realized closes stay consistent across dashboard and reports.',
    },
    {
      icon: ShieldCheck,
      title: 'No-lookahead evaluations',
      description: 'Strategy testing uses realistic windows with cost and slippage assumptions.',
    },
    {
      icon: LockKeyhole,
      title: 'Secure by design',
      description: 'OAuth login and user-scoped data handling keep account context private.',
    },
  ];

  return (
    <section ref={ref} className="relative py-16 sm:py-24">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 space-y-8">
        <motion.div
          className="grid gap-3 sm:grid-cols-2"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          {trustBlocks.map((item, index) => (
            <motion.div
              key={item.title}
              className="rounded-xl bg-white/[0.03] border border-white/10 p-4"
              initial={{ opacity: 0, y: 12 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.45, delay: index * 0.08 }}
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/15 border border-emerald-500/20">
                  <item.icon className="h-4 w-4 text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{item.title}</p>
                  <p className="text-xs text-zinc-400 mt-1">{item.description}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          className="relative rounded-2xl sm:rounded-3xl overflow-hidden"
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          <div className="absolute inset-0 bg-linear-to-br from-emerald-500/20 via-teal-500/20 to-cyan-500/20" />
          <div className="absolute inset-0 bg-zinc-900/80 backdrop-blur-sm" />

          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-[80px]" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-teal-500/10 rounded-full blur-[60px]" />

          <div className="relative px-6 py-12 sm:px-12 sm:py-16 text-center">
            <motion.div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/10 mb-6"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={inView ? { opacity: 1, scale: 1 } : {}}
              transition={{ duration: 0.4, delay: 0.2 }}
            >
              <Sparkles className="h-4 w-4 text-emerald-400" />
              <span className="text-sm text-zinc-300">100% Free | No credit card required</span>
            </motion.div>

            <motion.h2
              className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-4"
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              Turn your trade data into better weekly decisions
            </motion.h2>

            <motion.p
              className="text-zinc-400 max-w-xl mx-auto mb-8 text-sm sm:text-base"
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.4 }}
            >
              Start with simple next-action guidance, then open advanced quant
              detail only when you want deeper conviction.
            </motion.p>

            <motion.div
              className="flex flex-col sm:flex-row items-center justify-center gap-4"
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.5 }}
            >
              <a
                href="#get-started"
                className="group inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-linear-to-r from-emerald-500 to-teal-500 text-white font-semibold shadow-lg shadow-emerald-500/25 hover:shadow-xl hover:shadow-emerald-500/40 hover:scale-[1.02] transition-all duration-300"
              >
                Start Free with Google
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </a>
              <a
                href="#demo"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-white/5 border border-white/10 text-white font-semibold hover:bg-white/10 hover:border-emerald-500/30 transition-all duration-300"
              >
                See AI Insights Preview
              </a>
            </motion.div>

            <motion.div
              className="flex flex-wrap items-center justify-center gap-6 mt-8 pt-8 border-t border-white/10"
              initial={{ opacity: 0 }}
              animate={inView ? { opacity: 1 } : {}}
              transition={{ duration: 0.5, delay: 0.6 }}
            >
              <div className="flex items-center gap-2 text-zinc-500 text-sm">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>Decision support only</span>
              </div>
              <div className="flex items-center gap-2 text-zinc-500 text-sm">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
                <span>User-scoped private data</span>
              </div>
              <div className="flex items-center gap-2 text-zinc-500 text-sm">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                <span>Free for individual traders</span>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
