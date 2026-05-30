import type { GuildForumTagData } from 'discord.js';

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export interface RoleDef {
  name: string;
  color: number;
  mentionable: boolean;
}

export const ROLES: RoleDef[] = [
  { name: 'Admin', color: 0xe74c3c, mentionable: false },
  { name: 'Beta Tester', color: 0x9b59b6, mentionable: true },
  { name: 'Wheel Trader', color: 0xf1c40f, mentionable: true },
  { name: 'Options Trader', color: 0x2ecc71, mentionable: true },
  { name: 'New Member', color: 0x95a5a6, mentionable: false },
];

// ---------------------------------------------------------------------------
// Channel content — starter messages, rules, FAQ
// ---------------------------------------------------------------------------

export const CHANNEL_CONTENT: Record<string, string | string[]> = {
  // ── Information ──
  announcements: [
    '# Welcome to Average Joe Trades',
    '',
    'This is the official Discord for **Average Joe Trades** — the multi-broker options & stocks trading journal.',
    '',
    "Here you'll find release notes, new feature announcements, and downtime notices.",
    '',
    'Turn on notifications for this channel to stay in the loop.',
  ].join('\n'),

  rules: [
    '# Server Rules',
    '',
    '**1. No Financial Advice**',
    'Nothing shared here constitutes financial advice. All discussion is for educational and informational purposes only. Always do your own research.',
    '',
    '**2. Be Respectful**',
    'Treat everyone with respect. No harassment, hate speech, discrimination, or personal attacks.',
    '',
    '**3. Stay On Topic**',
    'Use channels for their intended purpose. Check the channel description if unsure.',
    '',
    '**4. No Spam or Self-Promotion**',
    "No unsolicited promotions, referral links, or repetitive messages. Share your wins in #show-your-dashboard.",
    '',
    '**5. No Pump & Dump / Manipulation**',
    'Do not coordinate trades, shill tickers, or push others to buy/sell. Share analysis, not pressure.',
    '',
    '**6. Protect Your Privacy**',
    'Never share account numbers, passwords, API keys, or personal financial details. Blur sensitive data in screenshots.',
    '',
    '**7. Report Issues Properly**',
    'Use #bug-reports for app bugs and #feature-requests for ideas. Include steps to reproduce when reporting bugs.',
    '',
    '**8. Follow Discord TOS**',
    'All Discord Terms of Service and Community Guidelines apply.',
    '',
    '---',
    "*Breaking these rules may result in a warning, mute, or ban at the moderators' discretion.*",
  ].join('\n'),

  faq: [
    // Message 1: Setup & broker tables
    [
      '# Frequently Asked Questions',
      '',
      '### How do I connect my brokerage?',
      'Go to **Accounts** → **Add Account** → select your broker. SnapTrade handles broker authorization; this app stores connection metadata needed for sync.',
      '',
      '### Which brokers are supported?',
      '```',
      '┌──────────────────────┬─────────────┬───────────┐',
      '│ Broker               │ File Import │ Live Sync │',
      '├──────────────────────┼─────────────┼───────────┤',
      '│ Robinhood            │ CSV         │ ✅ Yes    │',
      '│ Charles Schwab       │ JSON        │ ✅ Yes    │',
      '│ Fidelity             │ —           │ ✅ Yes    │',
      '│ Interactive Brokers  │ —           │ ✅ Yes*   │',
      '└──────────────────────┴─────────────┴───────────┘',
      '```',
      '*IBKR uses third-party reports — initial data takes 24-48 hours.*',
      '',
      '### How long does syncing take?',
      '```',
      '┌──────────────────────┬───────────────┐',
      '│ Broker               │ Typical Wait  │',
      '├──────────────────────┼───────────────┤',
      '│ Robinhood            │ 2-5 minutes   │',
      '│ Schwab               │ 5-15 minutes  │',
      '│ Fidelity             │ 5-15 minutes  │',
      '│ Interactive Brokers  │ 24-48 hours   │',
      '└──────────────────────┴───────────────┘',
      '```',
    ].join('\n'),
    // Message 2: Troubleshooting & general
    [
      '### My positions or P&L look wrong. What do I do?',
      '1. Go to **Import** and re-sync your transactions',
      '2. Check for duplicate imports in **Import History**',
      '3. If the issue persists, post in #help with a screenshot',
      '',
      '### How does P&L calculation work?',
      'We use **FIFO (First In, First Out)** matching. The oldest open lots are matched against closes first. All calculations are derived from your immutable ledger entries.',
      '',
      '### What is the Wheel Strategy feature?',
      'The Wheel Dashboard tracks your CSP → Assignment → CC cycle. The AI/ML system provides strike optimization, roll advice, and candidate ranking based on your trading history.',
      '',
      '### Is my data secure?',
      'The app scopes data to your account and should be deployed behind HTTPS. Operators must protect the database, backups, and logs. See the privacy policy for this deployment.',
      '',
      '### How do I get help?',
      'Post in the #help forum with details about your issue. Include screenshots and steps to reproduce if possible.',
    ].join('\n'),
  ],

  // ── General ──
  general: [
    '# Welcome to #general',
    '',
    'This is the main hangout for the Average Joe Trades community.',
    '',
    "Talk about the app, trading, markets, or whatever's on your mind. Keep it friendly and check out the other channels for specific topics.",
  ].join('\n'),

  introductions: [
    '# Introduce Yourself',
    '',
    'New here? Drop a message and tell us:',
    '- What broker(s) do you use?',
    "- What's your trading style? (wheel, spreads, stocks, etc.)",
    '- How did you find Average Joe Trades?',
    '',
    'Welcome aboard!',
  ].join('\n'),

  'show-your-dashboard': [
    '# Show Your Dashboard',
    '',
    'Share screenshots of your dashboard, P&L calendar, streak tracker, or any cool views from the app.',
    '',
    'Tips:',
    "- Blur or crop out any sensitive info (account numbers, balances you'd rather keep private)",
    "- Tell us what we're looking at — what timeframe, what strategy, etc.",
    '- Celebrate wins and learn from losses — both are welcome here',
  ].join('\n'),

  // ── Trading Strategies ──
  'wheel-strategy': [
    '# Wheel Strategy Discussion',
    '',
    'This channel is for discussing the **wheel strategy** — selling Cash-Secured Puts (CSPs), getting assigned, and selling Covered Calls (CCs).',
    '',
    'Topics: ticker selection, strike picking, roll decisions, assignment management, premium targets.',
    '',
    "Use the app's **Strategies → Wheel Dashboard** and **AI Insights** to back up your ideas with data.",
  ].join('\n'),

  'options-general': [
    '# Options Discussion',
    '',
    'Discuss options strategies beyond the wheel — spreads, strangles, straddles, iron condors, earnings plays, LEAPS, and more.',
    '',
    'Share your setups, ask questions, and learn from each other. All experience levels welcome.',
  ].join('\n'),

  'stocks-and-shares': [
    '# Stocks & Shares',
    '',
    "For stock-only positions, long-term holds, dividend plays, and equity analysis.",
    '',
    "Share your thesis, discuss entries/exits, and track performance using the app's positions and charts.",
  ].join('\n'),

  'ticker-talk': [
    '# Ticker Talk',
    '',
    'Discuss specific tickers — share DD, chart setups, news, earnings expectations, and trade ideas.',
    '',
    'When posting, mention the ticker (e.g. $AAPL) so others can follow along. No pump-and-dump — share analysis, not pressure.',
  ].join('\n'),

  // ── AI & ML ──
  'ai-insights': [
    '# AI & ML Insights',
    '',
    "Discuss the app's AI-powered features:",
    '- **AI Actions** — personalized trade recommendations',
    '- **Ticker Suggestions** — ML-ranked candidates with confidence scores',
    '- **Strike Optimizer** — optimal strike selection for your wheel trades',
    '- **Roll Advisor** — when to roll, close, or hold',
    '',
    'Share interesting AI outputs, compare model confidence, and discuss how you use the insights in your trading.',
  ].join('\n'),

  'community-signals': [
    '# Community Signals',
    '',
    'Discuss the **Community Insights** feature — aggregated, anonymized data from all Average Joe Trades wheel traders.',
    '',
    'Talk about trending tickers, popular strikes, community sentiment, and how you factor community data into your decisions.',
  ].join('\n'),

  // ── Broker-Specific ──
  robinhood: [
    '# Robinhood',
    '',
    'Tips, tricks, and troubleshooting for Robinhood users.',
    '',
    '- **CSV Import**: Export from Robinhood → upload in Import → File tab',
    '- **Live Sync**: Connect via SnapTrade (2-5 min typical sync time)',
    '- **Crypto**: Robinhood crypto positions are synced (BTC, ETH, SOL, etc.)',
    '',
    'Post here if you run into Robinhood-specific issues.',
  ].join('\n'),

  schwab: [
    '# Charles Schwab',
    '',
    'Tips, tricks, and troubleshooting for Schwab users.',
    '',
    '- **JSON Import**: Export from Schwab → upload in Import → File tab',
    '- **Live Sync**: Connect via SnapTrade (5-15 min typical sync time)',
    '- Migrated from TD Ameritrade? Let us know if you hit any issues with historical data.',
    '',
    'Post here for Schwab-specific questions.',
  ].join('\n'),

  'fidelity-ibkr-other': [
    '# Fidelity, IBKR & Other Brokers',
    '',
    'For Fidelity, Interactive Brokers, and any other supported brokers.',
    '',
    '**Fidelity** — Live sync via SnapTrade (5-15 min)',
    "**Interactive Brokers** — Uses third-party reports. Initial sync takes **24-48 hours** — don't panic if data isn't immediate.",
    '',
    'Using a broker not listed? Let us know in #feature-requests.',
  ].join('\n'),
};

