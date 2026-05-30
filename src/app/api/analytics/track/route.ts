/**
 * Analytics Tracking API Route
 *
 * POST /api/analytics/track - Track page/section views
 *
 * Designed for fire-and-forget tracking calls from the client.
 * Returns 204 No Content immediately to minimize latency.
 */

import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { apiNoContent } from '@/lib/api/response';

// Validation schema for tracking events
const trackingSchema = z.object({
  page: z.string().max(100),
  section: z.string().max(50).optional(),
});

/**
 * POST /api/analytics/track
 * Track page/section views (fire-and-forget)
 */
export async function POST(request: NextRequest) {
  try {
    // Get session - lightweight check
    const session = await auth();
    if (!session?.user?.id) {
      return apiNoContent();
    }

    const userId = session.user.id;

    // Parse body
    let body;
    try {
      body = await request.json();
    } catch {
      return apiNoContent();
    }

    // Validate
    const result = trackingSchema.safeParse(body);
    if (!result.success) {
      return apiNoContent();
    }

    const { page, section } = result.data;

    // Fire-and-forget: Don't await, let it complete in background
    prisma.pageViewEvent
      .create({
        data: {
          userId,
          page,
          section: section ?? null,
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
