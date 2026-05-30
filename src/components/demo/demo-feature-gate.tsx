/**
 * Friendly placeholder for demo pages that don't have full functionality.
 *
 * Shows a card prompting the user to sign up for the real app.
 */

'use client';

import { Lock } from 'lucide-react';
import { getMainAppUrl } from '@/lib/demo/utils';

interface DemoFeatureGateProps {
  feature: string;
  description: string;
}

export function DemoFeatureGate({ feature, description }: DemoFeatureGateProps) {
  const mainAppUrl = getMainAppUrl();

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="max-w-md text-center space-y-4 px-6">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
          <Lock className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          {feature}
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {description}
        </p>
        <a
          href={mainAppUrl}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 transition-colors"
        >
          Sign up free to get started
        </a>
      </div>
    </div>
  );
}
