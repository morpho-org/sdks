import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  FindingsParseError,
  findFencedBlocks,
  validateFindings,
} from "./validate-findings.ts";

const VALID_DESCRIPTION = "WHAT: x. FIX: y.";

describe("findFencedBlocks", () => {
  test("default: no fences in plain prose returns empty list", () => {
    expect(findFencedBlocks("hello\nworld\n")).toEqual([]);
  });

  test("behavior: matched ``` fences produce one inclusive [start,end] pair", () => {
    const md = ["one", "```", "code", "```", "five"].join("\n");
    expect(findFencedBlocks(md)).toEqual([[2, 4]]);
  });

  test("behavior: matched ~~~ fences are detected the same way", () => {
    const md = ["one", "~~~", "code", "~~~", "five"].join("\n");
    expect(findFencedBlocks(md)).toEqual([[2, 4]]);
  });

  test("behavior: unclosed fence extends to EOF", () => {
    const md = ["one", "```", "two", "three"].join("\n");
    expect(findFencedBlocks(md)).toEqual([[2, 4]]);
  });

  test("behavior: multiple fenced blocks are returned in order", () => {
    const md = ["a", "```", "b", "```", "c", "```", "d", "```", "e"].join("\n");
    expect(findFencedBlocks(md)).toEqual([
      [2, 4],
      [6, 8],
    ]);
  });

  test("behavior: indented fence (≤3 leading spaces, then ```) is recognised", () => {
    const md = ["a", "   ```", "b", "   ```", "c"].join("\n");
    expect(findFencedBlocks(md)).toEqual([[2, 4]]);
  });
});

describe("validateFindings — schema check (failed[])", () => {
  const opts = { repoRoot: process.cwd(), changedLines: {} };

  test("error: missing WHAT clause routes to failed[]", () => {
    const result = validateFindings(
      [{ severity: "high", file: "a.ts", line: 1, description: "FIX: only" }],
      opts,
    );
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.reason).toContain("WHAT:");
    expect(result.kept).toHaveLength(0);
    expect(result.dropped).toHaveLength(0);
  });

  test("error: missing FIX clause routes to failed[]", () => {
    const result = validateFindings(
      [{ severity: "high", file: "a.ts", line: 1, description: "WHAT: only" }],
      opts,
    );
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.reason).toContain("FIX:");
  });

  test("error: invalid severity is rejected", () => {
    const result = validateFindings(
      [
        {
          severity: "info",
          file: "a.ts",
          line: 1,
          description: VALID_DESCRIPTION,
        },
      ],
      opts,
    );
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.reason).toMatch(/severity/);
  });

  test("error: non-positive line is rejected", () => {
    const result = validateFindings(
      [
        {
          severity: "high",
          file: "a.ts",
          line: 0,
          description: VALID_DESCRIPTION,
        },
      ],
      opts,
    );
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.reason).toMatch(/line/);
  });

  test("error: non-integer line is rejected", () => {
    const result = validateFindings(
      [
        {
          severity: "high",
          file: "a.ts",
          line: 1.5,
          description: VALID_DESCRIPTION,
        },
      ],
      opts,
    );
    expect(result.failed).toHaveLength(1);
  });

  test("error: missing description is rejected", () => {
    const result = validateFindings(
      [{ severity: "high", file: "a.ts", line: 1 }],
      opts,
    );
    expect(result.failed).toHaveLength(1);
  });

  test("error: missing file is rejected", () => {
    const result = validateFindings(
      [{ severity: "high", line: 1, description: VALID_DESCRIPTION }],
      opts,
    );
    expect(result.failed).toHaveLength(1);
  });

  test("error: empty file string is rejected", () => {
    const result = validateFindings(
      [{ severity: "high", file: "", line: 1, description: VALID_DESCRIPTION }],
      opts,
    );
    expect(result.failed).toHaveLength(1);
  });

  test("error: non-object finding is rejected", () => {
    const result = validateFindings(["not an object"], opts);
    expect(result.failed).toHaveLength(1);
  });

  test("error: FindingsParseError is exported and named", () => {
    const e = new FindingsParseError("bad input");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("FindingsParseError");
  });
});

