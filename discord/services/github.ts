import { GITHUB_API, GITHUB_AUTH_TOKEN, GITHUB_REPO } from '../config';
import { REQUIRED_LABELS } from '../constants/bridge';
import { threadToIssue } from '../state';
import type { IssueStatus } from '../types';

// ---------------------------------------------------------------------------
// GitHub API helpers
// ---------------------------------------------------------------------------

function ghHeaders(): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${GITHUB_AUTH_TOKEN}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

/** Ensure all required labels exist in the GitHub repo (create missing ones) */
export async function ensureGitHubLabels(): Promise<void> {
  try {
    const res = await fetch(
      `${GITHUB_API}/repos/${GITHUB_REPO}/labels?per_page=100`,
      { headers: ghHeaders() },
    );
    if (!res.ok) {
      console.warn(`[bridge] Failed to fetch labels: ${res.status}`);
      return;
    }
    const existing = (await res.json()) as { name: string }[];
    const existingNames = new Set(
      existing.map((l) => l.name.toLowerCase()),
    );

    for (const label of REQUIRED_LABELS) {
      if (existingNames.has(label.name.toLowerCase())) {
        continue;
      }
      const createRes = await fetch(
        `${GITHUB_API}/repos/${GITHUB_REPO}/labels`,
        {
          method: 'POST',
          headers: ghHeaders(),
          body: JSON.stringify(label),
        },
      );
      if (createRes.ok) {
        console.log(`[bridge] Created label "${label.name}"`);
      } else {
        console.warn(
          `[bridge] Failed to create label "${label.name}": ${createRes.status}`,
        );
      }
    }
    console.log('[bridge] Label sync complete');
  } catch (err) {
    console.warn('[bridge] Label sync failed:', err);
  }
}

interface GitHubIssue {
  number: number;
  html_url: string;
}

/**
 * Create a GitHub issue and return its number + URL.
 *
 * Trigger strategy (repository_dispatch):
 * 1. Create issue with NO labels (only fires `issues.opened`, no workflow trigger)
 * 2. Fire `repository_dispatch` with issue number, tier, and labels
 * 3. The workflow's dispatch-handler job adds labels and triggers the agent
 *
 * Fallback: if dispatch fails, add labels directly (ordered: trigger first,
 * then metadata) to avoid duplicate workflow runs.
 */
export async function createGitHubIssue(
  title: string,
  body: string,
  labels: string[],
): Promise<GitHubIssue> {
  // Step 1: Create issue with NO labels
  const res = await fetch(`${GITHUB_API}/repos/${GITHUB_REPO}/issues`, {
    method: 'POST',
    headers: ghHeaders(),
    body: JSON.stringify({ title, body }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status}: ${text}`);
  }

  const issue = (await res.json()) as GitHubIssue;

  // Step 2: Fire repository_dispatch to trigger workflow + apply labels
  const tier = labels.includes('ai-complex') ? 'complex' : 'standard';
  const dispatched = await fireRepositoryDispatch(issue.number, tier, labels);

  // Fallback: add labels directly if dispatch failed
  if (!dispatched) {
    await addLabelsFallback(issue.number, labels);
  }

  return issue;
}

/** Fire a repository_dispatch event to trigger the Claude agent workflow. */
async function fireRepositoryDispatch(
  issueNumber: number,
  tier: string,
  labels: string[],
): Promise<boolean> {
  try {
    const res = await fetch(
      `${GITHUB_API}/repos/${GITHUB_REPO}/dispatches`,
      {
        method: 'POST',
        headers: ghHeaders(),
        body: JSON.stringify({
          event_type: 'discord-issue',
          client_payload: {
            issue_number: issueNumber,
            tier,
            labels: labels.join(','),
          },
        }),
      },
    );

    if (res.ok || res.status === 204) {
      console.log(
        `[bridge] Fired repository_dispatch for issue #${issueNumber} (tier: ${tier})`,
      );
      return true;
    }

    console.warn(`[bridge] repository_dispatch failed: ${res.status}`);
    return false;
  } catch (err) {
    console.warn('[bridge] repository_dispatch error:', err);
    return false;
  }
}

