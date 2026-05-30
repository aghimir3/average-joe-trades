import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

/**
 * Robots.txt configuration for search engine crawlers.
 *
 * Rules:
 * - Allow crawling of public pages (landing, privacy, terms, contact)
 * - Disallow crawling of protected/authenticated pages
 * - Disallow API routes
 * - Point to sitemap for efficient crawling
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/privacy',
          '/terms',
          '/contact',
        ],
        disallow: [
          '/api/',
          '/demo/',
          '/demo/*',
          '/dashboard',
          '/dashboard/*',
          '/positions',
          '/positions/*',
          '/accounts',
          '/accounts/*',
          '/import',
          '/import/*',
          '/journal',
          '/journal/*',
          '/settings',
          '/settings/*',
          '/strategies',
          '/strategies/*',
          '/trade/',
          '/trade/*',
          '/issues',
          '/issues/*',
          '/tax-center',
          '/tax-center/*',
          '/ai-insights',
          '/ai-insights/*',
          '/policy',
          '/policy/*',
          '/features',
          '/features/*',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
