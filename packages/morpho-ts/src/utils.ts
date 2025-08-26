import { Time } from "./time";
import type { FieldType, PartialDottedKeys } from "./types";

export const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000" as const;

export const isNotNull = <T>(v: T | null): v is T => v !== null;
export const isNotUndefined = <T>(v: T | undefined): v is T => v !== undefined;

export const isDefined = <T>(v?: T | null): v is T => v != null;

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

const _get = <T>(data: T, path: string[]): unknown => {
  if (data === null) return null;
  if (data === undefined) return undefined;

  if (path.length === 0) return data;

  const [key, ...rest] = path;

  return _get((data as Record<string, unknown>)[key!], rest);
};

export const hasValue = <
  T,
  Path extends PartialDottedKeys<T> = PartialDottedKeys<T>,
>(
  data: T,
  path: Path,
): data is T & { [path in Path]: NonNullable<FieldType<T, path>> } =>
  isDefined(getValue(data, path));

export const createHasValue =
  <T, Path extends PartialDottedKeys<T> = PartialDottedKeys<T>>(path: Path) =>
  (data: T): data is T & { [path in Path]: NonNullable<FieldType<T, path>> } =>
    hasValue(data, path);

export const getValue = <
  T,
  Path extends PartialDottedKeys<T> = PartialDottedKeys<T>,
>(
  data: T,
  path: Path,
) => _get(data, path.split(".")) as FieldType<T, Path>;

export const transformValue = <T, R>(
  value: T | null | undefined,
  _transform: (v: T) => R,
) => (isDefined(value) ? _transform(value) : value);

export const createGetValue =
  <T, Path extends PartialDottedKeys<T> = PartialDottedKeys<T>>(path: Path) =>
  (data: T) =>
    getValue(data, path);

export const keys = <T>(o?: T) =>
  Object.keys(o ?? {}) as (T extends ArrayLike<unknown> ? number : keyof T)[];

export const values = <T>(o?: T) =>
  Object.values(o ?? {}) as (T extends ArrayLike<infer U> ? U : T[keyof T])[];

export const entries = <T>(o?: T) =>
  Object.entries(o ?? {}) as [
    keyof T,
    T extends ArrayLike<infer U> ? U : T[keyof T],
  ][];

export const fromEntries = <K extends PropertyKey, T>(
  srcEntries: Iterable<readonly [K, T]>,
) => Object.fromEntries(srcEntries) as Record<K, T>;

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

export function getLast<T>(array: [T, ...(T | null | undefined)[]]): T;
export function getLast<T>(array: T[]): T | undefined;
export function getLast<T>(array: T[]) {
  return array[array.length - 1];
}

export function filterDefined<T>(
  array: [T, ...(T | null | undefined)[]],
): [T, ...T[]];
export function filterDefined<T>(array: (T | null | undefined)[]): T[];
export function filterDefined<T>(array: T[]) {
  return array.filter(isDefined);
}

export function getLastDefined<T>(array: [T, ...(T | null | undefined)[]]): T;
export function getLastDefined<T>(
  array: (T | null | undefined)[],
): T | undefined;
export function getLastDefined<T>(array: T[]) {
  return getLast(filterDefined(array));
}

export function deepFreeze<T>(obj: T): T {
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
