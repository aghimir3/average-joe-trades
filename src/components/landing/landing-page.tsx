'use client';

/**
 * Landing Page Client Component
 *
 * Main container for the landing page with all animated sections.
 * Uses Motion for scroll-triggered animations and transitions.
 */

import { useEffect } from 'react';
import { HeroSection } from './hero-section';
import { BrokerLogos } from './broker-logos';
import { FeaturesSection } from './features-section';
import { DemoSection } from './demo-section';
import { HowItWorks } from './how-it-works';
import { CtaSection } from './cta-section';
import { LandingFooter } from './landing-footer';

export function LandingPage() {
  // Scroll to top on mount to prevent scroll restoration issues
  useEffect(() => {
    // Only scroll if there's no hash in the URL
    if (!window.location.hash) {
      window.scrollTo(0, 0);
    }
  }, []);

  return (
    <main className="relative min-h-screen overflow-hidden bg-zinc-950">
      {/* Animated gradient background */}
      <div className="fixed inset-0 pointer-events-none">
        {/* Primary gradient orb */}
        <div
          className="absolute top-0 left-1/4 w-125 h-125 bg-emerald-500/20 rounded-full blur-[120px] animate-pulse"
          style={{ animationDuration: '4s' }}
        />
        {/* Secondary orb */}
        <div
          className="absolute bottom-1/4 right-1/4 w-100 h-100 bg-teal-500/15 rounded-full blur-[100px] animate-pulse"
          style={{ animationDuration: '5s', animationDelay: '1s' }}
        />
        {/* Accent orb */}
        <div
          className="absolute top-1/2 right-1/3 w-75 h-75 bg-cyan-500/10 rounded-full blur-[80px] animate-pulse"
          style={{ animationDuration: '6s', animationDelay: '2s' }}
        />

        {/* Grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                              linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10">
        <HeroSection />
        <BrokerLogos />
        <FeaturesSection />
        <DemoSection />
        <HowItWorks />
        <CtaSection />
        <LandingFooter />
      </div>
    </main>
  );
}
