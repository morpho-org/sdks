import { describe, expect, test } from "vitest";

import changelog from "./changelog.ts";

describe("getReleaseLine", () => {
  test("default", async () => {
    await expect(
      changelog.getReleaseLine({ summary: "Fix rounding in `toAssets`." }),
    ).resolves.toBe("- Fix rounding in `toAssets`.");
  });

  test("behavior: indents continuation lines and leaves blank lines empty", async () => {
    await expect(
      changelog.getReleaseLine({ summary: "Title  \n\nBody line \n- item" }),
    ).resolves.toBe("- Title\n\n  Body line\n  - item");
  });

  test("behavior: ignores PR, commit and author metadata", async () => {
    const line = await changelog.getReleaseLine({
      summary: "Add vault reader",
      commit: "abcdef1234567890",
      id: "brave-dogs-sing",
      releases: [],
    } as Parameters<typeof changelog.getReleaseLine>[0]);
    expect(line).toBe("- Add vault reader");
  });
});

describe("getDependencyReleaseLine", () => {
  test("default", async () => {
    await expect(
      changelog.getDependencyReleaseLine(
        [{ summary: "x" }],
        [{ name: "@morpho-org/blue-sdk", newVersion: "7.1.0" }],
      ),
    ).resolves.toBe("- Updated dependencies\n  - @morpho-org/blue-sdk@7.1.0");
  });

  test("behavior: empty when no dependency changed", async () => {
    await expect(
      changelog.getDependencyReleaseLine([{ summary: "x" }], []),
    ).resolves.toBe("");
  });
});
