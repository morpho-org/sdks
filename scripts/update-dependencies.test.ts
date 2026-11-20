import { mkdtempSync, rmdirSync, rmSync, symlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test, vi } from "vitest";
import { updateDependencies } from "./update-dependencies.ts";

describe("updateDependencies", () => {
  test.each(["add", "update"])(
    "targets a workspace for %s but validates and installs at root",
    (command) => {
      const run = vi.fn();
      updateDependencies(
        [
          command,
          "--workspace",
          "packages/morpho-ts",
          "is-number@7.0.0",
          "--dev",
        ],
        run,
      );
      expect(run.mock.calls).toEqual([
        [
          "bun",
          [
            command,
            "--cwd",
            fileURLToPath(new URL("../packages/morpho-ts", import.meta.url)),
            "is-number@7.0.0",
            "--dev",
            "--lockfile-only",
            "--ignore-scripts",
          ],
        ],
        [
          process.execPath,
          [expect.stringMatching(/\/check-release-age\.ts$/), "--all"],
        ],
        ["bun", ["install", "--frozen-lockfile"]],
      ]);
    },
  );
  test.each([
    ["add", "is-number@7.0.0", "--dev"],
    ["update", "is-number", "--latest"],
    ["update"],
  ])("resolves, validates, then installs: %j", (...args) => {
    const run = vi.fn();
    updateDependencies(args, run);
    expect(run.mock.calls).toEqual([
      ["bun", [...args, "--lockfile-only", "--ignore-scripts"]],
      [
        process.execPath,
        [expect.stringMatching(/\/check-release-age\.ts$/), "--all"],
      ],
      ["bun", ["install", "--frozen-lockfile"]],
    ]);
  });
  test.each([
    [],
    ["install"],
    ["add"],
    ["add", "--dev"],
    ["update", "--cwd=elsewhere"],
    ["add", "x", "--ignore-scripts=false"],
    ["update", "--workspace"],
    ["update", "--workspace", "../outside"],
    ["update", "--workspace", "/packages/morpho-ts"],
    ["update", "--workspace", "packages/../scripts"],
    ["update", "--workspace", "packages/morpho-ts/src"],
    ["update", "--workspace", "packages/not-a-workspace"],
    [
      "update",
      "--workspace",
      "packages/morpho-ts",
      "--workspace",
      "packages/test",
    ],
    ["add", "--workspace", "packages/morpho-ts"],
  ])("rejects unsafe or empty arguments: %j", (...args) => {
    const run = vi.fn();
    expect(() => updateDependencies(args, run)).toThrow();
    expect(run).not.toHaveBeenCalled();
  });
  test("rejects symlinked workspace directories", () => {
    const parent = mkdtempSync(
      fileURLToPath(new URL("../packages/workspace-test-", import.meta.url)),
    );
    rmdirSync(parent);
    try {
      symlinkSync(
        fileURLToPath(new URL("../packages/morpho-ts", import.meta.url)),
        parent,
      );
      const run = vi.fn();
      expect(() =>
        updateDependencies(
          ["update", "--workspace", `packages/${parent.split("/").at(-1)}`],
          run,
        ),
      ).toThrow();
      expect(run).not.toHaveBeenCalled();
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });
  test.each([1, 2, 3])("stops when stage %i fails", (stage) => {
    const failure = new Error("stage failed");
    let calls = 0;
    const run = vi.fn(() => {
      if (++calls === stage) throw failure;
    });
    expect(() => updateDependencies(["update"], run)).toThrow(failure);
    expect(run).toHaveBeenCalledTimes(stage);
  });
});
