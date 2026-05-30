import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, Scale } from 'lucide-react';
import {
  COPYRIGHT_NAME,
  LEGAL_ENTITY_NAME,
  SUPPORT_EMAIL,
  SUPPORT_URL,
} from '@/lib/public-config';
import { SITE_URL, SOCIAL_IMAGE_ALT, SOCIAL_IMAGE_URL } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Terms and Conditions',
  description: 'Self-hosting terms template and financial-risk disclosure for Average Joe Trades deployments.',
  alternates: {
    canonical: `${SITE_URL}/terms`,
  },
  openGraph: {
    title: 'Terms and Conditions | Average Joe Trades',
    description: 'Terms template and financial-risk disclosure for Average Joe Trades.',
    url: `${SITE_URL}/terms`,
    type: 'article',
    images: [
      {
        url: SOCIAL_IMAGE_URL,
        width: 1200,
        height: 630,
        alt: SOCIAL_IMAGE_ALT,
      },
    ],
  },
  robots: {
    index: true,
    follow: true,
  },
};

function SectionHeading({ children }: { children: string }) {
  return <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-4">{children}</h2>;
}

function BodyText({ children }: { children: ReactNode }) {
  return <p className="text-zinc-600 dark:text-zinc-400 mb-4">{children}</p>;
}

export default function TermsPage() {
  const lastUpdated = 'May 29, 2026';
  const operatorName = LEGAL_ENTITY_NAME || 'the operator of this deployment';

  return (
    <main className="min-h-screen bg-white dark:bg-zinc-950">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>

        <div className="flex items-center gap-3 mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-600">
            <Scale className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Terms and Conditions</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Last updated: {lastUpdated}</p>
          </div>
        </div>

        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-xl p-4 mb-8">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-700 dark:text-amber-300">
              These terms are a public template for self-hosted deployments. Review them with qualified counsel before relying on them in production.
            </p>
          </div>
        </div>

        <div className="prose prose-zinc dark:prose-invert max-w-none">
          <section className="mb-8">
            <SectionHeading>1. Operator</SectionHeading>
            <BodyText>
              Average Joe Trades is open-source software. This deployment is operated by {operatorName}.
              The open-source project maintainers do not provide hosted brokerage, custodial, or advisory services through your self-hosted instance.
            </BodyText>
          </section>

          <section className="mb-8">
            <SectionHeading>2. No Financial Advice</SectionHeading>
            <BodyText>
              Average Joe Trades is a journaling, analytics, and decision-support tool. It is not a broker-dealer,
              investment adviser, commodity trading adviser, exchange, execution venue, custodian, tax adviser, or legal adviser.
            </BodyText>
            <BodyText>
              All analytics, AI outputs, scores, backtests, and community aggregates are informational only.
              You are responsible for every trading, tax, and investment decision you make.
            </BodyText>
          </section>

          <section className="mb-8">
            <SectionHeading>3. Trading Risk</SectionHeading>
            <ul className="list-disc list-inside text-zinc-600 dark:text-zinc-400 mb-4 space-y-2">
              <li>Stocks, options, futures, crypto assets, and leveraged products can lose money quickly.</li>
              <li>Past performance, model confidence, and backtests do not guarantee future outcomes.</li>
              <li>Market data can be delayed, incomplete, inaccurate, or unavailable.</li>
              <li>Consult licensed professionals before making financial, tax, accounting, or legal decisions.</li>
            </ul>
          </section>

          <section className="mb-8">
            <SectionHeading>4. User Responsibilities</SectionHeading>
            <ul className="list-disc list-inside text-zinc-600 dark:text-zinc-400 mb-4 space-y-2">
              <li>Keep OAuth credentials, API keys, MCP keys, broker tokens, and database credentials private.</li>
              <li>Do not submit real secrets, broker exports, account numbers, or private trading data to public issues.</li>
              <li>Use the software only in compliance with applicable laws and third-party provider terms.</li>
              <li>Do not disrupt the service, bypass security controls, or misrepresent your identity.</li>
            </ul>
          </section>

          <section className="mb-8">
            <SectionHeading>5. Optional Integrations</SectionHeading>
            <BodyText>
              SnapTrade, AI providers, market data, Discord, GitHub, and MCP access are optional and require your own credentials.
              The operator is responsible for configuring, securing, monitoring, and disabling integrations as needed.
            </BodyText>
          </section>

          <section className="mb-8">
            <SectionHeading>6. Open-Source License</SectionHeading>
            <BodyText>
              The source code is distributed under the MIT License. The license governs use, copying, modification,
              and distribution of the code. These terms govern use of this running deployment.
            </BodyText>
          </section>

          <section className="mb-8">
            <SectionHeading>7. Warranty Disclaimer</SectionHeading>
            <BodyText>
              To the maximum extent permitted by law, the software and this deployment are provided as is and as available,
              without warranties of any kind. The operator and project contributors do not guarantee availability,
              data accuracy, profitability, fitness for a particular purpose, or uninterrupted service.
            </BodyText>
          </section>

          <section className="mb-8">
            <SectionHeading>8. Contact</SectionHeading>
            <BodyText>
              Questions about these terms should be sent through the configured support channel.
            </BodyText>
            <div className="bg-zinc-50 dark:bg-zinc-900 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800">
              {SUPPORT_URL && (
                <p className="text-zinc-600 dark:text-zinc-400 mb-2">
                  Support:{' '}
                  <a href={SUPPORT_URL} className="text-emerald-600 dark:text-emerald-400 hover:underline">
                    {SUPPORT_URL}
                  </a>
                </p>
              )}
              {SUPPORT_EMAIL && (
                <p className="text-zinc-600 dark:text-zinc-400">
                  Email:{' '}
                  <a href={`mailto:${SUPPORT_EMAIL}`} className="text-emerald-600 dark:text-emerald-400 hover:underline">
                    {SUPPORT_EMAIL}
                  </a>
                </p>
              )}
              {!SUPPORT_URL && !SUPPORT_EMAIL && (
                <p className="text-zinc-600 dark:text-zinc-400">
                  Configure NEXT_PUBLIC_SUPPORT_URL or NEXT_PUBLIC_SUPPORT_EMAIL to publish contact details.
                </p>
              )}
            </div>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-zinc-200 dark:border-zinc-800">
          <div className="flex flex-wrap justify-center gap-6 text-sm mb-4">
            <Link href="/privacy" className="text-zinc-500 hover:text-emerald-600 dark:text-zinc-400 dark:hover:text-emerald-400 transition-colors">
              Privacy Policy
            </Link>
            <Link href="/contact" className="text-zinc-500 hover:text-emerald-600 dark:text-zinc-400 dark:hover:text-emerald-400 transition-colors">
              Contact
            </Link>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center">
            &copy; {new Date().getFullYear()} {COPYRIGHT_NAME}. All rights reserved.
          </p>
        </div>
      </div>
    </main>
  );
}