/** Fallback: add labels directly using ordered strategy (trigger first). */
async function addLabelsFallback(
  issueNumber: number,
  labels: string[],
): Promise<void> {
  const TRIGGER_LABELS = new Set(['ai-driven', 'ai-complex']);
  const triggerLabels = labels.filter((l) => TRIGGER_LABELS.has(l));
  const metadataLabels = labels.filter((l) => !TRIGGER_LABELS.has(l));

  // Add trigger label first — fires exactly ONE workflow run
  if (triggerLabels.length > 0) {
    const triggerRes = await fetch(
      `${GITHUB_API}/repos/${GITHUB_REPO}/issues/${issueNumber}/labels`,
      {
        method: 'POST',
        headers: ghHeaders(),
        body: JSON.stringify({ labels: triggerLabels }),
      },
    );
    if (!triggerRes.ok) {
      console.warn(
        `[bridge] Fallback: failed to add trigger label: ${triggerRes.status}`,
      );
    }
  }

  // Add metadata labels after (these queue behind the agent run)
  if (metadataLabels.length > 0) {
    const metaRes = await fetch(
      `${GITHUB_API}/repos/${GITHUB_REPO}/issues/${issueNumber}/labels`,
      {
        method: 'POST',
        headers: ghHeaders(),
        body: JSON.stringify({ labels: metadataLabels }),
      },
    );
    if (!metaRes.ok) {
      console.warn(
        `[bridge] Fallback: failed to add metadata labels: ${metaRes.status}`,
      );
    }
  }
}

/**
 * Look up the GitHub issue number for a Discord thread.
 * First checks in-memory cache, then falls back to GitHub Search API.
 */
export async function findIssueForThread(
  threadId: string,
  guildId: string,
): Promise<number | null> {
  // Check in-memory cache first
  const cached = threadToIssue.get(threadId);
  if (cached) return cached;

  // Fallback: search GitHub issues for the Discord thread URL
  const threadUrl = `discord.com/channels/${guildId}/${threadId}`;
  try {
    const query = encodeURIComponent(
      `repo:${GITHUB_REPO} in:body "${threadUrl}"`,
    );
    const res = await fetch(
      `${GITHUB_API}/search/issues?q=${query}&per_page=1`,
      { headers: ghHeaders() },
    );
    if (!res.ok) {
      console.warn(`[status] GitHub search failed: ${res.status}`);
      return null;
    }
    const data = (await res.json()) as {
      items?: { number: number }[];
    };
    const issueNum = data.items?.[0]?.number;
    if (issueNum) {
      threadToIssue.set(threadId, issueNum); // cache for next time
      return issueNum;
    }
  } catch (err) {
    console.warn('[status] GitHub search error:', err);
  }

  return null;
}

/**
 * Get the current status of a GitHub issue and its linked PRs.
 */
export async function getIssueStatus(
  issueNumber: number,
): Promise<IssueStatus | null> {
  try {
    // Fetch issue details
    const issueRes = await fetch(
      `${GITHUB_API}/repos/${GITHUB_REPO}/issues/${issueNumber}`,
      { headers: ghHeaders() },
    );
    if (!issueRes.ok) return null;
    const issue = (await issueRes.json()) as { state: string };

    // Search for PRs that reference this issue
    const query = encodeURIComponent(
      `repo:${GITHUB_REPO} is:pr closes #${issueNumber}`,
    );
    const prRes = await fetch(
      `${GITHUB_API}/search/issues?q=${query}&per_page=5`,
      { headers: ghHeaders() },
    );

    let hasLinkedPR = false;
    let prDraft = false;
    let prMerged = false;
    let prUrl: string | null = null;

    if (prRes.ok) {
      const prData = (await prRes.json()) as {
        items?: {
          number: number;
          html_url: string;
          state: string;
          draft?: boolean;
          pull_request?: { merged_at: string | null };
        }[];
      };

      if (prData.items && prData.items.length > 0) {
        hasLinkedPR = true;
        // Use the most recent PR
        const pr = prData.items[0];
        prUrl = pr.html_url;
        prDraft = pr.draft === true;
        prMerged = pr.pull_request?.merged_at != null;
      }
    }

    return {
      state: issue.state as 'open' | 'closed',
      hasLinkedPR,
      prDraft,
      prMerged,
      prUrl,
    };
  } catch (err) {
    console.warn(
      `[status] Failed to fetch status for issue #${issueNumber}:`,
      err,
    );
    return null;
  }
}
