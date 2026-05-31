import { randomUUID } from "node:crypto";
import type { DefaultsChange } from "./guildSettingsService.js";

/**
 * In-memory store for guild-default changes awaiting confirmation. Keyed by an
 * id embedded in the confirmation buttons' customIds. Entries expire after a
 * short TTL so abandoned confirmations don't linger; a periodic sweep clears
 * them (and the interval is unref'd so it never keeps the process alive).
 */
export interface PendingDefaults {
  guildId: string;
  userId: string; // only the admin who initiated may confirm
  change: DefaultsChange;
}

const TTL_MS = 2 * 60 * 1000;

interface Entry {
  value: PendingDefaults;
  expiresAt: number;
}

const store = new Map<string, Entry>();

const sweep = setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of store) {
    if (entry.expiresAt <= now) store.delete(id);
  }
}, 60 * 1000);
sweep.unref();

export const pendingDefaults = {
  /** Store a pending change and return its id (for the button customIds). */
  stage(value: PendingDefaults): string {
    const id = randomUUID();
    store.set(id, { value, expiresAt: Date.now() + TTL_MS });
    return id;
  },

  /** Consume a pending change (single use). Null if missing or expired. */
  take(id: string): PendingDefaults | null {
    const entry = store.get(id);
    if (!entry) return null;
    store.delete(id);
    return entry.expiresAt > Date.now() ? entry.value : null;
  },
};

// ── confirmation button customIds ──────────────────────────────────
const PREFIX = "config_defaults";
const CONFIRM_ACTIONS = ["adopt", "keep", "cancel"] as const;
export type ConfirmAction = (typeof CONFIRM_ACTIONS)[number];

export function buildCustomId(id: string, action: ConfirmAction): string {
  return `${PREFIX}:${id}:${action}`;
}

export function parseCustomId(
  customId: string
): { id: string; action: ConfirmAction } | null {
  const parts = customId.split(":");
  if (parts.length !== 3) return null;
  const [prefix, id, action] = parts;
  if (prefix !== PREFIX || !id) return null;
  if (!CONFIRM_ACTIONS.includes(action as ConfirmAction)) return null;
  return { id, action: action as ConfirmAction };
}
