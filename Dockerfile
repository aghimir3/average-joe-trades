# Stage 1: Install dependencies
FROM node:24-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./
RUN npm ci

# Stage 2: Build the application
FROM node:24-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Force standalone output on all platforms
ENV NEXT_OUTPUT=standalone
ENV NEXT_TELEMETRY_DISABLED=1

# Build-time placeholders for static analysis and page collection. Runtime values are provided by the deployment.
ENV DATABASE_URL=sqlserver://localhost:1433;database=placeholder;encrypt=false;trustServerCertificate=true
ENV AUTH_SECRET=<build-placeholder-secret-only>
ENV AUTH_GOOGLE_ID=
ENV AUTH_GOOGLE_SECRET=
ENV NEXTAUTH_URL=http://localhost:3000

ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_DEMO_HOSTNAMES=demo.localhost
ARG NEXT_PUBLIC_DEMO_URL=http://demo.localhost:3000
ARG NEXT_PUBLIC_FORCE_DEMO=false
ARG NEXT_PUBLIC_APP_NAME="Average Joe Trades"
ARG NEXT_PUBLIC_REPOSITORY_URL=
ARG NEXT_PUBLIC_SUPPORT_URL=
ARG NEXT_PUBLIC_SUPPORT_EMAIL=
ARG NEXT_PUBLIC_LEGAL_ENTITY_NAME=
ARG NEXT_PUBLIC_COPYRIGHT_NAME="Average Joe Trades contributors"

ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_DEMO_HOSTNAMES=$NEXT_PUBLIC_DEMO_HOSTNAMES
ENV NEXT_PUBLIC_DEMO_URL=$NEXT_PUBLIC_DEMO_URL
ENV NEXT_PUBLIC_FORCE_DEMO=$NEXT_PUBLIC_FORCE_DEMO
ENV NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME
ENV NEXT_PUBLIC_REPOSITORY_URL=$NEXT_PUBLIC_REPOSITORY_URL
ENV NEXT_PUBLIC_SUPPORT_URL=$NEXT_PUBLIC_SUPPORT_URL
ENV NEXT_PUBLIC_SUPPORT_EMAIL=$NEXT_PUBLIC_SUPPORT_EMAIL
ENV NEXT_PUBLIC_LEGAL_ENTITY_NAME=$NEXT_PUBLIC_LEGAL_ENTITY_NAME
ENV NEXT_PUBLIC_COPYRIGHT_NAME=$NEXT_PUBLIC_COPYRIGHT_NAME

# Prisma generate runs via postinstall, but run explicitly to be safe
RUN npx prisma generate
RUN npm run build

# Bundle the optional Discord bot if source exists.
RUN if [ -f discord/bot.ts ]; then \
      npx esbuild discord/bot.ts --bundle --platform=node --target=node24 --outfile=discord-bot.cjs; \
    fi

# Stage 3: Production image
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone server
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy Discord bot if it was built
COPY --from=builder /app/discord-bot.cjs* ./

# Copy startup script
COPY start.sh ./
RUN chmod +x start.sh

USER nextjs

EXPOSE 3000

CMD ["./start.sh"]
