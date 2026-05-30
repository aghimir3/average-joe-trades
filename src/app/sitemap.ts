import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

/**
 * Sitemap configuration for search engines.
 *
 * Only includes public, indexable pages:
 * - Landing page (/)
 * - Privacy policy (/privacy)
 * - Terms and conditions (/terms)
 * - Contact page (/contact)
 *
 * Protected pages (dashboard, positions, etc.) are excluded
 * as they require authentication and should not be indexed.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const currentDate = new Date().toISOString();

  return [
    {
      url: SITE_URL,
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/contact`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
  ];
}
