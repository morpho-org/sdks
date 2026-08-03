import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  nearestChangedLine,
  parseFindingsText,
  validateFindingsFromText,
} from "./validate-findings.ts";

type Out = ReturnType<typeof validateFindingsFromText>;

type RunInput = {
  findings?: unknown;
  findingsText?: string;
  changedLines?: unknown;
  changedLinesText?: string;
  repoRoot?: string;
  schemaOnly?: boolean;
  lineTolerance?: number;
  readFileText?: (path: string) => string | null;
};

function run(input: RunInput): Out {
  return validateFindingsFromText({
    findingsText: input.findingsText ?? JSON.stringify(input.findings ?? []),
    changedLinesText:
      input.changedLinesText ?? JSON.stringify(input.changedLines ?? {}),
    repoRoot: input.repoRoot ?? "/tmp/nonexistent-repo-root",
    schemaOnly: input.schemaOnly ?? false,
    lineTolerance: input.lineTolerance ?? 15,
    readFileText: input.readFileText,
  });
}

/** Narrow a result to the success shape, failing the test on an {error} result. */
function ok(out: Out) {
  if ("error" in out) throw new Error(`unexpected error result: ${out.error}`);
  return out;
}

function hasError(out: Out): boolean {
  return "error" in out;
}

// Shared fixtures for the tolerant-parser tests.
const FINDING =
  '{"severity": "high", "file": "src/X.ts", "line": 10, "description": "WHAT: x. FIX: y."}';
const CL_X = { "src/X.ts": [10] };

function tmp(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), "vf-")));
}

describe("schema validation", () => {
  it("keeps a valid finding on an in-range line", () => {
    const out = ok(
      run({
        findings: [
          {
            severity: "high",
            file: "src/X.ts",
            line: 10,
            description: "WHAT: thing. FIX: change.",
          },
        ],
        changedLines: { "src/X.ts": [9, 10, 11] },
      }),
    );
    expect(out.kept).toHaveLength(1);
    expect(out.counts.schema).toBe(0);
  });

  it("fails schema when missing WHAT:", () => {
    const out = ok(
      run({
        findings: [
          {
            severity: "high",
            file: "src/X.ts",
            line: 10,
            description: "FIX: change.",
          },
        ],
        changedLines: { "src/X.ts": [10] },
      }),
    );
    expect(out.kept).toEqual([]);
    expect(out.failed).toHaveLength(1);
    expect(out.counts.schema).toBe(1);
  });

  it("fails schema when missing FIX:", () => {
    const out = ok(
      run({
        findings: [
          {
            severity: "high",
            file: "src/X.ts",
            line: 10,
            description: "WHAT: thing happened.",
          },
        ],
        changedLines: { "src/X.ts": [10] },
      }),
    );
    expect(out.counts.schema).toBe(1);
  });

  it("fails schema for line: 0 on a real file (only valid on runtime)", () => {
    const out = ok(
      run({
        findings: [
          {
            severity: "high",
            file: "src/X.ts",
            line: 0,
            description: "WHAT: x. FIX: y.",
          },
        ],
        changedLines: { "src/X.ts": [10] },
      }),
    );
    expect(out.kept).toEqual([]);
    expect(out.counts.schema).toBe(1);
  });
});

