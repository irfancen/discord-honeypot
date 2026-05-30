import type {
  Action,
  HoneypotChannel,
  ResolvedChannelSettings,
} from "../types/honeypot.js";
import { honeypotChannelRepository } from "../database/repositories/honeypotChannelRepository.js";
import { guildSettingsRepository } from "../database/repositories/guildSettingsRepository.js";
import { settingsService } from "./settingsService.js";


export interface HoneypotOverrides {
  action?: Action | null;
  deleteMessageSeconds?: number | null;
  timeoutSeconds?: number | null;
  exemptAdmins?: boolean | null;
}

export type BypassRolesUpdate =
  | { kind: "inherit" }
  | { kind: "set"; roleIds: string[] };

export interface ResolvedHoneypot {
  channel: HoneypotChannel;
  resolved: ResolvedChannelSettings;
}

export const honeypotChannelService = {
  /**
   * Register a channel as a honeypot, optionally with overrides. Returns the
   * resolved settings for confirmation, or null if it was already registered.
   */
  async add(
    guildId: string,
    channelId: string,
    addedBy: string,
    overrides: HoneypotOverrides,
    bypass?: BypassRolesUpdate
  ): Promise<ResolvedChannelSettings | null> {
    if (await honeypotChannelRepository.exists(guildId, channelId)) return null;

    await honeypotChannelRepository.create({
      guildId,
      channelId,
      addedBy,
      action: overrides.action,
      deleteMessageSeconds: overrides.deleteMessageSeconds,
      timeoutSeconds: overrides.timeoutSeconds,
      exemptAdmins: overrides.exemptAdmins,
    });
    await applyBypass(guildId, channelId, bypass);
    return settingsService.resolveChannelSettings(guildId, channelId);
  },

  /** Unregister a honeypot channel. Returns false if it wasn't one. */
  async remove(guildId: string, channelId: string): Promise<boolean> {
    return honeypotChannelRepository.remove(guildId, channelId);
  },

  /**
   * Update overrides on an existing honeypot, returning the freshly-resolved
   * settings for confirmation. Returns null if the channel isn't a honeypot.
   */
  async configure(
    guildId: string,
    channelId: string,
    overrides: HoneypotOverrides,
    bypass?: BypassRolesUpdate
  ): Promise<ResolvedChannelSettings | null> {
    if (!(await honeypotChannelRepository.exists(guildId, channelId))) return null;

    await honeypotChannelRepository.update(guildId, channelId, overrides);
    await applyBypass(guildId, channelId, bypass);
    return settingsService.resolveChannelSettings(guildId, channelId);
  },

  /**
   * Every honeypot in the guild, paired with its resolved settings. Loads the
   * channels and the single guild-settings row once, then resolves each in
   * memory — a flat handful of queries regardless of how many honeypots exist.
   */
  async list(guildId: string): Promise<ResolvedHoneypot[]> {
    const [channels, guildSettings] = await Promise.all([
      honeypotChannelRepository.listByGuild(guildId),
      guildSettingsRepository.find(guildId),
    ]);

    return channels.map((channel) => ({
      channel,
      resolved: settingsService.resolve(channel, guildSettings),
    }));
  },
};

/** Apply a bypass-roles intent via the matching repository operation. */
async function applyBypass(
  guildId: string,
  channelId: string,
  bypass: BypassRolesUpdate | undefined
): Promise<void> {
  if (!bypass) return; // omitted → leave unchanged
  if (bypass.kind === "inherit") {
    await honeypotChannelRepository.resetBypassRoles(guildId, channelId);
  } else {
    // empty array = explicit "none" (overrides, does not inherit)
    await honeypotChannelRepository.setBypassRoles(guildId, channelId, bypass.roleIds);
  }
}
