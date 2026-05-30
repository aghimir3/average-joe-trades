import type { ForumChannel } from 'discord.js';
import { forumTagsEnsured } from '../state';

// ---------------------------------------------------------------------------
// Required forum tags (mirrors setup.ts definitions)
// ---------------------------------------------------------------------------

export const REQUIRED_FORUM_TAGS: Record<
  string,
  { name: string; emoji: string }[]
> = {
  'bug-reports': [
    { name: 'Dashboard', emoji: '📊' },
    { name: 'Positions', emoji: '📈' },
    { name: 'Import', emoji: '📥' },
    { name: 'Sync', emoji: '🔄' },
    { name: 'Options', emoji: '🎯' },
    { name: 'AI', emoji: '🤖' },
    { name: 'Accounts', emoji: '⚙️' },
    { name: 'Journal', emoji: '📝' },
    { name: 'Mobile', emoji: '📱' },
    { name: 'Confirmed', emoji: '🐛' },
    { name: 'Fixed', emoji: '✅' },
  ],
  'feature-requests': [
    { name: 'Dashboard', emoji: '📊' },
    { name: 'Positions', emoji: '📈' },
    { name: 'Import', emoji: '📥' },
    { name: 'Sync', emoji: '🔄' },
    { name: 'Options', emoji: '🎯' },
    { name: 'AI', emoji: '🤖' },
    { name: 'Accounts', emoji: '⚙️' },
    { name: 'Journal', emoji: '📝' },
    { name: 'Mobile', emoji: '📱' },
    { name: 'Under Review', emoji: '👀' },
    { name: 'Planned', emoji: '📋' },
    { name: 'Shipped', emoji: '✅' },
    { name: "Won't Do", emoji: '❌' },
  ],
};

/**
 * Ensure required tags exist on a forum channel, creating any missing ones.
 * Merges with existing tags (never removes). Skips if already checked this session.
 * Discord allows max 20 tags per forum — respects that limit.
 */
export async function ensureForumTags(forum: ForumChannel): Promise<void> {
  if (forumTagsEnsured.has(forum.id)) return;
  forumTagsEnsured.add(forum.id);

  const required = REQUIRED_FORUM_TAGS[forum.name];
  if (!required) return;

  const existingNames = new Set(forum.availableTags.map((t) => t.name));
  const toAdd = required
    .filter((t) => !existingNames.has(t.name))
    .map((t) => ({ name: t.name, emoji: { id: null, name: t.emoji } }));

  if (toAdd.length === 0) return;

  // Discord limit: 20 tags per forum channel
  const available = 20 - forum.availableTags.length;
  if (available <= 0) {
    console.warn(
      `[tags] ${forum.name} already has 20 tags — cannot add more`,
    );
    return;
  }

  const adding = toAdd.slice(0, available);

  try {
    await forum.setAvailableTags([...forum.availableTags, ...adding]);
    console.log(
      `[tags] Created ${adding.length} tag(s) on #${forum.name}: ${adding.map((t) => t.name).join(', ')}`,
    );
  } catch (err) {
    console.warn(`[tags] Failed to create tags on #${forum.name}:`, err);
    // Don't cache failure — retry next thread
    forumTagsEnsured.delete(forum.id);
  }
}