describe("scope filter", () => {
  it("drops a file out of scope", () => {
    const out = ok(
      run({
        findings: [
          {
            severity: "medium",
            file: "other/Y.ts",
            line: 5,
            description: "WHAT: x. FIX: y.",
          },
        ],
        changedLines: { "src/X.ts": [10] },
      }),
    );
    expect(out.kept).toEqual([]);
    expect(out.dropped).toHaveLength(1);
    expect(out.dropped[0]?.drop_reason).toBe("file-out-of-scope");
  });

  it("keeps a finding exactly at the +15 boundary (inclusive)", () => {
    const out = ok(
      run({
        findings: [
          {
            severity: "low",
            file: "src/X.ts",
            line: 25,
            description: "WHAT: x. FIX: y.",
          },
        ],
        changedLines: { "src/X.ts": [10] },
      }),
    );
    expect(out.kept).toHaveLength(1);
  });

  it("drops a finding at the +16 boundary, tagged with the distance", () => {
    const out = ok(
      run({
        findings: [
          {
            severity: "low",
            file: "src/X.ts",
            line: 26,
            description: "WHAT: x. FIX: y.",
          },
        ],
        changedLines: { "src/X.ts": [10] },
      }),
    );
    expect(out.kept).toEqual([]);
    expect(out.dropped[0]?.drop_reason).toBe("line-pre-existing");
    expect(out.dropped[0]?.distance_to_nearest_changed_line).toBe(16);
  });

  it("keeps any finding on a pure-rename file (empty changed set)", () => {
    const out = ok(
      run({
        findings: [
          {
            severity: "medium",
            file: "src/X.ts",
            line: 999,
            description: "WHAT: x. FIX: y.",
          },
        ],
        changedLines: { "src/X.ts": [] },
      }),
    );
    expect(out.kept).toHaveLength(1);
  });

  it("schema-only mode skips the scope filter", () => {
    const out = ok(
      run({
        findings: [
          {
            severity: "low",
            file: "other/Y.ts",
            line: 1,
            description: "WHAT: x. FIX: y.",
          },
        ],
        changedLines: { "src/X.ts": [10] },
        schemaOnly: true,
      }),
    );
    expect(out.kept).toHaveLength(1);
    expect(out.dropped).toEqual([]);
  });

  it("honors a custom line tolerance", () => {
    const finding = {
      severity: "low",
      file: "src/X.ts",
      line: 30,
      description: "WHAT: x. FIX: y.",
    };
    expect(
      ok(
        run({
          findings: [finding],
          changedLines: { "src/X.ts": [10] },
          lineTolerance: 20,
        }),
      ).kept,
    ).toHaveLength(1);
    expect(
      ok(run({ findings: [finding], changedLines: { "src/X.ts": [10] } })).kept,
    ).toEqual([]);
  });
});

describe("path normalization", () => {
  it("strips a/ and b/ diff prefixes", () => {
    const out = ok(
      run({
        findings: [
          {
            severity: "medium",
            file: "b/src/X.ts",
            line: 10,
            description: "WHAT: x. FIX: y.",
          },
        ],
        changedLines: { "src/X.ts": [10] },
      }),
    );
    expect(out.kept).toHaveLength(1);
  });

  it("strips a leading ./", () => {
    const out = ok(
      run({
        findings: [
          {
            severity: "medium",
            file: "./src/X.ts",
            line: 10,
            description: "WHAT: x. FIX: y.",
          },
        ],
        changedLines: { "src/X.ts": [10] },
      }),
    );
    expect(out.kept).toHaveLength(1);
  });

  it("strips the repo-root prefix off an absolute path", () => {
    const root = tmp();
    mkdirSync(join(root, "src"));
    const abs = join(root, "src", "X.ts");
    const out = ok(
      run({
        findings: [
          {
            severity: "medium",
            file: abs,
            line: 10,
            description: "WHAT: x. FIX: y.",
          },
        ],
        changedLines: { "src/X.ts": [10] },
        repoRoot: root,
      }),
    );
    expect(out.kept).toHaveLength(1);
  });

  it("drops an absolute path outside the repo root", () => {
    const outside = tmp();
    const root = tmp();
    const stray = join(outside, "X.ts");
    const out = ok(
      run({
        findings: [
          {
            severity: "medium",
            file: stray,
            line: 10,
            description: "WHAT: x. FIX: y.",
          },
        ],
        changedLines: { "src/X.ts": [10] },
        repoRoot: root,
      }),
    );
    expect(out.kept).toEqual([]);
    expect(out.dropped[0]?.drop_reason).toBe("file-out-of-scope");
  });
});

