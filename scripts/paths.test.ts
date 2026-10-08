import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { isPathInside } from "./paths.ts";

describe("isPathInside", () => {
  test("default", () => {
    const base = join("/repo");

    expect(isPathInside(base, join(base, "packages/alpha/package.json"))).toBe(
      true,
    );
  });

  test("behavior: treats the base directory itself as inside", () => {
    expect(isPathInside("/repo", "/repo")).toBe(true);
  });

  test("behavior: rejects traversal and sibling paths", () => {
    expect(isPathInside("/repo", join("/repo", "../etc/passwd"))).toBe(false);
    expect(isPathInside("/repo", "/other/package.json")).toBe(false);
  });
});
