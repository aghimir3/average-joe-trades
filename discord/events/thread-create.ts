import {
  ChannelType,
  type AnyThreadChannel,
  type Client,
  type ForumChannel,
} from 'discord.js';
import { bridgeEnabled } from '../config';
import { AREA_TO_TAG, FORUM_CHANNELS } from '../constants/bridge';
import { classifyThread, generateReply, structureIssue } from '../services/ai';
import { ensureForumTags } from '../services/forum-tags';
import { createGitHubIssue } from '../services/github';
import { buildIssueBody, resolveLabels } from '../services/issue-builder';
import { filteredThreads, markProcessed, threadToIssue } from '../state';
import type { DiscordAttachment } from '../types';

/** ThreadCreate — forum → GitHub issue pipeline */
export async function handleThreadCreate(
  thread: AnyThreadChannel,
  newlyCreated: boolean,
  client: Client,
): Promise<void> {
  // Guard 1: Only newly created threads
  if (!newlyCreated) return;

  // Guard 2: Bridge feature enabled
  if (!bridgeEnabled) return;

  // Guard 3: Only forum channels
  if (thread.parent?.type !== ChannelType.GuildForum) return;

  // Guard 4: Only target channels
  const parentName = thread.parent.name;
  if (!FORUM_CHANNELS.has(parentName)) return;

  // Guard 5: Not bot's own threads (e.g. setup script starter posts)
  if (thread.ownerId === client.user?.id) return;

  // Guard 6: Dedup — threadCreate can fire multiple times for forum threads
  if (!markProcessed(thread.id)) return;

  const isBug = parentName === 'bug-reports';

  try {
    // Fetch the starter message (the thread's first post)
    const starterMessage = await thread.fetchStarterMessage();
    if (!starterMessage) {
      console.warn(
        `[bridge] No starter message for thread "${thread.name}" — skipping`,
      );
      return;
    }

    // Collect attachments (screenshots, files) from the starter message
    const attachments: DiscordAttachment[] = starterMessage.attachments.map(
      (a) => ({
        name: a.name,
        url: a.url,
        contentType: a.contentType,
      }),
    );
    const imageUrls = attachments
      .filter((a) => a.contentType?.startsWith('image/'))
      .map((a) => a.url);

    // AI spam filter — reject non-legitimate posts before creating an issue
    const classification = await classifyThread(
      thread.name,
      starterMessage.content,
      parentName as 'bug-reports' | 'feature-requests',
      imageUrls,
    );
    if (!classification.legitimate) {
      filteredThreads.set(thread.id, {
        attempts: 1,
        lastAttemptAt: Date.now(),
        channelType: parentName as 'bug-reports' | 'feature-requests',
      });
      await thread.send(
        `Hey! This doesn't look like a ${isBug ? 'bug report' : 'feature request'} for the app. ${classification.reason}\n\nIf you think this was a mistake, just edit your post and we'll take another look.`,
      );
      console.log(
        `[bridge] Filtered "${thread.name}": ${classification.reason}`,
      );
      return;
    }

    // Extract structured fields for template-formatted issue body
    const structured = await structureIssue(
      thread.name,
      starterMessage.content,
      isBug,
      imageUrls,
    );

    // Ensure required tags exist on this forum (creates missing ones on external servers)
    await ensureForumTags(thread.parent as ForumChannel);

    // Auto-apply forum tags based on AI-extracted area
    try {
      // Re-fetch parent to get updated availableTags after ensureForumTags
      const parent = (await thread.guild.channels.fetch(
        thread.parentId!,
      )) as ForumChannel;
      const newTags = [...thread.appliedTags];

      // Area tag from structured extraction
      if (structured?.area) {
        const tagName = AREA_TO_TAG[structured.area];
        if (tagName) {
          const tag = parent.availableTags.find((t) => t.name === tagName);
          if (tag && !newTags.includes(tag.id)) newTags.push(tag.id);
        }
      }

      // Auto-apply "Under Review" for new feature requests
      if (!isBug) {
        const reviewTag = parent.availableTags.find(
          (t) => t.name === 'Under Review',
        );
        if (reviewTag && !newTags.includes(reviewTag.id))
          newTags.push(reviewTag.id);
      }

      if (newTags.length !== thread.appliedTags.length) {
        await thread.setAppliedTags(newTags);
        console.log(
          `[bridge] Applied tags: ${newTags.length} tag(s) to "${thread.name}"`,
        );
      }
    } catch (err) {
      console.warn(
        `[bridge] Failed to apply tags to "${thread.name}":`,
        err,
      );
    }

    const labels = resolveLabels(thread, isBug, classification.complexity);
    const body = buildIssueBody(
      starterMessage.content,
      thread,
      isBug,
      structured,
      attachments,
    );
    const issue = await createGitHubIssue(thread.name, body, labels);

    // Cache thread → issue mapping for status replies
    threadToIssue.set(thread.id, issue.number);

    // Generate a personalized reply, fall back to canned message
    const typeLabel = isBug ? 'Bug report' : 'Feature request';
    const reply = await generateReply(
      thread.name,
      starterMessage.content,
      isBug,
      imageUrls,
    );
    await thread.send(
      reply ??
        `${typeLabel} received! We're on it — you'll get an update here once the fix is ready. 🚀`,
    );

    console.log(
      `[bridge] ${parentName} "${thread.name}" → GitHub #${issue.number}`,
    );
  } catch (err) {
    console.error(`[bridge] Failed for thread "${thread.name}":`, err);
    try {
      await thread.send(
        'Something went wrong on our end — but we saw your post. Someone from the team will follow up.',
      );
    } catch {
      /* swallow send failure */
    }
  }
}
