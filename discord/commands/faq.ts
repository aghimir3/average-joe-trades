import {
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { EMBED_COLOR } from '../config';
import { FAQ_SECTIONS } from './data';

export const data = new SlashCommandBuilder()
  .setName('faq')
  .setDescription('Common questions about Average Joe Trades')
  .addStringOption((opt) =>
    opt
      .setName('topic')
      .setDescription('Show a specific FAQ topic')
      .setRequired(false)
      .addChoices(
        ...Object.entries(FAQ_SECTIONS).map(([key, val]) => ({
          name: val.title,
          value: key,
        })),
      ),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const topic = interaction.options.getString('topic');

  if (topic && FAQ_SECTIONS[topic]) {
    const section = FAQ_SECTIONS[topic];
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle(section.title)
      .setDescription(section.content)
      .setFooter({ text: 'Average Joe Trades — FAQ' });
    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  } else {
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle('Frequently Asked Questions')
      .setFooter({ text: 'Average Joe Trades — FAQ' });
    for (const section of Object.values(FAQ_SECTIONS)) {
      embed.addFields({ name: section.title, value: section.content });
    }
    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  }
}
