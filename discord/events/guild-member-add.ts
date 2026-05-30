import type { GuildMember } from 'discord.js';
import { NEW_MEMBER_ROLE_NAME } from '../config';

/** GuildMemberAdd — auto-assign "New Member" role */
export async function handleGuildMemberAdd(member: GuildMember): Promise<void> {
  try {
    const role = member.guild.roles.cache.find(
      (r) => r.name === NEW_MEMBER_ROLE_NAME,
    );
    if (!role) {
      console.warn(
        `[${member.guild.name}] "${NEW_MEMBER_ROLE_NAME}" role not found — skipping`,
      );
      return;
    }
    await member.roles.add(role);
    console.log(
      `[${member.guild.name}] Assigned "${NEW_MEMBER_ROLE_NAME}" to ${member.user.tag}`,
    );
  } catch (err) {
    console.error(
      `[${member.guild.name}] Failed to assign role to ${member.user.tag}:`,
      err,
    );
  }
}
