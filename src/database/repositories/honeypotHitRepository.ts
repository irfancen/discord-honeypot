import { v7 as uuidv7 } from "uuid";
import { sql } from "kysely";
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

  async countByGuild(guildId: string): Promise<number> {
    const result = await db
      .selectFrom("honeypot_hits")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .where("guild_id", "=", guildId)
      .executeTakeFirstOrThrow();

    return Number(result.count);
  },

  async countSince(guildId: string, since: Date): Promise<number> {
    const result = await db
      .selectFrom("honeypot_hits")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .where("guild_id", "=", guildId)
      .where("hit_at", ">=", since)
      .executeTakeFirstOrThrow();

    return Number(result.count);
  },

  /** Hit counts grouped by action, with zeros for actions that never occurred. */
  async countByAction(guildId: string): Promise<Record<Action, number>> {
    const rows = await db
      .selectFrom("honeypot_hits")
      .select("action_taken")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .where("guild_id", "=", guildId)
      .groupBy("action_taken")
      .execute();

    const counts: Record<Action, number> = { ban: 0, timeout: 0, kick: 0 };
    for (const row of rows) {
      counts[parseAction(row.action_taken)] = Number(row.count);
    }
    return counts;
  },

  async topUsers(
    guildId: string,
    limit: number
  ): Promise<{ userId: string; count: number }[]> {
    const rows = await db
      .selectFrom("honeypot_hits")
      .select("user_id")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .where("guild_id", "=", guildId)
      .groupBy("user_id")
      .orderBy(sql`count(*)`, "desc")
      .limit(limit)
      .execute();

    return rows.map((row) => ({ userId: row.user_id, count: Number(row.count) }));
  },

  async topChannels(
    guildId: string,
    limit: number
  ): Promise<{ channelId: string; count: number }[]> {
    const rows = await db
      .selectFrom("honeypot_hits")
      .select("channel_id")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .where("guild_id", "=", guildId)
      .groupBy("channel_id")
      .orderBy(sql`count(*)`, "desc")
      .limit(limit)
      .execute();

    return rows.map((row) => ({ channelId: row.channel_id, count: Number(row.count) }));
  },
};
