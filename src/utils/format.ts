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

export function prettify(key: string): string {
  const text = key.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatRoleList(roleIds: string[]): string {
  return roleIds.length > 0 ? roleIds.map((id) => `<@&${id}>`).join(", ") : "None";
}
