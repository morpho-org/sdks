import { describe, expect, test } from "vitest";
import { buildChangedLines, DiffParseError } from "./build-changed-lines.ts";

describe("buildChangedLines", () => {
  test("default: returns empty map for empty diff", () => {
    expect(buildChangedLines("")).toEqual({});
  });

  test("behavior: single file with a single hunk emits added line numbers", () => {
    const diff = [
      "diff --git a/src/foo.ts b/src/foo.ts",
      "index abc..def 100644",
      "--- a/src/foo.ts",
      "+++ b/src/foo.ts",
      "@@ -10,0 +11,3 @@",
      "+a",
      "+b",
      "+c",
      "",
    ].join("\n");
    expect(buildChangedLines(diff)).toEqual({ "src/foo.ts": [11, 12, 13] });
  });

  test("behavior: omitted count in hunk header defaults to 1", () => {
    const diff = [
      "diff --git a/src/foo.ts b/src/foo.ts",
      "+++ b/src/foo.ts",
      "@@ -1 +1 @@",
      "+x",
      "",
    ].join("\n");
    expect(buildChangedLines(diff)).toEqual({ "src/foo.ts": [1] });
  });

  test("behavior: multiple hunks in same file produce deduped sorted list", () => {
    const diff = [
      "diff --git a/x.ts b/x.ts",
      "+++ b/x.ts",
      "@@ -1,0 +5,2 @@",
      "+a",
      "+b",
      "@@ -3,0 +2,1 @@",
      "+c",
      "",
    ].join("\n");
    expect(buildChangedLines(diff)).toEqual({ "x.ts": [2, 5, 6] });
  });

  test("behavior: deletion-only hunk (count=0) emits no entries", () => {
    const diff = [
      "diff --git a/x.ts b/x.ts",
      "+++ b/x.ts",
      "@@ -10,3 +10,0 @@",
      "-a",
      "-b",
      "-c",
      "",
    ].join("\n");
    expect(buildChangedLines(diff)).toEqual({ "x.ts": [] });
  });

  test("behavior: pure rename emits the new path with an empty array", () => {
    const diff = [
      "diff --git a/old.ts b/new.ts",
      "similarity index 100%",
      "rename from old.ts",
      "rename to new.ts",
      "",
    ].join("\n");
    expect(buildChangedLines(diff)).toEqual({ "new.ts": [] });
  });

  test("behavior: rename with content changes captures both rename target and added lines", () => {
    const diff = [
      "diff --git a/old.ts b/new.ts",
      "similarity index 80%",
      "rename from old.ts",
      "rename to new.ts",
      "--- a/old.ts",
      "+++ b/new.ts",
      "@@ -5,0 +5,1 @@",
      "+added",
      "",
    ].join("\n");
    expect(buildChangedLines(diff)).toEqual({ "new.ts": [5] });
  });

  test("behavior: file deletion (+++ /dev/null) is absent from the map", () => {
    const diff = [
      "diff --git a/gone.ts b/gone.ts",
      "deleted file mode 100644",
      "--- a/gone.ts",
      "+++ /dev/null",
      "@@ -1,3 +0,0 @@",
      "-a",
      "-b",
      "-c",
      "",
    ].join("\n");
    expect(buildChangedLines(diff)).toEqual({});
  });

  test("behavior: multiple files in same diff land under their own keys", () => {
    const diff = [
      "diff --git a/a.ts b/a.ts",
      "+++ b/a.ts",
      "@@ -1,0 +1,2 @@",
      "+x",
      "+y",
      "diff --git a/b.ts b/b.ts",
      "+++ b/b.ts",
      "@@ -1,0 +1,1 @@",
      "+z",
      "",
    ].join("\n");
    expect(buildChangedLines(diff)).toEqual({
      "a.ts": [1, 2],
      "b.ts": [1],
    });
  });

  test("behavior: new file (post-image hunks starting at line 1) is captured", () => {
    const diff = [
      "diff --git a/new.ts b/new.ts",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/new.ts",
      "@@ -0,0 +1,2 @@",
      "+a",
      "+b",
      "",
    ].join("\n");
    expect(buildChangedLines(diff)).toEqual({ "new.ts": [1, 2] });
  });

  test("behavior: hunk header lines that don't match HUNK_RE are silently skipped (git won't emit them anyway)", () => {
    const diff = [
      "diff --git a/x.ts b/x.ts",
      "+++ b/x.ts",
      "@@ -1,0 +bogus,2 @@",
      "+a",
      "",
    ].join("\n");
    // The `+++ b/x.ts` line registers the file with an empty list; the
    // malformed hunk header doesn't match HUNK_RE so no lines are appended.
    expect(buildChangedLines(diff)).toEqual({ "x.ts": [] });
  });

  test("error: DiffParseError class is exported and named", () => {
    const e = new DiffParseError("nope", "+++ ???");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("DiffParseError");
    expect(e.message).toBe("nope");
    expect(e.offendingLine).toBe("+++ ???");
  });
});
