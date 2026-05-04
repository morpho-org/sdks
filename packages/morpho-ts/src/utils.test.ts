import { describe, expect, test, vi } from "vitest";
import {
  bigIntComparator,
  createGetValue,
  createHasValue,
  deepFreeze,
  entries,
  filterDefined,
  fromEntries,
  getLast,
  getLastDefined,
  getValue,
  hasValue,
  isDefined,
  isNotNull,
  isNotUndefined,
  keys,
  mergeEntries,
  retryPromiseLinearBackoff,
  transformValue,
  values,
  ZERO_ADDRESS,
} from "./utils.js";

describe("ZERO_ADDRESS", () => {
  test("is the canonical zero address", () => {
    expect(ZERO_ADDRESS).toBe("0x0000000000000000000000000000000000000000");
  });

  test("has length 42 (0x + 40 hex chars)", () => {
    expect(ZERO_ADDRESS.length).toBe(42);
  });
});

describe("isNotNull", () => {
  test("returns true for non-null values including undefined, 0, '', NaN, false", () => {
    expect(isNotNull(0)).toBe(true);
    expect(isNotNull("")).toBe(true);
    expect(isNotNull(false)).toBe(true);
    expect(isNotNull(undefined as unknown as number)).toBe(true);
    expect(isNotNull(Number.NaN)).toBe(true);
    expect(isNotNull({})).toBe(true);
    expect(isNotNull([])).toBe(true);
  });

  test("returns false for null", () => {
    expect(isNotNull(null)).toBe(false);
  });

  test("narrows the type", () => {
    const v: string | null = "hello" as string | null;
    if (isNotNull(v)) {
      // type-narrowed to string at compile time
      expect(v.length).toBe(5);
    }
  });
});

describe("isNotUndefined", () => {
  test("returns true for non-undefined values including null, 0, '', false", () => {
    expect(isNotUndefined(0)).toBe(true);
    expect(isNotUndefined("")).toBe(true);
    expect(isNotUndefined(false)).toBe(true);
    expect(isNotUndefined(null as unknown as number)).toBe(true);
  });

  test("returns false for undefined", () => {
    expect(isNotUndefined(undefined)).toBe(false);
  });
});

describe("isDefined", () => {
  test("returns false for null and undefined", () => {
    expect(isDefined(null)).toBe(false);
    expect(isDefined(undefined)).toBe(false);
  });

  test("returns true for falsy non-null/undefined values", () => {
    expect(isDefined(0)).toBe(true);
    expect(isDefined("")).toBe(true);
    expect(isDefined(false)).toBe(true);
    expect(isDefined(Number.NaN)).toBe(true);
    expect(isDefined({})).toBe(true);
    expect(isDefined([])).toBe(true);
  });
});

describe("bigIntComparator", () => {
  test("ascending order by default", () => {
    const items = [{ v: 3n }, { v: 1n }, { v: 2n }];
    items.sort(bigIntComparator((x) => x.v));
    expect(items.map((x) => x.v)).toEqual([1n, 2n, 3n]);
  });

  test("descending order", () => {
    const items = [{ v: 3n }, { v: 1n }, { v: 2n }];
    items.sort(bigIntComparator((x) => x.v, "desc"));
    expect(items.map((x) => x.v)).toEqual([3n, 2n, 1n]);
  });

  test("treats null/undefined values as larger than any concrete bigint (placed last)", () => {
    const items = [{ v: 1n }, { v: null }, { v: 2n }, { v: undefined }];
    items.sort(bigIntComparator((x) => x.v));
    // null/undefined go last in ascending order
    expect(items.slice(0, 2).map((x) => x.v)).toEqual([1n, 2n]);
    expect(items[2]!.v == null).toBe(true);
    expect(items[3]!.v == null).toBe(true);
  });

  test("treats two null/undefined entries as equal (returns 0)", () => {
    const cmp = bigIntComparator<{ v: bigint | null }>((x) => x.v);
    expect(cmp({ v: null }, { v: null })).toBe(0);
  });

  test("works with very large bigints", () => {
    const items = [{ v: 2n ** 256n - 1n }, { v: 0n }, { v: 1n }];
    items.sort(bigIntComparator((x) => x.v));
    expect(items.map((x) => x.v)).toEqual([0n, 1n, 2n ** 256n - 1n]);
  });
});

describe("getValue / hasValue / createGetValue / createHasValue", () => {
  const obj = {
    a: 1,
    nested: { b: 2, deep: { c: 3 } },
    n: null as null | number,
    u: undefined as undefined | string,
  };

  test("getValue with shallow path", () => {
    expect(getValue(obj, "a")).toBe(1);
  });

  test("getValue with dotted path", () => {
    expect(getValue(obj, "nested.b")).toBe(2);
    expect(getValue(obj, "nested.deep.c")).toBe(3);
  });

  test("getValue returns null when path traverses null", () => {
    expect(getValue({ a: null as null | { b: number } }, "a.b" as never)).toBe(
      null,
    );
  });

  test("getValue returns undefined when key missing", () => {
    expect(getValue(obj, "nested.missing" as never)).toBe(undefined);
  });

  test("hasValue returns true for present non-nullish values", () => {
    expect(hasValue(obj, "a")).toBe(true);
    expect(hasValue(obj, "nested.b")).toBe(true);
  });

  test("hasValue returns false for null/undefined values", () => {
    expect(hasValue(obj, "n")).toBe(false);
    expect(hasValue(obj, "u")).toBe(false);
  });

  test("createGetValue returns a reusable getter", () => {
    const getA = createGetValue<typeof obj>("a");
    expect(getA(obj)).toBe(1);
  });

  test("createHasValue returns a reusable predicate", () => {
    const hasA = createHasValue<typeof obj>("a");
    expect(hasA(obj)).toBe(true);
    expect(hasA({ ...obj, a: undefined as unknown as number })).toBe(false);
  });
});

