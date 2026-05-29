import { v7 as uuidv7 } from "uuid";
import { db } from "../client.js";
import type { Action, HoneypotHit } from "../../types/honeypot.js";
import { parseAction } from "../../utils/validation.js";

interface HoneypotHitRow {
  id: string;
  guild_id: string;
  user_id: string;
  channel_id: string;
  message_content: string | null;
  action_taken: string;
  hit_at: Date;
}

function toDomain(row: HoneypotHitRow): HoneypotHit {
  return {
    id: row.id,
    guildId: row.guild_id,
    userId: row.user_id,
    channelId: row.channel_id,
    messageContent: row.message_content,
    actionTaken: parseAction(row.action_taken),
    hitAt: row.hit_at,
  };
}

export const honeypotHitRepository = {
  async create(hit: {
    guildId: string;
    userId: string;
    channelId: string;
    messageContent: string | null;
    actionTaken: Action;
  }): Promise<string> {
    const id = uuidv7();

    await db
      .insertInto("honeypot_hits")
      .values({
        id,
        guild_id: hit.guildId,
        user_id: hit.userId,
        channel_id: hit.channelId,
        message_content: hit.messageContent,
        action_taken: hit.actionTaken,
      })
      .execute();

    return id;
  },

  async listByGuild(guildId: string, limit = 25): Promise<HoneypotHit[]> {
    const rows = await db
      .selectFrom("honeypot_hits")
      .selectAll()
      .where("guild_id", "=", guildId)
      .orderBy("hit_at", "desc")
      .limit(limit)
      .execute();

    return rows.map(toDomain);
  },

  async listByUser(
    guildId: string,
    userId: string,
    limit = 25
  ): Promise<HoneypotHit[]> {
    const rows = await db
      .selectFrom("honeypot_hits")
      .selectAll()
      .where("guild_id", "=", guildId)
      .where("user_id", "=", userId)
      .orderBy("hit_at", "desc")
      .limit(limit)
      .execute();

    return rows.map(toDomain);
  },

  async countByGuild(guildId: string): Promise<number> {
    const result = await db
      .selectFrom("honeypot_hits")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .where("guild_id", "=", guildId)
      .executeTakeFirstOrThrow();

    return Number(result.count);
  },
};
