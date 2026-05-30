import {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildBasedChannel,
  type GuildMember,
} from "discord.js";
import { guildSettingsService } from "../services/guildSettingsService.js";
import { honeypotChannelService } from "../services/honeypotChannelService.js";

interface Perm {
  flag: bigint;
  name: string;
  why: string;
}

// Everything the bot needs, with a plain-language reason for each.
const SERVER_PERMS: Perm[] = [
  { flag: PermissionFlagsBits.ViewChannel, name: "View Channels", why: "see honeypot channels" },
  { flag: PermissionFlagsBits.SendMessages, name: "Send Messages", why: "post to the log channel" },
  { flag: PermissionFlagsBits.EmbedLinks, name: "Embed Links", why: "send hit-notification embeds" },
  { flag: PermissionFlagsBits.ManageMessages, name: "Manage Messages", why: "delete spam messages" },
  { flag: PermissionFlagsBits.ReadMessageHistory, name: "Read Message History", why: "purge recent spam" },
  { flag: PermissionFlagsBits.BanMembers, name: "Ban Members", why: "ban action" },
  { flag: PermissionFlagsBits.KickMembers, name: "Kick Members", why: "kick action" },
  { flag: PermissionFlagsBits.ModerateMembers, name: "Moderate Members", why: "timeout action" },
];

// Channel-level perms that matter where the bot actually works.
const LOG_CHANNEL_PERMS: Perm[] = SERVER_PERMS.filter((p) =>
  [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
  ].includes(p.flag)
);
const HONEYPOT_CHANNEL_PERMS: Perm[] = SERVER_PERMS.filter((p) =>
  [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.ManageMessages,
    PermissionFlagsBits.ReadMessageHistory,
  ].includes(p.flag)
);

const MAX_LISTED = 15;

export const data = new SlashCommandBuilder()
  .setName("diagnose")
  .setDescription("Check whether the bot has the permissions it needs")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addBooleanOption((o) =>
    o
      .setName("visible")
      .setDescription("Post for other admins to see (default: only you; reveals honeypot channels)")
  );

export async function execute(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({
      content: "This command can only be used in a server.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const me = guild.members.me ?? (await guild.members.fetchMe());
  const guildId = guild.id;

  // ── server-wide permissions ──
  const serverLines = SERVER_PERMS.map((p) =>
    me.permissions.has(p.flag) ? `✅ ${p.name}` : `❌ ${p.name} — ${p.why}`
  );
  const serverOk = SERVER_PERMS.every((p) => me.permissions.has(p.flag));

  // ── log channel ──
  const settings = await guildSettingsService.get(guildId);
  const { text: logText, ok: logOk } = checkLogChannel(guild, me, settings?.logChannelId ?? null);

  // ── honeypot channels ──
  const honeypots = await honeypotChannelService.list(guildId);
  const { text: hpText, ok: hpOk } = checkHoneypots(guild, me, honeypots.map((h) => h.channel.channelId));

  // ── role hierarchy (governs ban/kick/timeout, even with Administrator) ──
  const hierarchyText = checkHierarchy(guild, me);

  const allOk = serverOk && logOk && hpOk;
  const embed = new EmbedBuilder()
    .setTitle(allOk ? "🩺 Diagnostics — all good" : "🩺 Diagnostics — issues found")
    .setColor(allOk ? 0x57f287 : 0xed4245)
    .addFields(
      { name: "Server permissions", value: serverLines.join("\n") },
      { name: "Log channel", value: logText },
      { name: "Honeypot channels", value: hpText },
      { name: "Role hierarchy", value: hierarchyText }
    )
    .setFooter({
      text: "The bot is online, so its gateway intents are already enabled.",
    });

  const visible = interaction.options.getBoolean("visible") ?? false;
  await interaction.reply({
    embeds: [embed],
    flags: visible ? undefined : MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}

/**
 * The bot can only ban/kick/timeout members whose highest role is *below* its
 * own. List any roles above the bot so the admin can see who's out of reach.
 */
function checkHierarchy(guild: Guild, me: GuildMember): string {
  const botTop = me.roles.highest;
  const above = [...guild.roles.cache.values()]
    .filter((role) => role.comparePositionTo(botTop) > 0)
    .sort((a, b) => b.position - a.position);

  if (above.length === 0) {
    return `✅ Bot's top role (${botTop}) is above all others — it can action any non-owner member.`;
  }

  const shown = above.slice(0, MAX_LISTED).map((role) => `<@&${role.id}>`).join(", ");
  const more = above.length > MAX_LISTED ? ` …and ${above.length - MAX_LISTED} more` : "";
  return (
    `⚠️ ${above.length} role(s) sit above the bot's top role (${botTop}). ` +
    `Members whose highest role is one of these can't be banned/kicked/timed out — ` +
    `move the bot's role higher to cover them: ${shown}${more}`
  );
}

function checkLogChannel(
  guild: Guild,
  me: GuildMember,
  logChannelId: string | null
): { text: string; ok: boolean } {
  if (!logChannelId) {
    return { text: "⚠️ Not configured — hits won't be logged (set with `/config logchannel`).", ok: true };
  }

  const channel = guild.channels.cache.get(logChannelId);
  if (!channel) {
    return { text: `❌ <#${logChannelId}> is set but I can't see it (deleted or no access).`, ok: false };
  }

  const missing = missingNames(channel, me, LOG_CHANNEL_PERMS);
  return missing.length === 0
    ? { text: `✅ <#${logChannelId}> — can post here.`, ok: true }
    : { text: `❌ <#${logChannelId}> — missing: ${missing.join(", ")}`, ok: false };
}

function checkHoneypots(
  guild: Guild,
  me: GuildMember,
  channelIds: string[]
): { text: string; ok: boolean } {
  if (channelIds.length === 0) {
    return { text: "None configured yet (add with `/honeypot add`).", ok: true };
  }

  const problems: string[] = [];
  for (const id of channelIds) {
    const channel = guild.channels.cache.get(id);
    if (!channel) {
      problems.push(`❌ <#${id}> — channel missing (deleted?)`);
      continue;
    }
    const missing = missingNames(channel, me, HONEYPOT_CHANNEL_PERMS);
    if (missing.length > 0) problems.push(`❌ <#${id}> — missing: ${missing.join(", ")}`);
  }

  if (problems.length === 0) {
    return { text: `✅ All ${channelIds.length} can be moderated.`, ok: true };
  }

  const shown = problems.slice(0, MAX_LISTED).join("\n");
  const more = problems.length > MAX_LISTED ? `\n…and ${problems.length - MAX_LISTED} more` : "";
  return { text: shown + more, ok: false };
}

/** Names of the given perms the bot lacks in a specific channel. */
function missingNames(
  channel: GuildBasedChannel,
  me: GuildMember,
  perms: Perm[]
): string[] {
  const here = channel.permissionsFor(me);
  return perms.filter((p) => !here?.has(p.flag)).map((p) => p.name);
}