// ---------------------------------------------------------------------------
// Forum tags per channel
// ---------------------------------------------------------------------------

export const FORUM_TAGS: Record<string, GuildForumTagData[]> = {
  roadmap: [
    { name: 'Planned', emoji: { name: '📋' } },
    { name: 'In Progress', emoji: { name: '🔨' } },
    { name: 'Shipped', emoji: { name: '✅' } },
    { name: 'Under Review', emoji: { name: '👀' } },
  ],
  help: [
    { name: 'Setup', emoji: { name: '⚙️' } },
    { name: 'Sync', emoji: { name: '🔄' } },
    { name: 'Import', emoji: { name: '📥' } },
    { name: 'Dashboard', emoji: { name: '📊' } },
    { name: 'Resolved', emoji: { name: '✅' } },
  ],
  'bug-reports': [
    { name: 'Dashboard', emoji: { name: '📊' } },
    { name: 'Positions', emoji: { name: '📈' } },
    { name: 'Import', emoji: { name: '📥' } },
    { name: 'Sync', emoji: { name: '🔄' } },
    { name: 'Options', emoji: { name: '🎯' } },
    { name: 'AI', emoji: { name: '🤖' } },
    { name: 'Accounts', emoji: { name: '⚙️' } },
    { name: 'Journal', emoji: { name: '📝' } },
    { name: 'Mobile', emoji: { name: '📱' } },
    { name: 'Confirmed', emoji: { name: '🐛' } },
    { name: 'Fixed', emoji: { name: '✅' } },
  ],
  'feature-requests': [
    { name: 'Dashboard', emoji: { name: '📊' } },
    { name: 'Positions', emoji: { name: '📈' } },
    { name: 'Import', emoji: { name: '📥' } },
    { name: 'Sync', emoji: { name: '🔄' } },
    { name: 'Options', emoji: { name: '🎯' } },
    { name: 'AI', emoji: { name: '🤖' } },
    { name: 'Accounts', emoji: { name: '⚙️' } },
    { name: 'Journal', emoji: { name: '📝' } },
    { name: 'Mobile', emoji: { name: '📱' } },
    { name: 'Under Review', emoji: { name: '👀' } },
    { name: 'Planned', emoji: { name: '📋' } },
    { name: 'Shipped', emoji: { name: '✅' } },
    { name: "Won't Do", emoji: { name: '❌' } },
  ],
};

