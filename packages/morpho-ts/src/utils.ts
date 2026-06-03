import { Time } from "./time/index.js";
import type { FieldType, PartialDottedKeys } from "./types.js";

/** Canonical zero address constant. */
export const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000" as const;

/**
 * Narrows a nullable value to its non-null type.
 *
 * @param v - Value to test.
 * @returns `true` when `v` is not `null`.
 * @example
 * ```ts
 * import { isNotNull } from "@morpho-org/morpho-ts";
 *
 * const values = [1, null, 2].filter(isNotNull);
 * // values satisfies number[]
 * ```
 */
export const isNotNull = <T>(v: T | null): v is T => v !== null;

/**
 * Narrows an optional value to its non-undefined type.
 *
 * @param v - Value to test.
 * @returns `true` when `v` is not `undefined`.
 * @example
 * ```ts
 * import { isNotUndefined } from "@morpho-org/morpho-ts";
 *
 * const values = [1, undefined, 2].filter(isNotUndefined);
 * // values satisfies number[]
 * ```
 */
export const isNotUndefined = <T>(v: T | undefined): v is T => v !== undefined;

/**
 * Narrows a nullish value to its defined type.
 *
 * @param v - Value to test.
 * @returns `true` when `v` is neither `null` nor `undefined`.
 * @example
 * ```ts
 * import { isDefined } from "@morpho-org/morpho-ts";
 *
 * const values = [1, null, undefined, 2].filter(isDefined);
 * // values satisfies number[]
 * ```
 */
export const isDefined = <T>(v?: T | null): v is T => v != null;

/**
 * Creates a comparator for sorting by nullable bigint keys.
 *
 * @param getter - Reads the bigint sort key from an item.
 * @param order - Optional sort order. Defaults to ascending.
 * @returns A comparator compatible with `Array.prototype.sort`.
 * @example
 * ```ts
 * import { bigIntComparator } from "@morpho-org/morpho-ts";
 *
 * const sorted = [{ value: 2n }, { value: 1n }].sort(
 *   bigIntComparator((item) => item.value),
 * );
 * // [{ value: 1n }, { value: 2n }]
 * ```
 */
export const bigIntComparator =
  <T>(
    getter: (x: T) => bigint | undefined | null,
    order: "asc" | "desc" = "asc",
  ) =>
  (a: T, b: T) => {
    const xA = getter(a);
    const xB = getter(b);

    if (xA == null && xB == null) return 0;
    if (xA == null) return 1;
    if (xB == null) return -1;

    if (order === "asc") return xA > xB ? 1 : -1;

    return xA > xB ? -1 : 1;
  };

// biome-ignore lint/suspicious/noExplicitAny: recursion breaks type
const _get = (data: any, path: string[]): unknown => {
  if (data === null) return null;
  if (data === undefined) return undefined;

  if (path.length === 0) return data;

  const [key, ...rest] = path;

  return _get(data[key!], rest);
};

/**
 * Tests whether a dot-separated path resolves to a non-nullish value.
 *
 * @param data - Object to inspect.
 * @param path - Dot-separated path to read from `data`.
 * @returns `true` when the value at `path` is neither `null` nor `undefined`.
 * @example
 * ```ts
 * import { hasValue } from "@morpho-org/morpho-ts";
 *
 * const data = { user: { name: "Ada" as string | null } };
 * const result = hasValue(data, "user.name");
 * // true
 * ```
 */
export const hasValue = <
  T,
  Path extends PartialDottedKeys<T> = PartialDottedKeys<T>,
>(
  data: T,
  path: Path,
): data is T & { [path in Path]: NonNullable<FieldType<T, path>> } =>
  isDefined(getValue(data, path));

/**
 * Creates a reusable non-nullish path predicate.
 *
 * @param path - Dot-separated path the returned predicate reads.
 * @returns A predicate that narrows objects whose value at `path` is defined.
 * @example
 * ```ts
 * import { createHasValue } from "@morpho-org/morpho-ts";
 *
 * const hasName = createHasValue<{ user: { name?: string } }>("user.name");
 * const result = [{ user: {} }, { user: { name: "Ada" } }].filter(hasName);
 * // [{ user: { name: "Ada" } }]
 * ```
 */
