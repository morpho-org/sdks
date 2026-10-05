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
import { afterAll, describe, expect, test } from "vitest";

import {
  applyExceptions,
  evaluate,
  POLICY_PATH,
  parsePolicy,
  readTarballs,
  readTree,
  scanFiles,
} from "./scan.ts";

// Tests run concurrently, where onTestFinished can't tell tests apart, so one
// root holds every test's directory and is removed at the end.
const testRoot = mkdtempSync(join(tmpdir(), "public-gates-test-"));
afterAll(() => rmSync(testRoot, { recursive: true, force: true }));
const tempDir = () => mkdtempSync(join(testRoot, "t-"));

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
    ["linear-key", "branch feature/sdk-1322-public-gates"],
    ["linear-url", "https://Linear.app/morpho-labs/issue/X"],
    ["slack-url", "Morpho.Slack.com/archives/C1"],
    ["notion-url", "https://www.Notion.so/page"],
    ["devin-session", "https://App.Devin.ai/sessions/abc"],
    ["internal-repo", "Morpho-Org/SDKs-Internal"],
    ["internal-host", "API.Internal.Morpho.dev"],
    ["wallet-key", `PRIVATE_KEY=0x${"ab".repeat(32)}`],
    ["wallet-key", `privateKey: "${"cd".repeat(32)}"`],
    ["mnemonic", `MNEMONIC="${Array(12).fill("abandon").join(" ")}"`],
    ["url-credentials", "https://user:hunter2@rpc.example.com"],
    ["url-credentials", "wss://user:hunter2@rpc.example.com"],
    ["url-credentials", "https://user:1234@rpc.example.com"],
    ["url-credentials", "redis://:s3cretPass@cache:6379"],
    ["url-credentials", "postgres://admin:483920@10.0.0.5:5432/db"],
    ["url-credentials", "https://u:1234@1inch.example"],
    ["wallet-key", `privateKeyToAccount("0x${"ab".repeat(32)}")`],
    ["wallet-key", `hdKeyToAccount(\`${"ab".repeat(32)}\`)`],
    ["mnemonic", `mnemonicToAccount("${Array(12).fill("abandon").join(" ")}")`],
    ["wallet-key", `DEPLOYER_PRIVATE_KEY=0x${"ab".repeat(32)}`],
    ["wallet-key", `deployerPrivateKey: "0x${"ab".repeat(32)}"`],
    ["wallet-key", `SECRET_KEY=${"ab".repeat(32)}`],
    ["wallet-key", `TEST_PK=0x${"ab".repeat(32)}`],
    ["mnemonic", `TEST_MNEMONIC="${Array(12).fill("abandon").join(" ")}"`],
    ["mnemonic", `seed_phrase: "${Array(24).fill("zoo").join(" ")}"`],
    ["github-token", `github_pat_${"a".repeat(22)}`],
    ["rpc-key", `https://mainnet.infura.io/v3/${"a".repeat(32)}`],
    ["notion-url", "https://morpho.notion.site/page"],
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
          "ERC-4626, EIP-2612, MYSDK-12, SDK-v2, morpho-org/sdks, notion of slack, http://localhost:8545@19000000, https://x:$" +
            "{TOKEN}@github.com, market 0x" +
            "ab".repeat(32),
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

  test("matches blocked terms that start or end with punctuation", () => {
    expect(
      scanFiles([file("a.md", "by @acme and Acme+.")], ["@acme", "Acme+"]),
    ).toEqual([
      { path: "a.md", line: 1, rule: "blocked-term", match: "@acme" },
      { path: "a.md", line: 1, rule: "blocked-term", match: "Acme+" },
    ]);
  });

  test("scans files with NUL bytes, such as UTF-16 text", () => {
    expect(
      scanFiles([
        { path: "a.txt", content: Buffer.from("SDK-12", "utf16le") },
        { path: "b.map", content: Buffer.from("\0see SDK-3") },
      ]),
    ).toEqual([
      { path: "a.txt", line: 1, rule: "linear-key", match: "SDK-12" },
      { path: "b.map", line: 1, rule: "linear-key", match: "SDK-3" },
    ]);
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

  test("doesn't allow the same text and path under another rule", () => {
    const other = { ...allowed, rule: "blocked-term" } as const;
    const { blocking, unused } = applyExceptions(findings, [other]);
    expect(blocking).toHaveLength(3);
    expect(unused).toEqual([other]);
  });

  test("never allows a tarball finding, even under a matching glob", () => {
    const wide = { ...allowed, path: "**/CHANGELOG.md" } as const;
    const { blocking } = applyExceptions(
      scanFiles([file("a-1.0.0.tgz:package/CHANGELOG.md", "SDK-1")]),
      [wide],
    );
    expect(blocking.map(({ path }) => path)).toEqual([
      "a-1.0.0.tgz:package/CHANGELOG.md",
    ]);
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
    [
      "a prototype key as rule",
      { blockedTerms: [], exceptions: [{ ...valid, rule: "constructor" }] },
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

  test("scan tarball contents under the tarball name", async () => {
    const dir = tempDir();
    write(dir, {
      "package/package.json": "{}",
      "package/lib/index.js": "// see SDK-7\n",
    });
    const tarball = join(dir, "pkg-1.0.0.tgz");
    execFileSync("tar", ["-czf", tarball, "-C", dir, "package"]);
    expect(scanFiles(await readTarballs([tarball]))).toEqual([
      {
        path: "pkg-1.0.0.tgz:package/lib/index.js",
        line: 1,
        rule: "linear-key",
        match: "SDK-7",
      },
    ]);
  });

  test("reject tarballs with symlinks", async () => {
    const dir = tempDir();
    write(dir, { "package/package.json": "{}" });
    symlinkSync("../../.env", join(dir, "package/leak"));
    const tarball = join(dir, "pkg-1.0.0.tgz");
    execFileSync("tar", ["-czf", tarball, "-C", dir, "package"]);
    await expect(readTarballs([tarball])).rejects.toThrow(
      "package/leak (SymbolicLink)",
    );
  });

  test("reject tarballs without package/package.json", async () => {
    const dir = tempDir();
    write(dir, { "package/index.js": "" });
    const tarball = join(dir, "pkg-1.0.0.tgz");
    execFileSync("tar", ["-czf", tarball, "-C", dir, "package"]);
    await expect(readTarballs([tarball])).rejects.toThrow(
      "has no package/package.json",
    );
  });
});

describe("evaluate", () => {
  const finding = {
    path: "a.md",
    line: 1,
    rule: "linear-key",
    match: "SDK-1",
  } as const;
  const stale = {
    path: "b.md",
    rule: "linear-key",
    match: "SDK-2",
    reason: "why",
  } as const;
  const base = { blocking: [], unused: [], scannedFiles: 3, policyPath: "p" };

  test("passes a clean scan", () => {
    expect(evaluate({ ...base, treeFiles: 3 })).toEqual({
      exitCode: 0,
      errors: [],
      summary: "Scanned 3 files: nothing internal found.",
    });
  });

  test("fails on a blocking finding", () => {
    expect(evaluate({ ...base, blocking: [finding], tarballs: 1 })).toEqual({
      exitCode: 1,
      errors: ['a.md:1: linear-key: "SDK-1"'],
    });
  });

  test("fails on an unused exception when the tree is scanned", () => {
    expect(evaluate({ ...base, unused: [stale], treeFiles: 3 }).exitCode).toBe(
      1,
    );
  });

  test("ignores unused exceptions when only tarballs are scanned", () => {
    expect(evaluate({ ...base, unused: [stale], tarballs: 2 }).exitCode).toBe(
      0,
    );
  });

  test.each([
    {
      name: "an empty tree",
      input: { treeFiles: 0 },
      error: "The tree is empty.",
    },
    {
      name: "no tarballs",
      input: { tarballs: 0 },
      error: "No .tgz files to scan.",
    },
  ])("fails on $name", ({ input, error }) => {
    expect(evaluate({ ...base, scannedFiles: 0, ...input })).toEqual({
      exitCode: 1,
      errors: [error],
    });
  });
});
