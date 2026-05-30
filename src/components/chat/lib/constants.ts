/**
 * Chat Constants
 *
 * Suggested prompts, limits, and configuration for Joey chat.
 */

/** Suggested prompts shown in the empty state */
export const SUGGESTED_PROMPTS = [
  'How can I improve my trading results?',
  'Which tickers am I most profitable on and why?',
  'What are my riskiest open positions right now?',
  'Break down my options P&L by strategy',
] as const;

/** Max characters per message */
export const MAX_MESSAGE_LENGTH = 4000;

/** Max textarea rows (auto-resize) */
export const MAX_INPUT_ROWS = 4;

/** Personality modes for Joey */
export const JOEY_MODES = [
  { id: 'just-joey', label: 'Just Joey', description: 'Default' },
  { id: 'blunt-joey', label: 'Blunt Joey', description: 'No sugar coating' },
  { id: 'gentle-joey', label: 'Gentle Joey', description: 'Supportive' },
  { id: 'hype-joey', label: 'Hype Joey', description: 'Energetic' },
  { id: 'brief-joey', label: 'Brief Joey', description: 'Short & sweet' },
] as const;

/** Default personality mode */
export const DEFAULT_MODE_ID = JOEY_MODES[0].id;

/** Models users can choose from in the chat UI */
export const CHAT_MODELS = [
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', description: 'Fast & efficient' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', description: 'Most capable' },
] as const;

/** Default model ID */
export const DEFAULT_MODEL_ID = CHAT_MODELS[0].id;

/** Sidebar width on desktop */
export const SIDEBAR_WIDTH = 280;

/** Widget panel dimensions */
export const WIDGET_PANEL_WIDTH = 400;
export const WIDGET_PANEL_HEIGHT = 550;

/** Tool display names for the tool call cards */
export const TOOL_DISPLAY_NAMES: Record<string, string> = {
  get_accounts: 'Listing accounts',
  get_portfolio_summary: 'Querying portfolio summary',
  get_positions: 'Looking up positions',
  get_realtime_portfolio: 'Fetching real-time portfolio',
  search_trades: 'Searching trades',
  get_performance: 'Analyzing performance',
  get_trade_metrics: 'Calculating trade metrics',
  get_options_analytics: 'Analyzing options',
  get_wheel_strategy: 'Reviewing wheel strategy',
  get_ai_actions: 'Getting AI recommendations',
  get_ai_status: 'Checking AI status',
  get_ticker_recommendation: 'Analyzing ticker',
  get_journal_entries: 'Reading journal entries',
  get_community_insights: 'Checking community insights',
  get_market_regimes: 'Analyzing market regimes',
  get_app_features: 'Looking up app features',
  sync_trades: 'Syncing trades from brokerage',
};
