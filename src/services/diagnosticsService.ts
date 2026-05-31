import { PermissionFlagsBits, type PermissionsBitField } from "discord.js";


export interface PermStatus {
  name: string;
  ok: boolean;
  why: string;
}

export interface RolePosition {
  id: string;
  position: number;
}

interface PermDef {
  flag: bigint;
  name: string;
  why: string;
}

const SERVER_PERMS: PermDef[] = [
  { flag: PermissionFlagsBits.ViewChannel, name: "View Channels", why: "see honeypot channels" },
  { flag: PermissionFlagsBits.SendMessages, name: "Send Messages", why: "post to the log channel" },
  { flag: PermissionFlagsBits.EmbedLinks, name: "Embed Links", why: "send hit-notification embeds" },
  { flag: PermissionFlagsBits.ManageMessages, name: "Manage Messages", why: "delete spam messages" },
  { flag: PermissionFlagsBits.ReadMessageHistory, name: "Read Message History", why: "purge recent spam" },
  { flag: PermissionFlagsBits.BanMembers, name: "Ban Members", why: "ban action" },
  { flag: PermissionFlagsBits.KickMembers, name: "Kick Members", why: "kick action" },
  { flag: PermissionFlagsBits.ModerateMembers, name: "Moderate Members", why: "timeout action" },
];

const LOG_CHANNEL_FLAGS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
];
const HONEYPOT_CHANNEL_FLAGS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ReadMessageHistory,
];

const LOG_CHANNEL_PERMS = SERVER_PERMS.filter((p) => LOG_CHANNEL_FLAGS.includes(p.flag));
const HONEYPOT_CHANNEL_PERMS = SERVER_PERMS.filter((p) =>
  HONEYPOT_CHANNEL_FLAGS.includes(p.flag)
);

/** Names of `required` perms not present in `perms` (null = none held). */
function missing(perms: PermissionsBitField | null, required: PermDef[]): string[] {
  return required.filter((p) => !perms?.has(p.flag)).map((p) => p.name);
}

export const diagnosticsService = {
  /** Per-permission status for the bot's guild-level permissions. */
  serverPermStatuses(perms: PermissionsBitField): PermStatus[] {
    return SERVER_PERMS.map((p) => ({ name: p.name, why: p.why, ok: perms.has(p.flag) }));
  },

  /** Log-channel perms the bot lacks (View / Send / Embed). */
  missingLogChannelPerms(perms: PermissionsBitField | null): string[] {
    return missing(perms, LOG_CHANNEL_PERMS);
  },

  /** Honeypot-channel perms the bot lacks (View / Manage Messages / Read History). */
  missingHoneypotChannelPerms(perms: PermissionsBitField | null): string[] {
    return missing(perms, HONEYPOT_CHANNEL_PERMS);
  },

  /**
   * Roles positioned above the bot's top role, highest first. Members whose
   * highest role is one of these can't be actioned (regardless of Administrator).
   */
  rolesAboveBot(botPosition: number, roles: RolePosition[]): RolePosition[] {
    return roles
      .filter((role) => role.position > botPosition)
      .sort((a, b) => b.position - a.position);
  },
};
