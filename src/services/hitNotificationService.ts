import {
  Colors,
  EmbedBuilder,
  escapeMarkdown,
  type Client,
  type SendableChannels,
} from "discord.js";
import type { Action, HoneypotHit } from "../types/honeypot.js";
import { guildSettingsRepository } from "../database/repositories/guildSettingsRepository.js";
import { prettify } from "../utils/format.js";
import { createLogger } from "../lib/logger.js";

const log = createLogger("hitNotification");

const ACTION_LABEL: Record<Action, string> = {
  ban: "Banned",
  timeout: "Timed out",
  kick: "Kicked",
};

const ACTION_COLOR: Record<Action, number> = {
  ban: Colors.Red,
  timeout: Colors.Orange,
  kick: Colors.DarkOrange,
};

// Discord caps an embed field value at 1024 chars.
const MAX_CONTENT_LENGTH = 1000;

/** A honeypot trigger the bot could not action (hierarchy / ownership / perms). */
export interface ActionFailure {
  guildId: string;
  userId: string;
  channelId: string;
  attemptedAction: Action;
  messageContent: string | null;
}

export const hitNotificationService = {
  /**
   * Post a honeypot-hit notification to the guild's configured log channel.
   * `attachmentNames` are display-only (captured before the message was deleted).
   */
  async postHit(
    client: Client,
    hit: HoneypotHit,
    attachmentNames: string[] = []
  ): Promise<void> {
    await sendToLogChannel(client, hit.guildId, buildHitEmbed(hit, attachmentNames));
  },

  /** Alert the log channel that a honeypot fired but the bot couldn't action the user. */
  async postActionFailed(
    client: Client,
    failure: ActionFailure,
    attachmentNames: string[] = []
  ): Promise<void> {
    await sendToLogChannel(
      client,
      failure.guildId,
      buildFailureEmbed(failure, attachmentNames)
    );
  },
};

/** Resolve the guild's log channel and post an embed; logs and skips on failure. */
async function sendToLogChannel(
  client: Client,
  guildId: string,
  embed: EmbedBuilder
): Promise<void> {
  const guildSettings = await guildSettingsRepository.find(guildId);
  if (!guildSettings?.logChannelId) return;

  const channel = await resolveSendableChannel(client, guildSettings.logChannelId);
  if (!channel) {
    log.warn(
      { logChannelId: guildSettings.logChannelId, guildId },
      "Log channel is missing or not sendable; skipping."
    );
    return;
  }

  try {
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
  } catch (error) {
    log.warn(
      { err: error, logChannelId: guildSettings.logChannelId, guildId },
      "Failed to post to log channel."
    );
  }
}

function buildHitEmbed(hit: HoneypotHit, attachmentNames: string[]): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(ACTION_COLOR[hit.actionTaken])
    .setTitle("🍯 Honeypot triggered")
    .addFields(
      { name: "User", value: `<@${hit.userId}> (\`${hit.userId}\`)` },
      { name: "Channel", value: `<#${hit.channelId}>`, inline: true },
      { name: "Action", value: ACTION_LABEL[hit.actionTaken], inline: true },
      { name: "Message", value: formatContent(hit.messageContent) }
    )
    .setFooter({ text: `Hit ID: ${hit.id}` })
    .setTimestamp(hit.hitAt);

  addAttachments(embed, attachmentNames);
  return embed;
}

function buildFailureEmbed(
  failure: ActionFailure,
  attachmentNames: string[]
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(Colors.Yellow)
    .setTitle("⚠️ Honeypot triggered — could not action")
    .setDescription(
      "The message was deleted, but the bot couldn't action this user — they " +
        "outrank it, are the server owner, or it lacks permission. **Manual " +
        "review needed.**"
    )
    .addFields(
      { name: "User", value: `<@${failure.userId}> (\`${failure.userId}\`)` },
      { name: "Channel", value: `<#${failure.channelId}>`, inline: true },
      { name: "Attempted action", value: prettify(failure.attemptedAction), inline: true },
      { name: "Message", value: formatContent(failure.messageContent) }
    )
    .setTimestamp(new Date());

  addAttachments(embed, attachmentNames);
  return embed;
}

function addAttachments(embed: EmbedBuilder, attachmentNames: string[]): void {
  if (attachmentNames.length > 0) {
    embed.addFields({
      name: `Attachments (${attachmentNames.length})`,
      value: formatAttachments(attachmentNames),
    });
  }
}

function formatContent(raw: string | null): string {
  const text = raw?.trim();
  if (!text) return "*(no content)*";

  return truncate(escapeMarkdown(text, { maskedLink: true }), MAX_CONTENT_LENGTH);
}

function formatAttachments(names: string[]): string {
  const list = names.map((name) => `📎 ${escapeMarkdown(name)}`).join("\n");
  return truncate(list, MAX_CONTENT_LENGTH);
}

/**
 * Fetch a channel by ID and confirm the bot can post to it. Returns null for
 * any failure (unknown channel, no access, non-sendable type) so the caller can
 * degrade gracefully.
 */
async function resolveSendableChannel(
  client: Client,
  channelId: string
): Promise<SendableChannels | null> {
  try {
    const channel = await client.channels.fetch(channelId);
    return channel?.isSendable() ? channel : null;
  } catch {
    return null;
  }
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
