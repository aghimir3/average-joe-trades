'use client';

/**
 * Hero Section
 *
 * The main hero with animated headline, subtext, CTA buttons,
 * and the interactive demo preview on the right (desktop) or below (mobile).
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { TrendingUp, Play, Menu, X, ArrowRight } from 'lucide-react';
import { LoginCard } from '@/components/auth/login-card';

export function HeroSection() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { href: '#features', label: 'Features' },
    { href: '#demo', label: 'Demo' },
    { href: '#how-it-works', label: 'How It Works' },
  ];

  return (
    <section id="hero" className="relative min-h-screen flex flex-col">
      {/* Header */}
      <header className="px-4 sm:px-6 py-4 sm:py-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <motion.div
            className="flex items-center gap-2 sm:gap-3"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-linear-to-br from-emerald-400 to-emerald-600 shadow-lg shadow-emerald-500/30">
              <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
            </div>
            <span className="text-lg sm:text-xl font-bold text-white">
              Average Joe Trades
            </span>
          </motion.div>

          {/* Desktop nav links */}
          <motion.nav
            className="hidden md:flex items-center gap-6"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm text-zinc-400 hover:text-white transition-colors"
              >
                {link.label}
              </a>
            ))}
          </motion.nav>

          {/* Mobile menu button */}
          <motion.button
            className="md:hidden p-2 rounded-lg bg-white/5 border border-white/10 text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </motion.button>
        </div>

        {/* Mobile menu dropdown */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.nav
              className="md:hidden mt-4 p-4 rounded-xl bg-zinc-900/95 border border-white/10 backdrop-blur-sm"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex flex-col gap-1">
                {navLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="px-4 py-3 rounded-lg text-sm text-zinc-300 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            </motion.nav>
          )}
        </AnimatePresence>
      </header>

      {/* Hero content */}
      <div className="flex-1 flex items-center">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 lg:py-0">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-center">
            {/* Left side - Hero content */}
            <div className="text-center lg:text-left order-2 lg:order-1">
              {/* Badge */}
              <motion.div
                className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-4 sm:mb-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs sm:text-sm text-emerald-400 font-medium">
                  AI command center for retail traders
                </span>
              </motion.div>

              {/* Headline */}
              <motion.h1
                className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4 sm:mb-6 leading-tight"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1 }}
              >
                From trade noise to{' '}
                <span className="text-transparent bg-clip-text bg-linear-to-r from-emerald-400 via-teal-400 to-cyan-400">
                  clear next actions
                </span>
              </motion.h1>

              {/* Subheadline */}
              <motion.p
                className="text-base sm:text-lg lg:text-xl text-zinc-400 mb-6 sm:mb-8 max-w-xl mx-auto lg:mx-0"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
              >
                Start with manual trade entry in minutes, or connect/import from your broker.
                Average Joe Trades combines immutable journaling, multi-account sync,
                and AI Insights that deliver simple recommendations first with advanced
                detail when you want it.
              </motion.p>

              {/* CTA Buttons */}
              <motion.div
                className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3 mb-8 lg:mb-0"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
              >
                <a
                  href="#get-started"
                  className="group inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-linear-to-r from-emerald-500 to-teal-500 text-white font-semibold shadow-lg shadow-emerald-500/25 hover:shadow-xl hover:shadow-emerald-500/40 hover:scale-[1.02] transition-all duration-300"
                >
                  Start Free with Google
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </a>
                <a
                  href="/demo/dashboard"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-white font-medium hover:bg-white/10 hover:border-emerald-500/30 transition-all duration-300"
                >
                  <Play className="h-4 w-4" />
                  Try Live Demo
                </a>
              </motion.div>

              {/* Trust indicators - Visible on all screen sizes */}
              <motion.div
                className="flex items-center justify-center lg:justify-start gap-4 sm:gap-6 mt-6 sm:mt-8 pt-6 sm:pt-8 border-t border-white/10"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.5 }}
              >
                <div className="text-center">
                  <p className="text-lg sm:text-2xl font-bold text-white">6 Tabs</p>
                  <p className="text-[10px] sm:text-xs text-zinc-500">AI command center</p>
                </div>
                <div className="w-px h-8 sm:h-10 bg-white/10" />
                <div className="text-center">
                  <p className="text-lg sm:text-2xl font-bold text-white">Manual + 4 Brokers</p>
                  <p className="text-[10px] sm:text-xs text-zinc-500">Entry, import, or live sync</p>
                </div>
                <div className="w-px h-8 sm:h-10 bg-white/10" />
                <div className="text-center">
                  <p className="text-lg sm:text-2xl font-bold text-white">FIFO</p>
                  <p className="text-[10px] sm:text-xs text-zinc-500">Ledger-derived P&L</p>
                </div>
              </motion.div>
            </div>

            {/* Right side - Login card */}
            <motion.div
              className="flex justify-center lg:justify-end order-1 lg:order-2"
              initial={{ opacity: 0, x: 50, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.2 }}
          >
              <div id="get-started" className="w-full max-w-sm">
                <LoginCard />
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Scroll indicator - Desktop only */}
      <motion.div
        className="hidden lg:flex absolute bottom-8 left-1/2 -translate-x-1/2 flex-col items-center gap-2"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.8 }}
      >
        <span className="text-xs text-zinc-500">Scroll to explore</span>
        <motion.div
          className="w-5 h-8 rounded-full border-2 border-zinc-700 flex justify-center"
          animate={{ y: [0, 5, 0] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          <motion.div
            className="w-1 h-2 bg-zinc-500 rounded-full mt-1.5"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        </motion.div>
      </motion.div>
    </section>
  );
}
