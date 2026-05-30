import type { AnyThreadChannel, ForumChannel } from 'discord.js';
import { TAG_TO_LABEL } from '../constants/bridge';
import type { DiscordAttachment, IssueStatus, StructuredIssue } from '../types';

// ---------------------------------------------------------------------------
// Discord → GitHub bridge helpers
// ---------------------------------------------------------------------------

/** Resolve GitHub labels from a Discord forum thread */
export function resolveLabels(
  thread: AnyThreadChannel,
  isBug: boolean,
  complexity: 'simple' | 'complex',
): string[] {
  const labels: string[] = [
    'discord',
    complexity === 'simple' ? 'ai-driven' : 'ai-complex',
  ];
  labels.push(isBug ? 'bug' : 'enhancement');

  const parent = thread.parent as ForumChannel | null;
  if (parent?.availableTags) {
    const tagIdToName = new Map(
      parent.availableTags.map((t) => [t.id, t.name]),
    );
    for (const tagId of thread.appliedTags) {
      const tagName = tagIdToName.get(tagId);
      if (tagName && TAG_TO_LABEL[tagName]) {
        labels.push(TAG_TO_LABEL[tagName]);
      }
    }
  }

  return labels;
}

/** Build the GitHub issue body from a Discord thread */
export function buildIssueBody(
  content: string,
  thread: AnyThreadChannel,
  isBug: boolean,
  structured?: StructuredIssue | null,
  attachments?: DiscordAttachment[],
): string {
  const channelLabel = isBug ? '#bug-reports' : '#feature-requests';
  const threadUrl = `https://discord.com/channels/${thread.guildId}/${thread.id}`;

  // Resolve tag names for metadata
  const tagNames: string[] = [];
  const parent = thread.parent as ForumChannel | null;
  if (parent?.availableTags) {
    const tagIdToName = new Map(
      parent.availableTags.map((t) => [t.id, t.name]),
    );
    for (const tagId of thread.appliedTags) {
      const name = tagIdToName.get(tagId);
      if (name) tagNames.push(name);
    }
  }

  const parts = [`<!-- Filed from Discord ${channelLabel} -->`];

  if (structured) {
    // Template-formatted body using extracted fields
    parts.push('', `### Area`, '', structured.area);
    parts.push(
      '',
      `### ${isBug ? 'What happened?' : 'What would you like?'}`,
      '',
      structured.description,
    );

    if (isBug && structured.steps_to_reproduce) {
      parts.push(
        '',
        '### Steps to reproduce',
        '',
        structured.steps_to_reproduce,
      );
    }

    if (isBug && structured.broker) {
      parts.push('', '### Broker', '', structured.broker);
    }

    if (isBug && structured.device) {
      parts.push('', '### Device', '', structured.device);
    }

    if (!isBug && structured.motivation) {
      parts.push('', '### Why is this useful?', '', structured.motivation);
    }

    if (!isBug && structured.scope) {
      parts.push('', '### Scope estimate', '', structured.scope);
    }

    // Include original post as context
    if (content) {
      parts.push(
        '',
        '### Additional context',
        '',
        `<details><summary>Original Discord post</summary>`,
        '',
        content,
        '',
        `</details>`,
      );
    }
  } else {
    // Fallback: raw body
    parts.push('', content || '_No description provided._');
  }

  // Append screenshots / attachments
  const images = attachments?.filter((a) =>
    a.contentType?.startsWith('image/'),
  );
  if (images && images.length > 0) {
    parts.push('', '### Screenshots', '');
    for (const img of images) {
      parts.push(`![${img.name}](${img.url})`);
    }
  }

  // Non-image attachments as links
  const files = attachments?.filter(
    (a) => !a.contentType?.startsWith('image/'),
  );
  if (files && files.length > 0) {
    parts.push('', '### Attachments', '');
    for (const file of files) {
      parts.push(`- [${file.name}](${file.url})`);
    }
  }

  parts.push('', '---', '', `**Source:** [Discord thread](${threadUrl})`);

  if (tagNames.length > 0) {
    parts.push(`**Discord tags:** ${tagNames.join(', ')}`);
  }

  return parts.join('\n');
}

/** Build a human-friendly status message based on issue/PR state */
export function buildStatusMessage(status: IssueStatus): string {
  if (status.prMerged) {
    return "This has been fixed and deployed! If you're still seeing the issue, give it a few minutes for the update to go live.";
  }

  if (status.hasLinkedPR && !status.prDraft) {
    return 'The fix is done and waiting for review. Should be merged and deployed soon!';
  }

  if (status.hasLinkedPR && status.prDraft) {
    return "This is actively being worked on right now. We'll update this thread when it's ready.";
  }

  if (status.state === 'closed') {
    return "This has been resolved and closed. If you're still experiencing the issue, feel free to open a new post.";
  }

  // Open issue, no PR yet
  return "This is on our list and will be picked up soon. We'll update this thread when work starts.";
}
