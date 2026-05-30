# Security Policy

## Supported Versions

The public `main` branch is the supported development line. Self-hosted operators are responsible for keeping their deployments current.

## Reporting a Vulnerability

If GitHub private vulnerability reporting is enabled for this repository, use it. Otherwise, contact the maintainers through the public support channel configured for the project or deployment, such as `NEXT_PUBLIC_SUPPORT_URL` or `NEXT_PUBLIC_SUPPORT_EMAIL`.

Do not open a public issue with exploit details, real tokens, brokerage credentials, account numbers, database dumps, or private trading data. A short public issue asking for a secure contact path is acceptable when no private channel is available.

## Self-Hosting Responsibilities

Average Joe Trades is self-hostable software. Operators are responsible for:

- Generating unique `AUTH_SECRET`, OAuth, database, SnapTrade, AI, Discord, GitHub, and MCP credentials.
- Protecting `DATABASE_URL`, API keys, OAuth secrets, and bot tokens.
- Running the app behind HTTPS in production.
- Restricting database access with least privilege and private networking where possible.
- Encrypting database storage and backups through the database or hosting platform.
- Reviewing logs to ensure secrets and private trading data are not exposed.
- Disabling optional integrations that are not needed.

SnapTrade service-user secrets are stored in the application database for broker sync. This repository does not currently add application-level encryption around that database field, so production deployments should rely on strong database, backup, host, and network controls before connecting real brokerage accounts.

MCP API keys are bearer credentials. They are shown only once at creation, stored as HMAC-SHA-256 hashes using `AUTH_SECRET` as the server-side pepper, and should be revoked immediately if exposed.