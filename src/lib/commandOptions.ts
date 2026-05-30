import type { ChatInputCommandInteraction } from "discord.js";
import { prettify } from "../utils/format.js";

// Shared slash-command option values/parsing for the inherit-choice pattern.

// Maps a setting choice back to NULL (inherit the next level).
export const INHERIT = "inherit";
// bypass_roles dropdown values.
export const NONE = "none";
export const SET = "set";

// Shown when "Set to roles below" is chosen but no role mention can be parsed.
export const BYPASS_HELP =
  "To set bypass roles, choose `Set to roles below` and `@`-mention at least " +
  "one role in the `roles` option.";

interface Choice {
  name: string;
  value: string;
}

/** Build dropdown choices from a presets object (`{ key: seconds }`). */
export function presetChoices(presets: Record<string, number>): Choice[] {
  return Object.keys(presets).map((key) => ({ name: prettify(key), value: key }));
}

/** The shared "Inherit (guild default)" choice → NULL. */
export function inheritChoice(): Choice {
  return { name: "Inherit (guild default)", value: INHERIT };
}

/**
 * Translate a setting option into the three-state convention:
 * absent → undefined (leave unchanged), "inherit" → null (clear), else the
 * transformed value.
 */
export function readChoice<T>(
  interaction: ChatInputCommandInteraction,
  name: string,
  transform: (value: string) => T
): T | null | undefined {
  const raw = interaction.options.getString(name);
  if (raw === null) return undefined;
  if (raw === INHERIT) return null;
  return transform(raw);
}

/** Extract unique role IDs from `<@&id>` mentions in free text. */
export function parseRoleMentions(text: string): string[] {
  const ids = new Set<string>();
  const pattern = /<@&(\d+)>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const id = match[1];
    if (id) ids.add(id);
  }
  return [...ids];
}
