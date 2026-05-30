import { Events, type Client } from 'discord.js';
import { handleReady } from './ready';
import { handleGuildMemberAdd } from './guild-member-add';
import { handleThreadCreate } from './thread-create';
import { handleMessageUpdate } from './message-update';
import { handleMessageCreate } from './message-create';
import { handleInteractionCreate } from './interaction-create';

/** Register all event handlers on the client */
export function registerEvents(client: Client): void {
  client.once(Events.ClientReady, handleReady);

  client.on(Events.GuildMemberAdd, handleGuildMemberAdd);

  client.on(Events.ThreadCreate, (thread, newlyCreated) => {
    handleThreadCreate(thread, newlyCreated, client);
  });

  client.on(Events.MessageUpdate, handleMessageUpdate);

  client.on(Events.MessageCreate, handleMessageCreate);

  client.on(Events.InteractionCreate, handleInteractionCreate);
}
