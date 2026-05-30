# Average Joe Trades

Average Joe Trades is a self-hostable trading journal for stocks and options. It focuses on ledger-first accounting, FIFO-derived P&L, broker import/sync workflows, options strategy dashboards, AI-assisted analysis, and read-only MCP access for personal agents.

Average Joe Trades is decision-support software, not financial advice, brokerage, execution, custody, tax, accounting, or legal service.

## Features

- Immutable ledger events with derived positions, realized closes, and daily aggregates.
- CSV/JSON import and optional SnapTrade broker sync.
- Dashboards for performance, positions, options analytics, wheel strategy, journal, and charts.
- AI Insights and Ask Joey chat using Anthropic or OpenAI through the Vercel AI SDK.
- Read-only MCP endpoint protected by user API keys.
- Optional Discord bot with GitHub issue bridge and AI moderation.
- Demo mode that can run from configured demo hostnames.

## Tech Stack

- Next.js 16 App Router, React 19, TypeScript
- Prisma 7 with Microsoft SQL Server
- Auth.js / NextAuth v5 with Google OAuth
- Tailwind CSS v4, Radix UI, lucide-react
- TanStack Query, Chart.js, Lightweight Charts
- TensorFlow.js and Vercel AI SDK
- Vitest, Playwright, ESLint

## Repository Layout

| Path | Purpose |
| --- | --- |
| `src/app` | Next.js routes, pages, layouts, and API routes. |
| `src/components` | UI and feature components. |
| `src/lib` | Auth, API, services, AI, market, MCP, quant, and utility code. |
| `prisma` | Prisma schema and database configuration. |
| `discord` | Optional Discord bot and setup script. |
| `e2e` | Playwright tests. |

## Prerequisites

- Node.js 24 LTS and npm.
- Microsoft SQL Server, Azure SQL, or another SQL Server-compatible database.
- Google OAuth web client credentials.
- Docker Desktop if you want to use Docker Compose.

## Quick Start

```powershell
npm ci
Copy-Item .env.example .env.local
# Edit .env.local with local database, auth, and URL values.
npm run db:generate
npx prisma db push
npm run dev
```

Open `http://localhost:3000`.

## Environment Setup

Generate a unique auth secret:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Set at least these values in `.env.local` for local development:

```dotenv
AUTH_SECRET=<generated-secret>
AUTH_GOOGLE_ID=<google-oauth-client-id>
AUTH_GOOGLE_SECRET=<google-oauth-client-secret>
DATABASE_URL=<sqlserver-connection-string>
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
WEBAUTHN_RP_ID=localhost
WEBAUTHN_ORIGIN=http://localhost:3000
```

Quote `DATABASE_URL` in `.env.local` if it contains `#` or other shell-sensitive characters. Leave optional SnapTrade, AI, Discord, GitHub, Finnhub, and MCP-related variables blank unless you are configuring those integrations.

## Google OAuth Setup

Add this redirect URI to your Google OAuth web client for local development:

```text
http://localhost:3000/api/auth/callback/google
```

For production, add the callback for your deployment domain:

```text
https://<your-domain>/api/auth/callback/google
```

Update `NEXTAUTH_URL` whenever you switch between localhost and a deployed domain.

## Database Setup

The app uses Prisma with Microsoft SQL Server. For a first-time local setup, run:

```powershell
npm run db:generate
npx prisma db push
```

Run schema pushes or migrations only against the intended database.

## Docker Compose

Docker Compose starts the app and a local SQL Server container. Use an env file with strong local values:

```powershell
Copy-Item .env.example .env.local
# Edit AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, DB_SA_PASSWORD, and URLs.
docker compose --env-file .env.local up --build
```

The compose file requires `DB_SA_PASSWORD`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, and `AUTH_GOOGLE_SECRET`. If your password contains shell-sensitive characters, quote it in your env file.

After SQL Server is healthy, initialize the schema:

```powershell
docker compose --env-file .env.local run --rm app npx prisma db push
```

## Production Build

```powershell
npm run lint
npm run test:run
npm run build
npm run start
```

## Production Configuration

Set these for every production deployment:

```bash
AUTH_SECRET=<unique-production-secret>
AUTH_GOOGLE_ID=<production-google-oauth-client-id>
AUTH_GOOGLE_SECRET=<production-google-oauth-client-secret>
DATABASE_URL=<production-sqlserver-connection-string>
NEXTAUTH_URL=https://<your-domain>
NEXT_PUBLIC_SITE_URL=https://<your-domain>
NEXT_PUBLIC_APP_URL=https://<your-domain>
WEBAUTHN_RP_ID=<your-domain>
WEBAUTHN_ORIGIN=https://<your-domain>
```

Google OAuth production redirect URI:

```text
https://<your-domain>/api/auth/callback/google
```

Public branding and support values are optional:

```bash
NEXT_PUBLIC_APP_NAME=Average Joe Trades
NEXT_PUBLIC_REPOSITORY_URL=https://github.com/owner/average-joe-trades
NEXT_PUBLIC_SUPPORT_URL=https://github.com/owner/average-joe-trades/issues
NEXT_PUBLIC_SUPPORT_EMAIL=
NEXT_PUBLIC_LEGAL_ENTITY_NAME=
NEXT_PUBLIC_COPYRIGHT_NAME=Average Joe Trades contributors
```

