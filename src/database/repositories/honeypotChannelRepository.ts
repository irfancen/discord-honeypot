import { db } from "../client.js";
import type { Action, HoneypotChannel } from "../../types/honeypot.js";
import { parseActionOrNull } from "../../utils/validation.js";
import { buildUpdate } from "../../utils/dbHelpers.js";

interface HoneypotChannelRow {
  guild_id: string;
  channel_id: string;
  added_by: string;
  added_at: Date;
  action: string | null;
  delete_message_seconds: number | null;
  exempt_admins: boolean | null;
  bypass_roles_overridden: boolean;
}

function toDomain(row: HoneypotChannelRow, bypassRoleIds: string[]): HoneypotChannel {
  return {
    guildId: row.guild_id,
    channelId: row.channel_id,
    addedBy: row.added_by,
    addedAt: row.added_at,
    action: parseActionOrNull(row.action),
    deleteMessageSeconds: row.delete_message_seconds,
    exemptAdmins: row.exempt_admins,
    bypassRolesOverridden: row.bypass_roles_overridden,
    bypassRoleIds,
  };
}

async function fetchChannelBypassRoles(
  guildId: string,
  channelId: string
): Promise<string[]> {
  const rows = await db
    .selectFrom("channel_bypass_roles")
    .select("role_id")
    .where("guild_id", "=", guildId)
    .where("channel_id", "=", channelId)
    .execute();
  return rows.map((r) => r.role_id);
}

export const honeypotChannelRepository = {
  async find(guildId: string, channelId: string): Promise<HoneypotChannel | null> {
    const row = await db
      .selectFrom("honeypot_channels")
      .selectAll()
      .where("guild_id", "=", guildId)
      .where("channel_id", "=", channelId)
      .executeTakeFirst();

    if (!row) return null;

    const roles = await fetchChannelBypassRoles(guildId, channelId);
    return toDomain(row, roles);
  },

  async exists(guildId: string, channelId: string): Promise<boolean> {
    const row = await db
      .selectFrom("honeypot_channels")
      .select("channel_id")
      .where("guild_id", "=", guildId)
      .where("channel_id", "=", channelId)
      .executeTakeFirst();
    return row !== undefined;
  },

  async listByGuild(guildId: string): Promise<HoneypotChannel[]> {
    const rows = await db
      .selectFrom("honeypot_channels")
      .selectAll()
      .where("guild_id", "=", guildId)
      .execute();

    if (rows.length === 0) return [];

    // Fetch all channel bypass roles for this guild in one query, then group.
    const roleRows = await db
      .selectFrom("channel_bypass_roles")
      .select(["channel_id", "role_id"])
      .where("guild_id", "=", guildId)
      .execute();

    const rolesByChannel = new Map<string, string[]>();
    for (const { channel_id, role_id } of roleRows) {
      const list = rolesByChannel.get(channel_id) ?? [];
      list.push(role_id);
      rolesByChannel.set(channel_id, list);
    }

    return rows.map((row) =>
      toDomain(row, rolesByChannel.get(row.channel_id) ?? [])
    );
  },

  async create(channel: {
    guildId: string;
    channelId: string;
    addedBy: string;
    action?: Action | null;
    deleteMessageSeconds?: number | null;
    exemptAdmins?: boolean | null;
  }): Promise<void> {
    await db
      .insertInto("honeypot_channels")
      .values({
        guild_id: channel.guildId,
        channel_id: channel.channelId,
        added_by: channel.addedBy,
        action: channel.action ?? null,
        delete_message_seconds: channel.deleteMessageSeconds ?? null,
        exempt_admins: channel.exemptAdmins ?? null,
        bypass_roles_overridden: false,
      })
      .onConflict((oc) =>
        oc.columns(["guild_id", "channel_id"]).doNothing()
      )
      .execute();
  },

  async remove(guildId: string, channelId: string): Promise<boolean> {
    const result = await db
      .deleteFrom("honeypot_channels")
      .where("guild_id", "=", guildId)
      .where("channel_id", "=", channelId)
      .executeTakeFirst();
    return Number(result.numDeletedRows) > 0;
  },

  async update(
    guildId: string,
    channelId: string,
    changes: {
      action?: Action | null;
      deleteMessageSeconds?: number | null;
      exemptAdmins?: boolean | null;
    }
  ): Promise<void> {
    const updateValues = buildUpdate(changes, {
      action: "action",
      deleteMessageSeconds: "delete_message_seconds",
      exemptAdmins: "exempt_admins",
    });

    if (Object.keys(updateValues).length === 0) return;

    await db
      .updateTable("honeypot_channels")
      .set(updateValues)
      .where("guild_id", "=", guildId)
      .where("channel_id", "=", channelId)
      .execute();
  },

  async setBypassRoles(
    guildId: string,
    channelId: string,
    roleIds: string[]
  ): Promise<void> {
    await db.transaction().execute(async (trx) => {
      await trx
        .deleteFrom("channel_bypass_roles")
        .where("guild_id", "=", guildId)
        .where("channel_id", "=", channelId)
        .execute();

      if (roleIds.length > 0) {
        await trx
          .insertInto("channel_bypass_roles")
          .values(
            roleIds.map((roleId) => ({
              guild_id: guildId,
              channel_id: channelId,
              role_id: roleId,
            }))
          )
          .execute();
      }

      // Setting roles explicitly means this channel overrides guild bypass roles.
      await trx
        .updateTable("honeypot_channels")
        .set({ bypass_roles_overridden: true })
        .where("guild_id", "=", guildId)
        .where("channel_id", "=", channelId)
        .execute();
    });
  },

  async resetBypassRoles(guildId: string, channelId: string): Promise<void> {
    await db.transaction().execute(async (trx) => {
      await trx
        .deleteFrom("channel_bypass_roles")
        .where("guild_id", "=", guildId)
        .where("channel_id", "=", channelId)
        .execute();

      await trx
        .updateTable("honeypot_channels")
        .set({ bypass_roles_overridden: false })
        .where("guild_id", "=", guildId)
        .where("channel_id", "=", channelId)
        .execute();
    });
  },
};
