# Discord Bot

Optional Discord bot for Average Joe Trades. It can assign a new-member role, register slash commands, bridge forum posts to GitHub issues, and use Anthropic for spam filtering and issue extraction.

## Features

- `/demo`, `/signup`, `/faq`, and `/features` slash commands.
- Forum-to-GitHub bridge for bug reports and feature requests.
- Optional Anthropic-based spam filtering for forum posts.
- One-time setup script for roles, channels, forum tags, and starter messages.

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `DISCORD_BOT_TOKEN` | Yes | Bot token from the Discord Developer Portal. |
| `DISCORD_GUILD_ID` | Setup only | Server ID used by `discord/setup.ts`. |
| `GITHUB_TOKEN` | No | Fine-grained PAT. Enables the GitHub issue bridge when `GITHUB_REPO` is also set. |
| `GITHUB_REPO` | No | Target repository in `owner/repo` format. Example: `owner/average-joe-trades`. |
| `ANTHROPIC_API_KEY` | No | Enables Discord AI filtering and issue extraction. |
| `AI_PROVIDER` / `AI_API_KEY` | No | If `AI_PROVIDER` is `anthropic`, `AI_API_KEY` can be used instead of `ANTHROPIC_API_KEY`. |
| `NEXT_PUBLIC_APP_NAME` | No | Display name used in embeds. |
| `NEXT_PUBLIC_SITE_URL` | No | Base URL used for privacy links. |
| `NEXT_PUBLIC_APP_URL` | No | App URL used by `/signup`. |
| `NEXT_PUBLIC_DEMO_URL` | No | Demo URL used by `/demo`. |

The GitHub bridge is disabled unless both `GITHUB_TOKEN` and `GITHUB_REPO` are configured.

## Local Run

```bash
npm install
npx tsx discord/bot.ts
```

Load values from your local environment first, for example:

```bash
export DISCORD_BOT_TOKEN=<your-discord-bot-token>
export GITHUB_TOKEN=<optional-fine-grained-github-token>
export GITHUB_REPO=owner/average-joe-trades
export ANTHROPIC_API_KEY=<optional-anthropic-key>
npx tsx discord/bot.ts
```

## Server Setup

Run the setup script only after reviewing `discord/setup-data.ts` for your community.

```bash
export DISCORD_BOT_TOKEN=<your-discord-bot-token>
export DISCORD_GUILD_ID=<your-discord-server-id>
npx tsx discord/setup.ts
```

The setup script is intended to be non-destructive and idempotent, but you should still review the generated roles and channels before running it on an existing server.

## Production Bundle

```bash
npx esbuild discord/bot.ts --bundle --platform=node --target=node24 --format=cjs --outfile=discord-bot.cjs
node discord-bot.cjs
```

The Docker image bundles `discord-bot.cjs` when `discord/bot.ts` is present. `start.sh` starts the bot only when `DISCORD_BOT_TOKEN` is set and the bundled file exists.

## Repository Bridge Permissions

A fine-grained GitHub token should be scoped to the target repository and granted only the permissions needed by your workflow, typically Issues read/write, Metadata read, and Actions repository dispatch if you use the automation hook.