export const createHasValue =
  <T, Path extends PartialDottedKeys<T> = PartialDottedKeys<T>>(path: Path) =>
  (data: T): data is T & { [path in Path]: NonNullable<FieldType<T, path>> } =>
    hasValue(data, path);

/**
 * Reads a value from an object by a dot-separated path.
 *
 * @param data - Object to inspect.
 * @param path - Dot-separated path to read from `data`.
 * @returns The value resolved at `path`, preserving nullish values from the input.
 * @example
 * ```ts
 * import { getValue } from "@morpho-org/morpho-ts";
 *
 * const value = getValue({ user: { name: "Ada" } }, "user.name");
 * // "Ada"
 * ```
 */
export const getValue = <
  T,
  Path extends PartialDottedKeys<T> = PartialDottedKeys<T>,
>(
  data: T,
  path: Path,
) => _get(data, path.split(".")) as FieldType<T, Path>;

/**
 * Applies a transform to a defined value while preserving nullish inputs.
 *
 * @param value - Value to transform.
 * @param _transform - Transform applied only when `value` is defined.
 * @returns The transformed value, or the original `null` or `undefined` input.
 * @example
 * ```ts
 * import { transformValue } from "@morpho-org/morpho-ts";
 *
 * const value = transformValue(2, (x) => x * 3);
 * // 6
 * ```
 */
export const transformValue = <T, R>(
  value: T | null | undefined,
  _transform: (v: T) => R,
) => (isDefined(value) ? _transform(value) : value);

/**
 * Creates a reusable getter for a dot-separated path.
 *
 * @param path - Dot-separated path the returned getter reads.
 * @returns A getter that reads the value at `path` from an object.
 * @example
 * ```ts
 * import { createGetValue } from "@morpho-org/morpho-ts";
 *
 * const getName = createGetValue<{ user: { name: string } }>("user.name");
 * const value = getName({ user: { name: "Ada" } });
 * // "Ada"
 * ```
 */
export const createGetValue =
  <T, Path extends PartialDottedKeys<T> = PartialDottedKeys<T>>(path: Path) =>
  (data: T) =>
    getValue(data, path);

/**
 * Returns object keys with a typed key union.
 *
 * @param o - Optional object to read keys from.
 * @returns The object's enumerable own property keys, or an empty array for nullish input.
 * @example
 * ```ts
 * import { keys } from "@morpho-org/morpho-ts";
 *
 * const result = keys({ a: 1, b: 2 });
 * // ["a", "b"]
 * ```
 */
export const keys = <T>(o?: T) =>
  Object.keys(o ?? {}) as (T extends ArrayLike<unknown>
    ? `${number}` // keyof Array == number | "length" | "toString" | ...
    :
        | `${Extract<keyof T, number>}` // number keys are converted to strings
        | Extract<keyof T, string>)[];

/**
 * Returns object values with a typed value union.
 *
 * @param o - Optional object to read values from.
 * @returns The object's enumerable own property values, or an empty array for nullish input.
 * @example
 * ```ts
 * import { values } from "@morpho-org/morpho-ts";
 *
 * const result = values({ a: 1, b: 2 });
 * // [1, 2]
 * ```
 */
export const values = <T>(o?: T) =>
  Object.values(o ?? {}) as (T extends ArrayLike<infer U> ? U : T[keyof T])[];

/**
 * Returns object entries with typed keys and values.
 *
 * @param o - Optional object to read entries from.
 * @returns The object's enumerable own entries, or an empty array for nullish input.
 * @example
 * ```ts
 * import { entries } from "@morpho-org/morpho-ts";
 *
 * const result = entries({ a: 1, b: 2 });
 * // [["a", 1], ["b", 2]]
 * ```
 */
export const entries = <T>(o?: T) =>
  Object.entries(o ?? {}) as [
    keyof T,
    T extends ArrayLike<infer U> ? U : T[keyof T],
  ][];

