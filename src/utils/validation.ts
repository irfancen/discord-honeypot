import { ACTIONS, type Action } from "../types/honeypot.js";

/** Narrows an arbitrary string to a valid Action, or throws. */
export function parseAction(value: string): Action {
  if ((ACTIONS as readonly string[]).includes(value)) {
    return value as Action;
  }
  throw new Error(`Invalid action value: "${value}"`);
}

/** Narrows an arbitrary string to a valid Action, or throws. Allows null (for nullable columns / inherit). */
export function parseActionOrNull(value: string | null): Action | null {
  return value === null ? null : parseAction(value);
}
