import { keys } from "../src";

import { describe, expect, test } from "vitest";

describe("utils", () => {
  test("should list keys of object", async () => {
    expect(keys({ a: 1, b: 2, 3: "c", 1.1: 1 })).toEqual([
      "3",
      "a",
      "b",
      "1.1",
    ]);
  });

  test("should list keys of array", async () => {
    expect(keys([1, 2, 3])).toEqual(["0", "1", "2"]);
  });
});
