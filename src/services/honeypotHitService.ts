import type { Action, HoneypotHit } from "../types/honeypot.js";
import { honeypotHitRepository } from "../database/repositories/honeypotHitRepository.js";

const TOP_N = 5;
const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface HitsView {
  hits: HoneypotHit[];
  total: number;
}

export interface HoneypotStats {
  total: number;
  recent: number; // hits in the last 7 days
  byAction: Record<Action, number>;
  topUsers: { userId: string; count: number }[];
  topChannels: { channelId: string; count: number }[];
}

export const honeypotHitService = {
  /** The most recent hits for the guild, plus the total count. */
  async getHits(guildId: string, limit: number): Promise<HitsView> {
    const [hits, total] = await Promise.all([
      honeypotHitRepository.listByGuild(guildId, limit),
      honeypotHitRepository.countByGuild(guildId),
    ]);
    return { hits, total };
  },

  /** Aggregate honeypot activity: totals, action breakdown, top users/channels. */
  async getStats(guildId: string): Promise<HoneypotStats> {
    const since = new Date(Date.now() - RECENT_WINDOW_MS);
    const [total, recent, byAction, topUsers, topChannels] = await Promise.all([
      honeypotHitRepository.countByGuild(guildId),
      honeypotHitRepository.countSince(guildId, since),
      honeypotHitRepository.countByAction(guildId),
      honeypotHitRepository.topUsers(guildId, TOP_N),
      honeypotHitRepository.topChannels(guildId, TOP_N),
    ]);
    return { total, recent, byAction, topUsers, topChannels };
  },
};
