import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeft, Shield } from 'lucide-react';
import {
  COPYRIGHT_NAME,
  LEGAL_ENTITY_NAME,
  SUPPORT_EMAIL,
  SUPPORT_URL,
} from '@/lib/public-config';
import { SITE_URL, SOCIAL_IMAGE_ALT, SOCIAL_IMAGE_URL } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Self-hosting privacy template for Average Joe Trades deployments.',
  alternates: {
    canonical: `${SITE_URL}/privacy`,
  },
  openGraph: {
    title: 'Privacy Policy | Average Joe Trades',
    description: 'How an Average Joe Trades deployment may process account, trade, and integration data.',
    url: `${SITE_URL}/privacy`,
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

export default function PrivacyPolicyPage() {
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
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600">
            <Shield className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Privacy Policy</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Last updated: {lastUpdated}</p>
          </div>
        </div>

        <div className="prose prose-zinc dark:prose-invert max-w-none">
          <section className="mb-8">
            <SectionHeading>1. Overview</SectionHeading>
            <BodyText>
              Average Joe Trades is open-source software. This page is a deployment-level privacy
              template for self-hosters and should be reviewed before a public production launch.
            </BodyText>
            <BodyText>
              In this deployment, {operatorName} controls how the application is configured,
              hosted, secured, monitored, and supported.
            </BodyText>
          </section>

          <section className="mb-8">
            <SectionHeading>2. Data Processed</SectionHeading>
            <ul className="list-disc list-inside text-zinc-600 dark:text-zinc-400 mb-4 space-y-1">
              <li>Google OAuth identity data such as name, email, and provider account ID.</li>
              <li>Trading journal entries, imported transactions, positions, notes, and derived analytics.</li>
              <li>Optional SnapTrade connection metadata and service-user secrets when broker sync is enabled.</li>
              <li>Optional AI chat prompts, responses, feedback, and model status data when AI features are enabled.</li>
              <li>Security, sync, API, and application logs needed to operate and troubleshoot the app.</li>
            </ul>
          </section>

          <section className="mb-8">
            <SectionHeading>3. Optional Integrations</SectionHeading>
            <BodyText>
              Google OAuth, SnapTrade, AI providers, market-data providers, Discord, GitHub, and MCP
              access are optional integrations. Each integration is controlled by environment variables
              and may be left disabled.
            </BodyText>
            <BodyText>
              Third-party providers process data under their own terms and policies. Review each
              provider before enabling it for live brokerage or portfolio data.
            </BodyText>
          </section>

          <section className="mb-8">
            <SectionHeading>4. Broker Credentials</SectionHeading>
            <BodyText>
              SnapTrade service-user secrets are stored in the application database so the app can
              sync accounts after authorization. This repository does not currently add application-level
              encryption around that database field.
            </BodyText>
            <BodyText>
              Production operators should use database encryption, encrypted backups, least-privilege
              database users, private networking, restricted logs, and short retention policies before
              connecting real brokerage accounts.
            </BodyText>
          </section>

          <section className="mb-8">
            <SectionHeading>5. Retention and Deletion</SectionHeading>
            <BodyText>
              Retention depends on the deployment operator&apos;s database, backup, log, and analytics
              configuration. Users should be given a clear path to request account deletion and old
              imports/logs should be purged on a documented schedule.
            </BodyText>
          </section>

          <section className="mb-8">
            <SectionHeading>6. Contact</SectionHeading>
            <BodyText>
              Questions about this deployment&apos;s privacy practices should be sent through the configured
              support channel.
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
            <Link href="/terms" className="text-zinc-500 hover:text-emerald-600 dark:text-zinc-400 dark:hover:text-emerald-400 transition-colors">
              Terms & Conditions
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