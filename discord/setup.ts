/**
 * Discord Server Setup Script for Average Joe Trades
 *
 * Non-destructive and idempotent — safe to re-run on any server.
 * Only creates what's missing (categories, channels, roles, messages, tags).
 * Never deletes, overwrites, or modifies existing server state.
 *
 * Prerequisites:
 *   1. Create a bot at https://discord.com/developers/applications
 *   2. Bot permissions: Administrator (simplest), or at minimum:
 *      Manage Channels, Manage Roles, Send Messages, Manage Messages,
 *      Read Message History
 *   3. Invite the bot to your server with those permissions
 *   4. Set environment variables:
 *        DISCORD_BOT_TOKEN=<your-discord-bot-token>
 *        DISCORD_GUILD_ID=<your-server-id>
 *
 * Usage:
 *   npx tsx scripts/setup-discord.ts
 */

import {
  Client,
  ChannelType,
  GatewayIntentBits,
  GuildDefaultMessageNotifications,
  PermissionsBitField,
  type CategoryChannel,
  type TextChannel,
  type ForumChannel,
  type NewsChannel,
} from 'discord.js';
import {
  CATEGORIES,
  CHANNEL_CONTENT,
  FORUM_CONTENT,
  FORUM_TAGS,
  ROLES,
  SLOW_MODE,
  type ChannelKind,
} from './setup-data';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

