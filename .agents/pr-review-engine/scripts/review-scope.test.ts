import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseArgs, runHash, toHttpsUrl, UsageError } from "./review-scope.ts";

describe("toHttpsUrl", () => {
  it("rewrites an scp-style GitHub SSH remote", () => {
    expect(toHttpsUrl("git@github.com:0xbulma/facets.git")).toBe(
      "https://github.com/0xbulma/facets.git",
    );
  });
  it("rewrites an ssh:// GitHub remote", () => {
    expect(toHttpsUrl("ssh://git@github.com/0xbulma/facets.git")).toBe(
      "https://github.com/0xbulma/facets.git",
    );
  });
  it("leaves an already-HTTPS remote unchanged", () => {
    expect(toHttpsUrl("https://github.com/0xbulma/facets.git")).toBe(
      "https://github.com/0xbulma/facets.git",
    );
  });
  it("leaves a non-GitHub remote unchanged (no-op)", () => {
    expect(toHttpsUrl("git@gitlab.com:o/r.git")).toBe("git@gitlab.com:o/r.git");
  });
  it("trims surrounding whitespace", () => {
    expect(toHttpsUrl("  git@github.com:o/r.git\n")).toBe(
      "https://github.com/o/r.git",
    );
  });
});

describe("runHash", () => {
  it("is stable for identical inputs and 16 hex chars", () => {
    const a = runHash({ mergeBase: "mb", headSha: "h", diff: "d" });
    const b = runHash({ mergeBase: "mb", headSha: "h", diff: "d" });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });
  it("changes when the diff CONTENT changes (the #23 regression: not content-blind)", () => {
    const a = runHash({ mergeBase: "mb", headSha: "h", diff: "X" });
    const b = runHash({ mergeBase: "mb", headSha: "h", diff: "Y" });
    expect(a).not.toBe(b);
  });
  it("changes when merge-base or head SHA changes", () => {
    const base = runHash({ mergeBase: "mb", headSha: "h", diff: "d" });
    expect(runHash({ mergeBase: "mb2", headSha: "h", diff: "d" })).not.toBe(
      base,
    );
    expect(runHash({ mergeBase: "mb", headSha: "h2", diff: "d" })).not.toBe(
      base,
    );
  });
});

describe("parseArgs", () => {
  it("parses --to-https", () => {
    expect(parseArgs(["--to-https", "git@github.com:o/r.git"])).toEqual({
      kind: "to-https",
      url: "git@github.com:o/r.git",
    });
  });
  it("parses --run-hash --base", () => {
    expect(parseArgs(["--run-hash", "--base", "abc"])).toEqual({
      kind: "run-hash",
      base: "abc",
    });
  });
  it("throws on a missing value or unknown mode", () => {
    expect(() => parseArgs(["--to-https"])).toThrow(UsageError);
    expect(() => parseArgs(["--run-hash"])).toThrow(UsageError);
    expect(() => parseArgs(["--bogus"])).toThrow(UsageError);
  });
});

describe("CLI --run-hash (real git fixture)", () => {
  const SCRIPT = join(import.meta.dirname, "review-scope.ts");

  function run(cwd: string, args: string[]): string {
    return execFileSync("node", [SCRIPT, ...args], {
      cwd,
      encoding: "utf8",
    }).trim();
  }

  it("changes the run hash when an already-modified file is edited in place", () => {
    const dir = mkdtempSync(join(tmpdir(), "rs-"));
    try {
      const g = (...a: string[]) =>
        execFileSync("git", a, { cwd: dir, encoding: "utf8" });
      g("init", "-q");
      g("config", "user.email", "a@b.c");
      g("config", "user.name", "x");
      g("config", "commit.gpgsign", "false"); // fixture must not depend on the dev's signing agent
      writeFileSync(join(dir, "f.txt"), "v1\n");
      g("add", "f.txt");
      g("commit", "-qm", "init");
      const mb = g("rev-parse", "HEAD").trim();

      writeFileSync(join(dir, "f.txt"), "v1\nmodified-X\n");
      const h1 = run(dir, ["--run-hash", "--base", mb]);
      // Edit the SAME already-modified file in place — porcelain status is
      // unchanged (` M f.txt`), but the content differs, so the hash MUST move.
      writeFileSync(join(dir, "f.txt"), "v1\nmodified-Y\n");
      const h2 = run(dir, ["--run-hash", "--base", mb]);

      expect(h1).toMatch(/^[0-9a-f]{16}$/);
      expect(h1).not.toBe(h2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