// ---------------------------------------------------------------------------
// Slow mode (seconds) per channel
// ---------------------------------------------------------------------------

export const SLOW_MODE: Record<string, number> = {
  general: 5,
  'ticker-talk': 10,
  'show-your-dashboard': 10,
};

// ---------------------------------------------------------------------------
// Forum channels — guidelines + starter posts
// ---------------------------------------------------------------------------

export const FORUM_CONTENT: Record<
  string,
  { guidelines: string; starterPost: { title: string; body: string } }
> = {
  roadmap: {
    guidelines:
      'Vote and discuss upcoming features. One feature per post. Use reactions to upvote.',
    starterPost: {
      title: 'Welcome to the Roadmap',
      body: [
        'This forum tracks upcoming features and improvements for Average Joe Trades.',
        '',
        '**How to use this channel:**',
        "- Browse existing posts to see what's planned",
        '- React with 👍 to upvote features you want',
        '- Comment on posts to share your use case or suggestions',
        '- Create a new post for features not yet listed',
        '',
        'We review this regularly and prioritize based on community interest.',
      ].join('\n'),
    },
  },
  help: {
    guidelines:
      'Need help? Create a post with a clear title describing your issue. Include screenshots and steps to reproduce.',
    starterPost: {
      title: 'How to Get Help',
      body: [
        'Welcome to the help forum! To get the fastest support:',
        '',
        '**1. Search first** — your question may already be answered',
        '**2. Create a post** with a clear, specific title',
        '   Good: "Schwab sync shows 0 transactions after connecting"',
        '   Bad: "Help pls"',
        '**3. Include details:**',
        '- What broker are you using?',
        '- What page/feature is the issue on?',
        '- Screenshots (blur sensitive data)',
        '- Steps to reproduce the problem',
        '',
        '**4. Mark as resolved** — once your issue is fixed, add ✅ to the title so others know',
        '',
        'Common first steps:',
        '- Re-sync your transactions (Import → Sync)',
        '- Clear browser cache and reload',
        '- Check #faq for known issues',
      ].join('\n'),
    },
  },
  'bug-reports': {
    guidelines:
      'Found a bug? Create a post with steps to reproduce, expected vs actual behavior, and screenshots.',
    starterPost: {
      title: 'How to Report a Bug',
      body: [
        'Found something broken? Help us fix it fast by including:',
        '',
        '**Bug Report Template:**',
        '```',
        'Summary: [one-line description]',
        'Broker: [Robinhood / Schwab / Fidelity / IBKR / N/A]',
        'Page: [Dashboard / Import / Positions / etc.]',
        'Steps to reproduce:',
        '  1. ...',
        '  2. ...',
        '  3. ...',
        'Expected: [what should happen]',
        'Actual: [what actually happens]',
        'Screenshots: [attach images]',
        'Browser: [Chrome / Firefox / Safari / Edge]',
        '```',
        '',
        'The more detail you provide, the faster we can investigate.',
      ].join('\n'),
    },
  },
  'feature-requests': {
    guidelines:
      "Have an idea? Create a post describing the feature, why it's useful, and how you'd use it. Vote on others with 👍.",
    starterPost: {
      title: 'How to Request a Feature',
      body: [
        "Got an idea to make Average Joe Trades better? We'd love to hear it.",
        '',
        '**Before posting:**',
        '- Check if someone already requested it — upvote with 👍 instead of duplicating',
        "- Check #roadmap to see if it's already planned",
        '',
        '**Feature Request Template:**',
        '```',
        'Feature: [short title]',
        'Problem: [what pain point does this solve?]',
        'Proposed solution: [how would it work?]',
        'Alternatives considered: [other approaches, if any]',
        '```',
        '',
        'We review requests regularly and prioritize based on votes and impact.',
      ].join('\n'),
    },
  },
};