if (!BOT_TOKEN || !GUILD_ID) {
  console.error(
    'Missing env vars. Set DISCORD_BOT_TOKEN and DISCORD_GUILD_ID.',
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function channelType(kind: ChannelKind): ChannelType {
  switch (kind) {
    case 'text':
      return ChannelType.GuildText;
    case 'announcement':
      return ChannelType.GuildAnnouncement;
    case 'forum':
      return ChannelType.GuildForum;
    case 'voice':
      return ChannelType.GuildVoice;
    case 'stage':
      return ChannelType.GuildStageVoice;
  }
}

/** Check if the bot already has a pinned message in a text/announcement channel */
async function hasBotPinnedMessage(
  channel: TextChannel | NewsChannel,
  botId: string,
): Promise<boolean> {
  const pinned = await channel.messages.fetchPinned();
  return pinned.some((m) => m.author.id === botId);
}

/** Check if the bot already created a post in a forum channel */
async function hasBotForumPost(
  channel: ForumChannel,
  botId: string,
): Promise<boolean> {
  const active = await channel.threads.fetchActive();
  const archived = await channel.threads.fetchArchived();
  const all = [...active.threads.values(), ...archived.threads.values()];
  return all.some((t) => t.ownerId === botId);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function setupServer() {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  });

  await client.login(BOT_TOKEN);
  const botId = client.user!.id;
  console.log(`Logged in as ${client.user?.tag}\n`);

  const guild = await client.guilds.fetch(GUILD_ID!);
  await guild.channels.fetch();
  await guild.roles.fetch();
  console.log(`Server: ${guild.name}\n`);

  // ── Step 1: Server settings (non-destructive — only log, never overwrite) ──
  console.log('=== Server Settings ===');
  if (
    guild.defaultMessageNotifications ===
    GuildDefaultMessageNotifications.OnlyMentions
  ) {
    console.log(
      '  [ok] Default notifications already set to @mentions only',
    );
  } else {
    console.log(
      '  [info] Default notifications not set to @mentions only — change manually in Server Settings if desired',
    );
  }

  // ── Step 2: Roles ──
  console.log('\n=== Roles ===');
  let newMemberRole = guild.roles.cache.find((r) => r.name === 'New Member');
  for (const roleDef of ROLES) {
    const existing = guild.roles.cache.find((r) => r.name === roleDef.name);
    if (existing) {
      if (roleDef.name === 'New Member') newMemberRole = existing;
      console.log(`  [skip] "${roleDef.name}" exists`);
      continue;
    }
    const created = await guild.roles.create({
      name: roleDef.name,
      color: roleDef.color,
      mentionable: roleDef.mentionable,
    });
    if (roleDef.name === 'New Member') newMemberRole = created;
    console.log(`  [created] "${roleDef.name}"`);
  }

  // ── Step 3: Categories, channels, and content ──
  console.log('\n=== Channels ===');
  let generalChannel: TextChannel | null = null;

  for (const categoryDef of CATEGORIES) {
    // Find or create category
    let category = guild.channels.cache.find(
      (c) =>
        c.type === ChannelType.GuildCategory && c.name === categoryDef.name,
    ) as CategoryChannel | undefined;

    if (category) {
      console.log(`\n  [exists] ${categoryDef.name}`);
    } else {
      category = (await guild.channels.create({
        name: categoryDef.name,
        type: ChannelType.GuildCategory,
      })) as CategoryChannel;
      console.log(`\n  [created] ${categoryDef.name}`);
    }

    for (const channelDef of categoryDef.channels) {
      // Find or create channel
      let channel = guild.channels.cache.find(
        (c) => c.name === channelDef.name && c.parentId === category!.id,
      );

      if (!channel) {
        const permissionOverwrites = channelDef.readOnly
          ? [
              {
                id: guild.id,
                deny: [PermissionsBitField.Flags.SendMessages],
              },
            ]
          : [];

        const slowMode = SLOW_MODE[channelDef.name] ?? 0;

        channel = await guild.channels.create({
          name: channelDef.name,
          type: channelType(channelDef.kind),
          parent: category.id,
          topic: channelDef.topic,
          rateLimitPerUser: slowMode,
          permissionOverwrites,
        });

        const slowLabel = slowMode > 0 ? `, ${slowMode}s slowmode` : '';
        console.log(
          `    [created] #${channelDef.name} (${channelDef.kind}${slowLabel})`,
        );
      } else {
        console.log(`    [exists] #${channelDef.name}`);
      }

      // Track #general for system channel
      if (channelDef.name === 'general') {
        generalChannel = channel as TextChannel;
      }

      // ── Post content (only if missing) ──
      if (channelDef.kind === 'forum') {
        const forum = channel as ForumChannel;
        const forumDef = FORUM_CONTENT[channelDef.name];
        const tags = FORUM_TAGS[channelDef.name];

        // Merge tags — keep existing, only add missing ones (never remove)
        if (tags) {
          const existingNames = new Set(
            forum.availableTags.map((t) => t.name),
          );
          const toAdd = tags.filter((t) => !existingNames.has(t.name));
          if (toAdd.length > 0) {
            await forum.setAvailableTags([
              ...forum.availableTags,
              ...toAdd,
            ]);
            console.log(
              `      [added] ${toAdd.length} new tag(s): ${toAdd.map((t) => t.name).join(', ')}`,
            );
          } else {
            console.log(
              `      [skip] all ${tags.length} tags already exist`,
            );
          }
        }

        if (!forumDef) continue;

        // Only set guidelines if forum has no topic yet (never overwrite)
        if (!forum.topic) {
          await forum.setTopic(forumDef.guidelines);
          console.log(`      [set] guidelines`);
        } else {
          console.log(`      [skip] guidelines already set`);
        }

        // Create starter post only if bot hasn't posted yet
        if (!(await hasBotForumPost(forum, botId))) {
          const thread = await forum.threads.create({
            name: forumDef.starterPost.title,
            message: { content: forumDef.starterPost.body },
          });
          const starterMsg = await thread.fetchStarterMessage();
          if (starterMsg) await starterMsg.pin();
          console.log(`      [posted] "${forumDef.starterPost.title}"`);
        } else {
          console.log(`      [skip] starter post exists`);
        }
      } else if (
        channelDef.kind === 'text' ||
        channelDef.kind === 'announcement'
      ) {
        const textChannel = channel as TextChannel | NewsChannel;
        const content = CHANNEL_CONTENT[channelDef.name];
        if (!content) continue;

        // Only post if bot hasn't pinned a message yet
        if (!(await hasBotPinnedMessage(textChannel, botId))) {
          // Temporarily allow bot to send in read-only channels
          if (channelDef.readOnly) {
            await textChannel.permissionOverwrites.create(botId, {
              SendMessages: true,
            });
          }

          // Support multi-message content (array) for channels exceeding 2000 chars
          const messages = Array.isArray(content) ? content : [content];
          for (let i = 0; i < messages.length; i++) {
            const msg = await textChannel.send(messages[i]);
            if (i === 0) await msg.pin();
          }

          // Clean up bot permission override
          if (channelDef.readOnly) {
            await textChannel.permissionOverwrites.delete(botId);
          }
          console.log(`      [posted & pinned] starter message`);
        } else {
          console.log(`      [skip] pinned message exists`);
        }
      }
    }
  }

  // ── Step 4: System channel (non-destructive — only log) ──
  if (generalChannel && guild.systemChannelId === generalChannel.id) {
    console.log('\n  [ok] System channel already set to #general');
  } else if (generalChannel) {
    console.log(
      '\n  [info] System channel is not #general — change manually in Server Settings if desired',
    );
  }

  // ── Step 5: Auto-role info ──
  if (newMemberRole) {
    console.log('\n=== Auto-Role ===');
    console.log(`  "New Member" role ID: ${newMemberRole.id}`);
    console.log(
      '  Run the persistent bot: npx tsx scripts/discord-bot.ts',
    );
  }

  console.log('\nDone! Server is up to date.');
  client.destroy();
}

setupServer().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
