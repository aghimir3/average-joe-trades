/**
 * MCP Server Factory
 *
 * Creates an McpServer instance with all tools registered.
 * Each tool is scoped to the authenticated userId via closure.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAccountTools } from './tools/accounts';
import { registerPortfolioTools } from './tools/portfolio';
import { registerTradeTools } from './tools/trades';
import { registerAnalyticsTools } from './tools/analytics';
import { registerOptionsTools } from './tools/options';
import { registerAIInsightsTools } from './tools/ai-insights';
import { registerJournalTools } from './tools/journal';
import { registerCommunityTools } from './tools/community';
import { registerSyncTradesTools } from './tools/sync-trades';

/**
 * Create an MCP server instance with all tools registered.
 * All tool queries are scoped to the given userId.
 * Tools are read-only except sync_trades (one-time exception for brokerage sync).
 */
export function createMCPServer(userId: string): McpServer {
  const server = new McpServer({
    name: 'average-joe-trades',
    version: '1.0.0',
  });

  registerAccountTools(server, userId);
  registerPortfolioTools(server, userId);
  registerTradeTools(server, userId);
  registerAnalyticsTools(server, userId);
  registerOptionsTools(server, userId);
  registerAIInsightsTools(server, userId);
  registerJournalTools(server, userId);
  registerCommunityTools(server, userId);
  registerSyncTradesTools(server, userId);

  return server;
}