describe("validateFindings — scope filter (dropped[])", () => {
  test("default: valid finding on a changed line is kept", () => {
    const result = validateFindings(
      [
        {
          severity: "high",
          file: "a.ts",
          line: 5,
          description: VALID_DESCRIPTION,
        },
      ],
      { repoRoot: process.cwd(), changedLines: { "a.ts": [5] } },
    );
    expect(result.kept).toHaveLength(1);
    expect(result.dropped).toHaveLength(0);
    expect(result.counts.high).toBe(1);
  });

  test("behavior: file not in changedLines drops as file_out_of_scope", () => {
    const result = validateFindings(
      [
        {
          severity: "high",
          file: "z.ts",
          line: 1,
          description: VALID_DESCRIPTION,
        },
      ],
      { repoRoot: process.cwd(), changedLines: { "a.ts": [1] } },
    );
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0]!.drop_reason).toBe("file_out_of_scope");
  });

  test("behavior: line outside ±15 window drops as line_pre_existing with distance", () => {
    const result = validateFindings(
      [
        {
          severity: "high",
          file: "a.ts",
          line: 100,
          description: VALID_DESCRIPTION,
        },
      ],
      { repoRoot: process.cwd(), changedLines: { "a.ts": [5] } },
    );
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0]!.drop_reason).toBe("line_pre_existing");
    expect(result.dropped[0]!.distance_to_nearest_changed_line).toBe(95);
  });

  test("behavior: line within ±15 (adjacent code tolerance) is kept", () => {
    const result = validateFindings(
      [
        {
          severity: "high",
          file: "a.ts",
          line: 20,
          description: VALID_DESCRIPTION,
        },
      ],
      { repoRoot: process.cwd(), changedLines: { "a.ts": [5] } },
    );
    expect(result.kept).toHaveLength(1);
  });

  test("behavior: pure rename (empty changedLines for a file) short-circuits line filter", () => {
    const result = validateFindings(
      [
        {
          severity: "high",
          file: "new.ts",
          line: 999,
          description: VALID_DESCRIPTION,
        },
      ],
      { repoRoot: process.cwd(), changedLines: { "new.ts": [] } },
    );
    expect(result.kept).toHaveLength(1);
  });

  test("behavior: path normalization strips leading ./", () => {
    const result = validateFindings(
      [
        {
          severity: "high",
          file: "./a.ts",
          line: 1,
          description: VALID_DESCRIPTION,
        },
      ],
      { repoRoot: process.cwd(), changedLines: { "a.ts": [1] } },
    );
    expect(result.kept).toHaveLength(1);
  });

  test("behavior: path normalization strips diff a/ prefix", () => {
    const result = validateFindings(
      [
        {
          severity: "high",
          file: "a/x.ts",
          line: 1,
          description: VALID_DESCRIPTION,
        },
      ],
      { repoRoot: process.cwd(), changedLines: { "x.ts": [1] } },
    );
    expect(result.kept).toHaveLength(1);
  });

  test("behavior: path normalization strips diff b/ prefix", () => {
    const result = validateFindings(
      [
        {
          severity: "high",
          file: "b/x.ts",
          line: 1,
          description: VALID_DESCRIPTION,
        },
      ],
      { repoRoot: process.cwd(), changedLines: { "x.ts": [1] } },
    );
    expect(result.kept).toHaveLength(1);
  });
});

describe("validateFindings — markdown documentation-example filter", () => {
  let tmpRoot: string;

  beforeAll(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "validate-findings-test-"));
    writeFileSync(
      join(tmpRoot, "doc.md"),
      [
        "prose line 1", // 1
        "```", // 2 — fence open
        "code line 3", // 3
        "code line 4", // 4
        "```", // 5 — fence close
        "prose line 6", // 6
      ].join("\n"),
    );
  });

  afterAll(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  test("behavior: finding inside fenced block in .md drops as doc_example_fp", () => {
    const result = validateFindings(
      [
        {
          severity: "high",
          file: "doc.md",
          line: 3,
          description: VALID_DESCRIPTION,
        },
      ],
      { repoRoot: tmpRoot, changedLines: { "doc.md": [3] } },
    );
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0]!.drop_reason).toBe("doc_example_fp");
  });

  test("behavior: finding outside fenced block in .md is kept", () => {
    const result = validateFindings(
      [
        {
          severity: "high",
          file: "doc.md",
          line: 1,
          description: VALID_DESCRIPTION,
        },
      ],
      { repoRoot: tmpRoot, changedLines: { "doc.md": [1] } },
    );
    expect(result.kept).toHaveLength(1);
  });

  test("behavior: fence delimiter lines are also treated as inside the block", () => {
    const result = validateFindings(
      [
        {
          severity: "high",
          file: "doc.md",
          line: 2,
          description: VALID_DESCRIPTION,
        },
      ],
      { repoRoot: tmpRoot, changedLines: { "doc.md": [2] } },
    );
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0]!.drop_reason).toBe("doc_example_fp");
  });

  test("behavior: non-.md files skip the fence filter", () => {
    const result = validateFindings(
      [
        {
          severity: "high",
          file: "doc.ts",
          line: 3,
          description: VALID_DESCRIPTION,
        },
      ],
      { repoRoot: tmpRoot, changedLines: { "doc.ts": [3] } },
    );
    expect(result.kept).toHaveLength(1);
  });

  test("behavior: missing .md file falls through (no fence info → keep)", () => {
    const result = validateFindings(
      [
        {
          severity: "high",
          file: "missing.md",
          line: 1,
          description: VALID_DESCRIPTION,
        },
      ],
      { repoRoot: tmpRoot, changedLines: { "missing.md": [1] } },
    );
    expect(result.kept).toHaveLength(1);
  });
});

describe("validateFindings — counts aggregation", () => {
  test("default: counts reflect kept findings, severity-by-severity", () => {
    const result = validateFindings(
      [
        {
          severity: "critical",
          file: "a.ts",
          line: 1,
          description: VALID_DESCRIPTION,
        },
        {
          severity: "high",
          file: "a.ts",
          line: 2,
          description: VALID_DESCRIPTION,
        },
        {
          severity: "high",
          file: "a.ts",
          line: 3,
          description: VALID_DESCRIPTION,
        },
        {
          severity: "medium",
          file: "a.ts",
          line: 4,
          description: VALID_DESCRIPTION,
        },
        {
          severity: "low",
          file: "a.ts",
          line: 5,
          description: VALID_DESCRIPTION,
        },
      ],
      { repoRoot: process.cwd(), changedLines: { "a.ts": [1, 2, 3, 4, 5] } },
    );
    expect(result.counts).toEqual({ critical: 1, high: 2, medium: 1, low: 1 });
  });

  test("behavior: dropped findings do NOT count toward counts", () => {
    const result = validateFindings(
      [
        {
          severity: "high",
          file: "a.ts",
          line: 1,
          description: VALID_DESCRIPTION,
        },
        {
          severity: "high",
          file: "z.ts",
          line: 1,
          description: VALID_DESCRIPTION,
        },
      ],
      { repoRoot: process.cwd(), changedLines: { "a.ts": [1] } },
    );
    expect(result.counts.high).toBe(1);
    expect(result.kept).toHaveLength(1);
    expect(result.dropped).toHaveLength(1);
  });
});
