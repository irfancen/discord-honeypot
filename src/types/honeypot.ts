export const ACTIONS = ["ban", "timeout", "kick"] as const;
export type Action = (typeof ACTIONS)[number];
export type ActionOrInherit = Action | "inherit";

export const DELETE_PRESETS = {
  none: 0,
  last_5_minutes: 300,
  last_10_minutes: 600,
  last_hour: 3600,
  last_6_hours: 21600,
  last_day: 86400,
  last_3_days: 259200,
  last_7_days: 604800,
} as const;

export type DeletePreset = keyof typeof DELETE_PRESETS;
export type DeletePresetOrInherit = DeletePreset | "inherit";

// Durations (in seconds) the `timeout` action can use. Mirrors Discord's own
// client UI options, which cap at one week — even though the API permits up to
// 28 days (see MAX_TIMEOUT_SECONDS, enforced in honeypotService).
export const TIMEOUT_PRESETS = {
  one_minute: 60,
  five_minutes: 300,
  ten_minutes: 600,
  one_hour: 3600,
  one_day: 86400,
  one_week: 604800,
} as const;

export type TimeoutPreset = keyof typeof TIMEOUT_PRESETS;
export type TimeoutPresetOrInherit = TimeoutPreset | "inherit";

// Discord's hard ceiling for a timeout (28 days) in seconds.
export const MAX_TIMEOUT_SECONDS = 28 * 24 * 60 * 60;

export const HARDCODED_DEFAULTS = {
  action: "ban" as Action,
  deleteMessageSeconds: DELETE_PRESETS.last_hour,
  timeoutSeconds: TIMEOUT_PRESETS.one_day,
  exemptAdmins: true,
  bypassRoleIds: [] as string[],
} as const;

export interface HoneypotChannel {
  guildId: string;
  channelId: string;
  addedBy: string;
  addedAt: Date;
  action: Action | null;
  deleteMessageSeconds: number | null;
  timeoutSeconds: number | null;
  exemptAdmins: boolean | null;
  bypassRolesOverridden: boolean; // false = inherit guild bypass roles; true = use `bypassRoleIds` as-is (even if empty)
  bypassRoleIds: string[];
}

export interface GuildSettings {
  guildId: string;
  logChannelId: string | null;
  defaultAction: Action | null;
  defaultDeleteMessageSeconds: number | null;
  defaultTimeoutSeconds: number | null;
  defaultExemptAdmins: boolean | null;
  defaultBypassRoleIds: string[];
}

/**
 * The resolved action plus any parameter that belongs to it. Only `timeout`
 * carries a parameter (its duration), so the duration — and its own resolution
 * source — live here rather than polluting the flat settings object. `kind`'s
 * source (which level chose the action) is tracked separately in `source.action`.
 */
export type ResolvedAction =
  | { kind: "ban" }
  | { kind: "kick" }
  | { kind: "timeout"; durationSeconds: number; durationSource: SettingSource };

export interface ResolvedChannelSettings {
  action: ResolvedAction;
  deleteMessageSeconds: number;
  exemptAdmins: boolean;
  bypassRoleIds: string[];

  source: {
    action: SettingSource;
    deleteMessageSeconds: SettingSource;
    exemptAdmins: SettingSource;
    bypassRoleIds: SettingSource;
  };
}


export type SettingSource = "channel" | "guild" | "hardcoded";

export interface HoneypotHit {
  id: string;
  guildId: string;
  userId: string;
  channelId: string;
  messageContent: string | null;
  actionTaken: Action;
  hitAt: Date;
}
