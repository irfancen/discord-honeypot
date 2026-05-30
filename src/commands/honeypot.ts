import {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type SlashCommandSubcommandBuilder,
} from "discord.js";
import {
  DELETE_PRESETS,
  TIMEOUT_PRESETS,
  type DeletePreset,
  type ResolvedChannelSettings,
  type SettingSource,
  type TimeoutPreset,
} from "../types/honeypot.js";
import { parseAction } from "../utils/validation.js";
import { formatRoleList, humanizeSeconds, prettify } from "../utils/format.js";
import {
  honeypotChannelService,
  type BypassRolesUpdate,
  type HoneypotOverrides,
} from "../services/honeypotChannelService.js";

// The choice value that maps a setting back to NULL (inherit the next level).
const INHERIT = "inherit";
// bypass_roles dropdown values.
const NONE = "none";
const SET = "set";

const BYPASS_HELP =
  "To set bypass roles, choose `Set to roles below` and `@`-mention at least " +
  "one role in the `roles` option.";

export const data = new SlashCommandBuilder()
  .setName("honeypot")
  .setDescription("Manage honeypot channels")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    withSettingOptions(
      sub
        .setName("add")
        .setDescription("Register a channel as a honeypot")
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("The channel to use as a honeypot")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setDescription("Unregister a honeypot channel")
      .addChannelOption((o) =>
        o
          .setName("channel")
          .setDescription("The honeypot channel to remove")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    withSettingOptions(
      sub
        .setName("config")
        .setDescription("Change a honeypot channel's settings")
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("The honeypot channel to configure")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
  )
  .addSubcommand((sub) =>
    sub
      .setName("list")
      .setDescription("List all honeypot channels and their resolved settings")
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
    case "add":
      return handleAdd(interaction, guildId);
    case "remove":
      return handleRemove(interaction, guildId);
    case "config":
      return handleConfig(interaction, guildId);
    case "list":
      return handleList(interaction, guildId);
  }
}

async function handleAdd(
  interaction: ChatInputCommandInteraction,
  guildId: string
): Promise<void> {
  const channel = interaction.options.getChannel("channel", true);

  const bypass = readBypassRoles(interaction);
  if (bypass === "invalid") {
    await reply(interaction, BYPASS_HELP);
    return;
  }

  const resolved = await honeypotChannelService.add(
    guildId,
    channel.id,
    interaction.user.id,
    readOverrides(interaction),
    bypass
  );

  if (!resolved) {
    await reply(
      interaction,
      `<#${channel.id}> is already a honeypot. Use \`/honeypot config\` to change its settings.`
    );
    return;
  }

  await reply(
    interaction,
    `🍯 Added <#${channel.id}> as a honeypot.\n\n${formatResolved(resolved)}`
  );
}

async function handleRemove(
  interaction: ChatInputCommandInteraction,
  guildId: string
): Promise<void> {
  const channel = interaction.options.getChannel("channel", true);
  const removed = await honeypotChannelService.remove(guildId, channel.id);
  await reply(
    interaction,
    removed
      ? `Removed <#${channel.id}> as a honeypot.`
      : `<#${channel.id}> isn't a honeypot.`
  );
}

async function handleConfig(
  interaction: ChatInputCommandInteraction,
  guildId: string
): Promise<void> {
  const channel = interaction.options.getChannel("channel", true);

  const bypass = readBypassRoles(interaction);
  if (bypass === "invalid") {
    await reply(interaction, BYPASS_HELP);
    return;
  }

  const resolved = await honeypotChannelService.configure(
    guildId,
    channel.id,
    readOverrides(interaction),
    bypass
  );

  if (!resolved) {
    await reply(
      interaction,
      `<#${channel.id}> isn't a honeypot. Add it with \`/honeypot add\` first.`
    );
    return;
  }

  await reply(
    interaction,
    `Updated <#${channel.id}>.\n\n${formatResolved(resolved)}`
  );
}

async function handleList(
  interaction: ChatInputCommandInteraction,
  guildId: string
): Promise<void> {
  const items = await honeypotChannelService.list(guildId);

  if (items.length === 0) {
    await reply(
      interaction,
      "No honeypot channels configured. Add one with `/honeypot add`."
    );
    return;
  }

  const description = items
    .map(({ channel, resolved }) => `**<#${channel.channelId}>**\n${formatResolved(resolved)}`)
    .join("\n\n");

  const embed = new EmbedBuilder()
    .setTitle("🍯 Honeypot channels")
    .setColor(0xf1c40f)
    .setDescription(description.slice(0, 4096));

  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}

// ── option building ────────────────────────────────────────────────

/** Adds the four shared setting options (each with an Inherit choice). */
function withSettingOptions(
  sub: SlashCommandSubcommandBuilder
): SlashCommandSubcommandBuilder {
  return sub
    .addStringOption((o) =>
      o
        .setName("action")
        .setDescription("What to do when someone posts here")
        .addChoices(
          { name: "Ban", value: "ban" },
          { name: "Timeout", value: "timeout" },
          { name: "Kick", value: "kick" },
          { name: "Inherit (guild default)", value: INHERIT }
        )
    )
    .addStringOption((o) =>
      o
        .setName("delete_messages")
        .setDescription("How much of the user's recent message history to delete")
        .addChoices(...presetChoices(DELETE_PRESETS), inheritChoice())
    )
    .addStringOption((o) =>
      o
        .setName("timeout_duration")
        .setDescription("Timeout length (only applies when action is Timeout)")
        .addChoices(...presetChoices(TIMEOUT_PRESETS), inheritChoice())
    )
    .addStringOption((o) =>
      o
        .setName("exempt_admins")
        .setDescription("Spare members with the Administrator permission")
        .addChoices(
          { name: "Yes", value: "true" },
          { name: "No", value: "false" },
          inheritChoice()
        )
    )
    .addStringOption((o) =>
      o
        .setName("bypass_roles")
        .setDescription("Roles that bypass this honeypot")
        .addChoices(
          { name: "Inherit (guild default)", value: INHERIT },
          { name: "None (clear)", value: NONE },
          { name: "Set to roles below", value: SET }
        )
    )
    .addStringOption((o) =>
      o
        .setName("roles")
        .setDescription("@mention the bypass roles (used with bypass_roles: Set to roles below)")
    );
}

function presetChoices(
  presets: Record<string, number>
): { name: string; value: string }[] {
  return Object.keys(presets).map((key) => ({ name: prettify(key), value: key }));
}

function inheritChoice(): { name: string; value: string } {
  return { name: "Inherit (guild default)", value: INHERIT };
}

// ── option parsing ─────────────────────────────────────────────────

function readOverrides(
  interaction: ChatInputCommandInteraction
): HoneypotOverrides {
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
  };
}