describe("markdown documentation-example filter", () => {
  const reader = (content: string) => (path: string) =>
    path.endsWith("docs.md") ? content : null;

  it("drops a finding inside a backtick fence", () => {
    const md =
      "# Example\n\n```bash\nOPENAI_API_KEY=sk-not-a-real-secret-just-an-example\n```\n";
    const out = ok(
      run({
        findings: [
          {
            severity: "critical",
            file: "docs.md",
            line: 4,
            description: "WHAT: hardcoded API key. FIX: move to env.",
          },
        ],
        changedLines: { "docs.md": [4] },
        readFileText: reader(md),
      }),
    );
    expect(out.kept).toEqual([]);
    expect(out.dropped[0]?.drop_reason).toBe("doc-example-fp");
  });

  it("drops a finding inside a tilde fence", () => {
    const md = '# Example\n\n~~~\nsecret = "abc123"\n~~~\n';
    const out = ok(
      run({
        findings: [
          {
            severity: "high",
            file: "docs.md",
            line: 4,
            description: "WHAT: hardcoded secret. FIX: rotate.",
          },
        ],
        changedLines: { "docs.md": [4] },
        readFileText: reader(md),
      }),
    );
    expect(out.kept).toEqual([]);
    expect(out.dropped[0]?.drop_reason).toBe("doc-example-fp");
  });

  it("keeps a finding outside any fence", () => {
    const md = "Hardcoded secret = abc123 (no fence).\n";
    const out = ok(
      run({
        findings: [
          {
            severity: "high",
            file: "docs.md",
            line: 1,
            description: "WHAT: hardcoded secret. FIX: rotate.",
          },
        ],
        changedLines: { "docs.md": [1] },
        readFileText: reader(md),
      }),
    );
    expect(out.kept).toHaveLength(1);
  });
});

describe("runtime-validation sentinel", () => {
  it("keeps it and bypasses the scope filters", () => {
    const out = ok(
      run({
        findings: [
          {
            severity: "critical",
            file: "runtime",
            line: 0,
            description:
              "WHAT: /dashboard 500s on load. FIX: check the new loader.",
          },
        ],
        changedLines: { "src/X.ts": [10] },
      }),
    );
    expect(out.kept).toHaveLength(1);
    expect(out.counts.schema).toBe(0);
    expect(out.dropped).toEqual([]);
  });

  it("still requires WHAT:/FIX: clauses", () => {
    const out = ok(
      run({
        findings: [
          {
            severity: "high",
            file: "runtime",
            line: 0,
            description: "the page looked broken",
          },
        ],
        changedLines: { "src/X.ts": [10] },
      }),
    );
    expect(out.kept).toEqual([]);
    expect(out.counts.schema).toBe(1);
  });

  it("fails schema on a negative line", () => {
    const out = ok(
      run({
        findings: [
          {
            severity: "high",
            file: "runtime",
            line: -1,
            description: "WHAT: x. FIX: y.",
          },
        ],
        changedLines: { "src/X.ts": [10] },
      }),
    );
    expect(out.kept).toEqual([]);
    expect(out.counts.schema).toBe(1);
  });

  it("keeps a positive line and still bypasses scope filters", () => {
    const out = ok(
      run({
        findings: [
          {
            severity: "high",
            file: "runtime",
            line: 7,
            description: "WHAT: x. FIX: y.",
          },
        ],
        changedLines: { "src/X.ts": [10] },
      }),
    );
    expect(out.kept).toHaveLength(1);
    expect(out.dropped).toEqual([]);
  });
});

