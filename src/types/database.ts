import type { Generated } from "kysely";

export interface GuildSettingsTable {
  guild_id: string;
  log_channel_id: string | null;
  default_action: string | null;
  default_delete_message_seconds: number | null;
  default_timeout_seconds: number | null;
  default_exempt_admins: boolean | null;
}

export interface HoneypotChannelsTable {
  guild_id: string;
  channel_id: string;
  added_by: string;
  added_at: Generated<Date>;
  action: string | null;
  delete_message_seconds: number | null;
  timeout_seconds: number | null;
  exempt_admins: boolean | null;
  bypass_roles_overridden: boolean;
}

export interface GuildBypassRolesTable {
  guild_id: string;
  role_id: string;
}

export interface ChannelBypassRolesTable {
  guild_id: string;
  channel_id: string;
  role_id: string;
}

export interface HoneypotHitsTable {
  id: string;
  guild_id: string;
  user_id: string;
  channel_id: string;
  message_content: string | null;
  action_taken: string;
  hit_at: Generated<Date>;
}

export interface Database {
  guild_settings: GuildSettingsTable;
  honeypot_channels: HoneypotChannelsTable;
  guild_bypass_roles: GuildBypassRolesTable;
  channel_bypass_roles: ChannelBypassRolesTable;
  honeypot_hits: HoneypotHitsTable;
}