/**
 * Translate a setting option into the three-state override convention:
 * absent → undefined (leave unchanged), "inherit" → null (clear), else the
 * transformed value.
 */
function readChoice<T>(
  interaction: ChatInputCommandInteraction,
  name: string,
  transform: (value: string) => T
): T | null | undefined {
  const raw = interaction.options.getString(name);
  if (raw === null) return undefined;
  if (raw === INHERIT) return null;
  return transform(raw);
}

/**
 * Build the bypass-roles intent from the `bypass_roles` dropdown and the
 * `roles` text. The dropdown drives it; the `roles` mentions are only read for
 * the "Set" case. Returns undefined when nothing was provided (leave unchanged)
 * and "invalid" when "Set" was chosen without any parseable role mention.
 */
function readBypassRoles(
  interaction: ChatInputCommandInteraction
): BypassRolesUpdate | undefined | "invalid" {
  const mode = interaction.options.getString("bypass_roles");
  const rolesRaw = interaction.options.getString("roles");

  if (mode === INHERIT) return { kind: "inherit" };
  if (mode === NONE) return { kind: "set", roleIds: [] };

  // "Set" chosen, or roles supplied without picking the dropdown — treat as set.
  if (mode === SET || rolesRaw !== null) {
    const roleIds = rolesRaw ? parseRoleMentions(rolesRaw) : [];
    return roleIds.length > 0 ? { kind: "set", roleIds } : "invalid";
  }

  return undefined; // nothing provided → leave unchanged
}

/** Extract unique role IDs from `<@&id>` mentions in free text. */
function parseRoleMentions(text: string): string[] {
  const ids = new Set<string>();
  const pattern = /<@&(\d+)>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const id = match[1];
    if (id) ids.add(id);
  }
  return [...ids];
}

// ── display ────────────────────────────────────────────────────────

function formatResolved(r: ResolvedChannelSettings): string {
  return [
    `• **Action:** ${describeAction(r)}`,
    `• **Delete history:** ${humanizeSeconds(r.deleteMessageSeconds)}${tag(r.source.deleteMessageSeconds)}`,
    `• **Exempt admins:** ${r.exemptAdmins ? "Yes" : "No"}${tag(r.source.exemptAdmins)}`,
    `• **Bypass roles:** ${formatRoleList(r.bypassRoleIds)}${tag(r.source.bypassRoleIds)}`,
  ].join("\n");
}

function describeAction(r: ResolvedChannelSettings): string {
  const action = r.action;
  if (action.kind === "timeout") {
    return `Timeout for ${humanizeSeconds(action.durationSeconds)}${tag(r.source.action)} _(duration ${sourceName(action.durationSource)})_`;
  }
  return `${prettify(action.kind)}${tag(r.source.action)}`;
}

/** A short parenthetical noting where an inherited value came from. */
function tag(source: SettingSource): string {
  return source === "channel" ? "" : ` _(${sourceName(source)})_`;
}

function sourceName(source: SettingSource): string {
  return source === "guild" ? "guild default" : source === "hardcoded" ? "built-in default" : "set here";
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
