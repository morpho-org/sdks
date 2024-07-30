import { Time } from "./time";
import { FieldType, PartialDottedKeys } from "./types";

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

    if (xA == undefined && xB == undefined) return 0;
    if (xA == undefined) return 1;
    if (xB == undefined) return -1;

    if (order === "asc") return xA > xB ? 1 : -1;

    return xA > xB ? -1 : 1;
  };

const _get = (data: any, path: string[]): any => {
  if (data === null) return null;
  if (data === undefined) return undefined;

  if (path.length === 0) return data;

  const [key, ...rest] = path;

  return _get(data[key!], rest);
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
    onError?: (error: unknown, index: number) => any | Promise<any>;
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
