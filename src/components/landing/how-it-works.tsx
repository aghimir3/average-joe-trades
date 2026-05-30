'use client';

/**
 * How It Works Section
 *
 * 3-step process with animated connectors.
 * Shows the simple onboarding flow.
 */

import { motion } from 'motion/react';
import { useInView } from 'react-intersection-observer';
import { Link2, BarChart3, TrendingUp, ArrowRight } from 'lucide-react';

const steps = [
  {
    number: '01',
    title: 'Start Your Way',
    description: 'Begin with manual entry, import a file, or connect a live broker to build one complete portfolio view.',
    icon: Link2,
    color: 'emerald',
  },
  {
    number: '02',
    title: 'Prioritize',
    description: 'Open AI Insights to review action priorities, risk flags, and symbol-level context in minutes.',
    icon: BarChart3,
    color: 'teal',
  },
  {
    number: '03',
    title: 'Execute and Improve',
    description: 'Take clearer next steps, then review outcomes weekly to tighten your decision process over time.',
    icon: TrendingUp,
    color: 'cyan',
  },
];

export function HowItWorks() {
  const { ref, inView } = useInView({
    triggerOnce: true,
    threshold: 0.2,
  });

  return (
    <section id="how-it-works" ref={ref} className="relative py-16 sm:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Section header */}
        <motion.div
          className="text-center mb-12 sm:mb-16"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-4">
            Get started in{' '}
            <span className="text-transparent bg-clip-text bg-linear-to-r from-emerald-400 to-teal-400">
              3 simple steps
            </span>
          </h2>
          <p className="text-zinc-400 max-w-2xl mx-auto text-sm sm:text-base">
            From manual-first setup to action-ready insights in one workflow
          </p>
        </motion.div>

        {/* Steps */}
        <div className="relative">
          {/* Connector line - Desktop only */}
          <div className="hidden lg:block absolute top-1/2 left-0 right-0 h-px bg-linear-to-r from-transparent via-white/10 to-transparent -translate-y-1/2" />

          <div className="grid gap-8 sm:gap-6 lg:grid-cols-3">
            {steps.map((step, index) => (
              <motion.div
                key={step.number}
                className="relative"
                initial={{ opacity: 0, y: 30 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: index * 0.2 }}
              >
                {/* Mobile connector arrow */}
                {index < steps.length - 1 && (
                  <div className="lg:hidden flex justify-center -mb-4">
                    <ArrowRight className="h-5 w-5 text-zinc-600 rotate-90" />
                  </div>
                )}

                <div className="relative p-6 sm:p-8 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-emerald-500/20 hover:bg-white/[0.05] transition-all duration-300 group">
                  {/* Step number */}
                  <div className="absolute -top-3 left-6 px-3 py-1 rounded-full bg-zinc-950 border border-white/10 text-xs font-mono text-zinc-500">
                    {step.number}
                  </div>

                  {/* Icon */}
                  <div className={`inline-flex p-3 rounded-xl mb-4 ${
                    step.color === 'emerald' ? 'bg-emerald-500/20' :
                    step.color === 'teal' ? 'bg-teal-500/20' : 'bg-cyan-500/20'
                  }`}>
                    <step.icon className={`h-6 w-6 ${
                      step.color === 'emerald' ? 'text-emerald-400' :
                      step.color === 'teal' ? 'text-teal-400' : 'text-cyan-400'
                    }`} />
                  </div>

                  {/* Content */}
                  <h3 className="text-xl font-semibold text-white mb-2">
                    {step.title}
                  </h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">
                    {step.description}
                  </p>

                  {/* Desktop connector dot */}
                  {index < steps.length - 1 && (
                    <div className="hidden lg:block absolute -right-3 top-1/2 -translate-y-1/2">
                      <div className="w-6 h-6 rounded-full bg-zinc-950 border border-white/10 flex items-center justify-center">
                        <ArrowRight className="h-3 w-3 text-zinc-500" />
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
