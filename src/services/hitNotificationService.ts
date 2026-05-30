import {
  Colors,
  EmbedBuilder,
  escapeMarkdown,
  type Client,
  type SendableChannels,
} from "discord.js";
import type { Action, HoneypotHit } from "../types/honeypot.js";
import { guildSettingsRepository } from "../database/repositories/guildSettingsRepository.js";

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

export const hitNotificationService = {
  /**
   * Post a honeypot-hit notification to the guild's configured log channel.
   *
   * Best-effort and self-contained: if no log channel is configured, the
   * channel is gone, or the bot lacks permission to post, it logs a warning and
   * returns rather than throwing — a logging failure must never abort the
   * moderation action that triggered it.
   *
   * `attachmentNames` are display-only (filenames captured before the message
   * was deleted); they aren't persisted on the hit, since attachment URLs die
   * with the message anyway.
   */
  async postHit(
    client: Client,
    hit: HoneypotHit,
    attachmentNames: string[] = []
  ): Promise<void> {
    const guildSettings = await guildSettingsRepository.find(hit.guildId);
    if (!guildSettings?.logChannelId) return;

    const channel = await resolveSendableChannel(client, guildSettings.logChannelId);
    if (!channel) {
      console.warn(
        `[hitNotification] Log channel ${guildSettings.logChannelId} for guild ${hit.guildId} is missing or not sendable; skipping.`
      );
      return;
    }

    try {
      await channel.send({
        embeds: [buildHitEmbed(hit, attachmentNames)],
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      console.warn(
        `[hitNotification] Failed to post hit ${hit.id} to channel ${guildSettings.logChannelId}:`,
        error
      );
    }
  },
};

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

  if (attachmentNames.length > 0) {
    embed.addFields({
      name: `Attachments (${attachmentNames.length})`,
      value: formatAttachments(attachmentNames),
    });
  }

  return embed;
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
