import {
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { APP_NAME, DEMO_URL, EMBED_COLOR } from '../config';

export const data = new SlashCommandBuilder()
  .setName('demo')
  .setDescription('Get the demo link to try Average Joe Trades');

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(`Try ${APP_NAME}`)
    .setDescription(
      [
        `**[Open the Demo](${DEMO_URL})**`,
        '',
        'Explore the full app with sample data — no signup required.',
        '',
        'Includes dashboard analytics, position tracking, strategies, AI insights, journal, and more.',
      ].join('\n'),
    )
    .setFooter({ text: APP_NAME });
  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  });
}
