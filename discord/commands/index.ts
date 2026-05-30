import type { ChatInputCommandInteraction } from 'discord.js';
import * as demo from './demo';
import * as signup from './signup';
import * as faq from './faq';
import * as features from './features';

// ---------------------------------------------------------------------------
// Barrel — slash command definitions + handler map
// ---------------------------------------------------------------------------

const commands = [demo, signup, faq, features];

/** SlashCommandBuilder array for REST registration */
export const slashCommands = commands.map((c) => c.data);

/** Command name → execute handler */
export const commandHandlers = new Map<
  string,
  (interaction: ChatInputCommandInteraction) => Promise<void>
>(commands.map((c) => [c.data.name, c.execute]));
