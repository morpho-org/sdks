import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import {
  applyExceptions,
  POLICY_PATH,
  parsePolicy,
  readTarballs,
  readTree,
  scanFiles,
} from "./scan.ts";

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "public-gates-test-"));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function write(root: string, files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
}

const file = (path: string, content: string) => ({
  path,
  content: Buffer.from(content),
});

describe("scanFiles", () => {
  test.each([
    ["linear-key", "Fixed in SDK-1234."],
    ["linear-key", "Follow-up in VAU-56."],
    ["linear-url", "See https://linear.app/morpho-labs/issue/X"],
    ["slack-url", "https://morpho.slack.com/archives/C1"],
    ["notion-url", "https://www.notion.so/page"],
    ["devin-session", "https://app.devin.ai/sessions/abc"],
    ["internal-repo", "git clone git@github.com:morpho-org/sdks-internal.git"],
    ["internal-host", "curl https://api.dev.internal.morpho.dev/health"],
    ["private-key", "-----BEGIN OPENSSH PRIVATE KEY-----"],
    ["github-token", `token = "ghp_${"a".repeat(36)}"`],
    ["npm-token", `//registry.npmjs.org/:_authToken=npm_${"A".repeat(36)}`],
    ["aws-key", "AKIAABCDEFGHIJKLMNOP"],
    ["slack-token", "xoxb-1234567890-abcdef"],
    ["anthropic-key", `sk-ant-api03-${"x".repeat(24)}`],
    ["rpc-key", `https://eth-mainnet.g.alchemy.com/v2/${"k".repeat(32)}`],
  ])("flags %s", (rule, text) => {
    expect(scanFiles([file("a.md", `ok\n${text}\n`)])).toEqual([
      expect.objectContaining({ path: "a.md", line: 2, rule }),
    ]);
  });

  test("ignores look-alikes", () => {
    expect(
      scanFiles([
        file(
          "a.md",
          "ERC-4626, EIP-2612, MYSDK-12, SDK-v2, morpho-org/sdks, notion of slack",
        ),
      ]),
    ).toEqual([]);
  });

  test("flags blocked terms case-insensitively, as whole words", () => {
    expect(
      scanFiles(
        [file("a.ts", "// Ships on Acmechain soon\nacmechainy")],
        ["AcmeChain"],
      ),
    ).toEqual([
      { path: "a.ts", line: 1, rule: "blocked-term", match: "Acmechain" },
    ]);
  });

  test("escapes regex characters in blocked terms", () => {
    expect(scanFiles([file("a.ts", "aXb")], ["a.b"])).toEqual([]);
  });

  test("skips binary files", () => {
    expect(
      scanFiles([{ path: "a.png", content: Buffer.from("\0SDK-1") }]),
    ).toEqual([]);
  });
});

describe("applyExceptions", () => {
  const findings = scanFiles([
    file("packages/a/CHANGELOG.md", "SDK-1 and SDK-2"),
    file("docs/b.md", "SDK-1"),
  ]);
  const allowed = {
    path: "packages/*/CHANGELOG.md",
    rule: "linear-key",
    match: "SDK-1",
    reason: "published",
  } as const;

  test("allows only the same rule, text and path", () => {
    const { blocking, unused } = applyExceptions(findings, [allowed]);
    expect(blocking.map(({ path, match }) => `${path} ${match}`)).toEqual([
      "packages/a/CHANGELOG.md SDK-2",
      "docs/b.md SDK-1",
    ]);
    expect(unused).toEqual([]);
  });

  test("reports exceptions that match nothing", () => {
    const stale = { ...allowed, match: "SDK-9" };
    expect(applyExceptions(findings, [stale]).unused).toEqual([stale]);
  });
});

describe("parsePolicy", () => {
  const valid = {
    path: "a.md",
    rule: "linear-key",
    match: "SDK-1",
    reason: "why",
  };

  test("accepts the committed policy", () => {
    expect(() =>
      parsePolicy(JSON.parse(readFileSync(POLICY_PATH, "utf8"))),
    ).not.toThrow();
  });

  test.each([
    ["no blockedTerms", { exceptions: [] }],
    ["an empty blocked term", { blockedTerms: [" "], exceptions: [] }],
    ["no exceptions", { blockedTerms: [] }],
    [
      "an exception without a reason",
      { blockedTerms: [], exceptions: [{ ...valid, reason: "" }] },
    ],
    [
      "an unknown rule",
      { blockedTerms: [], exceptions: [{ ...valid, rule: "nope" }] },
    ],
    ["a duplicate", { blockedTerms: [], exceptions: [valid, valid] }],
  ])("rejects %s", (_, policy) => {
    expect(() => parsePolicy(policy)).toThrow();
  });
});

describe("readTree and readTarballs", () => {
  test("read regular files with POSIX paths and skip symlinks", () => {
    const dir = tempDir();
    write(dir, { "a/b.md": "SDK-1" });
    symlinkSync("a/b.md", join(dir, "link.md"));
    expect(readTree(dir).map(({ path }) => path)).toEqual(["a/b.md"]);
  });

  test("scan tarball contents under the tarball name", () => {
    const dir = tempDir();
    write(dir, { "package/lib/index.js": "// see SDK-7\n" });
    const tarball = join(dir, "pkg-1.0.0.tgz");
    execFileSync("tar", ["-czf", tarball, "-C", dir, "package"]);
    expect(scanFiles(readTarballs([tarball]))).toEqual([
      {
        path: "pkg-1.0.0.tgz:package/lib/index.js",
        line: 1,
        rule: "linear-key",
        match: "SDK-7",
      },
    ]);
  });
});
