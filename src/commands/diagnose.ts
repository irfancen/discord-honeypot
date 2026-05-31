import {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildMember,
} from "discord.js";
import { guildSettingsService } from "../services/guildSettingsService.js";
import { honeypotChannelService } from "../services/honeypotChannelService.js";
import { diagnosticsService } from "../services/diagnosticsService.js";

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
  const statuses = diagnosticsService.serverPermStatuses(me.permissions);
  const serverLines = statuses.map((s) =>
    s.ok ? `✅ ${s.name}` : `❌ ${s.name} — ${s.why}`
  );
  const serverOk = statuses.every((s) => s.ok);

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

function checkHierarchy(guild: Guild, me: GuildMember): string {
  const above = diagnosticsService.rolesAboveBot(
    me.roles.highest.position,
    [...guild.roles.cache.values()].map((r) => ({ id: r.id, position: r.position }))
  );

  if (above.length === 0) {
    return `✅ Bot's top role (${me.roles.highest}) is above all others — it can action any non-owner member.`;
  }

  const shown = above.slice(0, MAX_LISTED).map((r) => `<@&${r.id}>`).join(", ");
  const more = above.length > MAX_LISTED ? ` …and ${above.length - MAX_LISTED} more` : "";
  return (
    `⚠️ ${above.length} role(s) sit above the bot's top role (${me.roles.highest}). ` +
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

  const missing = diagnosticsService.missingLogChannelPerms(channel.permissionsFor(me));
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
    const missing = diagnosticsService.missingHoneypotChannelPerms(channel.permissionsFor(me));
    if (missing.length > 0) problems.push(`❌ <#${id}> — missing: ${missing.join(", ")}`);
  }

  if (problems.length === 0) {
    return { text: `✅ All ${channelIds.length} can be moderated.`, ok: true };
  }

  const shown = problems.slice(0, MAX_LISTED).join("\n");
  const more = problems.length > MAX_LISTED ? `\n…and ${problems.length - MAX_LISTED} more` : "";
  return { text: shown + more, ok: false };
}
