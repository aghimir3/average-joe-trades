function cleanOptionalText(value: string | undefined): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed || /^<.*>$/.test(trimmed)) return '';
  return trimmed;
}

function normalizeUrl(value: string | undefined): string {
  const cleaned = cleanOptionalText(value);
  return cleaned.replace(/\/+$/, '');
}

function parseHostnames(value: string | undefined): string[] {
  const hostnames = cleanOptionalText(value)
    .split(',')
    .map((hostname) => hostname.trim().toLowerCase())
    .filter(Boolean);

  return hostnames.length > 0 ? hostnames : ['demo.localhost'];
}

export const APP_NAME = cleanOptionalText(process.env.NEXT_PUBLIC_APP_NAME) || 'Average Joe Trades';
export const SITE_URL =
  normalizeUrl(process.env.NEXT_PUBLIC_SITE_URL) ||
  normalizeUrl(process.env.NEXTAUTH_URL) ||
  'http://localhost:3000';
export const APP_URL = normalizeUrl(process.env.NEXT_PUBLIC_APP_URL) || SITE_URL;
export const DEMO_URL = normalizeUrl(process.env.NEXT_PUBLIC_DEMO_URL) || 'http://demo.localhost:3000';
export const DEMO_HOSTNAMES = parseHostnames(process.env.NEXT_PUBLIC_DEMO_HOSTNAMES);
export const REPOSITORY_URL = normalizeUrl(process.env.NEXT_PUBLIC_REPOSITORY_URL);
export const SUPPORT_URL = normalizeUrl(process.env.NEXT_PUBLIC_SUPPORT_URL);
export const SUPPORT_EMAIL = cleanOptionalText(process.env.NEXT_PUBLIC_SUPPORT_EMAIL);
export const LEGAL_ENTITY_NAME = cleanOptionalText(process.env.NEXT_PUBLIC_LEGAL_ENTITY_NAME);
export const COPYRIGHT_NAME =
  cleanOptionalText(process.env.NEXT_PUBLIC_COPYRIGHT_NAME) || 'Average Joe Trades contributors';