import { ChannelType, type Message } from 'discord.js';
import { bridgeEnabled } from '../config';
import { FORUM_CHANNELS, STATUS_KEYWORDS } from '../constants/bridge';
import { findIssueForThread, getIssueStatus } from '../services/github';
import { buildStatusMessage } from '../services/issue-builder';
import { STATUS_COOLDOWN_MS, statusCooldowns } from '../state';

/** MessageCreate — status replies in forum threads */
export async function handleMessageCreate(message: Message): Promise<void> {
  // Guard 1: Ignore bot messages
  if (message.author.bot) return;

  // Guard 2: Only messages inside threads
  if (!message.channel.isThread()) return;

  // Guard 3: Only threads in our target forum channels
  const parent = message.channel.parent;
  if (!parent || parent.type !== ChannelType.GuildForum) return;
  if (!FORUM_CHANNELS.has(parent.name)) return;

  // Guard 4: Bridge must be enabled (we need GitHub API)
  if (!bridgeEnabled) return;

  // Guard 5: Check if the message content matches status keywords
  const content = message.content.toLowerCase();
  const isStatusRequest = STATUS_KEYWORDS.some((kw) => content.includes(kw));
  if (!isStatusRequest) return;

  // Guard 6: Per-thread cooldown to avoid spam
  const threadId = message.channel.id;
  const lastReply = statusCooldowns.get(threadId) ?? 0;
  if (Date.now() - lastReply < STATUS_COOLDOWN_MS) return;

  try {
    const guildId = message.guild?.id;
    if (!guildId) return;

    const issueNumber = await findIssueForThread(threadId, guildId);
    if (!issueNumber) {
      // No linked issue found — this thread may predate the bot
      return;
    }

    const status = await getIssueStatus(issueNumber);
    if (!status) return;

    const statusMsg = buildStatusMessage(status);
    await message.channel.send(statusMsg);
    statusCooldowns.set(threadId, Date.now());

    console.log(
      `[status] Replied in thread ${threadId} (issue #${issueNumber}): ${status.state}, PR=${status.hasLinkedPR}`,
    );
  } catch (err) {
    console.warn(`[status] Failed to reply in thread ${threadId}:`, err);
  }
}
