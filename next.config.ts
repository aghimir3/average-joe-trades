import type { NextConfig } from "next";

const useStandaloneOutput =
  process.env.NEXT_OUTPUT === 'standalone' || process.platform !== 'win32';

const isProduction = process.env.NODE_ENV === 'production';

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://accounts.google.com https://*.googleapis.com https://api.snaptrade.com https://*.snaptrade.com",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  ...(isProduction ? ['upgrade-insecure-requests'] : []),
].join('; ');

const securityHeaders = [
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
  {
    key: 'Content-Security-Policy',
    value: contentSecurityPolicy,
  },
  ...(isProduction
    ? [
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=31536000; includeSubDomains; preload',
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,

  /**
   * Generate a unique build ID for cache busting.
   * This helps ensure users get fresh content after deployments.
   */
  generateBuildId: async () => {
    // Use timestamp + random string for unique build ID
    return `build-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  },

  /**
   * Custom headers for cache control and security.
   * Ensures HTML pages are revalidated on each request while
   * static assets use immutable caching (they have hashed filenames).
   */
  headers: async () => [
    {
      // Security headers for all routes
      source: '/:path*',
      headers: [
        // Cache control - always revalidate HTML pages
        {
          key: 'Cache-Control',
          value: 'no-cache, no-store, must-revalidate',
        },
        ...securityHeaders,
      ],
    },
  ],

  /**
   * Standalone output mode for Azure App Service deployment.
   * Creates a self-contained package with only necessary dependencies (~50MB vs 500MB+).
   * Eliminates symlink issues with Azure's ZipDeploy and speeds up cold starts.
   */
  output: useStandaloneOutput ? 'standalone' : undefined, // Note: Windows local builds may fail at standalone step due to Turbopack chunk filenames with colons. Linux CI/CD works fine.

  /**
   * External packages for Server Components.
   *
   * These packages are not bundled by Next.js/Turbopack and are
   * imported as-is from node_modules. This is required for packages
   * that have complex module resolution or native dependencies.
   *
   * NOTE: In Next.js 16, this was renamed from serverComponentsExternalPackages
   * to serverExternalPackages.
   */
  serverExternalPackages: [
    '@prisma/client', // Prisma ORM client
    '@prisma/adapter-mssql', // Prisma MSSQL adapter (Prisma 7)
    'tedious', // TDS protocol driver for MSSQL (used by adapter)
    'pino', // Logger
    'pino-pretty', // Logger pretty print (dev only)
  ],
};

export default nextConfig;
