/**
 * Analytics Session API Route
 *
 * POST /api/analytics/session - Track user login session with IP
 *
 * Called once per browser session to record login activity.
 * Captures IP address from request headers for geographic analytics.
 */

import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { apiNoContent } from '@/lib/api/response';

/**
 * POST /api/analytics/session
 * Track user login session (fire-and-forget)
 */
export async function POST(request: NextRequest) {
  try {
    // Get session - lightweight check
    const session = await auth();
    if (!session?.user?.id) {
      return apiNoContent();
    }

    const userId = session.user.id;

    // Extract IP address from headers (works with Vercel, Azure, Cloudflare, etc.)
    const forwardedFor = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');
    const cfConnectingIp = request.headers.get('cf-connecting-ip');

    // Priority: CF > X-Real-IP > X-Forwarded-For (first IP) > null
    let ipAddress: string | null = null;
    if (cfConnectingIp) {
      ipAddress = cfConnectingIp;
    } else if (realIp) {
      ipAddress = realIp;
    } else if (forwardedFor) {
      // X-Forwarded-For can contain multiple IPs, take the first (client IP)
      ipAddress = forwardedFor.split(',')[0].trim();
    }

    // Get user agent
    const userAgent = request.headers.get('user-agent')?.slice(0, 500) ?? null;

    // Fire-and-forget: Don't await, let it complete in background
    prisma.userSession
      .create({
        data: {
          userId,
          ipAddress,
          userAgent,
        },
      })
      .catch(() => {
        // Silently ignore errors - analytics should never block the user
      });

    // Return immediately
    return apiNoContent();
  } catch {
    // Analytics should never return errors to the client
    return apiNoContent();
  }
}

/**
 * GET /api/analytics/session
 * Update lastActiveAt for the current user's most recent session
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return apiNoContent();
    }

    const userId = session.user.id;

    // Fire-and-forget: Update lastActiveAt on most recent session
    prisma.userSession
      .updateMany({
        where: {
          userId,
          loginAt: {
            // Only update sessions from the last 24 hours
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
        data: {
          lastActiveAt: new Date(),
        },
      })
      .catch(() => {
        // Silently ignore errors
      });

    return apiNoContent();
  } catch {
    return apiNoContent();
  }
}