describe("tolerant agent-output parser", () => {
  it("recovers a prose-wrapped array", () => {
    const out = ok(
      run({
        findingsText: `Analysis complete. I verified everything carefully.\n\n[${FINDING}]\n\nDone.`,
        changedLines: CL_X,
      }),
    );
    expect(out.kept).toHaveLength(1);
    expect(out.counts.schema).toBe(0);
  });

  it("recovers a prose-wrapped empty array", () => {
    const out = ok(
      run({
        findingsText: "All checks pass, nothing to report.\n\n[]\n",
        changedLines: {},
      }),
    );
    expect(out.kept).toEqual([]);
    expect(out.failed).toEqual([]);
  });

  it("recovers an object-wrapped array (sole list value)", () => {
    const out = ok(
      run({ findingsText: `{"findings": [${FINDING}]}`, changedLines: CL_X }),
    );
    expect(out.kept).toHaveLength(1);
  });

  it("recovers an object-wrapped empty array as clean", () => {
    const out = ok(run({ findingsText: '{"findings": []}', changedLines: {} }));
    expect(out.kept).toEqual([]);
    expect(out.failed).toEqual([]);
  });

  it("recovers a prose-wrapped sole-list dict", () => {
    const out = ok(
      run({
        findingsText: `Here are my results.\n{"findings": [${FINDING}]}`,
        changedLines: CL_X,
      }),
    );
    expect(out.kept).toHaveLength(1);
  });

  it("rejects incidental brackets in failure prose (string[])", () => {
    expect(
      hasError(
        run({
          findingsText:
            "I could not complete the review: the string[] type in the diff failed to parse.",
          changedLines: {},
        }),
      ),
    ).toBe(true);
  });

  it("rejects a truncated array", () => {
    const out = run({
      findingsText:
        'Truncated: [{"severity": "high", "file": "x.ts", "line": 1]',
      changedLines: {},
    });
    expect(hasError(out)).toBe(true);
    if ("error" in out) expect(out.error).toContain("invalid findings JSON");
  });

  it("rejects a checkbox line ([ ])", () => {
    expect(
      hasError(
        run({
          findingsText:
            "I could not complete the review. Remaining work:\n[ ] parse the diff hunks",
          changedLines: {},
        }),
      ),
    ).toBe(true);
  });

  it("never mines an agent_error sentinel for embedded findings", () => {
    expect(
      hasError(
        run({
          findingsText: `{"agent_error": "context overflow", "partial": [${FINDING}]}`,
          changedLines: CL_X,
        }),
      ),
    ).toBe(true);
  });

  it("rejects a non-object array slice (citation brackets)", () => {
    const out = run({
      findingsText: "I checked lines [1, 2] and the run failed midway.",
      changedLines: {},
    });
    expect(hasError(out)).toBe(true);
    if ("error" in out) expect(out.error).toContain("invalid findings JSON");
  });

  it("rejects a dict with a failure sibling key", () => {
    expect(
      hasError(
        run({
          findingsText: '{"error": "could not parse the diff", "findings": []}',
          changedLines: {},
        }),
      ),
    ).toBe(true);
  });

  it("rejects a dict with a failure sibling carrying partials", () => {
    expect(
      hasError(
        run({
          findingsText: `{"error": "ran out of context", "partial_findings": [${FINDING}]}`,
          changedLines: CL_X,
        }),
      ),
    ).toBe(true);
  });

  it("never mines a prose-wrapped agent_error", () => {
    expect(
      hasError(
        run({
          findingsText: `I hit a context overflow partway through.\n\n{"agent_error": "context overflow", "partial": [${FINDING}]}`,
          changedLines: CL_X,
        }),
      ),
    ).toBe(true);
  });

  it("never mines a prose-wrapped failure-sibling dict", () => {
    expect(
      hasError(
        run({
          findingsText: `I ran out of context.\n{"error": "ran out of context", "partial_findings": [${FINDING}]}`,
          changedLines: CL_X,
        }),
      ),
    ).toBe(true);
  });

  it("never mines a fenced failure-sibling dict", () => {
    expect(
      hasError(
        run({
          findingsText: `Partial results below.\n\`\`\`json\n{"error": "truncated", "partial_findings": [${FINDING}]}\n\`\`\`\n`,
          changedLines: CL_X,
        }),
      ),
    ).toBe(true);
  });

  it("rejects a trailing failure object after an empty array", () => {
    expect(
      hasError(
        run({
          findingsText:
            '[]\n{"error": "context limit reached, review incomplete"}',
          changedLines: {},
        }),
      ),
    ).toBe(true);
  });

  it("rejects a trailing failure object after a findings array", () => {
    expect(
      hasError(
        run({
          findingsText: `[${FINDING}]\n{"error": "ran out of context after file 3 of 21"}`,
          changedLines: CL_X,
        }),
      ),
    ).toBe(true);
  });

  it("never mines an object-led payload whose outer slice is unparseable", () => {
    expect(
      hasError(
        run({
          findingsText: `I ran out {of context} midway.\n{"error": "x", "partial_findings": [${FINDING}]}`,
          changedLines: CL_X,
        }),
      ),
    ).toBe(true);
  });

  it("never unwraps a failure-named sole key", () => {
    for (const payload of [
      '{"error": []}',
      '{"errors": []}',
      `{"partial_findings": [${FINDING}]}`,
    ]) {
      expect(hasError(run({ findingsText: payload, changedLines: CL_X }))).toBe(
        true,
      );
    }
  });

  it("never unwraps a prose-wrapped failure-named sole key", () => {
    expect(
      hasError(
        run({
          findingsText: 'Hit the limit.\n{"partial_findings": []}',
          changedLines: {},
        }),
      ),
    ).toBe(true);
  });

  it("rejects an ambiguous multi-list dict", () => {
    expect(
      hasError(
        run({
          findingsText: '{"findings": [], "skipped": []}',
          changedLines: {},
        }),
      ),
    ).toBe(true);
  });

  it("returns a structured error for unparseable findings", () => {
    const out = run({ findingsText: "not json at all", changedLines: {} });
    expect(hasError(out)).toBe(true);
    if ("error" in out) expect(out.error).toContain("invalid findings JSON");
  });

  it("returns a structured error for invalid changed-lines JSON", () => {
    const out = run({
      findingsText: "[]",
      changedLinesText: "not json at all",
    });
    expect(hasError(out)).toBe(true);
    if ("error" in out)
      expect(out.error).toContain("invalid changed-lines JSON");
  });

  // parseFindingsText is the unit under the recovery rules above; spot-check it directly.
  it("parseFindingsText returns an array for a clean payload and null for prose-only input", () => {
    expect(Array.isArray(parseFindingsText(`[${FINDING}]`))).toBe(true);
    expect(parseFindingsText("not json at all")).toBeNull();
  });
});

