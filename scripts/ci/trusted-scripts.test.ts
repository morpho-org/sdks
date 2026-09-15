import { spawnSync } from "node:child_process";
import {
  existsSync,
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
  parseCopyPairs,
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
  test("default: copies the tree and node, writes node_bin= and digest= to the output file", () => {
    const src = makeTree({ "a.ts": "a", "ci/b.ts": "b" });
    const dest = join(src, "..", `trusted-scripts-dest-${process.pid}`);
    const outputFile = join(src, "..", `trusted-scripts-output-${process.pid}`);
    tempDirs.push(dest, outputFile);

    const digest = snapshot({ dest, src }, { outputFile });

    const nodeBin = join(dest, "bin", "node");
    expect(readFileSync(join(dest, "ci", "b.ts"), "utf8")).toBe("b");
    expect(readFileSync(outputFile, "utf8")).toBe(
      `node_bin=${nodeBin}\ndigest=${digest}\n`,
    );
    expect(digest).toBe(digestDirectory(dest));
    expect(digest).not.toBe(digestDirectory(src));
    expect(
      spawnSync(nodeBin, ["-p", "1+1"], { encoding: "utf8" }).stdout.trim(),
    ).toBe("2");
  });

  test("behavior: the digest covers the copied node binary", () => {
    const src = makeTree({ "a.ts": "a" });
    const dest = join(src, "..", `trusted-scripts-dest-bin-${process.pid}`);
    const fakeNode = join(
      src,
      "..",
      `trusted-scripts-fake-node-${process.pid}`,
    );
    tempDirs.push(dest, fakeNode);
    writeFileSync(fakeNode, "#!/bin/sh\nexit 0\n");

    const digest = snapshot(
      { dest, src },
      { nodeBin: fakeNode, outputFile: "/dev/null" },
    );
    writeFileSync(join(dest, "bin", "node"), "#!/bin/sh\nexit 1\n");

    expect(() => verify(dest, digest)).toThrow(/modified after the snapshot/);
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

  test("behavior: extra <src> <dest> pairs are copied but not digested", () => {
    const scripts = makeTree({ "a.ts": "a" });
    const agents = makeTree({ "commands/review.md": "review" });
    const outputFile = join(scripts, "..", `trusted-extra-out-${process.pid}`);
    const dest = join(scripts, "..", `trusted-extra-dest-${process.pid}`);
    const agentsDest = join(
      scripts,
      "..",
      `trusted-extra-agents-${process.pid}`,
    );
    tempDirs.push(outputFile, dest, agentsDest);
    const output: string[] = [];

    main({
      argv: ["snapshot", scripts, dest, agents, agentsDest],
      outputFile,
      writeOutput: (m) => output.push(m),
    });

    expect(
      readFileSync(join(agentsDest, "commands", "review.md"), "utf8"),
    ).toBe("review");
    expect(output[0]).toBe(
      `Trusted copy of ${agents} made at ${agentsDest}.\n`,
    );
    const digest = readFileSync(outputFile, "utf8").match(
      /^digest=(.*)$/m,
    )?.[1];
    if (digest == null) throw new Error("digest output missing");
    // Editing the instructions copy does not invalidate the executable-scripts digest.
    writeFileSync(join(agentsDest, "commands", "review.md"), "changed");
    expect(() => verify(dest, digest)).not.toThrow();
  });

  test("error: an existing extra destination aborts before any copy", () => {
    const scripts = makeTree({ "a.ts": "a" });
    const agents = makeTree({ "x.md": "x" });
    const dest = join(scripts, "..", `trusted-extra-abort-${process.pid}`);
    tempDirs.push(dest);

    expect(() =>
      snapshot(
        { dest, extraCopies: [{ dest: agents, src: agents }], src: scripts },
        { outputFile: "/dev/null" },
      ),
    ).toThrow(/existing path/);
    expect(existsSync(dest)).toBe(false);
  });

  test("error: unknown mode / missing arguments", () => {
    const dir = makeTree({ "a.ts": "a" });

    expect(() => main({ argv: ["snapshot", dir, dir, dir] })).toThrow(/Usage/);
    expect(() => parseCopyPairs([])).toThrow(/Usage/);

    expect(() => main({ argv: ["nope", dir, dir] })).toThrow(
      /Unknown mode "nope"/,
    );
    expect(() => main({ argv: ["verify"] })).toThrow(/Usage/);
    expect(() => main({ argv: ["verify", dir] })).toThrow(/Usage/);
    expect(() => main({ argv: ["snapshot", dir] })).toThrow(/Usage/);
  });
});
