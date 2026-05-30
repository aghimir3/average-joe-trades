import { PRIVACY_URL } from '../config';

// ---------------------------------------------------------------------------
// FAQ sections data
// ---------------------------------------------------------------------------

export const FAQ_SECTIONS: Record<string, { title: string; content: string }> =
  {
    setup: {
      title: 'How do I connect my brokerage?',
      content:
        'Go to **Accounts** → **Add Account** → select your broker. SnapTrade handles broker authorization; this app stores connection metadata needed for sync.',
    },
    brokers: {
      title: 'Which brokers are supported?',
      content: [
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
      ].join('\n'),
    },
    sync: {
      title: 'How long does syncing take?',
      content: [
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
    },
    pnl: {
      title: 'How does P&L calculation work?',
      content:
        'We use **FIFO (First In, First Out)** matching. The oldest open lots are matched against closes first. All calculations are derived from your immutable ledger entries.',
    },
    wheel: {
      title: 'What is the Wheel Strategy feature?',
      content:
        'The Wheel Dashboard tracks your CSP → Assignment → CC cycle. The AI/ML system provides strike optimization, roll advice, and candidate ranking based on your trading history.',
    },
    security: {
      title: 'Is my data secure?',
      content:
        `The app scopes data to your account and should be deployed behind HTTPS. Operators must protect the database, backups, and logs. See ${PRIVACY_URL}.`,
    },
  };