describe("CLI shell", () => {
  const SCRIPT = join(import.meta.dirname, "validate-findings.ts");

  function cli(args: readonly string[], input: string) {
    return spawnSync("node", [SCRIPT, ...args], { input, encoding: "utf8" });
  }

  function clFile(): string {
    const dir = tmp();
    const path = join(dir, "cl.json");
    writeFileSync(path, JSON.stringify(CL_X));
    return path;
  }

  it("exits 2 when --changed-lines is missing", () => {
    const res = cli([], "[]");
    expect(res.status).toBe(2);
    expect(res.stderr).toContain("--changed-lines is required");
  });

  it("exits 2 on a non-integer --line-tolerance", () => {
    const res = cli(
      ["--changed-lines", clFile(), "--line-tolerance", "15.5"],
      "[]",
    );
    expect(res.status).toBe(2);
    expect(res.stderr).toContain("--line-tolerance must be an integer");
  });

  it("exits 2 on an unknown argument", () => {
    const res = cli(["--changed-lines", clFile(), "--bogus"], "[]");
    expect(res.status).toBe(2);
    expect(res.stderr).toContain("unknown argument");
  });

  it("reads findings from stdin", () => {
    const res = cli(["--changed-lines", clFile()], `[${FINDING}]`);
    expect(res.status).toBe(0);
    expect(JSON.parse(res.stdout).kept).toHaveLength(1);
  });

  it("reads findings from a --findings file", () => {
    const dir = tmp();
    const fPath = join(dir, "findings.json");
    writeFileSync(fPath, `[${FINDING}]`);
    const res = cli(["--findings", fPath, "--changed-lines", clFile()], "");
    expect(res.status).toBe(0);
    expect(JSON.parse(res.stdout).kept).toHaveLength(1);
  });

  it("returns a structured error for a missing findings file", () => {
    const res = cli(
      ["--findings", "/no/such/file.json", "--changed-lines", clFile()],
      "",
    );
    expect(res.status).toBe(0);
    expect(JSON.parse(res.stdout).error).toContain("cannot read findings file");
  });

  it("returns a structured error for a missing changed-lines file", () => {
    const res = cli(["--changed-lines", "/no/such/cl.json"], "[]");
    expect(res.status).toBe(0);
    expect(JSON.parse(res.stdout).error).toContain(
      "cannot read changed-lines file",
    );
  });
});

