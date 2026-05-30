/**
 * Lightweight persistent Discord bot for Average Joe Trades
 *
 * Currently handles:
 *   - Auto-assigns "New Member" role when someone joins the server
 *   - Creates GitHub issues from #bug-reports and #feature-requests forum posts
 *   - AI spam filter (Claude Haiku) to reject non-legitimate posts
 *   - Re-classifies filtered posts when edited (up to 3 attempts, 2 min cooldown)
 *   - Status updates: replies with issue/PR status when users ask in forum threads
 *   - Slash commands: /demo, /signup, /faq, /features
 *
 * Prerequisites:
 *   - Bot must have "Manage Roles" permission
 *   - Enable the "Server Members Intent" in Discord Developer Portal
 *     (Bot → Privileged Gateway Intents → Server Members Intent)
 *   - Set environment variables:
 *       DISCORD_BOT_TOKEN=<your-discord-bot-token>
 *       GITHUB_TOKEN=<optional-fine-grained-github-token> (optional, enables issue bridge)
 *       GITHUB_REPO=owner/repo (required when GITHUB_TOKEN is set)
 *       ANTHROPIC_API_KEY=<optional-anthropic-key> (optional, enables AI spam filter)
 *
 * Usage (local):
 *   export $(grep -E '^(DISCORD_|GITHUB_)' .env | xargs) && npx tsx discord/bot.ts
 *
 * Production:
 *   Bundled with esbuild into discord-bot.cjs and started by start.sh when
 *   DISCORD_BOT_TOKEN is configured.
 */

import { Client, GatewayIntentBits } from 'discord.js';
import { BOT_TOKEN } from './config';
import { registerEvents } from './events';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

registerEvents(client);
client.login(BOT_TOKEN);
