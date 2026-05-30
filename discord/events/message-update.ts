import {
  ChannelType,
  type Message,
  type ForumChannel,
  type PartialMessage,
} from 'discord.js';
import { bridgeEnabled, filterEnabled } from '../config';
import { AREA_TO_TAG, FORUM_CHANNELS } from '../constants/bridge';
import { classifyThread, generateReply, structureIssue } from '../services/ai';
import { ensureForumTags } from '../services/forum-tags';
import { createGitHubIssue } from '../services/github';
import { buildIssueBody, resolveLabels } from '../services/issue-builder';
import {
  filteredThreads,
  MAX_RECLASSIFY_ATTEMPTS,
  RECLASSIFY_COOLDOWN_MS,
  threadToIssue,
} from '../state';
import type { DiscordAttachment } from '../types';

/** MessageUpdate — re-classify filtered posts when edited */
export async function handleMessageUpdate(
  _oldMessage: Message | PartialMessage,
  newMessage: Message | PartialMessage,
): Promise<void> {
  // Guard 1: Bridge + filter must be enabled
  if (!bridgeEnabled || !filterEnabled) return;

  // Guard 2: Must be inside a thread channel
  const channel = newMessage.channel;
  if (!channel.isThread()) return;

  // Guard 3: Thread must be in a target forum channel
  const forumParent = channel.parent;
  if (!forumParent || forumParent.type !== ChannelType.GuildForum) return;
  if (!FORUM_CHANNELS.has(forumParent.name)) return;

  // Guard 4: Must be a previously filtered thread
  const entry = filteredThreads.get(channel.id);
  if (!entry) return;

  // Guard 5: Only react to edits of the starter message (ID equals thread ID in forums)
  if (newMessage.id !== channel.id) return;

  // Guard 6: Ignore bot's own edits
  if (newMessage.author?.id === newMessage.client.user?.id) return;

  // Guard 7: Max retry limit reached
  if (entry.attempts >= MAX_RECLASSIFY_ATTEMPTS) {
    console.log(
      `[filter-retry] Thread "${channel.name}" hit max attempts (${MAX_RECLASSIFY_ATTEMPTS}) — ignoring edit`,
    );
    return;
  }

  // Guard 8: Per-thread cooldown
  const now = Date.now();
  if (now - entry.lastAttemptAt < RECLASSIFY_COOLDOWN_MS) return;

  // Update tracking before async work
  entry.attempts += 1;
  entry.lastAttemptAt = now;

  const isBug = forumParent.name === 'bug-reports';

  try {
    // Fetch full message content (MessageUpdate may deliver partials)
    const fullMessage = newMessage.partial
      ? await newMessage.fetch()
      : newMessage;

    const attachments: DiscordAttachment[] = fullMessage.attachments.map(
      (a) => ({
        name: a.name,
        url: a.url,
        contentType: a.contentType,
      }),
    );
    const imageUrls = attachments
      .filter((a) => a.contentType?.startsWith('image/'))
      .map((a) => a.url);

    // Re-classify
    const classification = await classifyThread(
      channel.name,
      fullMessage.content,
      entry.channelType,
      imageUrls,
    );

    if (!classification.legitimate) {
      if (entry.attempts < MAX_RECLASSIFY_ATTEMPTS) {
        await channel.send(
          `We took another look, but this still doesn't seem like a ${isBug ? 'bug report' : 'feature request'}. ${classification.reason}\n\nYou can try editing once more — make sure to describe a specific issue with the app.`,
        );
      } else {
        await channel.send(
          `We've reviewed this a few times now and it still doesn't look like a ${isBug ? 'bug report' : 'feature request'}. If you believe this is a mistake, reach out to a moderator for help.`,
        );
      }
      console.log(
        `[filter-retry] "${channel.name}" still spam (attempt ${entry.attempts}/${MAX_RECLASSIFY_ATTEMPTS}): ${classification.reason}`,
      );
      return;
    }

    // Legitimate! Clean up filtered tracking
    filteredThreads.delete(channel.id);
    console.log(
      `[filter-retry] "${channel.name}" reclassified as legitimate on attempt ${entry.attempts}`,
    );

    // Run the full pipeline (same as ThreadCreate success path)
    const structured = await structureIssue(
      channel.name,
      fullMessage.content,
      isBug,
      imageUrls,
    );

    await ensureForumTags(forumParent as ForumChannel);

    try {
      const freshParent = (await channel.guild.channels.fetch(
        channel.parentId!,
      )) as ForumChannel;
      const newTags = [...channel.appliedTags];

      if (structured?.area) {
        const tagName = AREA_TO_TAG[structured.area];
        if (tagName) {
          const tag = freshParent.availableTags.find(
            (t) => t.name === tagName,
          );
          if (tag && !newTags.includes(tag.id)) newTags.push(tag.id);
        }
      }

      if (!isBug) {
        const reviewTag = freshParent.availableTags.find(
          (t) => t.name === 'Under Review',
        );
        if (reviewTag && !newTags.includes(reviewTag.id))
          newTags.push(reviewTag.id);
      }

      if (newTags.length !== channel.appliedTags.length) {
        await channel.setAppliedTags(newTags);
      }
    } catch (err) {
      console.warn(
        `[filter-retry] Failed to apply tags to "${channel.name}":`,
        err,
      );
    }

    const labels = resolveLabels(channel, isBug, classification.complexity);
    const body = buildIssueBody(
      fullMessage.content,
      channel,
      isBug,
      structured,
      attachments,
    );
    const issue = await createGitHubIssue(channel.name, body, labels);

    threadToIssue.set(channel.id, issue.number);

    const typeLabel = isBug ? 'Bug report' : 'Feature request';
    const reply = await generateReply(
      channel.name,
      fullMessage.content,
      isBug,
      imageUrls,
    );
    await channel.send(
      reply ??
        `${typeLabel} received! We're on it — you'll get an update here once the fix is ready. 🚀`,
    );

    console.log(
      `[filter-retry] ${forumParent.name} "${channel.name}" → GitHub #${issue.number} (reclassified)`,
    );
  } catch (err) {
    console.error(
      `[filter-retry] Failed for thread "${channel.name}":`,
      err,
    );
    try {
      await channel.send(
        'Something went wrong while re-reviewing your post — but we saw the edit. Someone from the team will follow up.',
      );
    } catch {
      /* swallow send failure */
    }
  }
}
