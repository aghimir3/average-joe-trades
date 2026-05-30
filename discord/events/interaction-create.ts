import { MessageFlags, type Interaction } from 'discord.js';
import { commandHandlers } from '../commands';

/** InteractionCreate — slash command dispatch */
export async function handleInteractionCreate(
  interaction: Interaction,
): Promise<void> {
  if (!interaction.isChatInputCommand()) return;

  const handler = commandHandlers.get(interaction.commandName);
  if (!handler) return;

  try {
    await handler(interaction);
  } catch (err) {
    console.error(
      `[commands] Error handling /${interaction.commandName}:`,
      err,
    );
    const msg = 'Something went wrong. Try again in a moment.';
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: msg,
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await interaction.reply({
        content: msg,
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}
