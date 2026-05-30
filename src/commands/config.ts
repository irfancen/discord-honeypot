import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import {
  DELETE_PRESETS,
  HARDCODED_DEFAULTS,
  TIMEOUT_PRESETS,
  type DeletePreset,
  type GuildSettings,
  type TimeoutPreset,
} from "../types/honeypot.js";
import {
  guildSettingsService,
  type AffectedChannel,
  type DefaultsChange,
} from "../services/guildSettingsService.js";
import { pendingDefaults, buildCustomId } from "../services/pendingDefaults.js";
import { parseAction } from "../utils/validation.js";
import { formatRoleList, humanizeSeconds, prettify } from "../utils/format.js";
import {
  NONE,
  SET,
  BYPASS_HELP,
  readChoice,
  parseRoleMentions,
  presetChoices,
  inheritChoice,
} from "../lib/commandOptions.js";

// Show at most this many affected channels in the confirmation before summarizing.
const MAX_SHOWN_CHANNELS = 20;

export const data = new SlashCommandBuilder()
  .setName("config")
  .setDescription("Configure server-wide honeypot settings")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName("show")
      .setDescription("Show the current server configuration")
      .addBooleanOption((o) =>
        o
          .setName("visible")
          .setDescription("Post for other admins to see (default: only you)")
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("logchannel")
      .setDescription("Set or clear the channel where honeypot hits are logged")
      .addChannelOption((o) =>
        o
          .setName("channel")
          .setDescription("Channel to log hits to (leave empty to disable logging)")
          .addChannelTypes(ChannelType.GuildText)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("defaults")
      .setDescription("Set server-wide default settings for honeypot channels")
      .addStringOption((o) =>
        o
          .setName("action")
          .setDescription("Default action when someone posts in a honeypot")
          .addChoices(
            { name: "Ban", value: "ban" },
            { name: "Timeout", value: "timeout" },
            { name: "Kick", value: "kick" },
            inheritChoice()
          )
      )
      .addStringOption((o) =>
        o
          .setName("delete_messages")
          .setDescription("Default amount of recent message history to delete")
          .addChoices(...presetChoices(DELETE_PRESETS), inheritChoice())
      )
      .addStringOption((o) =>
        o
          .setName("timeout_duration")
          .setDescription("Default timeout length (when action is Timeout)")
          .addChoices(...presetChoices(TIMEOUT_PRESETS), inheritChoice())
      )
      .addStringOption((o) =>
        o
          .setName("exempt_admins")
          .setDescription("Spare members with Administrator permission by default")
          .addChoices(
            { name: "Yes", value: "true" },
            { name: "No", value: "false" },
            inheritChoice()
          )
      )
      .addStringOption((o) =>
        o
          .setName("bypass_roles")
          .setDescription("Default bypass roles")
          .addChoices(
            { name: "None (clear)", value: NONE },
            { name: "Set to roles below", value: SET }
          )
      )
      .addStringOption((o) =>
        o
          .setName("roles")
          .setDescription("@mention default bypass roles (used with bypass_roles: Set)")
      )
  );

export async function execute(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!interaction.inGuild()) {
    await reply(interaction, "This command can only be used in a server.");
    return;
  }

  const guildId = interaction.guildId;
  switch (interaction.options.getSubcommand()) {
    case "show":
      return handleShow(interaction, guildId);
    case "logchannel":
      return handleLogChannel(interaction, guildId);
    case "defaults":
      return handleDefaults(interaction, guildId);
  }
}

