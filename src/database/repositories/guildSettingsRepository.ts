import { db } from "../client.js";
import type { Action, GuildSettings } from "../../types/honeypot.js";
import { parseActionOrNull } from "../../utils/validation.js";
import { buildUpdate } from "../../utils/dbHelpers.js";

interface GuildSettingsRow {
  guild_id: string;
  log_channel_id: string | null;
  default_action: string | null;
  default_delete_message_seconds: number | null;
  default_exempt_admins: boolean | null;
}

function toDomain(row: GuildSettingsRow, bypassRoleIds: string[]): GuildSettings {
  return {
    guildId: row.guild_id,
    logChannelId: row.log_channel_id,
    defaultAction: parseActionOrNull(row.default_action),
    defaultDeleteMessageSeconds: row.default_delete_message_seconds,
    defaultExemptAdmins: row.default_exempt_admins,
    defaultBypassRoleIds: bypassRoleIds,
  };
}

export const guildSettingsRepository = {
  async find(guildId: string): Promise<GuildSettings | null> {
    const row = await db
      .selectFrom("guild_settings")
      .selectAll()
      .where("guild_id", "=", guildId)
      .executeTakeFirst();

    if (!row) return null;

    const roles = await db
      .selectFrom("guild_bypass_roles")
      .select("role_id")
      .where("guild_id", "=", guildId)
      .execute();

    return toDomain(row, roles.map((r) => r.role_id));
  },

  async create(guildId: string): Promise<GuildSettings> {
    await db
      .insertInto("guild_settings")
      .values({
        guild_id: guildId,
        log_channel_id: null,
        default_action: null,
        default_delete_message_seconds: null,
        default_exempt_admins: null,
      })
      .onConflict((oc) => oc.column("guild_id").doNothing())
      .execute();

    const settings = await this.find(guildId);
    if (!settings) {
      throw new Error(`Failed to ensure guild_settings for ${guildId}`);
    }
    return settings;
  },

  async update(
    guildId: string,
    changes: {
      logChannelId?: string | null;
      defaultAction?: Action | null;
      defaultDeleteMessageSeconds?: number | null;
      defaultExemptAdmins?: boolean | null;
    }
  ): Promise<void> {
    const updateValues = buildUpdate(changes, {
      logChannelId: "log_channel_id",
      defaultAction: "default_action",
      defaultDeleteMessageSeconds: "default_delete_message_seconds",
      defaultExemptAdmins: "default_exempt_admins",
    });

    if (Object.keys(updateValues).length === 0) return;

    await db
      .insertInto("guild_settings")
      .values({ guild_id: guildId, ...updateValues })
      .onConflict((oc) => oc.column("guild_id").doUpdateSet(updateValues))
      .execute();
  },

  async setBypassRoles(guildId: string, roleIds: string[]): Promise<void> {
    await db.transaction().execute(async (trx) => {
      await trx.deleteFrom("guild_bypass_roles").where("guild_id", "=", guildId).execute();
      if (roleIds.length > 0) {
        await trx
          .insertInto("guild_bypass_roles")
          .values(roleIds.map((roleId) => ({ guild_id: guildId, role_id: roleId })))
          .execute();
      }
    });
  },
};
