import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Github, Mail, MessageCircle } from 'lucide-react';
import { COPYRIGHT_NAME, SUPPORT_EMAIL, SUPPORT_URL } from '@/lib/public-config';
import { SITE_URL, SOCIAL_IMAGE_ALT, SOCIAL_IMAGE_URL } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Support and project contact information for Average Joe Trades.',
  alternates: {
    canonical: `${SITE_URL}/contact`,
  },
  openGraph: {
    title: 'Contact | Average Joe Trades',
    description: 'Support and project contact information for Average Joe Trades.',
    url: `${SITE_URL}/contact`,
    type: 'website',
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

export default function ContactPage() {
  const hasSupportUrl = Boolean(SUPPORT_URL);
  const hasSupportEmail = Boolean(SUPPORT_EMAIL);

  return (
    <main className="min-h-screen bg-linear-to-br from-zinc-50 via-white to-emerald-50/30 dark:from-zinc-950 dark:via-zinc-900 dark:to-emerald-950/20">
      <div className="relative max-w-4xl mx-auto px-4 py-12">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 mb-8 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>

        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-linear-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/25 mb-6">
            <MessageCircle className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-zinc-900 dark:text-zinc-100 mb-3">
            Contact
          </h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400 max-w-xl mx-auto">
            Use the configured support channels for help, feedback, and vulnerability coordination.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-12">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/30">
                <Github className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                Project Support
              </h2>
            </div>
            {hasSupportUrl ? (
              <a
                href={SUPPORT_URL}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
              >
                Open Support
              </a>
            ) : (
              <p className="text-zinc-600 dark:text-zinc-400">
                Set NEXT_PUBLIC_SUPPORT_URL in your deployment to publish a support link here.
              </p>
            )}
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 rounded-xl bg-teal-50 dark:bg-teal-900/30">
                <Mail className="h-6 w-6 text-teal-600 dark:text-teal-400" />
              </div>
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                Email
              </h2>
            </div>
            {hasSupportEmail ? (
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-lg font-medium text-emerald-700 dark:text-emerald-300 hover:underline"
              >
                {SUPPORT_EMAIL}
              </a>
            ) : (
              <p className="text-zinc-600 dark:text-zinc-400">
                Set NEXT_PUBLIC_SUPPORT_EMAIL to publish an email contact.
              </p>
            )}
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-zinc-200 dark:border-zinc-800">
          <div className="flex flex-wrap justify-center gap-6 text-sm">
            <Link
              href="/privacy"
              className="text-zinc-500 hover:text-emerald-600 dark:text-zinc-400 dark:hover:text-emerald-400 transition-colors"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="text-zinc-500 hover:text-emerald-600 dark:text-zinc-400 dark:hover:text-emerald-400 transition-colors"
            >
              Terms & Conditions
            </Link>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center mt-4">
            &copy; {new Date().getFullYear()} {COPYRIGHT_NAME}. All rights reserved.
          </p>
        </div>
      </div>
    </main>
  );
}