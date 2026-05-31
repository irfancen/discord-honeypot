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
  type HoneypotHit,
  type ResolvedChannelSettings,
  type SettingSource,
  type TimeoutPreset,
} from "../types/honeypot.js";
import { parseAction } from "../utils/validation.js";
import { formatRoleList, humanizeSeconds, prettify } from "../utils/format.js";
import {
  INHERIT,
  NONE,
  SET,
  BYPASS_HELP,
  readChoice,
  parseRoleMentions,
  presetChoices,
  inheritChoice,
} from "../lib/commandOptions.js";
import {
  honeypotChannelService,
  type BypassRolesUpdate,
  type HoneypotOverrides,
} from "../services/honeypotChannelService.js";
import { honeypotHitService } from "../services/honeypotHitService.js";

// How many recent hits /honeypot hits shows.
const HITS_LIMIT = 10;

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
      .addBooleanOption((o) =>
        o
          .setName("visible")
          .setDescription("Post for other admins to see (default: only you; reveals honeypot channels)")
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("hits")
      .setDescription("Show recent honeypot hits")
      .addBooleanOption((o) =>
        o
          .setName("visible")
          .setDescription("Post for other admins to see (default: only you; reveals honeypot channels)")
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("stats")
      .setDescription("Show honeypot activity stats (totals, top offenders, top channels)")
      .addBooleanOption((o) =>
        o
          .setName("visible")
          .setDescription("Post for other admins to see (default: only you; reveals honeypot channels)")
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
    case "add":
      return handleAdd(interaction, guildId);
    case "remove":
      return handleRemove(interaction, guildId);
    case "config":
      return handleConfig(interaction, guildId);
    case "list":
      return handleList(interaction, guildId);
    case "hits":
      return handleHits(interaction, guildId);
    case "stats":
      return handleStats(interaction, guildId);
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

  await replyEmbed(interaction, embed);
}

async function handleHits(
  interaction: ChatInputCommandInteraction,
  guildId: string
): Promise<void> {
  const { hits, total } = await honeypotHitService.getHits(guildId, HITS_LIMIT);

  if (hits.length === 0) {
    await reply(interaction, "No honeypot hits recorded yet.");
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("🍯 Recent honeypot hits")
    .setColor(0xf1c40f)
    .setDescription(hits.map(formatHit).join("\n"))
    .setFooter({
      text: `${total} total hit(s) in this server${
        hits.length < total ? ` · showing the latest ${hits.length}` : ""
      }`,
    });

  await replyEmbed(interaction, embed);
}

async function handleStats(
  interaction: ChatInputCommandInteraction,
  guildId: string
): Promise<void> {
  const stats = await honeypotHitService.getStats(guildId);

  if (stats.total === 0) {
    await reply(interaction, "No honeypot hits recorded yet.");
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("📊 Honeypot stats")
    .setColor(0xf1c40f)
    .addFields(
      {
        name: "Total",
        value: `${stats.total} hit(s) · ${stats.recent} in the last 7 days`,
      },
      {
        name: "By action",
        value: `🔨 Ban ${stats.byAction.ban} · ⏱️ Timeout ${stats.byAction.timeout} · 👢 Kick ${stats.byAction.kick}`,
      },
      {
        name: "Top offenders",
        value: formatRanked(stats.topUsers.map((u) => ({ mention: `<@${u.userId}>`, count: u.count }))),
      },
      {
        name: "Most-triggered honeypots",
        value: formatRanked(stats.topChannels.map((c) => ({ mention: `<#${c.channelId}>`, count: c.count }))),
      }
    );

  await replyEmbed(interaction, embed);
}

/** One line per hit: relative time · user · channel · action. */
function formatHit(hit: HoneypotHit): string {
  const when = `<t:${Math.floor(hit.hitAt.getTime() / 1000)}:R>`;
  return `${when} — <@${hit.userId}> in <#${hit.channelId}> — **${prettify(hit.actionTaken)}**`;
}

/** Numbered "1. <mention> — N" list. */
function formatRanked(entries: { mention: string; count: number }[]): string {
  return entries
    .map((e, i) => `${i + 1}. ${e.mention} — ${e.count}`)
    .join("\n");
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

/** Reply with an embed, honoring the `visible` option (default ephemeral). */
function replyEmbed(
  interaction: ChatInputCommandInteraction,
  embed: EmbedBuilder
): Promise<unknown> {
  const visible = interaction.options.getBoolean("visible") ?? false;
  return interaction.reply({
    embeds: [embed],
    flags: visible ? undefined : MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}
