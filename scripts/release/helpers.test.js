import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { getErrorMessage, isPathInside, sanitizeLogLine } from "./helpers.mjs";

describe("getErrorMessage", () => {
  test("default", () => {
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
  });

  test("behavior: coerces non-Error values to a string", () => {
    expect(getErrorMessage("plain string")).toBe("plain string");
    expect(getErrorMessage(42)).toBe("42");
    expect(getErrorMessage(undefined)).toBe("undefined");
  });
});

describe("sanitizeLogLine", () => {
  test("default", () => {
    expect(sanitizeLogLine("packages/alpha/package.json")).toBe(
      "packages/alpha/package.json",
    );
  });

  test("behavior: replaces control characters", () => {
    expect(sanitizeLogLine("\n::add-mask::secret\t.md")).toBe(
      "?::add-mask::secret?.md",
    );
    expect(sanitizeLogLine("a\x7fb")).toBe("a?b");
  });
});

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
