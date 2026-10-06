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
  parseTargets,
  readTarballs,
  readTree,
  scanFiles,
  valueSecrets,
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
const entry = (path: string, content: string) => ({
  ...file(path, content),
  tarball: true as const,
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
    ["linear-key", "test_SDK-1322 here"],
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
    ["wallet-key", `const DEPLOYER_PRIVATE_KEY =\n  "0x${"ab".repeat(32)}";`],
    ["wallet-key", `privateKeyToAccount(\n  "0x${"ab".repeat(32)}",\n);`],
    ["wallet-key", `const privateKey: Hex = "0x${"ab".repeat(32)}";`],
    [
      "wallet-key",
      `const privateKey: \`0x\${string}\` = "0x${"ab".repeat(32)}";`,
    ],
    [
      "wallet-key",
      `const privateKey: Hex | undefined = "0x${"ab".repeat(32)}";`,
    ],
    ["wallet-key", `PRIVATE_KEY_MAINNET=0x${"ab".repeat(32)}`],
    ["wallet-key", `privateKeyHex = "0x${"ab".repeat(32)}"`],
    ["mnemonic", `MNEMONIC_PHRASE="${Array(12).fill("legal").join(" ")}"`],
    [
      "wallet-key",
      `process.env.DEPLOYER_PRIVATE_KEY ?? "0x${"ab".repeat(32)}"`,
    ],
    ["wallet-key", `process.env.PRIVATE_KEY || "0x${"ab".repeat(32)}"`],
    ["wallet-key", `PRIVATE_KEY=0x1${"a".repeat(15)}${"0".repeat(48)}`],
    ["wallet-key", `const deployerPk = "0x${"ab".repeat(32)}";`],
    ["wallet-key", `ownerPK=0x${"ab".repeat(32)}`],
    ["wallet-key", `const privateKey = 0x${"ab".repeat(32)}n;`],
    ["wallet-key-list", `const PRIVATE_KEYS = [0x${"ab".repeat(32)}n];`],
    ["wallet-key", `const signingKey = "0x${"ab".repeat(32)}";`],
    ["wallet-key", `const sk = "0x${"ab".repeat(32)}";`],
    ["wallet-key-list", `vi.stubEnv("PRIVATE_KEY", "0x${"ab".repeat(32)}");`],
    [
      "wallet-key-list",
      `vm.envOr("PRIVATE_KEY", uint256(0x${"ab".repeat(32)}));`,
    ],
    ["wallet-key-list", `const key = env("PK", "0x${"ab".repeat(32)}");`],
    [
      "mnemonic",
      `MNEMONIC="test test test test test test test test test test test junk legal legal legal"`,
    ],
    ["rpc-key", `https://eth-mainnet.g.ALCHEMY.COM/v2/${"K".repeat(32)}`],
    ["rpc-key", `https://mainnet.infura.io/v3/${"A".repeat(32)}`],
    ["wallet-key", `hdKeyToAccount(\`${"ab".repeat(32)}\`)`],
    ["mnemonic", `mnemonicToAccount("${Array(12).fill("abandon").join(" ")}")`],
    ["mnemonic", `Wallet.fromPhrase("${Array(12).fill("abandon").join(" ")}")`],
    [
      "mnemonic",
      `ethers.Wallet.fromMnemonic("${Array(12).fill("abandon").join(" ")}")`,
    ],
    [
      "mnemonic",
      `mnemonicToSeedSync("${Array(12).fill("abandon").join(" ")}")`,
    ],
    ["mnemonic", `mnemonicToSeed("${Array(12).fill("abandon").join(" ")}")`],
    ["mnemonic", `mnemonicToEntropy("${Array(12).fill("abandon").join(" ")}")`],
    ["wallet-key", `DEPLOYER_PRIVATE_KEY=0x${"ab".repeat(32)}`],
    ["wallet-key", `deployerPrivateKey: "0x${"ab".repeat(32)}"`],
    ["wallet-key", `SECRET_KEY=${"ab".repeat(32)}`],
    ["wallet-key", `TEST_PK=0x${"ab".repeat(32)}`],
    ["wallet-key", `const deployerKey = "0x${"ab".repeat(32)}";`],
    ["wallet-key", `SIGNER_KEY=0x${"ab".repeat(32)}`],
    ["wallet-key-list", `const PRIVATE_KEYS = ["0x${"ab".repeat(32)}"];`],
    ["wallet-key-list", `privateKeys: ["0x${"ab".repeat(32)}",\n]`],
    ["wallet-key-list", `privateKey: hexToBytes("0x${"ab".repeat(32)}")`],
    ["wallet-key-list", `privateKeyToAccount(("0x${"ab".repeat(32)}" as Hex))`],
    ["wallet-key-list", `accounts: ["0x${"ab".repeat(32)}"]`],
    ["wallet-key-list", `const accounts = ["0x${"ab".repeat(32)}"];`],
    ["wallet-key-list", `privateKeys: [0x${"ab".repeat(32)}]`],
    ["wallet-key", `privateKeyToAddress("0x${"ab".repeat(32)}")`],
    ["wallet-key", `const signer = new Wallet("0x${"ab".repeat(32)}");`],
    ["wallet-key", `new ethers.Wallet("0x${"ab".repeat(32)}")`],
    ["wallet-key", `const key = new SigningKey("0x${"ab".repeat(32)}");`],
    ["wallet-key", `new ethers.SigningKey("0x${"ab".repeat(32)}")`],
    ["wallet-key", `const pkey = "0x${"ab".repeat(32)}";`],
    ["wallet-key", `LIQUIDATOR_KEY=0x${"ab".repeat(32)}`],
    [
      "wallet-key-fallback",
      `toAccount((process.env.PK as Hex) ?? "0x${"ab".repeat(32)}")`,
    ],
    [
      "wallet-key-fallback",
      `useKey(process.env.PRIVATE_KEY as Hex ?? "0x${"ab".repeat(32)}")`,
    ],
    ["wallet-key-fallback", `privateKey ??= "0x${"ab".repeat(32)}"`],
    [
      "wallet-key-fallback",
      `useKey(process.env.PRIVATE_KEY ?? ("0x${"ab".repeat(32)}" as Hex))`,
    ],
    ["wallet-key-fallback", `useKey(env.PK ? "0x${"ab".repeat(32)}" : env.PK)`],
    [
      "mnemonic-fallback",
      `mnemonicToAccount(process.env.M ?? "${Array(12).fill("legal").join(" ")}")`,
    ],
    [
      "mnemonic-fallback",
      `mnemonic: process.env.MNEMONIC ?? ("${Array(12).fill("legal").join(" ")}")`,
    ],
    [
      "mnemonic-fallback",
      `mnemonic: env.M ? env.M : "${Array(12).fill("legal").join(" ")}"`,
    ],
    ["wallet-key-fallback", `privateKey ||= "0x${"ab".repeat(32)}"`],
    ["mnemonic", `mnemonic ??= "${Array(12).fill("abandon").join(" ")}"`],
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
            "ab".repeat(32) +
            ", marketKey = 0x" +
            "ab".repeat(32) +
            ", task = 0x" +
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
      scanFiles([entry("a-1.0.0.tgz:package/CHANGELOG.md", "SDK-1")]),
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

const ANVIL_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const REAL_KEY = `0x${"ab".repeat(32)}`;
test.each([
  `{ "pk": "${REAL_KEY}", "pk2": "${ANVIL_KEY}" }`,
  `{ pk: "${REAL_KEY}", pk2: "0x${"0".repeat(63)}1" }`,
  `PRIVATE_KEY: ${REAL_KEY} # anvil = ${ANVIL_KEY}`,
])("flag a real key next to a test key in %s", (line) => {
  expect(scanFiles([file("a.ts", line)])).toEqual([
    expect.objectContaining({
      rule: "wallet-key",
      match: expect.stringContaining(REAL_KEY.slice(2)),
    }),
  ]);
});

test.each([
  `accounts: ["${ANVIL_KEY}", "${REAL_KEY}"]`,
  `accounts: [\n  "${ANVIL_KEY}",\n  "${REAL_KEY}",\n]`,
  `const privateKeys = ["${ANVIL_KEY}", "${REAL_KEY}"];`,
  `const privateKeys = [ANVIL_KEY, "${REAL_KEY}"];`,
  `accounts: [process.env.DEPLOYER_PK!, "${REAL_KEY}"],`,
  `accounts: process.env.PK ? [process.env.PK] : ["${REAL_KEY}"],`,
  `accounts: ["${ANVIL_KEY}", keys[0], "${REAL_KEY}"],`,
  `accounts: ["${ANVIL_KEY}", process.env["K"], "${REAL_KEY}"],`,
  `accounts: ["${ANVIL_KEY}", // [default]\n  "${REAL_KEY}"],`,
  `const pk = useFork ? "${REAL_KEY}" : process.env.PK;`,
  `const pk = useFork\n  ? "${REAL_KEY}"\n  : process.env.PK;`,
  `const privateKey = process.env.PRIVATE_KEY ?? ("${REAL_KEY}" as Hex);`,
  `const privateKey = process.env.PRIVATE_KEY ?? hexToBytes("${REAL_KEY}");`,
  `privateKeyToAccount(process.env.PK ?? ("${REAL_KEY}" as Hex))`,
  `PRIVATE_KEY:\n  - ${ANVIL_KEY}\n  - ${REAL_KEY}\n`,
  `accounts:\n  - "${REAL_KEY}"\n`,
  `PRIVATE_KEYS=${ANVIL_KEY},${REAL_KEY}`,
  `DEPLOYER_PRIVATE_KEYS=${ANVIL_KEY},${REAL_KEY}`,
  `export DEPLOYER_PRIVATE_KEYS=${ANVIL_KEY},${REAL_KEY}`,
  `PRIVATE_KEYS=${ANVIL_KEY} ${REAL_KEY}`,
  `export PRIVATE_KEYS="${ANVIL_KEY};${REAL_KEY}"`,
  `const PRIVATE_KEYS = "${ANVIL_KEY},${REAL_KEY}";`,
  `const PRIVATE_KEYS = "${ANVIL_KEY} ${REAL_KEY}";`,
  `privateKeys: [${ANVIL_KEY}, ${REAL_KEY}]`,
  `private_keys:\n  # deployer\n  - ${REAL_KEY}\n`,
  `private_keys: # deployers\n  - ${REAL_KEY}\n`,
  `private_keys:\n  - ${ANVIL_KEY}\n\n  - ${REAL_KEY}\n`,
  `const accounts = ["${ANVIL_KEY}", "${REAL_KEY}"];`,
  `PRIVATE_KEY: # anvil, then real\n  "${REAL_KEY}"`,
  `accounts: /* deployer, keeper */ ["${REAL_KEY}"],`,
  `const pk = env.PK\n  .trim() || "${REAL_KEY}";`,
  `{"accounts": ["${ANVIL_KEY}", "${REAL_KEY}"]}`,
  `  privateKeys = [\n    ANVIL_KEY,\n    "${REAL_KEY}",\n  ];`,
  `private_keys = [\n  "${ANVIL_KEY}",\n  "${REAL_KEY}",\n]`,
  `PRIVATE_KEYS = [\n    "${ANVIL_KEY}",\n    "${REAL_KEY}",\n]`,
])("flag a real key listed after a test key in %s", (line) => {
  expect(scanFiles([file("a.ts", line)])).toEqual([
    expect.objectContaining({
      rule: "wallet-key-list",
      match: expect.stringContaining(REAL_KEY.slice(2)),
    }),
  ]);
});

test.each([
  `forge script D.s.sol --private-key ${REAL_KEY} --broadcast`,
  `cast wallet address --private-key "${REAL_KEY}"`,
  `forge script D.s.sol \\\n  --private-key ${REAL_KEY}`,
])("flag a key passed as a CLI flag in %s", (line) => {
  expect(scanFiles([file("a.sh", line)])).toEqual([
    expect.objectContaining({ rule: "wallet-key" }),
  ]);
});

test("ignore the Anvil default key passed as a call argument", () => {
  const line = `vi.stubEnv("PRIVATE_KEY", "${ANVIL_KEY}");`;
  expect(scanFiles([file("a.ts", line)])).toEqual([]);
});

test("ignore the Anvil default key passed as a CLI flag", () => {
  const line = `cast send --private-key ${ANVIL_KEY} 0x0`;
  expect(scanFiles([file("a.sh", line)])).toEqual([]);
});

const HEX = `d${"1".repeat(63)}`;
test("flag a real hex operand before a test key in a chain", () => {
  const content = `PK ?? ${HEX} ?? "${ANVIL_KEY}"`;
  expect(scanFiles([file("a.ts", content)])).toEqual([
    expect.objectContaining({ rule: "wallet-key" }),
  ]);
});

// A chain operand never holds a 64-hex value, so no match (skipped or not) can
// run across one.
test.each([
  `getEnv("${HEX}")`,
  `env["${HEX}"]`,
  `env.${HEX}`,
  `env.${"1".repeat(64)}`,
])("never span a hex value inside the chain operand %s", (operand) => {
  const content = `PK ?? ${operand} ?? "${REAL_KEY}"`;
  expect(
    scanFiles([file("a.ts", content)]).filter(({ match }) =>
      match.includes(HEX.slice(1)),
    ),
  ).toEqual([]);
});

test("valueSecrets lists every 64-hex value in a quoted, delimited value", () => {
  const opener = "PRIVATE_KEYS = ";
  const source = `${opener}"${ANVIL_KEY},${REAL_KEY}"; const id = "${REAL_KEY}";`;
  expect(
    valueSecrets(source, { opener, start: opener.length }).map(
      ({ secret, at }) => ({ secret, at }),
    ),
  ).toEqual([
    { secret: ANVIL_KEY, at: opener.length + 1 },
    { secret: REAL_KEY, at: opener.length + 2 + ANVIL_KEY.length },
  ]);
});

test.each([
  `accounts: [ANVIL_KEY], marketId: "${REAL_KEY}",`,
  `const privateKey = env.PK;\nconst marketId = "${REAL_KEY}";`,
  `privateKey: env.PK }, { id: "${REAL_KEY}" }`,
])("stop the value at its end in %s", (line) => {
  expect(scanFiles([file("a.ts", line)])).toEqual([]);
});

test.each([
  `const upkeepId = "0x${"ab".repeat(32)}";`,
  `pkgHash = "0x${"ab".repeat(32)}"`,
  `PKG_HASH = "0x${"ab".repeat(32)}"`,
])("don't flag a name that only contains pk in %s", (line) => {
  expect(scanFiles([file("a.ts", line)])).toEqual([]);
});

test("still flag a real mnemonic on the line after the test one", () => {
  const real = Array(12).fill("legal").join(" ");
  const content = `TEST_MNEMONIC=test test test test test test test test test test test junk\nMNEMONIC=${real}\n`;
  expect(scanFiles([file("a.env", content)])).toEqual([
    expect.objectContaining({ line: 2, rule: "mnemonic" }),
  ]);
});

test.each([
  file("docs/SDK-1234-plan/notes.md", "x"),
  file("x/sdk-1322_notes.md", "x"),
  file("SDK-999.tgz:a/b.md", "x"),
  entry("a-1.0.0.tgz:package/sdk-1322-notes.md", "x"),
])("flag a Linear key in the path $path", (scanned) => {
  expect(scanFiles([scanned])).toEqual([
    expect.objectContaining({
      path: scanned.path,
      line: 0,
      rule: "linear-key",
    }),
  ]);
});

test("don't scan the tarball name itself", () => {
  expect(scanFiles([entry("morpho-sdk-1.0.0.tgz:package/a.md", "x")])).toEqual(
    [],
  );
});

test.each([
  `process.env["PRIVATE_KEY"] ?? "${REAL_KEY}"`,
  `getEnv("PRIVATE_KEY") ?? "${REAL_KEY}"`,
  `const privKey = "${REAL_KEY}";`,
  `PRIV_KEY=${REAL_KEY}`,
  `process.env.PRIVATE_KEY ?? process.env.FALLBACK ?? "${REAL_KEY}"`,
  `env["PK"] || env["BACKUP"] || "${REAL_KEY}"`,
  `env.PK ?? getEnv("B") ?? "${REAL_KEY}"`,
  `env.PK ?? env?.B ?? "${REAL_KEY}"`,
  `env.PK ?? env?.["B"] ?? "${REAL_KEY}"`,
  `{"code":"const PRIVATE_KEY = \\"${REAL_KEY}\\";"}`,
])("flag a wallet key in %s", (line) => {
  expect(scanFiles([file("a.ts", line)])).toEqual([
    expect.objectContaining({ rule: "wallet-key" }),
  ]);
});

const REAL_MNEMONIC = Array(12).fill("legal").join(" ");
test.each([
  `process.env.MNEMONIC ?? "${REAL_MNEMONIC}"`,
  `env["MNEMONIC"] || "${REAL_MNEMONIC}"`,
  `{"code":"const MNEMONIC = \\"${REAL_MNEMONIC}\\";"}`,
  `anvil --mnemonic "${REAL_MNEMONIC}"`,
])("flag a mnemonic in %s", (line) => {
  expect(scanFiles([file("a.ts", line)])).toEqual([
    expect.objectContaining({ rule: "mnemonic" }),
  ]);
});

const ANVIL_MNEMONIC =
  "test test test test test test test test test test test junk";
test.each([
  `const mnemonics = ["${ANVIL_MNEMONIC}", "${REAL_MNEMONIC}"];`,
  `const mnemonic = isTest ? "${ANVIL_MNEMONIC}" : "${REAL_MNEMONIC}";`,
  `mnemonics:\n  - ${ANVIL_MNEMONIC}\n  - ${REAL_MNEMONIC}\n`,
])("flag a real mnemonic listed after the test one in %s", (line) => {
  expect(scanFiles([file("a.ts", line)])).toEqual([
    expect.objectContaining({
      rule: "mnemonic-list",
      match: expect.stringContaining(REAL_MNEMONIC),
    }),
  ]);
});

test("report a file's findings in line order", () => {
  const content = "SDK-1\nhttps://linear.app/x\n\nSDK-2\n";
  expect(scanFiles([file("a.md", content)]).map((f) => f.line)).toEqual([
    1, 2, 4,
  ]);
});

test.each([
  `privateKeyToAccount(\n  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",\n);`,
  `PRIVATE_KEY=0x${"0".repeat(63)}1`,
  `mnemonicToAccount("test test test test test test test test test test test junk")`,
])("ignore the published test secret in %s", (line) => {
  expect(scanFiles([file("a.ts", line)])).toEqual([]);
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

  test("names the given policy file in errors", () => {
    expect(() => parsePolicy({}, "custom.json")).toThrow('"custom.json"');
  });
});

describe("readTree and readTarballs", () => {
  test("read files with POSIX paths, symlinks as their target", () => {
    const dir = tempDir();
    write(dir, { "a/b.md": "x" });
    symlinkSync("a/b.md", join(dir, "SDK-1234-notes.md"));
    const files = readTree(dir);
    expect(files.map(({ path }) => path)).toEqual([
      "SDK-1234-notes.md",
      "a/b.md",
    ]);
    expect(scanFiles(files)).toEqual([
      expect.objectContaining({ path: "SDK-1234-notes.md", line: 0 }),
    ]);
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
        tarball: true,
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

  test("reject a later tarball without package/package.json", async () => {
    const dir = tempDir();
    write(dir, {
      "a/package/package.json": "{}",
      "b/package/index.js": "",
    });
    const valid = join(dir, "a-1.0.0.tgz");
    const missing = join(dir, "b-1.0.0.tgz");
    execFileSync("tar", ["-czf", valid, "-C", join(dir, "a"), "package"]);
    execFileSync("tar", ["-czf", missing, "-C", join(dir, "b"), "package"]);
    await expect(readTarballs([valid, missing])).rejects.toThrow(
      `"${missing}" has no package/package.json`,
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

  test("redacts secrets in its messages", () => {
    const secret = `0x${"ab".repeat(32)}`;
    const blocking = scanFiles([file("a.ts", `const pk = "${secret}";`)]);
    expect(blocking).toEqual([expect.objectContaining({ rule: "wallet-key" })]);
    const { errors } = evaluate({ ...base, blocking, tarballs: 1 });
    expect(errors).toEqual([
      'a.ts:1: wallet-key: "pk ="… (72 characters, redacted)',
    ]);
    expect(errors.join("\n")).not.toContain("ab".repeat(8));
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

describe("parseTargets", () => {
  test.each([
    ["an empty --tree", { tree: "", tarballs: "packs" }],
    ["an empty --tarballs", { tree: "tree", tarballs: "" }],
    ["no flags", {}],
  ])("rejects %s", (_, flags) => {
    expect(() => parseTargets(flags)).toThrow();
  });

  test("returns the given directories", () => {
    expect(parseTargets({ tarballs: "packs" })).toEqual({
      tree: undefined,
      tarballs: "packs",
    });
  });
});

test("skip the Anvil default mnemonic passed to a seed-phrase sink", () => {
  expect(
    scanFiles([
      file(
        "a.ts",
        'Wallet.fromPhrase("test test test test test test test test test test test junk")',
      ),
    ]),
  ).toEqual([]);
});

test("fail closed on a key-named value longer than 4096 characters", () => {
  const list = `accounts: [\n${`  "${ANVIL_KEY}",\n`.repeat(60)}  "${REAL_KEY}",\n]`;
  expect(scanFiles([file("a.ts", list)])).toEqual([
    expect.objectContaining({
      rule: "wallet-key-list",
      match: expect.stringContaining("longer than 4096"),
    }),
  ]);
});

test("fail closed on a YAML key list longer than 4096 characters", () => {
  const list = `accounts:\n${`  - "${ANVIL_KEY}"\n`.repeat(60)}  - "${REAL_KEY}"\n`;
  expect(scanFiles([file("a.yml", list)])).toEqual([
    expect.objectContaining({
      rule: "wallet-key-list",
      match: expect.stringContaining("longer than 4096"),
    }),
  ]);
});

test("report a repeated key once per file", () => {
  const line = `PRIVATE_KEY=${REAL_KEY}\n`;
  expect(scanFiles([file("a.env", line + line)])).toHaveLength(1);
});
