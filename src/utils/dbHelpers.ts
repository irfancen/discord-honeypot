/**
 * Picks only the keys whose values are not `undefined`, mapping each
 * camelCase input key to its snake_case column name.
 *
 * Distinguishes three states for each field:
 *   - undefined → omitted (leave column unchanged)
 *   - null → included as null (clear the column / reset to inherit)
 *   - value → included as-is (set the column)
 */
export function buildUpdate<T extends Record<string, unknown>>(
  input: T,
  keyMap: Record<keyof T, string>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key in input) {
    if (input[key] !== undefined) {
      out[keyMap[key]] = input[key];
    }
  }
  return out;
}
