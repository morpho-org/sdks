/**
 * Returns `true` when `value` is a non-null, non-array plain object. Shared internal helper
 * used by structural type-guards across the package.
 *
 * @internal
 */
export const isPlainObject = (
  value: unknown,
): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