async function handleShow(
  interaction: ChatInputCommandInteraction,
  guildId: string
): Promise<void> {
  const settings = await guildSettingsService.get(guildId);

  const embed = new EmbedBuilder()
    .setTitle("⚙️ Server configuration")
    .setColor(0x5865f2)
    .addFields(
      { name: "Log channel", value: formatLogChannel(settings) },
      { name: "Default settings", value: formatDefaults(settings) }
    );

  const visible = interaction.options.getBoolean("visible") ?? false;
  await interaction.reply({
    embeds: [embed],
    flags: visible ? undefined : MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}

async function handleLogChannel(
  interaction: ChatInputCommandInteraction,
  guildId: string
): Promise<void> {
  const channel = interaction.options.getChannel("channel");
  await guildSettingsService.setLogChannel(guildId, channel?.id ?? null);

  await reply(
    interaction,
    channel
      ? `Honeypot hits will be logged to <#${channel.id}>.`
      : "Hit logging disabled (no log channel set)."
  );
}

async function handleDefaults(
  interaction: ChatInputCommandInteraction,
  guildId: string
): Promise<void> {
  const change = readDefaultsChange(interaction);
  if (change === "invalid_bypass") {
    await reply(interaction, BYPASS_HELP);
    return;
  }
  if (isEmptyChange(change)) {
    await reply(interaction, "Specify at least one default to change.");
    return;
  }

  const affected = await guildSettingsService.computeImpact(guildId, change);

  // No channel's behavior changes → apply straight away, no confirmation.
  if (affected.length === 0) {
    await guildSettingsService.applyDefaults(guildId, change);
    await reply(interaction, `✅ Updated server defaults.\n\n${formatChange(change)}`);
    return;
  }

  const id = pendingDefaults.stage({
    guildId,
    userId: interaction.user.id,
    change,
  });

  await interaction.reply({
    content: confirmationMessage(change, affected),
    components: [confirmationButtons(id)],
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}

// ── option parsing ─────────────────────────────────────────────────

function readDefaultsChange(
  interaction: ChatInputCommandInteraction
): DefaultsChange | "invalid_bypass" {
  const bypassRoleIds = readGuildBypass(interaction);
  if (bypassRoleIds === "invalid") return "invalid_bypass";

  return {
    action: readChoice(interaction, "action", parseAction),
    deleteMessageSeconds: readChoice(
      interaction,
      "delete_messages",
      (v) => DELETE_PRESETS[v as DeletePreset]
    ),
    timeoutSeconds: readChoice(
      interaction,
      "timeout_duration",
      (v) => TIMEOUT_PRESETS[v as TimeoutPreset]
    ),
    exemptAdmins: readChoice(interaction, "exempt_admins", (v) => v === "true"),
    bypassRoleIds,
  };
}

/**
 * Guild bypass roles: `None` → clear ([]), `Set` (or roles supplied) → parse the
 * mentions ("invalid" if none parse), omitted → undefined (leave unchanged).
 * There is no `Inherit` at the guild level.
 */
function readGuildBypass(
  interaction: ChatInputCommandInteraction
): string[] | undefined | "invalid" {
  const mode = interaction.options.getString("bypass_roles");
  const rolesRaw = interaction.options.getString("roles");

  if (mode === NONE) return [];
  if (mode === SET || rolesRaw !== null) {
    const roleIds = rolesRaw ? parseRoleMentions(rolesRaw) : [];
    return roleIds.length > 0 ? roleIds : "invalid";
  }
  return undefined;
}

function isEmptyChange(change: DefaultsChange): boolean {
  return (
    change.action === undefined &&
    change.deleteMessageSeconds === undefined &&
    change.timeoutSeconds === undefined &&
    change.exemptAdmins === undefined &&
    change.bypassRoleIds === undefined
  );
}

// ── display ────────────────────────────────────────────────────────

function formatLogChannel(settings: GuildSettings | null): string {
  return settings?.logChannelId
    ? `<#${settings.logChannelId}>`
    : "None — logging disabled";
}

function formatDefaults(settings: GuildSettings | null): string {
  const bypassRoleIds = settings?.defaultBypassRoleIds ?? [];
  return [
    `• **Action:** ${shownDefault(settings?.defaultAction ?? null, HARDCODED_DEFAULTS.action, prettify)}`,
    `• **Delete history:** ${shownDefault(settings?.defaultDeleteMessageSeconds ?? null, HARDCODED_DEFAULTS.deleteMessageSeconds, humanizeSeconds)}`,
    `• **Timeout duration:** ${shownDefault(settings?.defaultTimeoutSeconds ?? null, HARDCODED_DEFAULTS.timeoutSeconds, humanizeSeconds)}`,
    `• **Exempt admins:** ${shownDefault(settings?.defaultExemptAdmins ?? null, HARDCODED_DEFAULTS.exemptAdmins, yesNo)}`,
    // Guild bypass has no level above it but the hardcoded empty list, so an
    // empty list is simply "None" rather than a built-in fallback.
    `• **Bypass roles:** ${formatRoleList(bypassRoleIds)}`,
  ].join("\n");
}

/** Show an explicit guild default, or the hardcoded baseline tagged as such. */
function shownDefault<T>(
  value: T | null,
  hardcoded: T,
  format: (v: T) => string
): string {
  return value === null
    ? `${format(hardcoded)} _(built-in default)_`
    : format(value);
}

/** Describe the requested change (only the fields being set). */
function formatChange(change: DefaultsChange): string {
  const lines: string[] = [];
  const inherit = "Inherit _(built-in default)_";
  if (change.action !== undefined) {
    lines.push(`• **Action** → ${change.action === null ? inherit : prettify(change.action)}`);
  }
  if (change.deleteMessageSeconds !== undefined) {
    lines.push(`• **Delete history** → ${change.deleteMessageSeconds === null ? inherit : humanizeSeconds(change.deleteMessageSeconds)}`);
  }
  if (change.timeoutSeconds !== undefined) {
    lines.push(`• **Timeout duration** → ${change.timeoutSeconds === null ? inherit : humanizeSeconds(change.timeoutSeconds)}`);
  }
  if (change.exemptAdmins !== undefined) {
    lines.push(`• **Exempt admins** → ${change.exemptAdmins === null ? inherit : yesNo(change.exemptAdmins)}`);
  }
  if (change.bypassRoleIds !== undefined) {
    lines.push(`• **Bypass roles** → ${formatRoleList(change.bypassRoleIds)}`);
  }
  return lines.join("\n");
}

function confirmationMessage(
  change: DefaultsChange,
  affected: AffectedChannel[]
): string {
  const shown = affected
    .slice(0, MAX_SHOWN_CHANNELS)
    .map((a) => `<#${a.channel.channelId}>`)
    .join(", ");
  const more =
    affected.length > MAX_SHOWN_CHANNELS
      ? ` …and ${affected.length - MAX_SHOWN_CHANNELS} more`
      : "";

  return [
    `⚠️ This affects **${affected.length}** honeypot channel(s) that currently inherit these settings:`,
    shown + more,
    "",
    "**New defaults:**",
    formatChange(change),
    "",
    "**Adopt new default** — those channels switch to the new value(s).",
    "**Keep current values** — freeze their current values so they don't change.",
    "**Cancel** — make no changes.",
  ].join("\n");
}

function confirmationButtons(id: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildCustomId(id, "adopt"))
      .setLabel("Adopt new default")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(buildCustomId(id, "keep"))
      .setLabel("Keep current values")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(buildCustomId(id, "cancel"))
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Danger)
  );
}

function yesNo(value: boolean): string {
  return value ? "Yes" : "No";
}

function reply(
  interaction: ChatInputCommandInteraction,
  content: string
): Promise<unknown> {
  return interaction.reply({
    content,
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}
