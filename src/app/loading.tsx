import { PageLoadingSkeleton } from '@/components/layout/page-loading-skeleton';

/**
 * Root loading boundary — shown instantly on navigation while the
 * target page's server component (requireAuth, DB queries) resolves.
 * Route-specific loading.tsx files (e.g. import/) override this.
 */
export default function Loading() {
  return <PageLoadingSkeleton />;
}