Demo mode is local-only by default. Configure your own demo domain if you host one:

```dotenv
NEXT_PUBLIC_DEMO_HOSTNAMES=demo.localhost
NEXT_PUBLIC_DEMO_URL=http://demo.localhost:3000
NEXT_PUBLIC_FORCE_DEMO=false
```

## Deploying To Your Own Domain

Set these values to your deployment host:

```dotenv
NEXTAUTH_URL=https://<your-domain>
NEXT_PUBLIC_SITE_URL=https://<your-domain>
NEXT_PUBLIC_APP_URL=https://<your-domain>
WEBAUTHN_RP_ID=<your-domain>
WEBAUTHN_ORIGIN=https://<your-domain>
```

Add `https://<your-domain>/api/auth/callback/google` to Google OAuth. Use `NEXT_PUBLIC_DEMO_HOSTNAMES` and `NEXT_PUBLIC_DEMO_URL` only if you intentionally host demo mode on a separate domain.

## Try It With Demo Data

Demo mode uses synthetic data and can run from configured demo hostnames. Do not commit sample CSV files, real broker exports, account numbers, access tokens, screenshots with financial data, or generated reports. If public examples are added later, they should be synthetic and documented without including import files in the first public commit.

## Optional Integrations

| Integration | Variables | Notes |
| --- | --- | --- |
| SnapTrade | `SNAPTRADE_CLIENT_ID`, `SNAPTRADE_CONSUMER_KEY` | Enables broker connection and sync. |
| Market data | `FINNHUB_API_KEY` | Enables optional quote/data paths that use Finnhub. |
| AI | `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL` | `AI_PROVIDER` can be `anthropic` or `openai`. |
| Discord | `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID` | See `discord/README.md`. |
| GitHub bridge | `GITHUB_TOKEN`, `GITHUB_REPO` | Enables Discord forum posts to create GitHub issues. |
| Discord AI moderation | `ANTHROPIC_API_KEY` | Discord bot can also use `AI_API_KEY` when `AI_PROVIDER=anthropic`. |

SnapTrade service-user secrets are stored in the application database so sync can continue after authorization. This repository does not currently add application-level encryption around that database field. Production operators should use database encryption, encrypted backups, least-privilege users, private networking, and careful log retention before connecting real brokerage accounts.

## Azure App Service

The workflow in `.github/workflows/azure-deploy.yml` is a template for Azure App Service zip deployment.

Required GitHub repository variables:

- `AZURE_WEBAPP_NAME`
- `AZURE_RESOURCE_GROUP`
- `NEXTAUTH_URL`
- `NEXT_PUBLIC_SITE_URL`

Required GitHub secrets:

- `AZURE_CREDENTIALS`
- `AUTH_SECRET`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
- `DATABASE_URL`

Configure the App Service startup command as:

```bash
bash start.sh
```

Also set the runtime environment variables listed in Production Configuration on the App Service.

## AWS Deployment

Average Joe Trades can run as a Node.js container on AWS services such as ECS/Fargate, App Runner, or Elastic Beanstalk.

Recommended production shape:

- Amazon RDS for SQL Server, or another SQL Server-compatible database reachable from the app.
- ECR for the container image.
- ECS/Fargate or App Runner for the web process on port `3000`.
- Application Load Balancer or managed HTTPS endpoint with an ACM certificate.
- Secrets Manager or SSM Parameter Store for `AUTH_SECRET`, Google OAuth values, `DATABASE_URL`, and optional integration secrets.
- CloudWatch Logs with retention configured for your deployment.

Build and push a container image to your own registry:

```bash
docker build -t average-joe-trades .
docker tag average-joe-trades:latest <account-id>.dkr.ecr.<region>.amazonaws.com/average-joe-trades:latest
docker push <account-id>.dkr.ecr.<region>.amazonaws.com/average-joe-trades:latest
```

Set the same production env vars described above, configure Google OAuth for your AWS-hosted domain, run `npx prisma db push` or your migration process against the intended production database, and serve the app behind HTTPS. For container deployments, build with the public `NEXT_PUBLIC_*` values you want baked into the client bundle.

## MCP

The MCP endpoint is available at `POST /api/mcp`. Users create personal API keys in Settings; keys use an `ajt_` prefix, are shown only once, and are stored as HMAC-SHA-256 hashes using `AUTH_SECRET` as the server-side pepper. MCP tools are read-only and scoped to the authenticated user.

## Validation

Run these before opening a pull request or deploying:

```bash
npm run lint
npm run test:run
npm run build
```

For end-to-end demo tests:

```bash
npm run test:e2e
```

## Troubleshooting

- `/?error=Configuration` after sign-in usually means auth, database, or environment configuration is incomplete.
- Verify Google OAuth redirect URIs exactly match `NEXTAUTH_URL`.
- Quote `DATABASE_URL` in `.env.local` if it contains `#` or shell-sensitive characters.
- Leave optional integrations blank to disable them while bringing up the core app.
- Re-run `npm run db:generate` after Prisma schema changes.

## Security Notes

- Never commit `.env.local`, broker exports, API keys, OAuth secrets, tokens, database dumps, or screenshots with private financial data.
- Use HTTPS in production.
- Regenerate `AUTH_SECRET` for every deployment.
- Keep optional integrations disabled unless you need them.
- Review `SECURITY.md` before operating a public deployment.

## License

MIT. See `LICENSE`.