/**
 * App Feature Data
 *
 * Shared feature definitions used by both the Features Guide page
 * and the Joey chat tool (get_app_features). Kept free of React
 * imports so it can be used on the server.
 */

export interface AppFeature {
  title: string;
  description: string;
  howToUse: string;
  benefit: string;
}

export interface AppFeatureSection {
  id: string;
  title: string;
  description: string;
  features: AppFeature[];
}

export const APP_FEATURE_SECTIONS: AppFeatureSection[] = [
  {
    id: 'dashboard',
    title: 'Dashboard & Analytics',
    description: 'Your trading command center with real-time stats and insights',
    features: [
      {
        title: 'P&L Summary Cards',
        description: 'See your total profit/loss, win rate, profit factor, and average win/loss at a glance.',
        howToUse: 'Open the dashboard - stats are displayed at the top automatically.',
        benefit: 'Instantly know how your trading is performing without digging through data.',
      },
      {
        title: 'P&L Chart',
        description: 'Visual line chart showing your cumulative profit/loss over time.',
        howToUse: 'Click timeframe buttons (1W, 1M, 3M, 6M, YTD, 1Y, ALL) to change the view.',
        benefit: 'Spot trends in your trading performance and see how you\'re progressing.',
      },
      {
        title: 'Calendar View',
        description: 'Monthly calendar showing daily P&L with color-coded days (green for profit, red for loss).',
        howToUse: 'Click any day to see details. Navigate months with arrows.',
        benefit: 'Identify your best and worst trading days at a glance.',
      },
      {
        title: 'Quick Section Navigation',
        description: 'Jump to any dashboard section instantly with the sticky navigation bar.',
        howToUse: 'Scroll down to see the navigation bar appear. Click any section name to jump there.',
        benefit: 'Quickly access the analytics you need without endless scrolling.',
      },
    ],
  },
  {
    id: 'positions',
    title: 'Position Tracking',
    description: 'Track all your open positions across stocks, options, and crypto',
    features: [
      {
        title: 'Unified Portfolio View',
        description: 'See all your positions from all brokerage accounts in one place.',
        howToUse: 'Go to Positions page or scroll to the portfolio section on the dashboard.',
        benefit: 'Never lose track of what you own across multiple accounts.',
      },
      {
        title: 'Position Filtering',
        description: 'Filter positions by type (stocks, options, crypto) or by brokerage account.',
        howToUse: 'Use the tabs and dropdown at the top of the positions list.',
        benefit: 'Focus on specific position types when you need to.',
      },
      {
        title: 'Live Sync Indicator',
        description: 'See which positions are synced live from your brokerage vs manually entered.',
        howToUse: 'Look for "LIVE" badges on positions synced from connected brokerages.',
        benefit: 'Know which data is real-time and which might need updating.',
      },
      {
        title: 'Position Details',
        description: 'Click any position to see full details including entry price, current value, and P&L.',
        howToUse: 'Click on a position row to open the detail view.',
        benefit: 'Get the full picture on any trade without leaving the page.',
      },
    ],
  },
  {
    id: 'trading',
    title: 'Trade Entry',
    description: 'Enter and close trades with ease',
    features: [
      {
        title: 'Stock Trades',
        description: 'Log buy and sell orders for stocks and ETFs.',
        howToUse: 'Click Trade -> Stock Trade. Enter the symbol, quantity, and price.',
        benefit: 'Keep accurate records of all your equity trades.',
      },
      {
        title: 'Option Trades',
        description: 'Log calls, puts, spreads, and more complex option strategies.',
        howToUse: 'Click Trade -> choose your strategy (Long Call, Covered Call, etc.).',
        benefit: 'Track options trades with proper P&L calculation per contract.',
      },
      {
        title: 'Exit Positions',
        description: 'Close out existing positions and record your realized P&L.',
        howToUse: 'Click Trade -> Exit Position, then select which position to close.',
        benefit: 'Accurately track your wins and losses on closed trades.',
      },
    ],
  },
  {
    id: 'import',
    title: 'Trade Import',
    description: 'Import your trading history from any brokerage',
    features: [
      {
        title: 'CSV Import',
        description: 'Upload CSV files exported from Robinhood, Schwab, and other brokerages.',
        howToUse: 'Go to Import -> Choose File -> Select your CSV -> Preview -> Import.',
        benefit: 'Import months or years of trading history in seconds.',
      },
      {
        title: 'SnapTrade Sync',
        description: 'Connect your brokerage account for automatic trade syncing.',
        howToUse: 'Go to Accounts -> Add Account -> Connect via SnapTrade -> Authorize.',
        benefit: 'Never manually enter a trade again - they sync automatically.',
      },
      {
        title: 'Import Preview',
        description: 'Review trades before importing to catch any issues.',
        howToUse: 'After selecting a file, review the preview table before confirming.',
        benefit: 'Avoid importing duplicate or incorrect data.',
      },
      {
        title: 'Duplicate Detection',
        description: 'Automatic detection of duplicate trades to prevent double-counting.',
        howToUse: 'Just import - the system automatically skips duplicates.',
        benefit: 'Import the same file multiple times without worrying about duplicates.',
      },
    ],
  },
  {
    id: 'accounts',
    title: 'Account Management',
    description: 'Manage multiple brokerage accounts in one place',
    features: [
      {
        title: 'Multi-Account Support',
        description: 'Track trades from Robinhood, Schwab, Fidelity, and more.',
        howToUse: 'Go to Accounts -> Add Account -> Choose your broker.',
        benefit: 'See your complete trading picture across all brokerages.',
      },
      {
        title: 'Account Filtering',
        description: 'Filter all data by specific account or view all accounts combined.',
        howToUse: 'Use the account dropdown in the dashboard header.',
        benefit: 'Focus on one account or see the big picture.',
      },
      {
        title: 'Real-Time Sync',
        description: 'Connected accounts sync trades automatically.',
        howToUse: 'Click Sync on any connected account to pull latest trades.',
        benefit: 'Your data stays current without manual entry.',
      },
    ],
  },
  {
    id: 'options-analytics',
    title: 'Options Analytics',
    description: 'Deep dive into your options trading performance',
    features: [
      {
        title: 'Strategy Performance',
        description: 'See how each option strategy (covered calls, puts, spreads) performs.',
        howToUse: 'Scroll to Options Deep Dive -> Strategy tab.',
        benefit: 'Know which strategies work best for you.',
      },
      {
        title: 'DTE Analysis',
        description: 'Analyze performance by days to expiration (DTE).',
        howToUse: 'Open Options Deep Dive -> DTE Performance tab.',
        benefit: 'Find your optimal expiration timeframe.',
      },
      {
        title: 'Win/Loss Distribution',
        description: 'Visualize the distribution of your winning and losing trades.',
        howToUse: 'Open Options Deep Dive -> Win/Loss tab.',
        benefit: 'Understand the risk/reward profile of your trading.',
      },
      {
        title: 'Premium Analysis',
        description: 'Track premium collected vs paid across all option trades.',
        howToUse: 'Open Options Deep Dive -> Premium tab.',
        benefit: 'Know if you\'re a net premium seller or buyer.',
      },
    ],
  },
  {
    id: 'wheel',
    title: 'Wheel Strategy Tracking',
    description: 'Complete hub for covered call and cash-secured put wheel strategy',
    features: [
      {
        title: 'Income Analysis',
        description: 'See total premium collected, number of cycles, and wheel P&L.',
        howToUse: 'Go to Strategies -> Income Analysis tab.',
        benefit: 'Track the success of your wheel trading.',
      },
      {
        title: 'Options-First AI Actions',
        description: 'Action cards tuned for options traders with roll, hold, close, and new setup suggestions.',
        howToUse: 'Go to AI Insights -> Actions tab. Start in Simple view, then open Advanced Quant for deeper evidence.',
        benefit: 'Get fast, plain-English suggestions without losing quant rigor when you need detail.',
      },
      {
        title: 'Community Wheel Intel',
        description: 'See platform-wide wheel behavior by ticker and regime, including win-rate and assignment patterns.',
        howToUse: 'Go to AI Insights -> Community tab. Search a ticker and compare your setup to community patterns.',
        benefit: 'Use anonymized hive-mind data to validate or challenge your plan.',
      },
      {
        title: 'Options Scanner',
        description: 'Find optimal options contracts for your wheel strategy. Shows annualized returns and OTM %.',
        howToUse: 'Go to Strategies -> Options Scanner tab. Enter a ticker or select from your positions.',
        benefit: 'Quickly find the best strikes and expirations for maximum income.',
      },
      {
        title: 'Ticker Deep Dive',
        description: 'Detailed performance analysis for any individual ticker in your wheel portfolio.',
        howToUse: 'Go to Strategies -> Ticker Deep Dive tab. Search for a specific ticker.',
        benefit: 'Understand your performance on each stock you wheel.',
      },
    ],
  },
  {
    id: 'goals',
    title: 'Goals & Streaks',
    description: 'Set targets and track your winning streaks',
    features: [
      {
        title: 'P&L Goals',
        description: 'Set weekly, monthly, or yearly profit targets.',
        howToUse: 'Go to Goals & Streaks section -> click Set Goal.',
        benefit: 'Stay motivated with clear targets to hit.',
      },
      {
        title: 'Progress Tracking',
        description: 'Visual progress bars show how close you are to each goal.',
        howToUse: 'View the Goals section - progress updates automatically.',
        benefit: 'Know exactly how much more you need to reach your target.',
      },
      {
        title: 'Win Streaks',
        description: 'Track your current and best winning streaks.',
        howToUse: 'Check the Streaks card in Goals & Streaks section.',
        benefit: 'Celebrate your hot streaks and stay consistent.',
      },
    ],
  },
  {
    id: 'ai-insights',
    title: 'AI Insights',
    description: 'Action-first AI workspace with simple recommendations and optional advanced quant detail',
    features: [
      {
        title: 'Actions (Simple + Advanced)',
        description: 'Every suggestion includes a plain-language action (buy, avoid, hold, sell, roll, close) plus optional quant evidence.',
        howToUse: 'Open AI Insights -> Actions. Use Simple by default, then open Advanced Quant for confidence, reason codes, and risk flags.',
        benefit: 'Take clear next steps quickly while still having audit-ready detail when needed.',
      },
      {
        title: 'Ticker Advisor',
        description: 'Enter any ticker to get an action suggestion using current context and historical behavior.',
        howToUse: 'In AI Insights -> Actions, use the Ticker Advisor card and run analysis. Open Advanced to inspect rationale.',
        benefit: 'Research new symbols fast, even before you open a position.',
      },
      {
        title: 'Alpha Lab (Simple + Advanced)',
        description: 'Run walk-forward backtests with transaction costs and slippage to test strategy behavior across time.',
        howToUse: 'Go to AI Insights -> Alpha Lab. Pick ticker and date range, run, then switch between Simple and Advanced views.',
        benefit: 'Validate ideas before placing trades with realistic assumptions.',
      },
      {
        title: 'Risk Dashboard',
        description: 'Portfolio guardrails for concentration, drawdown pressure, exposure, and VaR/CVaR-style risk checks.',
        howToUse: 'Go to AI Insights -> Risk. Review risk flags first, then drill into exposure and scenario numbers.',
        benefit: 'Catch oversized risk early and protect the portfolio from preventable drawdowns.',
      },
      {
        title: 'Your Models + Train',
        description: 'Model health view for options, wheel, stock, and community models with readiness checks and training controls.',
        howToUse: 'Go to AI Insights -> Your Models to review status, then AI Insights -> Train to retrain stale models.',
        benefit: 'Know what is live, what is stale, and when to retrain for better recommendations.',
      },
      {
        title: 'Community Regime Insights',
        description: 'Aggregated, anonymized platform behavior grouped by market regimes and ticker context.',
        howToUse: 'Go to AI Insights -> Community and search your ticker to compare your setup with crowd outcomes.',
        benefit: 'Blend personal signals with crowd evidence for stronger conviction.',
      },
      {
        title: 'Metric Tooltips',
        description: 'In-product definitions explain metrics like Sharpe, Sortino, drawdown, and drift in simple language.',
        howToUse: 'Hover or tap the info icon next to metrics across Actions, Alpha Lab, and Risk.',
        benefit: 'Understand advanced stats without leaving the page.',
      },
      {
        title: 'Event-Driven Market Data',
        description: 'Historical data is fetched when needed (current positions or ticker searches), then cached for fast reuse.',
        howToUse: 'Request analysis for your holdings or run Ticker Advisor/Alpha Lab. The system refreshes only required symbols.',
        benefit: 'Fast suggestions and lower infrastructure load without background cron jobs.',
      },
    ],
  },
  {
    id: 'ml',
    title: 'ML-Powered Insights',
    description: 'Personalized predictions powered by machine learning',
    features: [
      {
        title: 'Strategy Simulator',
        description: 'Test trade ideas and get ML predictions before executing.',
        howToUse: 'Open ML Options Insights -> Simulator tab -> Enter a symbol.',
        benefit: 'Make more informed decisions with AI-powered analysis.',
      },
      {
        title: 'P&L Attribution',
        description: 'Understand what\'s driving your P&L (delta, theta, vega, execution).',
        howToUse: 'Open ML Options Insights -> P&L Breakdown tab.',
        benefit: 'Learn if you\'re making money from stock moves, time decay, or volatility.',
      },
      {
        title: 'Position Alerts',
        description: 'Get notified about positions that need attention (expiring, large losses).',
        howToUse: 'Check the Alerts tab in ML Options Insights.',
        benefit: 'Never miss an important action on your positions.',
      },
      {
        title: 'Daily Insights',
        description: 'Personalized daily tips and observations based on your trading.',
        howToUse: 'Open ML Options Insights -> Insights tab.',
        benefit: 'Get actionable advice tailored to your trading style.',
      },
    ],
  },
  {
    id: 'joey',
    title: 'Ask Joey — AI Chat Assistant',
    description: 'Chat with your AI trading assistant that has full access to your portfolio data',
    features: [
      {
        title: 'Natural Language Queries',
        description: 'Ask questions about your portfolio, positions, trades, and analytics in plain English.',
        howToUse: 'Go to Ask Joey from the nav bar, or tap the chat bubble in the bottom-right corner of any page.',
        benefit: 'Get instant answers about your trading data without navigating through multiple pages.',
      },
      {
        title: 'Model Switcher',
        description: 'Choose between Haiku 4.5 (fast & efficient) and Sonnet 4.6 (most capable) for different needs.',
        howToUse: 'Use the model dropdown in the top-right of the chat header to switch models.',
        benefit: 'Use the fast model for quick lookups and the powerful model for deeper analysis.',
      },
      {
        title: '15 Data Tools',
        description: 'Joey can query your portfolio summary, positions, trades, options analytics, wheel strategy, AI recommendations, journal entries, and more.',
        howToUse: 'Just ask — Joey automatically picks the right tools. Try "How\'s my portfolio doing?" or "What options are expiring soon?"',
        benefit: 'Access all your trading data through conversation without learning the interface.',
      },
      {
        title: 'Conversation History',
        description: 'All conversations are saved and searchable with date grouping and archive support.',
        howToUse: 'Use the sidebar to browse past conversations, search by keyword, or archive old chats.',
        benefit: 'Revisit previous analysis and insights anytime.',
      },
      {
        title: 'Floating Chat Widget',
        description: 'Quick-access chat bubble available on every page of the app.',
        howToUse: 'Click the chat bubble in the bottom-right corner from any page.',
        benefit: 'Ask questions without leaving your current workflow.',
      },
      {
        title: 'Rich Markdown Responses',
        description: 'Joey responds with formatted tables, bold text, lists, code blocks, and more.',
        howToUse: 'Responses render automatically with full markdown — no extra steps needed.',
        benefit: 'Read clear, well-formatted analysis that\'s easy to scan and understand.',
      },
      {
        title: 'Personality Modes',
        description: 'Switch between 5 Joey personalities: Just Joey (default), Blunt, Gentle, Hype, and Brief.',
        howToUse: 'Use the mode dropdown in the chat header to pick a personality that fits your mood.',
        benefit: 'Get responses in the tone you prefer — concise, encouraging, no-nonsense, or celebratory.',
      },
    ],
  },
  {
    id: 'journal',
    title: 'Trading Journal',
    description: 'Record your thoughts and learn from every trade',
    features: [
      {
        title: 'Daily Journal',
        description: 'Write pre-market and post-market notes for each trading day.',
        howToUse: 'Go to Journal -> Write in Today\'s entry.',
        benefit: 'Track your mindset and improve decision-making over time.',
      },
      {
        title: 'Trade Notes',
        description: 'Attach notes to specific trades explaining your reasoning.',
        howToUse: 'Open a trade detail -> Add Note.',
        benefit: 'Review why you took each trade when analyzing performance.',
      },
    ],
  },
  {
    id: 'policy',
    title: 'Portfolio Policy',
    description: 'Define and enforce your trading rules',
    features: [
      {
        title: 'Trading Rules',
        description: 'Document your entry/exit criteria and position sizing rules.',
        howToUse: 'Go to Policy -> Edit your rules.',
        benefit: 'Stay disciplined by having written rules to follow.',
      },
      {
        title: 'Risk Limits',
        description: 'Set maximum position sizes and daily loss limits.',
        howToUse: 'Go to Policy -> Set your risk parameters.',
        benefit: 'Protect yourself from outsized losses.',
      },
    ],
  },
  {
    id: 'tax',
    title: 'Tax Center',
    description: 'Track tax-relevant information for your trades',
    features: [
      {
        title: 'Realized Gains/Losses',
        description: 'View your realized gains and losses for tax reporting.',
        howToUse: 'Go to Tax Center -> View yearly summary.',
        benefit: 'Have tax data ready when filing season arrives.',
      },
      {
        title: 'Wash Sale Detection',
        description: 'Automatic detection of potential wash sales.',
        howToUse: 'Check Tax Center -> Wash Sales tab.',
        benefit: 'Avoid tax surprises from disallowed losses.',
      },
    ],
  },
  {
    id: 'settings',
    title: 'Settings & Sync',
    description: 'Customize your experience and manage sync preferences',
    features: [
      {
        title: 'Auto-Sync',
        description: 'Enable automatic syncing of trades from connected brokerages.',
        howToUse: 'Go to Settings -> Enable Auto-Sync.',
        benefit: 'Always have up-to-date trade data without manual effort.',
      },
      {
        title: 'Theme Selection',
        description: 'Switch between light, dark, and system themes.',
        howToUse: 'Click the theme toggle in the header or go to Settings.',
        benefit: 'Trade in the lighting that\'s comfortable for you.',
      },
      {
        title: 'Notification Preferences',
        description: 'Choose what alerts and notifications you receive.',
        howToUse: 'Go to Settings -> Notifications.',
        benefit: 'Stay informed without being overwhelmed.',
      },
      {
        title: 'Screen Lock',
        description: 'Protect your account with biometric authentication (WebAuthn/passkey) or a PIN code.',
        howToUse: 'Go to Settings -> Screen Lock. Set up a passkey or PIN and choose an auto-lock timeout (1 min to 1 hour).',
        benefit: 'Keep your trading data private even on shared devices.',
      },
      {
        title: 'API Keys (MCP Integration)',
        description: 'Generate personal API keys to connect external AI tools (Claude Desktop, custom agents) to your trading data.',
        howToUse: 'Go to Settings -> API Keys -> Create Key. Copy the key and configure your MCP client.',
        benefit: 'Query your portfolio, trades, and analytics from any MCP-compatible AI assistant.',
      },
    ],
  },
];
