import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import {
  canonicalEntryPath,
  MANIFEST_ENTRY,
  main,
  parseEntryListing,
  verifyTarballEntries,
} from "./verify-tarball-entries.ts";

const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  "verify-tarball-entries.ts",
);

const VALID = [
  "package/package.json",
  "package/README.md",
  "package/lib/",
  "package/lib/esm/index.js",
  "package/lib/cjs/index.js",
];

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "tarball-entries-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
}

/** Builds a gzipped tarball whose stored entry names are exactly `entries`, in order. */
function buildTarball(dir: string, entries: readonly string[]): string {
  for (const entry of entries) {
    const target = join(dir, entry);
    if (entry.endsWith("/")) {
      mkdirSync(target, { recursive: true });
    } else {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, `{"entry":"${entry}"}`);
    }
  }
  const tgz = join(dir, "out.tgz");
  execFileSync("tar", ["-czf", tgz, "-C", dir, "--no-recursion", ...entries]);
  return tgz;
}

describe("canonicalEntryPath", () => {
  test("default: lowercases and drops the trailing slash", () => {
    expect(canonicalEntryPath("package/Lib/")).toBe("package/lib");
    expect(canonicalEntryPath("package/README.md")).toBe("package/readme.md");
  });
});

describe("verifyTarballEntries", () => {
  test("default: a single-rooted package/ archive with one literal manifest passes", () => {
    expect(() => verifyTarballEntries(VALID)).not.toThrow();
  });

  test("error: backslash-dot alias onto the manifest is rejected", () => {
    expect(() =>
      verifyTarballEntries([...VALID, "package/\\./package.json"]),
    ).toThrow(/contains a backslash/);
  });

  test("error: any backslash anywhere is rejected", () => {
    expect(() =>
      verifyTarballEntries([...VALID, "package/lib\\evil.js"]),
    ).toThrow(/contains a backslash/);
  });

  test("error: case-variant manifest alias is rejected", () => {
    expect(() =>
      verifyTarballEntries([...VALID, "package/Package.json"]),
    ).toThrow(/aliases package\/package\.json/);
  });

  test("error: PACKAGE/ root variant is rejected", () => {
    expect(() =>
      verifyTarballEntries([...VALID, "PACKAGE/package.json"]),
    ).toThrow(/outside package\//);
  });

  test("error: case-colliding non-manifest entries are rejected", () => {
    expect(() =>
      verifyTarballEntries([...VALID, "package/lib/esm/Index.js"]),
    ).toThrow(/resolve to the same path/);
  });

  test("error: non-ASCII and control characters are rejected", () => {
    // U+017F folds to `s` under Unicode caseless matching but not toLowerCase().
    expect(() =>
      verifyTarballEntries([...VALID, "package/package.j\u017fon"]),
    ).toThrow(/non-ASCII/);
    expect(() =>
      verifyTarballEntries([...VALID, "package/caf\u0065\u0301.js"]),
    ).toThrow(/non-ASCII/);
    expect(() =>
      verifyTarballEntries([...VALID, "package/lib/a\u0000b.js"]),
    ).toThrow(/non-ASCII/);
  });

  test("error: exact duplicate entry is rejected", () => {
    expect(() =>
      verifyTarballEntries([...VALID, "package/lib/esm/index.js"]),
    ).toThrow(/resolve to the same path/);
  });

  test("error: directory entry colliding with a file entry is rejected", () => {
    expect(() => verifyTarballEntries([...VALID, "package/lib"])).toThrow(
      /resolve to the same path/,
    );
  });

  test("error: dot and dot-dot segments are rejected", () => {
    expect(() =>
      verifyTarballEntries([...VALID, "package/./index.js"]),
    ).toThrow(/non-canonical/);
    expect(() =>
      verifyTarballEntries([...VALID, "package/../index.js"]),
    ).toThrow(/non-canonical/);
    expect(() => verifyTarballEntries([...VALID, "package//index.js"])).toThrow(
      /non-canonical/,
    );
  });

  test("error: segments ending in a dot or space are rejected", () => {
    expect(() =>
      verifyTarballEntries([...VALID, "package/package.json."]),
    ).toThrow(/ending in a dot or space/);
    expect(() =>
      verifyTarballEntries([...VALID, "package/lib/esm/index.js "]),
    ).toThrow(/ending in a dot or space/);
    expect(() =>
      verifyTarballEntries([...VALID, "package/lib./esm/index.js"]),
    ).toThrow(/ending in a dot or space/);
  });

  test("error: entries outside package/ are rejected", () => {
    expect(() => verifyTarballEntries([...VALID, "zzz/package.json"])).toThrow(
      /outside package\//,
    );
    expect(() => verifyTarballEntries([...VALID, "packages/index.js"])).toThrow(
      /outside package\//,
    );
  });

  test("error: missing manifest is rejected", () => {
    expect(() =>
      verifyTarballEntries(VALID.filter((e) => e !== MANIFEST_ENTRY)),
    ).toThrow(/exactly one package\/package\.json \(found 0\)/);
  });

  test("error: a regular file that is an ancestor of another entry is rejected in any order", () => {
    expect(() =>
      verifyTarballEntries(["package/package.json/evil", ...VALID]),
    ).toThrow(/is a regular file but .* is stored beneath it/);
    expect(() =>
      verifyTarballEntries([...VALID, "package/LIB/ESM/index.js/x"]),
    ).toThrow(/is a regular file but .* is stored beneath it/);
    expect(() =>
      verifyTarballEntries([...VALID, "package/lib/esm/"]),
    ).not.toThrow();
  });

  test("error: segments containing a tilde (Windows 8.3 short names) are rejected", () => {
    expect(() =>
      verifyTarballEntries([...VALID, "package/LONGFI~1.JS"]),
    ).toThrow(/containing "~"/);
  });

  test("error: characters invalid in Windows file names are rejected", () => {
    for (const bad of [
      "package/lib/a*.js",
      'package/lib/a"b.js',
      "package/lib/a:b.js",
      "package/lib/a?.js",
      "package/lib/a<b>.js",
      "package/lib/a|b.js",
    ]) {
      expect(() => verifyTarballEntries([...VALID, bad])).toThrow(
        /invalid in a Windows file name/,
      );
    }
  });

  test("error: Windows reserved device basenames are rejected", () => {
    for (const bad of [
      "package/lib/CON",
      "package/lib/con.txt",
      "package/COM1.js",
      "package/Nul/x.js",
    ]) {
      expect(() => verifyTarballEntries([...VALID, bad])).toThrow(
        /reserved device name/,
      );
    }
    expect(() =>
      verifyTarballEntries([
        ...VALID,
        "package/console.js",
        "package/config/x.js",
      ]),
    ).not.toThrow();
  });

  test("error: empty listing is rejected", () => {
    expect(() => verifyTarballEntries([])).toThrow(/found 0/);
  });
});

describe("parseEntryListing", () => {
  test("default: splits on newlines and drops empty lines without trimming", () => {
    expect(
      parseEntryListing("package/package.json\npackage/ a.js\n\n"),
    ).toEqual(["package/package.json", "package/ a.js"]);
  });
});

describe("main", () => {
  test("default: accepts a listing argument", () => {
    expect(() => main(`${VALID.join("\n")}\n`)).not.toThrow();
  });

  test("behavior: real tar listings are validated end to end via stdin", () => {
    withTempDir((dir) => {
      const ok = buildTarball(join(dir, "ok"), VALID);
      const okResult = spawnSync(process.execPath, [SCRIPT], {
        encoding: "utf8",
        input: execFileSync("tar", ["-tzf", ok], { encoding: "utf8" }),
      });
      expect(okResult.status).toBe(0);
      expect(okResult.stderr).toBe("");

      const alias = buildTarball(join(dir, "alias"), [
        "package/package.json",
        "package/\\./package.json",
      ]);
      const aliasResult = spawnSync(process.execPath, [SCRIPT], {
        encoding: "utf8",
        input: execFileSync("tar", ["-tzf", alias], { encoding: "utf8" }),
      });
      expect(aliasResult.status).toBe(1);
      expect(aliasResult.stderr).toMatch(/^::error::.*contains a backslash/);

      const caseVariant = buildTarball(join(dir, "case"), [
        "package/package.json",
        "package/Package.json",
      ]);
      const caseResult = spawnSync(process.execPath, [SCRIPT], {
        encoding: "utf8",
        input: execFileSync("tar", ["-tzf", caseVariant], { encoding: "utf8" }),
      });
      expect(caseResult.status).toBe(1);
      expect(caseResult.stderr).toMatch(
        /^::error::.*aliases package\/package\.json/,
      );
    });
  });

  test("behavior: an embedded newline cannot forge an entry boundary under --quoting-style=escape", () => {
    withTempDir((dir) => {
      const forged = buildTarball(join(dir, "newline"), [
        "package/package.json",
        "package/a\npackage/b",
      ]);
      const listing = execFileSync(
        "tar",
        ["-tzf", forged, "--quoting-style=escape"],
        { encoding: "utf8" },
      );
      expect(parseEntryListing(listing)).toEqual([
        "package/package.json",
        "package/a\\npackage/b",
      ]);
      const result = spawnSync(process.execPath, [SCRIPT], {
        encoding: "utf8",
        input: listing,
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/^::error::.*contains a backslash/);
    });
  });
});
