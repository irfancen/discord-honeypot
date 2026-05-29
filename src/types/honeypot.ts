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

export const HARDCODED_DEFAULTS = {
  action: "ban" as Action,
  deleteMessageSeconds: DELETE_PRESETS.last_hour,
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
  exemptAdmins: boolean | null;
  bypassRolesOverridden: boolean; // false = inherit guild bypass roles; true = use `bypassRoleIds` as-is (even if empty)
  bypassRoleIds: string[];
}

export interface GuildSettings {
  guildId: string;
  logChannelId: string | null;
  defaultAction: Action | null;
  defaultDeleteMessageSeconds: number | null;
  defaultExemptAdmins: boolean | null;
  defaultBypassRoleIds: string[];
}

export interface ResolvedChannelSettings {
  action: Action;
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
