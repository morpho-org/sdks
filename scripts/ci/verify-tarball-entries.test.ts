import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { describe, expect, test } from "vitest";

import {
  canonicalEntryPath,
  MANIFEST_ENTRY,
  main,
  readTarballEntries,
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
  execFileSync("tar", [
    "-czf",
    tgz,
    "-C",
    dir,
    "--format=ustar",
    "--no-recursion",
    ...entries,
  ]);
  return tgz;
}

interface RawHeader {
  readonly name: string;
  readonly type: string;
  readonly data?: Buffer;
  readonly magic?: string;
  readonly version?: string;
  readonly prefix?: string;
  /** Raw 12-byte `size` field, overriding the one derived from `data`. */
  readonly sizeField?: string;
  /** Written after the (valid) checksum is computed, to corrupt it. */
  readonly checksumField?: string;
  readonly linkname?: string;
}

/** Builds a 512-byte ustar header plus padded data block(s) for one entry. */
function rawEntry({
  name,
  type,
  data = Buffer.alloc(0),
  magic = "ustar\0",
  version = "00",
  prefix = "",
  sizeField,
  checksumField,
  linkname = "",
}: RawHeader): Buffer {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, "latin1");
  header.write("0000644\0", 100);
  header.write("0000000\0", 108);
  header.write("0000000\0", 116);
  header.write(
    sizeField ?? `${data.length.toString(8).padStart(11, "0")}\0`,
    124,
    12,
    "latin1",
  );
  header.write("00000000000\0", 136);
  header.write("        ", 148);
  header.write(type, 156, 1, "latin1");
  header.write(linkname, 157, 100, "latin1");
  header.write(magic, 257, 6, "latin1");
  header.write(version, 263, 2, "latin1");
  header.write(prefix, 345, 155, "latin1");
  let checksum = 0;
  for (const byte of header) checksum += byte;
  header.write(
    checksumField ?? `${checksum.toString(8).padStart(6, "0")}\0 `,
    148,
    8,
    "latin1",
  );
  const padded = Buffer.alloc(Math.ceil(data.length / 512) * 512);
  data.copy(padded);
  return Buffer.concat([header, padded]);
}

function paxRecords(records: Record<string, string>): Buffer {
  return Buffer.concat(
    Object.entries(records).map(([key, value]) => {
      const body = ` ${key}=${value}\n`;
      let length = body.length + 1;
      while (String(length).length + body.length !== length) length += 1;
      return Buffer.from(`${length}${body}`);
    }),
  );
}

const ZERO_BLOCK = Buffer.alloc(512);

function rawTarball(...blocks: readonly Buffer[]): Buffer {
  return gzipSync(Buffer.concat([...blocks, ZERO_BLOCK, ZERO_BLOCK]));
}

