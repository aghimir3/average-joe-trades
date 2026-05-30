// ---------------------------------------------------------------------------
// GitHub Issue Bridge — Constants
// ---------------------------------------------------------------------------

/** Discord forum channels that trigger issue creation */
export const FORUM_CHANNELS = new Set(['bug-reports', 'feature-requests']);

/** Map Discord forum tag names → GitHub label names */
export const TAG_TO_LABEL: Record<string, string> = {
  'Dashboard': 'area:ui',
  'Positions': 'area:data',
  'Sync': 'area:sync',
  'Import': 'area:import',
  'Options': 'area:ui',
  'AI': 'area:ui',
  'Accounts': 'area:ui',
  'Journal': 'area:ui',
  'Mobile': 'area:ui',
};

/** Map Haiku-extracted area → Discord forum tag name */
export const AREA_TO_TAG: Record<string, string> = {
  'Dashboard / Charts': 'Dashboard',
  'Positions / Trades': 'Positions',
  'Import / CSV / JSON': 'Import',
  'Brokerage Sync (SnapTrade)': 'Sync',
  'Options / Wheel Strategy': 'Options',
  'AI Insights / Ask Joey': 'AI',
  'Accounts / Settings': 'Accounts',
  'Journal': 'Journal',
  'Mobile Layout': 'Mobile',
};

/** Labels to ensure exist in the GitHub repo on startup */
export const REQUIRED_LABELS: {
  name: string;
  color: string;
  description: string;
}[] = [
  {
    name: 'discord',
    color: '5865F2',
    description: 'Created from Discord forum',
  },
  { name: 'bug', color: 'd73a4a', description: 'Bug report' },
  { name: 'enhancement', color: 'a2eeef', description: 'Feature request' },
  {
    name: 'ai-driven',
    color: '2ea44f',
    description: 'AI agent — Sonnet (standard)',
  },
  {
    name: 'ai-complex',
    color: 'd93f0b',
    description: 'AI agent — Opus (high complexity)',
  },
  { name: 'area:ui', color: 'e99695', description: 'UI-related issue' },
  {
    name: 'area:sync',
    color: 'c5def5',
    description: 'Brokerage sync issue',
  },
  {
    name: 'area:import',
    color: 'bfd4f2',
    description: 'Import/CSV/JSON issue',
  },
  {
    name: 'area:data',
    color: 'd4c5f9',
    description: 'Data integrity issue',
  },
];

/** Keywords that indicate a user is asking for a status update */
export const STATUS_KEYWORDS = [
  'status',
  'update',
  'progress',
  'eta',
  'when',
  'any update',
  'any news',
  'how long',
  'how is it going',
  'is this fixed',
  'is this done',
  'is this being worked on',
  'still working',
  'being worked on',
  "what's happening",
  'whats happening',
  'any progress',
];
