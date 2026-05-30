# Contributing

Thanks for helping improve Average Joe Trades. This project is a self-hostable trading journal, analytics app, and optional Discord/GitHub bridge.

## Before You Start

- Search existing issues and pull requests before opening a new one.
- Do not include real brokerage exports, account numbers, API keys, OAuth secrets, screenshots with balances, or private trading data.
- Keep changes focused. Separate unrelated refactors from bug fixes or feature work.

## Local Setup

```bash
npm install
cp .env.example .env.local
npx prisma generate
npm run dev
```

Set `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, and `AUTH_GOOGLE_SECRET` before using authenticated app flows. Optional features such as SnapTrade, AI, Discord, GitHub, and market data are enabled only when their env vars are configured.

## Checks

Run the checks that match your change:

```bash
npm run lint
npm run test:run
npm run build
```

For Prisma changes, run:

```bash
npx prisma generate
```

## Pull Requests

- Explain the problem and the fix.
- Include screenshots for UI changes.
- Note any schema, env, deployment, or security implications.
- Add or update tests when behavior changes.

## Security

Please do not report vulnerabilities with exploit details in public issues. See SECURITY.md for coordinated disclosure guidance.