const MANIFEST_BLOCK = rawEntry({
  name: MANIFEST_ENTRY,
  type: "0",
  data: Buffer.from("{}"),
});

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

  test("error: a path segment longer than 255 characters is rejected", () => {
    expect(() =>
      verifyTarballEntries([...VALID, `package/lib/${"a".repeat(256)}`]),
    ).toThrow(/longer than 255/);
    expect(() =>
      verifyTarballEntries([...VALID, `package/lib/${"a".repeat(255)}`]),
    ).not.toThrow();
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
    ).toThrow(/must contain package\/package\.json \(found 0\)/);
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

  test("error: a .gitignore renamed to .npmignore by pacote cannot collide with a directory", () => {
    expect(() =>
      verifyTarballEntries([
        ...VALID,
        "package/config/.gitignore",
        "package/config/.npmignore/child",
      ]),
    ).toThrow(/is a regular file but .* is stored beneath it/);
    expect(() =>
      verifyTarballEntries([
        ...VALID,
        "package/config/.npmignore/",
        "package/config/.gitignore",
      ]),
    ).toThrow(
      /renamed to \.npmignore .* collides with "package\/config\/\.npmignore\/"/,
    );
    expect(() =>
      verifyTarballEntries([
        ...VALID,
        "package/config/.gitignore",
        "package/config/.NPMIGNORE/",
      ]),
    ).toThrow(/collides with a \.gitignore that npm renames/);
  });

  test("error: a .gitignore and a case-variant .npmignore sibling land on one path", () => {
    expect(() =>
      verifyTarballEntries([
        ...VALID,
        "package/config/.gitignore",
        "package/config/.NPMIGNORE",
      ]),
    ).toThrow(/collides with a \.gitignore that npm renames/);
    expect(() =>
      verifyTarballEntries([
        ...VALID,
        "package/config/.NPMIGNORE",
        "package/config/.gitignore",
      ]),
    ).toThrow(
      /renamed to \.npmignore .* collides with "package\/config\/\.NPMIGNORE"/,
    );
    expect(() =>
      verifyTarballEntries([
        ...VALID,
        "package/Config/.npmignore",
        "package/config/.gitignore",
      ]),
    ).toThrow(/renamed to \.npmignore .* collides with/);
    // The literally spelled sibling is tolerated in both orders: pacote either
    // skips the rename (.npmignore first) or lets the sibling overwrite the
    // renamed file (.gitignore first); both are inert ignore files either way.
    expect(() =>
      verifyTarballEntries([
        ...VALID,
        "package/config/.gitignore",
        "package/config/.npmignore",
      ]),
    ).not.toThrow();
    expect(() =>
      verifyTarballEntries([
        ...VALID,
        "package/config/.npmignore",
        "package/config/.gitignore",
      ]),
    ).not.toThrow();
  });

  test("error: entry paths at or above macOS PATH_MAX are rejected", () => {
    const segment = "a".repeat(250);
    const base = `package/${segment}/${segment}/${segment}/${segment}/`;
    expect(() =>
      verifyTarballEntries([
        ...VALID,
        `${base}${"b".repeat(1023 - base.length)}`,
      ]),
    ).not.toThrow();
    expect(() =>
      verifyTarballEntries([
        ...VALID,
        `${base}${"b".repeat(1024 - base.length)}`,
      ]),
    ).toThrow(/1024 characters long/);
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
      "package/CONIN$",
      "package/lib/conout$.js",
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

describe("readTarballEntries", () => {
  test("default: lists ustar files, directories and prefix-split names in order", () => {
    const tgz = rawTarball(
      MANIFEST_BLOCK,
      rawEntry({ name: "package/lib", type: "5" }),
      rawEntry({ name: "index.js", type: "0", prefix: "package/lib/esm" }),
    );
    expect(readTarballEntries(tgz)).toEqual([
      MANIFEST_ENTRY,
      "package/lib/",
      "package/lib/esm/index.js",
    ]);
  });

  test("behavior: a per-entry PAX path record overrides the ustar name", () => {
    const long = `package/${"a".repeat(120)}.js`;
    const tgz = rawTarball(
      MANIFEST_BLOCK,
      rawEntry({
        name: "PaxHeader/x",
        type: "x",
        data: paxRecords({ mtime: "1.5", path: long }),
      }),
      rawEntry({ name: "package/truncated.js", type: "0" }),
    );
    expect(readTarballEntries(tgz)).toEqual([MANIFEST_ENTRY, long]);
  });

  test("behavior: matches GNU tar for archives it produced in ustar and pax formats", () => {
    withTempDir((dir) => {
      const ustar = buildTarball(join(dir, "ustar"), VALID);
      expect(readTarballEntries(readFileSync(ustar))).toEqual(VALID);

      const long = `package/${"b".repeat(150)}/${"c".repeat(150)}.js`;
      const paxDir = join(dir, "pax");
      mkdirSync(dirname(join(paxDir, long)), { recursive: true });
      writeFileSync(join(paxDir, long), "x");
      writeFileSync(join(paxDir, "package.json"), "{}");
      const pax = join(dir, "pax.tgz");
      execFileSync("tar", [
        "-czf",
        pax,
        "-C",
        paxDir,
        "--format=pax",
        "--no-recursion",
        "package.json",
        long,
      ]);
      expect(readTarballEntries(readFileSync(pax))).toEqual([
        "package.json",
        long,
      ]);
      expect(execFileSync("tar", ["-tzf", pax], { encoding: "utf8" })).toBe(
        `package.json\n${long}\n`,
      );
    });
  });

  test("error: a global PAX header is rejected instead of being applied", () => {
    const tgz = rawTarball(
      MANIFEST_BLOCK,
      rawEntry({
        name: "GlobalHead",
        type: "g",
        data: paxRecords({ path: "package/benign.js" }),
      }),
      rawEntry({ name: "package/Package.json", type: "0" }),
    );
    expect(() => readTarballEntries(tgz)).toThrow(/unsupported type flag "g"/);
  });

  test("error: GNU long-name headers are rejected even when a PAX path precedes them", () => {
    const tgz = rawTarball(
      MANIFEST_BLOCK,
      rawEntry({
        name: "PaxHeader/x",
        type: "x",
        data: paxRecords({ path: "package/benign.js" }),
      }),
      rawEntry({
        name: "././@LongLink",
        type: "L",
        data: Buffer.from(`${MANIFEST_ENTRY}\0`),
      }),
      rawEntry({ name: "package/benign.js", type: "0" }),
    );
    expect(() => readTarballEntries(tgz)).toThrow(/unsupported type flag "L"/);
  });

  test("error: a lone zero block followed by more entries is rejected", () => {
    const tgz = rawTarball(
      MANIFEST_BLOCK,
      ZERO_BLOCK,
      rawEntry({ name: "package/Package.json", type: "0" }),
    );
    expect(() => readTarballEntries(tgz)).toThrow(
      /zero block .* followed by more data/,
    );
  });

  test("error: links, non-ustar magic, PAX size overrides and dangling PAX headers are rejected", () => {
    expect(() =>
      readTarballEntries(
        rawTarball(MANIFEST_BLOCK, rawEntry({ name: "package/l", type: "2" })),
      ),
    ).toThrow(/unsupported type flag "2"/);
    expect(() =>
      readTarballEntries(
        rawTarball(
          rawEntry({ name: MANIFEST_ENTRY, type: "0", magic: "\0\0\0\0\0\0" }),
        ),
      ),
    ).toThrow(/not ustar\/pax/);
    expect(() =>
      readTarballEntries(
        rawTarball(
          rawEntry({
            name: "PaxHeader/x",
            type: "x",
            data: paxRecords({ size: "0" }),
          }),
          MANIFEST_BLOCK,
        ),
      ),
    ).toThrow(/unsupported record "size"/);
    expect(() =>
      readTarballEntries(
        rawTarball(
          MANIFEST_BLOCK,
          rawEntry({
            name: "PaxHeader/x",
            type: "x",
            data: paxRecords({ path: "x" }),
          }),
        ),
      ),
    ).toThrow(/dangling PAX header/);
  });

  test("error: a directory header with a non-zero size cannot hide the next header", () => {
    // node-tar forces type-5 size to 0 and parses the following block as a header.
    const tgz = rawTarball(
      MANIFEST_BLOCK,
      rawEntry({ name: "package/lib/", type: "5", sizeField: "00000001000\0" }),
      rawEntry({ name: "package/Package.json", type: "0" }),
    );
    expect(() => readTarballEntries(tgz)).toThrow(
      /directory declaring 512 bytes/,
    );
  });

  test("error: ustar magic with a non-00 version is rejected instead of applying prefix", () => {
    // node-tar only joins `prefix` when bytes 257–265 are exactly `ustar\0` + `00`.
    const tgz = rawTarball(
      MANIFEST_BLOCK,
      rawEntry({
        name: "package/Package.json",
        type: "0",
        version: "99",
        prefix: "package/benign",
      }),
    );
    expect(() => readTarballEntries(tgz)).toThrow(/not ustar\/pax/);
    expect(() =>
      readTarballEntries(
        rawTarball(
          MANIFEST_BLOCK,
          rawEntry({ name: "package/a.js", type: "0", version: " \0" }),
        ),
      ),
    ).toThrow(/not ustar\/pax/);
  });

  test("error: a header with an invalid checksum is rejected instead of trusting its size", () => {
    // node-tar skips a bad-checksum header and re-syncs on the next block, so a
    // header hidden in the declared payload would be extracted.
    const hidden = rawEntry({ name: "package/Package.json", type: "0" });
    const tgz = rawTarball(
      MANIFEST_BLOCK,
      rawEntry({
        name: "package/junk",
        type: "0",
        data: hidden,
        checksumField: "0000000\0",
      }),
    );
    expect(() => readTarballEntries(tgz)).toThrow(/invalid checksum/);
    expect(() =>
      readTarballEntries(
        rawTarball(
          MANIFEST_BLOCK,
          rawEntry({
            name: "package/a.js",
            type: "0",
            checksumField: "xxxxxxx\0",
          }),
        ),
      ),
    ).toThrow(/invalid checksum/);
  });

  test("error: a non-link header carrying a linkname cannot hide the next header", () => {
    // For a file/directory header node-tar warns `linkpath forbidden`, skips one
    // block without consuming the declared body, and parses the payload as the
    // next header. It processes an `x` header with a linkname normally; the
    // gate rejects that too, fail-closed.
    const hidden = rawEntry({ name: "package/Package.json", type: "0" });
    for (const type of ["0", "x"]) {
      expect(() =>
        readTarballEntries(
          rawTarball(
            MANIFEST_BLOCK,
            rawEntry({
              name: "package/junk",
              type,
              data: hidden,
              linkname: "x",
            }),
            rawEntry({ name: "package/benign.js", type: "0" }),
          ),
        ),
      ).toThrow(/carries a linkname/);
    }
  });

  test("error: a linkname hidden behind NUL + newline is still seen (node-tar decString)", () => {
    // node-tar decodes fields with `.replace(/\0.*/, "")`, so `\0x\nY` reads
    // as the non-empty linkpath "\nY"; the gate must not cut at the first NUL.
    const hidden = rawEntry({ name: "package/Package.json", type: "0" });
    expect(() =>
      readTarballEntries(
        rawTarball(
          MANIFEST_BLOCK,
          rawEntry({
            name: "package/junk",
            type: "0",
            data: hidden,
            linkname: "\0x\nY",
          }),
        ),
      ),
    ).toThrow(/carries a linkname/);
    // The same decode applies to the name: node-tar would extract "package/a\nY".
    expect(() =>
      verifyTarballEntries(
        readTarballEntries(
          rawTarball(
            MANIFEST_BLOCK,
            rawEntry({ name: "package/a\0x\nY", type: "0" }),
          ),
        ),
      ),
    ).toThrow(/non-ASCII/);
  });

  test("error: a PAX header above node-tar's maxMetaEntrySize is rejected", () => {
    // node-tar ignores meta entries > 1 MiB wholesale, so the raw name of the
    // following header would be extracted instead of the PAX `path`.
    const records = paxRecords({ path: "package/benign.js" });
    const padded = Buffer.alloc(1024 * 1024 + 1);
    records.copy(padded);
    expect(() =>
      readTarballEntries(
        rawTarball(
          MANIFEST_BLOCK,
          rawEntry({ name: "PaxHeader/x", type: "x", data: padded }),
          rawEntry({ name: "package/Package.json", type: "0" }),
        ),
      ),
    ).toThrow(/PAX header of 1048577 bytes/);
    // Exactly 1 MiB is still applied by node-tar (strict `>`), so it must parse.
    const limit = Buffer.alloc(1024 * 1024);
    limit.write(
      `${(1024 * 1024).toString()} comment=${"a".repeat(1024 * 1024 - 17)}\n`,
    );
    expect(
      readTarballEntries(
        rawTarball(
          MANIFEST_BLOCK,
          rawEntry({ name: "PaxHeader/x", type: "x", data: limit }),
          rawEntry({ name: "package/a.js", type: "0" }),
        ),
      ),
    ).toEqual([MANIFEST_ENTRY, "package/a.js"]);
  });

  test("default: a NUL type flag is a legacy regular file", () => {
    expect(
      readTarballEntries(
        rawTarball(
          MANIFEST_BLOCK,
          rawEntry({ name: "package/a.js", type: "\0" }),
        ),
      ),
    ).toEqual([MANIFEST_ENTRY, "package/a.js"]);
    expect(() =>
      verifyTarballEntries(
        readTarballEntries(
          rawTarball(
            MANIFEST_BLOCK,
            rawEntry({ name: "package/Package.json", type: "\0" }),
          ),
        ),
      ),
    ).toThrow(/aliases package\/package\.json/);
  });

  test("error: a header with an empty path is rejected", () => {
    // node-tar warns `path is required` and re-syncs on the next block.
    const hidden = rawEntry({ name: "package/Package.json", type: "0" });
    expect(() =>
      readTarballEntries(
        rawTarball(
          MANIFEST_BLOCK,
          rawEntry({ name: "", type: "x", data: hidden }),
        ),
      ),
    ).toThrow(/empty path/);
  });

  test("error: a non-octal size field is rejected", () => {
    expect(() =>
      readTarballEntries(
        rawTarball(
          MANIFEST_BLOCK,
          rawEntry({
            name: "package/a.js",
            type: "0",
            sizeField: "0000000000x\0",
          }),
        ),
      ),
    ).toThrow(/non-octal size/);
    expect(() =>
      readTarballEntries(
        rawTarball(
          MANIFEST_BLOCK,
          rawEntry({
            name: "package/a.js",
            type: "0",
            sizeField: "\x80\0\0\0\0\0\0\0\0\0\0\0",
          }),
        ),
      ),
    ).toThrow(/non-octal size/);
  });

  test("error: a header whose size runs past the end of the archive is rejected", () => {
    const tgz = gzipSync(
      Buffer.concat([
        MANIFEST_BLOCK,
        rawEntry({
          name: "package/a.js",
          type: "0",
          sizeField: "00000010000\0",
        }),
      ]),
    );
    expect(() => readTarballEntries(tgz)).toThrow(
      /past the end of the archive/,
    );
  });

  test("error: an archive without an end-of-archive zero block is rejected", () => {
    expect(() => readTarballEntries(gzipSync(MANIFEST_BLOCK))).toThrow(
      /no end-of-archive zero block \(0 trailing bytes\)/,
    );
    expect(() =>
      readTarballEntries(
        gzipSync(Buffer.concat([MANIFEST_BLOCK, Buffer.alloc(100, 0x41)])),
      ),
    ).toThrow(/no end-of-archive zero block \(100 trailing bytes\)/);
    expect(() =>
      readTarballEntries(gzipSync(Buffer.concat([MANIFEST_BLOCK, ZERO_BLOCK]))),
    ).not.toThrow();
  });

  test("error: malformed PAX records are rejected", () => {
    const pax = (data: string) =>
      rawTarball(
        MANIFEST_BLOCK,
        rawEntry({ name: "PaxHeader/x", type: "x", data: Buffer.from(data) }),
        rawEntry({ name: "package/a.js", type: "0" }),
      );
    expect(() => readTarballEntries(pax("99 path=package/a.js\n"))).toThrow(
      /malformed/,
    );
    expect(() => readTarballEntries(pax("x path=package/a.js\n"))).toThrow(
      /malformed/,
    );
    expect(() => readTarballEntries(pax("20 path=package/a.js\n"))).toThrow(
      /malformed/,
    );
    expect(() => readTarballEntries(pax("nospace\n"))).toThrow(/malformed/);
    expect(() => readTarballEntries(pax("15 pathpackage\n"))).toThrow(
      /record without "="/,
    );
  });

  test("error: a PAX value embedding a newline cannot smuggle a path record", () => {
    // node-tar's `parseKV` splits the body on "\n" and honours any line whose
    // length prefix is self-consistent, so a `comment` value containing
    // `<len> path=package/package.json` renames the next entry for node-tar
    // while a length-framed parser only sees a benign `comment`.
    const inner = paxRecords({ path: "package/package.json" }).toString("utf8");
    const value = `AAAA\n${inner.slice(0, -1)}`;
    const body = `comment=${value}\n`;
    const length = body.length + String(body.length + 3).length + 1;
    const record = Buffer.from(`${length} ${body}`);
    expect(record.length).toBe(length);
    expect(() =>
      readTarballEntries(
        rawTarball(
          MANIFEST_BLOCK,
          rawEntry({ name: "PaxHeader/x", type: "x", data: record }),
          rawEntry({ name: "package/readme.md", type: "0" }),
        ),
      ),
    ).toThrow(/containing a newline/);
  });

  test("error: two consecutive PAX headers are rejected", () => {
    const tgz = rawTarball(
      MANIFEST_BLOCK,
      rawEntry({
        name: "PaxHeader/x",
        type: "x",
        data: paxRecords({ path: "package/benign.js" }),
      }),
      rawEntry({
        name: "PaxHeader/x",
        type: "x",
        data: paxRecords({ path: "package/Package.json" }),
      }),
      rawEntry({ name: "package/a.js", type: "0" }),
    );
    expect(() => readTarballEntries(tgz)).toThrow(
      /second consecutive PAX header/,
    );
  });

  test("error: a regular file whose name ends in a slash is rejected", () => {
    expect(() =>
      readTarballEntries(
        rawTarball(
          MANIFEST_BLOCK,
          rawEntry({ name: "package/lib/", type: "0" }),
        ),
      ),
    ).toThrow(/regular file whose name ends in "\/"/);
  });
});

describe("main", () => {
  test("error: a missing tarball argument is rejected", () => {
    expect(() => main(undefined)).toThrow(/Usage/);
  });

  test("behavior: real tarballs are validated end to end via the CLI", () => {
    withTempDir((dir) => {
      const ok = buildTarball(join(dir, "ok"), VALID);
      expect(() => main(ok)).not.toThrow();
      const okResult = spawnSync(process.execPath, [SCRIPT, ok], {
        encoding: "utf8",
      });
      expect(okResult.status).toBe(0);
      expect(okResult.stderr).toBe("");

      const alias = buildTarball(join(dir, "alias"), [
        "package/package.json",
        "package/\\./package.json",
      ]);
      const aliasResult = spawnSync(process.execPath, [SCRIPT, alias], {
        encoding: "utf8",
      });
      expect(aliasResult.status).toBe(1);
      expect(aliasResult.stderr).toMatch(/^::error::.*contains a backslash/);

      const caseVariant = buildTarball(join(dir, "case"), [
        "package/package.json",
        "package/Package.json",
      ]);
      const caseResult = spawnSync(process.execPath, [SCRIPT, caseVariant], {
        encoding: "utf8",
      });
      expect(caseResult.status).toBe(1);
      expect(caseResult.stderr).toMatch(
        /^::error::.*aliases package\/package\.json/,
      );

      const newline = buildTarball(join(dir, "newline"), [
        "package/package.json",
        "package/a\npackage/b",
      ]);
      const newlineResult = spawnSync(process.execPath, [SCRIPT, newline], {
        encoding: "utf8",
      });
      expect(newlineResult.status).toBe(1);
      expect(newlineResult.stderr).toMatch(/^::error::.*non-ASCII or control/);
    });
  });

  test("behavior: a raw-header alias hidden from GNU tar is rejected via the CLI", () => {
    withTempDir((dir) => {
      const hidden = join(dir, "hidden.tgz");
      writeFileSync(
        hidden,
        rawTarball(
          MANIFEST_BLOCK,
          ZERO_BLOCK,
          rawEntry({ name: "package/Package.json", type: "0" }),
        ),
      );
      expect(execFileSync("tar", ["-tzf", hidden], { encoding: "utf8" })).toBe(
        `${MANIFEST_ENTRY}\n`,
      );
      const result = spawnSync(process.execPath, [SCRIPT, hidden], {
        encoding: "utf8",
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/^::error::.*zero block/);
    });
  });
});
