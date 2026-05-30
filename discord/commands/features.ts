import {
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { APP_FEATURE_SECTIONS } from '../../src/lib/chat/features-data';
import { APP_NAME, APP_URL, DEMO_URL, EMBED_COLOR } from '../config';

export const data = new SlashCommandBuilder()
  .setName('features')
  .setDescription('Explore Average Joe Trades features')
  .addStringOption((opt) =>
    opt
      .setName('category')
      .setDescription('Show a specific feature category')
      .setRequired(false)
      .addChoices(
        ...APP_FEATURE_SECTIONS.map((s) => ({
          name: s.title,
          value: s.id,
        })),
      ),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const category = interaction.options.getString('category');

  if (category) {
    const section = APP_FEATURE_SECTIONS.find((s) => s.id === category);
    if (section) {
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle(section.title)
        .setDescription(section.description)
        .setFooter({ text: `${APP_NAME} - Features` });
      for (const feature of section.features) {
        embed.addFields({
          name: feature.title,
          value: feature.description,
        });
      }
      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await interaction.reply({
        content:
          'Category not found. Use the autocomplete options to pick a valid category.',
        flags: MessageFlags.Ephemeral,
      });
    }
  } else {
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle(`${APP_NAME} - Features`)
      .setDescription(
        [
          `Explore all features in **[the app](${APP_URL})**`,
          `or try the **[demo](${DEMO_URL})**.`,
          '',
          'Use `/features category:<name>` for details on a specific area.',
        ].join('\n'),
      )
      .setFooter({
        text: `${APP_FEATURE_SECTIONS.length} feature categories`,
      });
    for (const section of APP_FEATURE_SECTIONS) {
      embed.addFields({
        name: section.title,
        value: `${section.description} (${section.features.length} features)`,
        inline: true,
      });
    }
    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  }
}
