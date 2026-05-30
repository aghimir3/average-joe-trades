import {
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { APP_NAME, APP_URL, EMBED_COLOR } from '../config';

export const data = new SlashCommandBuilder()
  .setName('signup')
  .setDescription('Get the link to sign up for Average Joe Trades');

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(`Get Started with ${APP_NAME}`)
    .setDescription(
      [
        `**[Open the App](${APP_URL})**`,
        '',
        'Connect your brokerage, sync your trades, and get real-time analytics — all in one place.',
        '',
        'Supports Robinhood, Schwab, Fidelity, and Interactive Brokers.',
      ].join('\n'),
    )
    .setFooter({ text: APP_NAME });
  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  });
}