describe("transformValue", () => {
  test("applies the transform when value is defined", () => {
    expect(transformValue(2, (n) => n * 3)).toBe(6);
  });

  test("returns null/undefined unchanged without invoking transform", () => {
    const fn = vi.fn((x: number) => x);
    expect(transformValue(null, fn)).toBe(null);
    expect(transformValue(undefined, fn)).toBe(undefined);
    expect(fn).not.toHaveBeenCalled();
  });

  test("preserves falsy non-nullish values (0, '')", () => {
    expect(transformValue(0, (n) => n + 1)).toBe(1);
    expect(transformValue("", (s) => `${s}x`)).toBe("x");
  });
});

describe("keys / values / entries / fromEntries", () => {
  test("keys() returns sorted-by-insertion (numeric first, then string)", () => {
    expect(keys({ b: 2, a: 1, "3": "c" })).toEqual(["3", "b", "a"]);
  });

  test("keys() handles empty object", () => {
    expect(keys({})).toEqual([]);
  });

  test("keys() handles null/undefined input", () => {
    expect(keys()).toEqual([]);
    expect(keys(null as unknown as object)).toEqual([]);
  });

  test("keys() of an array yields stringified indices", () => {
    expect(keys([10, 20, 30])).toEqual(["0", "1", "2"]);
  });

  test("values() returns object values", () => {
    expect(values({ a: 1, b: 2 })).toEqual([1, 2]);
  });

  test("values() handles null/undefined input", () => {
    expect(values()).toEqual([]);
    expect(values(null as unknown as object)).toEqual([]);
  });

  test("values() of an array yields the elements", () => {
    expect(values([10, 20, 30])).toEqual([10, 20, 30]);
  });

  test("entries() returns key/value pairs", () => {
    expect(entries({ a: 1, b: 2 })).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
  });

  test("entries() handles null/undefined input", () => {
    expect(entries()).toEqual([]);
    expect(entries(null as unknown as object)).toEqual([]);
  });

  test("fromEntries reconstructs object from iterable of pairs", () => {
    expect(
      fromEntries([
        ["a", 1],
        ["b", 2],
      ] as const),
    ).toEqual({ a: 1, b: 2 });
  });

  test("fromEntries handles a Map", () => {
    expect(
      fromEntries(
        new Map([
          ["a", 1],
          ["b", 2],
        ]),
      ),
    ).toEqual({ a: 1, b: 2 });
  });
});

describe("mergeEntries", () => {
  test("merges duplicate keys via merger", () => {
    const merged = mergeEntries<string, number>(
      [
        ["a", 1],
        ["a", 2],
        ["b", 3],
      ],
      (prev, value) => prev + value,
    );
    expect(merged).toEqual({ a: 3, b: 3 });
  });

  test("preserves first occurrence when merger returns prev", () => {
    const merged = mergeEntries<string, number>(
      [
        ["a", 1],
        ["a", 99],
      ],
      (prev) => prev,
    );
    expect(merged).toEqual({ a: 1 });
  });

  test("returns empty record for empty input", () => {
    expect(
      mergeEntries(
        [] as readonly (readonly [string, number])[],
        (a, b) => a + b,
      ),
    ).toEqual({});
  });

  test("does not call merger for first occurrence of a key", () => {
    const merger = vi.fn((a: number, b: number) => a + b);
    mergeEntries<string, number>(
      [
        ["a", 1],
        ["b", 2],
      ],
      merger,
    );
    expect(merger).not.toHaveBeenCalled();
  });

  test("supports objects (last-write semantics via merger)", () => {
    const merged = mergeEntries<string, { x: number }>(
      [
        ["a", { x: 1 }],
        ["a", { x: 2 }],
      ],
      (_, v) => v,
    );
    expect(merged).toEqual({ a: { x: 2 } });
  });
});

