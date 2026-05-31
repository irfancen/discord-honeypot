import {
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
  type Message,
} from "discord.js";
import {
  MAX_TIMEOUT_SECONDS,
  type Action,
  type ResolvedChannelSettings,
} from "../types/honeypot.js";

const BULK_DELETE_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;
const FETCH_PAGE_SIZE = 100;
const PURGE_CONCURRENCY = 10;
const PURGE_PERMS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.ManageMessages,
];
import { honeypotChannelRepository } from "../database/repositories/honeypotChannelRepository.js";
import { honeypotHitRepository } from "../database/repositories/honeypotHitRepository.js";
import { settingsService } from "./settingsService.js";
import { hitNotificationService } from "./hitNotificationService.js";
import { createLogger } from "../lib/logger.js";

const log = createLogger("honeypot");

export const honeypotService = {
  /**
   * Entry point for the honeypot trigger. Given a freshly-received message,
   * decide whether it landed in a honeypot, whether the author is exempt, and
   * if not: delete the message, action the author, record the hit, and notify
   * the log channel.
   */
  async handleMessage(message: Message): Promise<void> {
    if (!message.inGuild()) return; // ignore DMs
    if (message.author.bot || message.system) return; // ignore bots & system msgs

    const { guildId, channelId } = message;

    if (!(await honeypotChannelRepository.exists(guildId, channelId))) return;

    const resolved = await settingsService.resolveChannelSettings(guildId, channelId);

    const member = message.member ?? (await fetchMember(message));
    if (!member) {
      log.warn(
        { userId: message.author.id, guildId },
        "Could not resolve member; skipping."
      );
      return;
    }

    if (isExempt(member, resolved)) return;

    // Capture everything we want to report *before* the message is deleted.
    const messageContent = message.content.trim() ? message.content : null;
    const attachmentNames = [...message.attachments.values()].map((a) => a.name);

    await safeDeleteMessage(message);

    const reason = `Honeypot triggered in #${
      "name" in message.channel ? message.channel.name : channelId
    }`;
    const actioned = await executeAction(member, resolved, reason);
    if (!actioned) {
      // Alert the log channel when the action could not be performed.
      await hitNotificationService.postActionFailed(
        message.client,
        {
          guildId,
          userId: member.id,
          channelId,
          attemptedAction: resolved.action.kind,
          messageContent,
        },
        attachmentNames
      );
      return;
    }

    const hitId = await honeypotHitRepository.create({
      guildId,
      userId: member.id,
      channelId,
      messageContent,
      actionTaken: resolved.action.kind,
    });

    await hitNotificationService.postHit(
      message.client,
      {
        id: hitId,
        guildId,
        userId: member.id,
        channelId,
        messageContent,
        actionTaken: resolved.action.kind,
        hitAt: new Date(),
      },
      attachmentNames
    );

    if (resolved.action.kind !== "ban") {
      await purgeRecentMessages(member.guild, member.id, resolved.deleteMessageSeconds);
    }
  },
};

function isExempt(member: GuildMember, resolved: ResolvedChannelSettings): boolean {
  if (
    resolved.exemptAdmins &&
    member.permissions.has(PermissionFlagsBits.Administrator)
  ) {
    return true;
  }
  if (
    resolved.bypassRoleIds.length > 0 &&
    member.roles.cache.hasAny(...resolved.bypassRoleIds)
  ) {
    return true;
  }
  return false;
}

/** Execute the configured action. Returns false when the bot can't action the target. */
async function executeAction(
  member: GuildMember,
  resolved: ResolvedChannelSettings,
  reason: string
): Promise<boolean> {
  const action = resolved.action;
  try {
    switch (action.kind) {
      case "ban":
        if (!member.bannable) return logUnactionable(member, action.kind);
        await member.ban({
          deleteMessageSeconds: resolved.deleteMessageSeconds,
          reason,
        });
        return true;
      case "kick":
        if (!member.kickable) return logUnactionable(member, action.kind);
        await member.kick(reason);
        return true;
      case "timeout":
        if (!member.moderatable) return logUnactionable(member, action.kind);
        await member.timeout(
          Math.min(action.durationSeconds, MAX_TIMEOUT_SECONDS) * 1000,
          reason
        );
        return true;
    }
  } catch (error) {
    log.warn(
      { err: error, action: action.kind, userId: member.id, guildId: member.guild.id },
      "Failed to action member."
    );
    return false;
  }
}

function logUnactionable(member: GuildMember, action: Action): false {
  log.warn(
    { action, userId: member.id, guildId: member.guild.id },
    "Cannot action member (role hierarchy, ownership, or missing permission). Manual review needed."
  );
  return false;
}

async function fetchMember(message: Message<true>): Promise<GuildMember | null> {
  try {
    return await message.guild.members.fetch(message.author.id);
  } catch {
    return null;
  }
}

async function safeDeleteMessage(message: Message): Promise<void> {
  try {
    await message.delete();
  } catch (error) {
    log.warn({ err: error, messageId: message.id }, "Failed to delete message.");
  }
}

/**
 * Best-effort guild-wide purge of a user's recent messages, for actions that
 * lack ban's native deleteMessageSeconds (kick, timeout), scan each cached
 * text channel's most recent page and bulk-delete the matches within the window.
 */
async function purgeRecentMessages(
  guild: Guild,
  userId: string,
  seconds: number
): Promise<void> {
  if (seconds <= 0) return;

  const windowSeconds = Math.min(seconds, BULK_DELETE_MAX_AGE_SECONDS);
  const cutoff = Date.now() - windowSeconds * 1000;

  // Only channels the bot can actually read and delete in.
  const me = guild.members.me;
  const channels = [
    ...guild.channels.cache.filter((channel) => channel.isTextBased()).values(),
  ].filter(
    (channel) => me === null || channel.permissionsFor(me)?.has(PURGE_PERMS) === true
  );

  for (let i = 0; i < channels.length; i += PURGE_CONCURRENCY) {
    const batch = channels.slice(i, i + PURGE_CONCURRENCY);
    await Promise.all(
      batch.map(async (channel) => {
        try {
          const recent = await channel.messages.fetch({ limit: FETCH_PAGE_SIZE });
          const offenders = recent.filter(
            (m) => m.author.id === userId && m.createdTimestamp >= cutoff
          );
          if (offenders.size > 0) {
            await channel.bulkDelete(offenders, true);
          }
        } catch (error) {
          log.warn(
            { err: error, channelId: channel.id, guildId: guild.id },
            "Purge skipped channel."
          );
        }
      })
    );
  }
}