/**
 * Builds a typed record from key-value entries.
 *
 * @param srcEntries - Iterable of key-value entries.
 * @returns A record containing the provided entries.
 * @example
 * ```ts
 * import { fromEntries } from "@morpho-org/morpho-ts";
 *
 * const result = fromEntries([["a", 1]]);
 * // { a: 1 }
 * ```
 */
export const fromEntries = <K extends PropertyKey, T>(
  srcEntries: Iterable<readonly [K, T]>,
) => Object.fromEntries(srcEntries) as Record<K, T>;

/**
 * Builds a record from entries, merging duplicate keys.
 *
 * @param srcEntries - Iterable of key-value entries.
 * @param merger - Combines the previous value with a duplicate value.
 * @returns A record containing the merged entries.
 * @example
 * ```ts
 * import { mergeEntries } from "@morpho-org/morpho-ts";
 *
 * const result = mergeEntries(
 *   [["a", 1], ["a", 2]],
 *   (prev, value) => prev + value,
 * );
 * // { a: 3 }
 * ```
 */
export const mergeEntries = <K extends PropertyKey, T>(
  srcEntries: Iterable<readonly [K, T]>,
  merger: (prev: T, value: T) => T,
) => {
  const obj = {} as Record<K, T>;

  for (const [key, value] of srcEntries) {
    const prev = obj[key];

    obj[key] = prev ? merger(prev, value) : value;
  }

  return obj;
};

/**
 * Retries an asynchronous operation with a linear backoff delay.
 *
 * @param func - Operation to execute until it succeeds or retries are exhausted.
 * @param options - Optional retry settings.
 * @param options.timeout - Base delay in milliseconds multiplied by the retry attempt number.
 * @param options.retries - Maximum number of retry attempts.
 * @param options.onError - Optional hook called after each failure. Return a truthy value to stop retrying.
 * @returns The resolved operation result.
 * @example
 * ```ts
 * import { retryPromiseLinearBackoff } from "@morpho-org/morpho-ts";
 *
 * const value = await retryPromiseLinearBackoff(async () => "ready", {
 *   retries: 2,
 *   timeout: 10,
 * });
 * // "ready"
 * ```
 */
export const retryPromiseLinearBackoff = async <R>(
  func: () => R,
  {
    timeout = 100,
    retries = 8,
    onError,
  }: {
    timeout?: number;
    retries?: number;
    onError?: (error: unknown, index: number) => unknown | Promise<unknown>;
  },
) => {
  let i = 0;

  do {
    try {
      return await func();
    } catch (error) {
      if (await onError?.(error, i)) throw Error("stopped retrying");

      await Time.wait(timeout * ++i);
    }
  } while (i < retries);

  throw Error("too many retries");
};

/**
 * Returns the last item from a non-empty tuple.
 *
 * @param array - Non-empty tuple to read from.
 * @returns The last tuple item.
 * @example
 * ```ts
 * import { getLast } from "@morpho-org/morpho-ts";
 *
 * const value = getLast([1, 2, 3]);
 * // 3
 * ```
 */
export function getLast<T>(array: [T, ...(T | null | undefined)[]]): T;

/**
 * Returns the last item from an array.
 *
 * @param array - Array to read from.
 * @returns The last array item, or `undefined` when the array is empty.
 * @example
 * ```ts
 * import { getLast } from "@morpho-org/morpho-ts";
 *
 * const value = getLast([1, 2, 3]);
 * // 3
 * ```
 */
export function getLast<T>(array: T[]): T | undefined;

/**
 * Returns the last item from an array.
 *
 * @param array - Array to read from.
 * @returns The last array item, or `undefined` when the array is empty.
 * @example
 * ```ts
 * import { getLast } from "@morpho-org/morpho-ts";
 *
 * const value = getLast([1, 2, 3]);
 * // 3
 * ```
 */
export function getLast<T>(array: T[]) {
  return array[array.length - 1];
}

/**
 * Removes nullish values from a non-empty tuple.
 *
 * @param array - Non-empty tuple to filter.
 * @returns A non-empty tuple containing only defined values.
 * @example
 * ```ts
 * import { filterDefined } from "@morpho-org/morpho-ts";
 *
 * const values = filterDefined([1, null, 2]);
 * // [1, 2]
 * ```
 */
