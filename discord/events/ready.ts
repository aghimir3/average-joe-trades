import { REST, Routes, type Client } from 'discord.js';
import { BOT_TOKEN, bridgeEnabled, filterEnabled } from '../config';
import { slashCommands } from '../commands';
import { ensureGitHubLabels } from '../services/github';
import { cleanupFilteredThreads } from '../state';

/** ClientReady — register commands, ensure labels, start cleanup */
export function handleReady(client: Client<true>): void {
  console.log(`Bot online: ${client.user.tag}`);
  console.log(`Watching ${client.guilds.cache.size} server(s)`);

  // Register slash commands globally
  const rest = new REST().setToken(BOT_TOKEN!);
  rest
    .put(Routes.applicationCommands(client.user.id), {
      body: slashCommands.map((c) => c.toJSON()),
    })
    .then(() => {
      console.log(
        `[commands] Registered ${slashCommands.length} slash commands`,
      );
    })
    .catch((err) => {
      console.error('[commands] Failed to register slash commands:', err);
    });

  if (bridgeEnabled) {
    console.log('[bridge] GitHub issue bridge enabled');
    console.log(
      `[filter] AI spam filter ${filterEnabled ? 'enabled' : 'disabled (no Anthropic key)'}`,
    );
    ensureGitHubLabels();
  } else {
    console.log('[bridge] GitHub issue bridge disabled (set GITHUB_TOKEN and GITHUB_REPO to enable)');
  }

  // Clean up stale filtered-thread entries every 6 hours
  setInterval(cleanupFilteredThreads, 6 * 60 * 60 * 1000);
}
