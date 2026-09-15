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
  test("default: copies the tree and writes node_bin= and digest= to the output file", () => {
    const src = makeTree({ "a.ts": "a", "ci/b.ts": "b" });
    const dest = join(src, "..", `trusted-scripts-dest-${process.pid}`);
    const outputFile = join(src, "..", `trusted-scripts-output-${process.pid}`);
    tempDirs.push(dest, outputFile);

    const digest = snapshot({ dest, src }, { outputFile });

    expect(readFileSync(join(dest, "ci", "b.ts"), "utf8")).toBe("b");
    expect(readFileSync(outputFile, "utf8")).toBe(
      `node_bin=${process.execPath}\ndigest=${digest}\n`,
    );
    expect(digest).toBe(digestDirectory(src));
    expect(digest).toBe(digestDirectory(dest));
  });

  test("behavior: records an injected node binary path", () => {
    const src = makeTree({ "a.ts": "a" });
    const dest = join(src, "..", `trusted-scripts-dest-bin-${process.pid}`);
    const outputFile = join(
      src,
      "..",
      `trusted-scripts-output-bin-${process.pid}`,
    );
    tempDirs.push(dest, outputFile);

    snapshot({ dest, src }, { nodeBin: "/opt/node", outputFile });

    expect(readFileSync(outputFile, "utf8")).toMatch(/^node_bin=\/opt\/node\n/);
  });

  test("error: refuses an existing destination", () => {
    const src = makeTree({ "a.ts": "a" });
    const dest = makeTree({ "stale.ts": "x" });

    expect(() => snapshot({ dest, src }, { outputFile: "/dev/null" })).toThrow(
      /existing path/,
    );
  });

  test("error: missing GITHUB_OUTPUT", () => {
    const src = makeTree({ "a.ts": "a" });
    const dest = join(src, "..", `trusted-scripts-dest-noout-${process.pid}`);
    tempDirs.push(dest);

    expect(() => snapshot({ dest, src }, { env: {} })).toThrow(/GITHUB_OUTPUT/);
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

    const dest = join(dir, "..", `trusted-scripts-main-dest-${process.pid}`);
    tempDirs.push(dest);

    main({
      argv: ["snapshot", dir, dest],
      outputFile,
      writeOutput: (m) => output.push(m),
    });
    const digest = readFileSync(outputFile, "utf8").match(
      /^digest=(.*)$/m,
    )?.[1];
    if (digest == null) throw new Error("digest output missing");
    main({
      argv: ["verify", dest, digest],
      writeOutput: (m) => output.push(m),
    });

    expect(output).toEqual([
      `Trusted scripts copied to ${dest} (digest ${digest}).\n`,
      `Trusted scripts in ${dest} match the snapshot.\n`,
    ]);
  });

  test("error: unknown mode / missing arguments", () => {
    const dir = makeTree({ "a.ts": "a" });

    expect(() => main({ argv: ["nope", dir, dir] })).toThrow(
      /Unknown mode "nope"/,
    );
    expect(() => main({ argv: ["verify"] })).toThrow(/Usage/);
    expect(() => main({ argv: ["verify", dir] })).toThrow(/Usage/);
    expect(() => main({ argv: ["snapshot", dir] })).toThrow(/Usage/);
  });
});