describe("retryPromiseLinearBackoff", () => {
  test("returns the result on first success without retry", async () => {
    const fn = vi.fn(async () => "ok");
    const result = await retryPromiseLinearBackoff(fn, {
      timeout: 1,
      retries: 3,
    });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("retries on failure and eventually succeeds", async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts < 3) throw new Error("transient");
      return "ok";
    });
    const result = await retryPromiseLinearBackoff(fn, {
      timeout: 1,
      retries: 5,
    });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test("throws 'too many retries' when retries exhausted", async () => {
    const fn = vi.fn(async () => {
      throw new Error("always");
    });
    await expect(
      retryPromiseLinearBackoff(fn, { timeout: 1, retries: 2 }),
    ).rejects.toThrow("too many retries");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("throws 'stopped retrying' when onError returns truthy", async () => {
    const fn = vi.fn(async () => {
      throw new Error("nope");
    });
    const onError = vi.fn(async () => true);
    await expect(
      retryPromiseLinearBackoff(fn, { timeout: 1, retries: 5, onError }),
    ).rejects.toThrow("stopped retrying");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  test("continues retrying when onError returns falsy", async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts < 2) throw new Error("transient");
      return "ok";
    });
    const onError = vi.fn(async () => false);
    const result = await retryPromiseLinearBackoff(fn, {
      timeout: 1,
      retries: 5,
      onError,
    });
    expect(result).toBe("ok");
    expect(onError).toHaveBeenCalledTimes(1);
  });

  test("uses default timeout=100 and retries=8 when omitted", async () => {
    const fn = vi.fn(async () => "ok");
    const result = await retryPromiseLinearBackoff(fn, {});
    expect(result).toBe("ok");
  });

  test("forwards thrown errors to onError with the attempt index", async () => {
    const errors: unknown[] = [];
    const indices: number[] = [];
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts < 3) throw new Error(`fail-${attempts}`);
      return "done";
    });
    await retryPromiseLinearBackoff(fn, {
      timeout: 1,
      retries: 5,
      onError: async (err, i) => {
        errors.push(err);
        indices.push(i);
      },
    });
    expect(errors).toHaveLength(2);
    expect((errors[0] as Error).message).toBe("fail-1");
    expect((errors[1] as Error).message).toBe("fail-2");
    expect(indices).toEqual([0, 1]);
  });
});

describe("getLast", () => {
  test("returns the last element of a non-empty array", () => {
    expect(getLast([1, 2, 3])).toBe(3);
  });

  test("returns undefined for empty array", () => {
    expect(getLast([] as number[])).toBe(undefined);
  });

  test("returns the only element for singleton", () => {
    expect(getLast([42])).toBe(42);
  });

  test("preserves null/undefined values at the end", () => {
    expect(getLast([1, null] as Array<number | null>)).toBe(null);
    expect(getLast([1, undefined] as Array<number | undefined>)).toBe(
      undefined,
    );
  });
});

describe("filterDefined", () => {
  test("removes null and undefined", () => {
    expect(
      filterDefined([1, null, 2, undefined, 3] as Array<
        number | null | undefined
      >),
    ).toEqual([1, 2, 3]);
  });

  test("preserves falsy values that are defined (0, '', false)", () => {
    expect(
      filterDefined([0, "", false, null, undefined] as Array<unknown>),
    ).toEqual([0, "", false]);
  });

  test("returns empty array when all values are nullish", () => {
    expect(
      filterDefined([null, undefined] as Array<number | null | undefined>),
    ).toEqual([]);
  });

  test("returns a new array (does not mutate input)", () => {
    const input = [1, null, 2] as Array<number | null>;
    const result = filterDefined(input);
    expect(result).not.toBe(input);
    expect(input).toEqual([1, null, 2]);
  });
});

describe("getLastDefined", () => {
  test("returns the last defined value", () => {
    expect(getLastDefined([1, null, 2, undefined])).toBe(2);
  });

  test("returns undefined when no defined values exist", () => {
    expect(
      getLastDefined([null, undefined, null] as Array<
        number | null | undefined
      >),
    ).toBe(undefined);
  });

  test("returns the only element when array has one defined value", () => {
    expect(getLastDefined([42])).toBe(42);
  });
});

describe("deepFreeze", () => {
  test("freezes top-level object", () => {
    const obj = { a: 1, b: 2 };
    deepFreeze(obj);
    expect(Object.isFrozen(obj)).toBe(true);
  });

  test("freezes nested objects", () => {
    const obj = { a: 1, nested: { b: 2, deep: { c: 3 } } };
    deepFreeze(obj);
    expect(Object.isFrozen(obj.nested)).toBe(true);
    expect(Object.isFrozen(obj.nested.deep)).toBe(true);
  });

  test("freezes arrays", () => {
    const obj = { items: [1, 2, 3] };
    deepFreeze(obj);
    expect(Object.isFrozen(obj.items)).toBe(true);
  });

  test("returns the same reference", () => {
    const obj = { a: 1 };
    expect(deepFreeze(obj)).toBe(obj);
  });

  test("returns null/undefined unchanged", () => {
    expect(deepFreeze(null)).toBe(null);
    expect(deepFreeze(undefined)).toBe(undefined);
  });

  test("frozen objects throw on mutation in strict mode", () => {
    const obj = { a: 1 };
    deepFreeze(obj);
    expect(() => {
      obj.a = 2;
    }).toThrow();
  });

  test("handles primitive scalars without throwing", () => {
    // The implementation calls Object.getOwnPropertyNames which works on primitives via boxing.
    expect(() => deepFreeze(0 as unknown as object)).not.toThrow();
    expect(() => deepFreeze("string" as unknown as object)).not.toThrow();
  });
});