export function filterDefined<T>(
  array: [T, ...(T | null | undefined)[]],
): [T, ...T[]];

/**
 * Removes nullish values from an array.
 *
 * @param array - Array to filter.
 * @returns An array containing only defined values.
 * @example
 * ```ts
 * import { filterDefined } from "@morpho-org/morpho-ts";
 *
 * const values = filterDefined([1, null, undefined, 2]);
 * // [1, 2]
 * ```
 */
export function filterDefined<T>(array: (T | null | undefined)[]): T[];

/**
 * Removes nullish values from an array.
 *
 * @param array - Array to filter.
 * @returns An array containing only defined values.
 * @example
 * ```ts
 * import { filterDefined } from "@morpho-org/morpho-ts";
 *
 * const values = filterDefined([1, null, undefined, 2]);
 * // [1, 2]
 * ```
 */
export function filterDefined<T>(array: T[]) {
  return array.filter(isDefined);
}

/**
 * Returns the last defined item from a non-empty tuple.
 *
 * @param array - Non-empty tuple to read from.
 * @returns The last item after nullish values are removed.
 * @example
 * ```ts
 * import { getLastDefined } from "@morpho-org/morpho-ts";
 *
 * const value = getLastDefined([1, null, 2]);
 * // 2
 * ```
 */
export function getLastDefined<T>(array: [T, ...(T | null | undefined)[]]): T;

/**
 * Returns the last defined item from an array.
 *
 * @param array - Array to read from.
 * @returns The last defined item, or `undefined` when no item is defined.
 * @example
 * ```ts
 * import { getLastDefined } from "@morpho-org/morpho-ts";
 *
 * const value = getLastDefined([1, null, 2]);
 * // 2
 * ```
 */
export function getLastDefined<T>(
  array: (T | null | undefined)[],
): T | undefined;

/**
 * Returns the last defined item from an array.
 *
 * @param array - Array to read from.
 * @returns The last defined item, or `undefined` when no item is defined.
 * @example
 * ```ts
 * import { getLastDefined } from "@morpho-org/morpho-ts";
 *
 * const value = getLastDefined([1, null, 2]);
 * // 2
 * ```
 */
export function getLastDefined<T>(array: T[]) {
  return getLast(filterDefined(array));
}

/**
 * Thrown when a uint-like value is negative.
 *
 * @example
 * ```ts
 * import { NegativeValueError } from "@morpho-org/morpho-ts";
 *
 * throw new NegativeValueError("assets", -1n);
 * ```
 */
export class NegativeValueError extends Error {
  public constructor(field: string, value: bigint) {
    super(`${field} "${value}" must be non-negative.`);
    this.name = "NegativeValueError";
  }
}

/**
 * Asserts that a bigint value is non-negative.
 *
 * @param field - Field name used in the thrown error message.
 * @param value - Bigint value to validate.
 * @throws NegativeValueError when `value` is negative.
 * @example
 * ```ts
 * import { assertNonNegative } from "@morpho-org/morpho-ts";
 *
 * assertNonNegative("assets", 0n);
 * ```
 */
export function assertNonNegative(field: string, value: bigint) {
  if (value < 0n) throw new NegativeValueError(field, value);
}

/**
 * Recursively freezes an object and its nested object properties.
 *
 * @param obj - Object to freeze recursively.
 * @returns The same object reference after recursive freezing.
 * @example
 * ```ts
 * import { deepFreeze } from "@morpho-org/morpho-ts";
 *
 * const value = deepFreeze({ nested: { amount: 1n } });
 * // Object.isFrozen(value) === true
 * ```
 */
export function deepFreeze<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    // null or undefined are already immutable
    return obj;
  }

  const propNames = Object.getOwnPropertyNames(obj);

  for (const name of propNames) {
    // biome-ignore lint/suspicious/noExplicitAny: name is a property of obj
    const value = (obj as any)[name];

    if (value && typeof value === "object") {
      deepFreeze(value);
    }
  }

  return Object.freeze(obj);
}
