import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import {
  digestDirectory,
  listFiles,
  main,
  snapshot,
  verify,
} from "./trusted-scripts.ts";

const tempDirs: string[] = [];

function makeTree(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "trusted-scripts-"));
  tempDirs.push(dir);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), content);
  }

  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0))
    rmSync(dir, { force: true, recursive: true });
});

describe("listFiles", () => {
  test("default", () => {
    const dir = makeTree({
      "b.ts": "b",
      "ci/a.ts": "a",
      "ci/nested/c.ts": "c",
    });

    expect(listFiles(dir)).toEqual(["b.ts", "ci/a.ts", "ci/nested/c.ts"]);
  });
});

describe("digestDirectory", () => {
  test("default: deterministic and independent of write order", () => {
    const first = makeTree({ "a.ts": "a", "ci/b.ts": "b" });
    const second = makeTree({ "ci/b.ts": "b", "a.ts": "a" });

    expect(digestDirectory(first)).toMatch(/^[0-9a-f]{64}$/);
    expect(digestDirectory(first)).toBe(digestDirectory(second));
  });

  test("behavior: changes when a file is modified, added, renamed, or removed", () => {
    const base = digestDirectory(makeTree({ "a.ts": "a", "ci/b.ts": "b" }));

    expect(digestDirectory(makeTree({ "a.ts": "A", "ci/b.ts": "b" }))).not.toBe(
      base,
    );
    expect(
      digestDirectory(makeTree({ "a.ts": "a", "ci/b.ts": "b", "ci/c.ts": "" })),
    ).not.toBe(base);
    expect(digestDirectory(makeTree({ "a.ts": "a", "ci/c.ts": "b" }))).not.toBe(
      base,
    );
    expect(digestDirectory(makeTree({ "a.ts": "a" }))).not.toBe(base);
  });

  test("behavior: moving content between files is detected", () => {
    expect(digestDirectory(makeTree({ "a.ts": "x", "b.ts": "y" }))).not.toBe(
      digestDirectory(makeTree({ "a.ts": "y", "b.ts": "x" })),
    );
  });
});

describe("snapshot", () => {
  test("default: writes digest=<hex> to the output file", () => {
    const dir = makeTree({ "a.ts": "a" });
    const outputFile = join(dir, "..", `trusted-scripts-output-${process.pid}`);
    tempDirs.push(outputFile);

    const digest = snapshot(dir, { outputFile });

    expect(readFileSync(outputFile, "utf8")).toBe(`digest=${digest}\n`);
    expect(digest).toBe(digestDirectory(dir));
  });

  test("error: missing GITHUB_OUTPUT", () => {
    const dir = makeTree({ "a.ts": "a" });

    expect(() => snapshot(dir, { env: {} })).toThrow(/GITHUB_OUTPUT/);
  });
});

describe("verify", () => {
  test("default", () => {
    const dir = makeTree({ "a.ts": "a" });

    expect(() => verify(dir, digestDirectory(dir))).not.toThrow();
  });

  test("error: modified copy", () => {
    const dir = makeTree({ "a.ts": "a" });
    const expected = digestDirectory(dir);
    writeFileSync(join(dir, "a.ts"), "tampered");

    expect(() => verify(dir, expected)).toThrow(/modified after the snapshot/);
  });

  test("error: malformed expected digest", () => {
    const dir = makeTree({ "a.ts": "a" });

    expect(() => verify(dir, "")).toThrow(/Invalid expected digest/);
    expect(() => verify(dir, "abc")).toThrow(/Invalid expected digest/);
  });
});

describe("main", () => {
  test("behavior: snapshot then verify round-trip", () => {
    const dir = makeTree({ "a.ts": "a" });
    const outputFile = join(dir, "..", `trusted-scripts-main-${process.pid}`);
    tempDirs.push(outputFile);
    const output: string[] = [];

    main({
      argv: ["snapshot", dir],
      outputFile,
      writeOutput: (m) => output.push(m),
    });
    const digest = readFileSync(outputFile, "utf8").replace(
      /^digest=|\n$/g,
      "",
    );
    main({ argv: ["verify", dir, digest], writeOutput: (m) => output.push(m) });

    expect(output).toEqual([
      `Trusted scripts digest: ${digest}\n`,
      `Trusted scripts in ${dir} match the snapshot.\n`,
    ]);
  });

  test("error: unknown mode / missing arguments", () => {
    const dir = makeTree({ "a.ts": "a" });

    expect(() => main({ argv: ["nope", dir] })).toThrow(/Unknown mode "nope"/);
    expect(() => main({ argv: ["verify"] })).toThrow(/Usage/);
    expect(() => main({ argv: ["verify", dir] })).toThrow(/Usage/);
  });
});