describe("snapped_line (issue #22)", () => {
  it("equals the cited line when it is itself a changed line", () => {
    const out = ok(
      run({
        findings: [
          {
            severity: "high",
            file: "src/X.ts",
            line: 10,
            description: "WHAT: x. FIX: y.",
          },
        ],
        changedLines: { "src/X.ts": [9, 10, 11] },
      }),
    );
    expect(out.kept).toHaveLength(1);
    expect(out.kept[0]?.snapped_line).toBe(10);
  });

  it("snaps to the nearest changed line when the finding sits within tolerance", () => {
    const out = ok(
      run({
        findings: [
          {
            severity: "high",
            file: "src/X.ts",
            line: 20,
            description: "WHAT: x. FIX: y.",
          },
        ],
        changedLines: { "src/X.ts": [10, 17, 40] },
      }),
    );
    expect(out.kept).toHaveLength(1);
    // 20 is +3 from 17 and -20 from 40 → nearest changed line is 17 (within ±15).
    expect(out.kept[0]?.snapped_line).toBe(17);
  });

  it("omits snapped_line on the runtime sentinel", () => {
    const out = ok(
      run({
        findings: [
          {
            severity: "high",
            file: "runtime",
            line: 0,
            description: "WHAT: x. FIX: y.",
          },
        ],
        changedLines: { "src/X.ts": [10] },
      }),
    );
    expect(out.kept).toHaveLength(1);
    expect(out.kept[0]).not.toHaveProperty("snapped_line");
  });

  it("omits snapped_line on a pure-rename keep (empty changed set)", () => {
    const out = ok(
      run({
        findings: [
          {
            severity: "high",
            file: "src/X.ts",
            line: 99,
            description: "WHAT: x. FIX: y.",
          },
        ],
        changedLines: { "src/X.ts": [] },
      }),
    );
    expect(out.kept).toHaveLength(1);
    expect(out.kept[0]).not.toHaveProperty("snapped_line");
  });

  it("omits snapped_line in schema-only mode", () => {
    const out = ok(
      run({
        findings: [
          {
            severity: "high",
            file: "src/X.ts",
            line: 999,
            description: "WHAT: x. FIX: y.",
          },
        ],
        changedLines: {},
        schemaOnly: true,
      }),
    );
    expect(out.kept).toHaveLength(1);
    expect(out.kept[0]).not.toHaveProperty("snapped_line");
  });

  it("nearestChangedLine returns the closest line, null on empty", () => {
    expect(nearestChangedLine(20, [10, 17, 40])).toBe(17);
    expect(nearestChangedLine(10, [10])).toBe(10);
    expect(nearestChangedLine(5, [])).toBeNull();
  });
});
