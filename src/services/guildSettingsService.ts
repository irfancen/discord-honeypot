import type {
  Action,
  GuildSettings,
  HoneypotChannel,
  ResolvedAction,
  ResolvedChannelSettings,
} from "../types/honeypot.js";
import { guildSettingsRepository } from "../database/repositories/guildSettingsRepository.js";
import { honeypotChannelRepository } from "../database/repositories/honeypotChannelRepository.js";
import { settingsService } from "./settingsService.js";

/**
 * A change to the guild defaults. Each field follows the three-state convention:
 *   - `undefined`     → leave unchanged
 *   - `null` (scalars)→ reset to inherit (use the hardcoded baseline)
 *   - a value         → set it
 * For bypass roles there is no level above the guild but the hardcoded empty
 * list, so it is just `undefined` (unchanged) or an array (`[]` = clear).
 */
export interface DefaultsChange {
  action?: Action | null;
  deleteMessageSeconds?: number | null;
  timeoutSeconds?: number | null;
  exemptAdmins?: boolean | null;
  bypassRoleIds?: string[];
}

export interface AffectedChannel {
  channel: HoneypotChannel;
  before: ResolvedChannelSettings;
  after: ResolvedChannelSettings;
}

export const guildSettingsService = {
  /** The guild's settings row, or null if none has been created yet. */
  async get(guildId: string): Promise<GuildSettings | null> {
    return guildSettingsRepository.find(guildId);
  },

  /** Set the log channel, or pass null to disable hit logging. */
  async setLogChannel(guildId: string, channelId: string | null): Promise<void> {
    await guildSettingsRepository.update(guildId, { logChannelId: channelId });
  },

  /**
   * Which honeypot channels would actually behave differently if this change
   * were applied — computed by diffing each channel's *resolved* settings under
   * the old vs hypothetical-new guild defaults. Channels that don't inherit the
   * changed setting (or whose resolved value is unaffected, e.g. a timeout
   * duration change on a ban channel) produce no diff and aren't included.
   */
  async computeImpact(
    guildId: string,
    change: DefaultsChange
  ): Promise<AffectedChannel[]> {
    const [oldGuild, channels] = await Promise.all([
      guildSettingsRepository.find(guildId),
      honeypotChannelRepository.listByGuild(guildId),
    ]);

    const newGuild = withChange(guildId, oldGuild, change);
    const affected: AffectedChannel[] = [];
    for (const channel of channels) {
      const before = settingsService.resolve(channel, oldGuild);
      const after = settingsService.resolve(channel, newGuild);
      if (!resolvedEqual(before, after)) affected.push({ channel, before, after });
    }
    return affected;
  },

  /** Persist the change to the guild defaults. */
  async applyDefaults(guildId: string, change: DefaultsChange): Promise<void> {
    await guildSettingsRepository.update(guildId, {
      defaultAction: change.action,
      defaultDeleteMessageSeconds: change.deleteMessageSeconds,
      defaultTimeoutSeconds: change.timeoutSeconds,
      defaultExemptAdmins: change.exemptAdmins,
    });

    if (change.bypassRoleIds !== undefined) {
      // Ensure a guild_settings row exists so resolution sees these roles even
      // when no scalar default was set in this call.
      await guildSettingsRepository.create(guildId);
      await guildSettingsRepository.setBypassRoles(guildId, change.bypassRoleIds);
    }
  },

  /**
   * Freeze each affected channel's current resolved value as an explicit
   * override (only for the fields that would change), then apply the new
   * defaults — so existing channels keep behaving as they do now.
   */
  async keepCurrentValuesThenApply(
    guildId: string,
    change: DefaultsChange
  ): Promise<void> {
    const affected = await guildSettingsService.computeImpact(guildId, change);
    for (const item of affected) {
      await freezeChannel(guildId, item);
    }
    await guildSettingsService.applyDefaults(guildId, change);
  },
};

/** Hypothetical guild settings after applying a change (not persisted). */
function withChange(
  guildId: string,
  old: GuildSettings | null,
  change: DefaultsChange
): GuildSettings {
  const pick = <T>(value: T | null | undefined, fallback: T | null): T | null =>
    value !== undefined ? value : fallback;

  return {
    guildId,
    logChannelId: old?.logChannelId ?? null,
    defaultAction: pick(change.action, old?.defaultAction ?? null),
    defaultDeleteMessageSeconds: pick(
      change.deleteMessageSeconds,
      old?.defaultDeleteMessageSeconds ?? null
    ),
    defaultTimeoutSeconds: pick(
      change.timeoutSeconds,
      old?.defaultTimeoutSeconds ?? null
    ),
    defaultExemptAdmins: pick(change.exemptAdmins, old?.defaultExemptAdmins ?? null),
    defaultBypassRoleIds:
      change.bypassRoleIds !== undefined
        ? change.bypassRoleIds
        : old?.defaultBypassRoleIds ?? [],
  };
}

/** Write `before`'s values as channel overrides, only where they'd change. */
async function freezeChannel(
  guildId: string,
  { channel, before, after }: AffectedChannel
): Promise<void> {
  const overrides: {
    action?: Action;
    deleteMessageSeconds?: number;
    timeoutSeconds?: number;
    exemptAdmins?: boolean;
  } = {};

  if (!actionEqual(before.action, after.action)) {
    overrides.action = before.action.kind;
    // Freeze the duration too so a frozen timeout keeps its current length.
    if (before.action.kind === "timeout") {
      overrides.timeoutSeconds = before.action.durationSeconds;
    }
  }
  if (before.deleteMessageSeconds !== after.deleteMessageSeconds) {
    overrides.deleteMessageSeconds = before.deleteMessageSeconds;
  }
  if (before.exemptAdmins !== after.exemptAdmins) {
    overrides.exemptAdmins = before.exemptAdmins;
  }

  if (Object.keys(overrides).length > 0) {
    await honeypotChannelRepository.update(guildId, channel.channelId, overrides);
  }
  if (!sameRoleSet(before.bypassRoleIds, after.bypassRoleIds)) {
    await honeypotChannelRepository.setBypassRoles(
      guildId,
      channel.channelId,
      before.bypassRoleIds
    );
  }
}

function resolvedEqual(
  a: ResolvedChannelSettings,
  b: ResolvedChannelSettings
): boolean {
  return (
    actionEqual(a.action, b.action) &&
    a.deleteMessageSeconds === b.deleteMessageSeconds &&
    a.exemptAdmins === b.exemptAdmins &&
    sameRoleSet(a.bypassRoleIds, b.bypassRoleIds)
  );
}

function actionEqual(a: ResolvedAction, b: ResolvedAction): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "timeout" && b.kind === "timeout") {
    return a.durationSeconds === b.durationSeconds;
  }
  return true;
}

function sameRoleSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}
