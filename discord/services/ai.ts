import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY, filterEnabled } from '../config';
import type { Classification, StructuredIssue } from '../types';

// ---------------------------------------------------------------------------
// Anthropic client (shared by all AI functions)
// ---------------------------------------------------------------------------

const anthropic = filterEnabled
  ? new Anthropic({ apiKey: ANTHROPIC_API_KEY })
  : null;

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const FILTER_SYSTEM_PROMPT = `You are a moderator for the "Average Joe Trades" Discord server. This is a multi-broker options & stocks trading journal app that supports:
- Brokerage sync via SnapTrade (Robinhood, Schwab, Fidelity, IBKR)
- CSV/JSON import for trade history
- FIFO-based P&L derivation and analytics dashboard
- Options strategies (wheel, covered calls, cash-secured puts)
- AI-powered trade insights and recommendations

LEGITIMATE: issues with importing trades, sync errors, incorrect P&L calculations, chart display bugs, requests for new brokers/features/analytics, UI improvements, mobile layout issues.

SPAM/OFF-TOPIC: stock picks or trading advice, self-promotion or external links, crypto pump schemes, "join my Discord" posts, generic questions unrelated to the app, empty or nonsensical posts.

COMPLEXITY (for legitimate posts only):
- SIMPLE: typos, text/label changes, single-component UI tweaks, CSS fixes, adding a tooltip, minor display bugs, copy changes, color adjustments, small config changes.
- COMPLEX: new features, new API endpoints, multi-file changes, database/schema changes, business logic bugs, new pages/tabs, integration work, sync/import issues, P&L calculation bugs, architecture changes.

When in doubt on legitimacy, lean toward legitimate. When in doubt on complexity, lean toward complex (it's cheaper to overshoot than undershoot).
Always use the classify tool to respond.`;

const STRUCTURE_SYSTEM_PROMPT = `You extract structured fields from Discord forum posts for the "Average Joe Trades" app. Extract what you can from the post. If a field is not mentioned or cannot be inferred, leave it empty.

AREA options: Dashboard / Charts, Positions / Trades, Import / CSV / JSON, Brokerage Sync (SnapTrade), Options / Wheel Strategy, AI Insights / Ask Joey, Accounts / Settings, Journal, Mobile Layout, New Page / Feature, Other
BROKER options: Robinhood, Charles Schwab, Fidelity, Interactive Brokers (IBKR), Multiple brokers
DEVICE options: Desktop, Mobile, Both
SCOPE options: Small, Medium, Large

Always use the structure tool to respond.`;

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const CLASSIFY_TOOL: Anthropic.Messages.Tool = {
  name: 'classify',
  description:
    'Classify a Discord forum post as legitimate or spam/off-topic, and assess complexity.',
  input_schema: {
    type: 'object' as const,
    properties: {
      legitimate: {
        type: 'boolean',
        description:
          'true if the post is a valid bug report or feature request, false if spam/off-topic.',
      },
      complexity: {
        type: 'string',
        enum: ['simple', 'complex'],
        description:
          'simple = single-file/UI tweak, complex = multi-file/new feature/logic change.',
      },
      reason: {
        type: 'string',
        description:
          'One sentence explanation for the classification and complexity assessment.',
      },
    },
    required: ['legitimate', 'complexity', 'reason'],
  },
};

const STRUCTURE_TOOL: Anthropic.Messages.Tool = {
  name: 'structure',
  description: 'Extract structured fields from a Discord forum post.',
  input_schema: {
    type: 'object' as const,
    properties: {
      area: {
        type: 'string',
        description:
          'App area from the AREA options list. Pick the closest match.',
      },
      description: {
        type: 'string',
        description:
          'Clean, concise summary of the bug or feature request. 1-3 sentences.',
      },
      steps_to_reproduce: {
        type: 'string',
        description:
          'For bugs: numbered steps to reproduce. Empty if not a bug or steps are unclear.',
      },
      broker: {
        type: 'string',
        description:
          'Broker name if mentioned. Empty if not applicable.',
      },
      device: {
        type: 'string',
        description:
          'Desktop, Mobile, or Both. Empty if not mentioned.',
      },
      motivation: {
        type: 'string',
        description:
          'For features: why this would be useful. Empty if not a feature or not mentioned.',
      },
      scope: {
        type: 'string',
        description:
          'Small, Medium, or Large. Estimate based on the request.',
      },
    },
    required: ['area', 'description'],
  },
};

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/** Build multimodal content blocks: text prompt + image URLs for vision */
export function buildVisionContent(
  text: string,
  imageUrls: string[],
): Anthropic.Messages.ContentBlockParam[] {
  const blocks: Anthropic.Messages.ContentBlockParam[] = [];
  for (const url of imageUrls) {
    blocks.push({ type: 'image', source: { type: 'url', url } });
  }
  blocks.push({ type: 'text', text });
  return blocks;
}

