#!/bin/bash
# Startup script for the production container.
# Runs the Next.js server and the optional Discord bot side by side.

# Auto-restart loop for the Discord bot
start_bot() {
  while true; do
    echo "[bot] Starting Discord bot..."
    node discord-bot.cjs
    EXIT_CODE=$?
    echo "[bot] Discord bot exited with code $EXIT_CODE, restarting in 5s..."
    sleep 5
  done
}

echo "Starting Next.js server..."
node server.js &
NEXT_PID=$!

if [ -n "$DISCORD_BOT_TOKEN" ] && [ -f "discord-bot.cjs" ]; then
  start_bot &
  echo "[bot] Discord bot supervisor started (PID: $!)"
elif [ -n "$DISCORD_BOT_TOKEN" ]; then
  echo "[bot] DISCORD_BOT_TOKEN is set, but discord-bot.cjs was not bundled"
else
  echo "[bot] DISCORD_BOT_TOKEN not set - Discord bot disabled"
fi

# If Next.js exits, the container exits.
wait $NEXT_PID
