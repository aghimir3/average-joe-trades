/**
 * MCP Tool: get_journal_entries
 *
 * Returns daily trading journal entries with mood, notes, and lessons.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { prisma } from '@/lib/prisma';
import { createChildLogger } from '@/lib/logger';
import { dateSchema, sanitizeOutput } from '../security';

const log = createChildLogger({ module: 'mcp-journal' });

export function registerJournalTools(server: McpServer, userId: string) {
  server.registerTool(
    'get_journal_entries',
    {
      title: 'Journal Entries',
      description:
        'Get your daily trading journal entries including mood, notes, lessons learned, and market observations. Useful for reviewing patterns in your trading psychology.',
      inputSchema: z.object({
        startDate: dateSchema.describe('Start date (YYYY-MM-DD).'),
        endDate: dateSchema.describe('End date (YYYY-MM-DD).'),
        limit: z.number().int().min(1).max(50).default(10).describe('Max entries to return (1-50).'),
      }),
    },
    async ({ startDate, endDate, limit }) => {
      log.info({ userId, startDate, endDate, limit }, 'get_journal_entries');

      const where = {
        userId,
        ...((startDate || endDate) && {
          date: {
            ...(startDate && { gte: new Date(startDate) }),
            ...(endDate && { lte: new Date(endDate) }),
          },
        }),
      };

      const [entries, total] = await Promise.all([
        prisma.dailyJournal.findMany({
          where,
          orderBy: { date: 'desc' },
          take: limit,
        }),
        prisma.dailyJournal.count({ where }),
      ]);

      const result = sanitizeOutput({
        entries: entries.map((e) => ({
          date: e.date.toISOString().split('T')[0],
          preMarket: {
            notes: e.preMarketNotes,
            mood: e.preMarketMood,
            watchlist: e.watchlist,
            keyLevels: e.keyLevels,
          },
          health: {
            hoursSlept: e.hoursSlept ? Number(e.hoursSlept) : null,
            sleepQuality: e.sleepQuality,
            exercised: e.exercised,
            caffeineIntake: e.caffeineIntake,
            stressLevel: e.stressLevel,
          },
          postMarket: {
            notes: e.postMarketNotes,
            emotionalState: e.emotionalState,
            followedPlan: e.followedPlan,
            biggestWin: e.biggestWin,
            biggestMistake: e.biggestMistake,
            lessonsLearned: e.lessonsLearned,
          },
          marketCondition: e.marketCondition,
        })),
        total,
        hasMore: total > limit,
      });

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