// ---------------------------------------------------------------------------
// AI functions
// ---------------------------------------------------------------------------

/** Classify a Discord thread as legitimate or spam using Claude Haiku */
export async function classifyThread(
  title: string,
  content: string,
  channelType: 'bug-reports' | 'feature-requests',
  imageUrls: string[] = [],
): Promise<Classification> {
  if (!anthropic)
    return {
      legitimate: true,
      complexity: 'complex',
      reason: 'Filter disabled',
    };

  try {
    const label =
      channelType === 'bug-reports' ? 'bug report' : 'feature request';
    const prompt = `Classify this ${label}:\n\n<title>${title}</title>\n<content>${content || '(empty)'}</content>`;
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: FILTER_SYSTEM_PROMPT,
      tools: [CLASSIFY_TOOL],
      tool_choice: { type: 'tool', name: 'classify' },
      messages: [
        {
          role: 'user',
          content:
            imageUrls.length > 0
              ? buildVisionContent(prompt, imageUrls)
              : prompt,
        },
      ],
    });

    const toolBlock = message.content.find(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use',
    );
    const result = toolBlock?.input as Classification | undefined;
    if (!result) {
      console.warn(
        '[filter] No tool_use block in response, allowing through',
      );
      return {
        legitimate: true,
        complexity: 'complex',
        reason: 'No classification returned',
      };
    }

    // Normalize complexity — default to complex if unexpected value
    if (result.complexity !== 'simple' && result.complexity !== 'complex') {
      result.complexity = 'complex';
    }

    console.log(
      `[filter] "${title}" → ${result.legitimate ? 'legitimate' : 'spam'} (${result.complexity}): ${result.reason}`,
    );
    return result;
  } catch (err) {
    // On any failure, allow the issue through (fail open, default complex)
    console.warn('[filter] Classification failed, allowing through:', err);
    return {
      legitimate: true,
      complexity: 'complex',
      reason: 'Classification error — defaulting to allow',
    };
  }
}

/** Extract structured fields from a Discord post using Claude Haiku */
export async function structureIssue(
  title: string,
  content: string,
  isBug: boolean,
  imageUrls: string[] = [],
): Promise<StructuredIssue | null> {
  if (!anthropic) return null;

  try {
    const type = isBug ? 'bug report' : 'feature request';
    const prompt = `Extract structured fields from this ${type}:\n\n<title>${title}</title>\n<content>${content || '(empty)'}</content>`;
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: STRUCTURE_SYSTEM_PROMPT,
      tools: [STRUCTURE_TOOL],
      tool_choice: { type: 'tool', name: 'structure' },
      messages: [
        {
          role: 'user',
          content:
            imageUrls.length > 0
              ? buildVisionContent(prompt, imageUrls)
              : prompt,
        },
      ],
    });

    const toolBlock = message.content.find(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use',
    );
    const result = toolBlock?.input as StructuredIssue | undefined;
    if (!result) {
      console.warn(
        '[structure] No tool_use block, falling back to raw body',
      );
      return null;
    }

    console.log(
      `[structure] "${title}" → area="${result.area}", scope="${result.scope ?? 'n/a'}"`,
    );
    return result;
  } catch (err) {
    console.warn(
      '[structure] Extraction failed, falling back to raw body:',
      err,
    );
    return null;
  }
}

/** Generate a friendly, personalized Discord reply acknowledging the user's report */
export async function generateReply(
  title: string,
  content: string,
  isBug: boolean,
  imageUrls: string[] = [],
): Promise<string | null> {
  if (!anthropic) return null;

  try {
    const type = isBug ? 'bug report' : 'feature request';
    const prompt = `Write a reply for this ${type}:\n\n<title>${title}</title>\n<content>${content || '(no details provided)'}</content>`;
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      system: `You write short, friendly Discord replies for the "Average Joe Trades" trading journal app. You're acknowledging a user's ${type}.

Rules:
- 1-2 sentences max. Be warm but brief.
- Reference what they specifically reported (don't be generic). If the user attached a screenshot, reference what you see in it.
- Let them know we're working on it and they'll get an update here.
- Sound like a helpful human, not a bot. Casual tone.
- No emojis except one at the end if it fits naturally.
- Never mention GitHub, PRs, issues, branches, AI, or technical terms.
- Never promise a timeline.
- Do NOT use markdown formatting (no bold, no italics, no headers).`,
      messages: [
        {
          role: 'user',
          content:
            imageUrls.length > 0
              ? buildVisionContent(prompt, imageUrls)
              : prompt,
        },
      ],
    });

    const textBlock = message.content.find(
      (b): b is Anthropic.Messages.TextBlock => b.type === 'text',
    );
    const reply = textBlock?.text?.trim();
    if (!reply) return null;

    console.log(`[reply] Generated: "${reply.substring(0, 80)}..."`);
    return reply;
  } catch (err) {
    console.warn('[reply] Generation failed, using fallback:', err);
    return null;
  }
}
