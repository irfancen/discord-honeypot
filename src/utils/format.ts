/** Pure presentation helpers shared across commands. No domain/DB coupling. */

/** Human-readable duration, e.g. 3600 → "1 hour", 0 → "None". */
export function humanizeSeconds(seconds: number): string {
  if (seconds <= 0) return "None";
  const units: [string, number][] = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
    ["second", 1],
  ];
  for (const [name, size] of units) {
    if (seconds % size === 0) {
      const count = seconds / size;
      return `${count} ${name}${count === 1 ? "" : "s"}`;
    }
  }
  return `${seconds} seconds`;
}

/** snake_case / lowercase → Title-ish, e.g. "last_5_minutes" → "Last 5 minutes". */
export function prettify(key: string): string {
  const text = key.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Role IDs → mention list, or "None" when empty. */
export function formatRoleList(roleIds: string[]): string {
  return roleIds.length > 0 ? roleIds.map((id) => `<@&${id}>`).join(", ") : "None";
}