// ---------------------------------------------------------------------------
// Channel structure
// ---------------------------------------------------------------------------

export type ChannelKind = 'text' | 'announcement' | 'forum' | 'voice' | 'stage';

export interface ChannelDef {
  name: string;
  kind: ChannelKind;
  topic?: string;
  readOnly?: boolean;
}

export interface CategoryDef {
  name: string;
  channels: ChannelDef[];
}

export const CATEGORIES: CategoryDef[] = [
  {
    name: '📌 Information',
    channels: [
      {
        name: 'announcements',
        kind: 'text',
        topic: 'Release notes, new features, and downtime notices',
        readOnly: true,
      },
      {
        name: 'roadmap',
        kind: 'forum',
        topic: 'Public roadmap — vote and discuss upcoming features',
      },
      {
        name: 'faq',
        kind: 'text',
        topic: 'Common setup questions, known issues, broker sync times',
        readOnly: true,
      },
      {
        name: 'rules',
        kind: 'text',
        topic: 'Server rules and no-financial-advice disclaimer',
        readOnly: true,
      },
    ],
  },
  {
    name: '💬 General',
    channels: [
      { name: 'general', kind: 'text', topic: 'Main chat' },
      {
        name: 'introductions',
        kind: 'text',
        topic: 'Introduce yourself to the community',
      },
      {
        name: 'show-your-dashboard',
        kind: 'text',
        topic:
          'Share screenshots of your dashboards, P&L calendars, and streaks',
      },
    ],
  },
  {
    name: '🛠️ App Support',
    channels: [
      {
        name: 'help',
        kind: 'forum',
        topic: 'Support threads — setup, import issues, sync problems',
      },
      {
        name: 'bug-reports',
        kind: 'forum',
        topic: 'Report bugs with structured tags',
      },
      {
        name: 'feature-requests',
        kind: 'forum',
        topic: 'Request and upvote new features',
      },
    ],
  },
  {
    name: '📈 Trading Strategies',
    channels: [
      {
        name: 'wheel-strategy',
        kind: 'text',
        topic: 'CSP/CC wheel strategy discussion',
      },
      {
        name: 'options-general',
        kind: 'text',
        topic: 'Non-wheel options plays, spreads, earnings trades',
      },
      {
        name: 'stocks-and-shares',
        kind: 'text',
        topic: 'Stock-only positions, long-term holds',
      },
      {
        name: 'ticker-talk',
        kind: 'text',
        topic: 'Specific ticker discussion and DD sharing',
      },
    ],
  },
  {
    name: '🤖 AI & ML Insights',
    channels: [
      {
        name: 'ai-insights',
        kind: 'text',
        topic: 'Discuss AI actions, ticker suggestions, and model outputs',
      },
      {
        name: 'community-signals',
        kind: 'text',
        topic: 'Discuss the in-app Community Insights data',
      },
    ],
  },
  {
    name: '🏦 Broker-Specific',
    channels: [
      {
        name: 'robinhood',
        kind: 'text',
        topic: 'Robinhood sync and CSV import tips',
      },
      {
        name: 'schwab',
        kind: 'text',
        topic: 'Schwab JSON import and sync quirks',
      },
      {
        name: 'fidelity-ibkr-other',
        kind: 'text',
        topic: 'Fidelity, IBKR (24-48hr sync), and other brokers',
      },
    ],
  },
  {
    name: '🔊 Voice',
    channels: [
      { name: 'General Voice', kind: 'voice' },
      { name: 'Market Hours', kind: 'voice' },
    ],
  },
];
