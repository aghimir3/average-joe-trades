// ---------------------------------------------------------------------------
// Environment & Constants
// ---------------------------------------------------------------------------

function readEnv(name: string): string | undefined {
  return process.env[name];
}

export const BOT_TOKEN = readEnv('DISCORD_BOT_TOKEN');

if (!BOT_TOKEN) {
  console.error('Missing DISCORD_BOT_TOKEN env var.');
  process.exit(1);
}

export const GITHUB_AUTH_TOKEN = readEnv('GITHUB_TOKEN') ?? '';
export const GITHUB_REPO = cleanOptionalText(readEnv('GITHUB_REPO'));
export const GITHUB_API = 'https://api.github.com';

const AI_PROVIDER = cleanOptionalText(readEnv('AI_PROVIDER')).toLowerCase();
const anthropicFallbackApiKey = cleanOptionalText(readEnv('AI_API_KEY'));
export const ANTHROPIC_API_KEY =
  cleanOptionalText(readEnv('ANTHROPIC_API_KEY')) ||
  (AI_PROVIDER === '' || AI_PROVIDER === 'anthropic' ? anthropicFallbackApiKey : '');

export const bridgeEnabled = Boolean(GITHUB_AUTH_TOKEN && GITHUB_REPO);
export const filterEnabled = Boolean(ANTHROPIC_API_KEY);

export const NEW_MEMBER_ROLE_NAME = 'New Member';

export const APP_NAME = cleanOptionalText(readEnv('NEXT_PUBLIC_APP_NAME')) || 'Average Joe Trades';
export const SITE_URL =
  normalizeUrl(readEnv('NEXT_PUBLIC_SITE_URL')) ||
  normalizeUrl(readEnv('NEXTAUTH_URL')) ||
  'http://localhost:3000';
export const APP_URL = normalizeUrl(readEnv('NEXT_PUBLIC_APP_URL')) || SITE_URL;
export const DEMO_URL = normalizeUrl(readEnv('NEXT_PUBLIC_DEMO_URL')) || 'http://demo.localhost:3000';
export const PRIVACY_URL = `${SITE_URL}/privacy`;

export const EMBED_COLOR = 0x10b981; // emerald-500

function cleanOptionalText(value: string | undefined): string {
  const trimmed = value?.trim() ?? '';
  return trimmed.startsWith('<') && trimmed.endsWith('>') ? '' : trimmed;
}

function normalizeUrl(value: string | undefined): string {
  const cleaned = cleanOptionalText(value);
  return cleaned.replace(/\/+$/, '');
}
