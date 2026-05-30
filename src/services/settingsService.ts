import {
  HARDCODED_DEFAULTS,
  type Action,
  type GuildSettings,
  type HoneypotChannel,
  type ResolvedAction,
  type ResolvedChannelSettings,
  type SettingSource,
} from "../types/honeypot.js";
import { guildSettingsRepository } from "../database/repositories/guildSettingsRepository.js";
import { honeypotChannelRepository } from "../database/repositories/honeypotChannelRepository.js";


function resolveScalar<T>(
  channelValue: T | null,
  guildValue: T | null,
  hardcoded: T
): { value: T; source: SettingSource } {
  if (channelValue !== null) return { value: channelValue, source: "channel" };
  if (guildValue !== null) return { value: guildValue, source: "guild" };
  return { value: hardcoded, source: "hardcoded" };
}

export type ScalarSettingKey = "action" | "deleteMessageSeconds" | "exemptAdmins";

export const settingsService = {
  async resolveChannelSettings(
    guildId: string,
    channelId: string
  ): Promise<ResolvedChannelSettings> {
    const [channelSettings, guildSettings] = await Promise.all([
      honeypotChannelRepository.find(guildId, channelId),
      guildSettingsRepository.find(guildId),
    ]);

    const action = resolveScalar(
      channelSettings?.action ?? null,
      guildSettings?.defaultAction ?? null,
      HARDCODED_DEFAULTS.action
    );
    const deleteMessageSeconds = resolveScalar(
      channelSettings?.deleteMessageSeconds ?? null,
      guildSettings?.defaultDeleteMessageSeconds ?? null,
      HARDCODED_DEFAULTS.deleteMessageSeconds
    );
    const exemptAdmins = resolveScalar(
      channelSettings?.exemptAdmins ?? null,
      guildSettings?.defaultExemptAdmins ?? null,
      HARDCODED_DEFAULTS.exemptAdmins
    );

    const bypass = resolveBypassRoles(channelSettings, guildSettings);

    return {
      action: resolveAction(action.value, channelSettings, guildSettings),
      deleteMessageSeconds: deleteMessageSeconds.value,
      exemptAdmins: exemptAdmins.value,
      bypassRoleIds: bypass.value,
      source: {
        action: action.source,
        deleteMessageSeconds: deleteMessageSeconds.source,
        exemptAdmins: exemptAdmins.source,
        bypassRoleIds: bypass.source,
      },
    };
  },

  async findChannelsInheritingScalar(
    guildId: string,
    setting: ScalarSettingKey
  ): Promise<HoneypotChannel[]> {
    const channels = await honeypotChannelRepository.listByGuild(guildId);
    return channels.filter((channel) => channel[setting] === null);
  },

  async findChannelsInheritingBypassRoles(
    guildId: string
  ): Promise<HoneypotChannel[]> {
    const channels = await honeypotChannelRepository.listByGuild(guildId);
    return channels.filter((channel) => !channel.bypassRolesOverridden);
  },
};

function resolveAction(
  action: Action,
  channelSettings: HoneypotChannel | null,
  guildSettings: GuildSettings | null
): ResolvedAction {
  switch (action) {
    case "ban":
      return { kind: "ban" };
    case "kick":
      return { kind: "kick" };
    case "timeout": {
      const duration = resolveScalar(
        channelSettings?.timeoutSeconds ?? null,
        guildSettings?.defaultTimeoutSeconds ?? null,
        HARDCODED_DEFAULTS.timeoutSeconds
      );
      return {
        kind: "timeout",
        durationSeconds: duration.value,
        durationSource: duration.source,
      };
    }
  }
}

function resolveBypassRoles(
  channelSettings: HoneypotChannel | null,
  guildSettings: GuildSettings | null
): { value: string[]; source: SettingSource } {
  if (channelSettings?.bypassRolesOverridden) {
    return { value: channelSettings.bypassRoleIds, source: "channel" };
  }
  if (guildSettings && guildSettings.defaultBypassRoleIds.length > 0) {
    return { value: guildSettings.defaultBypassRoleIds, source: "guild" };
  }
  return { value: HARDCODED_DEFAULTS.bypassRoleIds, source: "hardcoded" };
}
