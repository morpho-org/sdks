import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import {
  MIN_DERIVED_SECRET_LENGTH,
  main,
  REDACTION,
  redactSecrets,
  sanitizeReports,
  secretRepresentations,
} from "./redact-vitest-reports.ts";

const MAINNET = "https://eth-mainnet.example.com/v2/KEY0123456789abcdef";
const BASE = "https://base.example.com/v2/BASEKEY9876543210";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "redact-vitest-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    rmSync(tempDir, { force: true, recursive: true });
  }
});

describe("secretRepresentations", () => {
  test("default: includes the raw value and its API-key path segment", () => {
    const representations = secretRepresentations(MAINNET);

    expect(representations.has(MAINNET)).toBe(true);
    expect(representations.has("KEY0123456789abcdef")).toBe(true);
  });

  test("behavior: includes percent-encoded and JSON-escaped forms", () => {
    const representations = secretRepresentations(MAINNET);

    expect(representations.has(encodeURIComponent(MAINNET))).toBe(true);
    expect(representations.has(JSON.stringify(MAINNET).slice(1, -1))).toBe(
      true,
    );
  });

  test("behavior: derives basic-auth and query credentials", () => {
    const representations = secretRepresentations(
      "https://user0123:pass0123@rpc.example.com/?apiKey=QUERYKEY1234567",
    );

    expect(representations.has("user0123")).toBe(true);
    expect(representations.has("pass0123")).toBe(true);
    expect(representations.has("QUERYKEY1234567")).toBe(true);
  });

  test("behavior: skips fragments shorter than the derived-secret minimum", () => {
    const representations = secretRepresentations("https://rpc.example.com/v2");

    // "v2" is a short, non-secret path segment.
    expect(representations.has("v2")).toBe(false);
    expect(MIN_DERIVED_SECRET_LENGTH).toBeGreaterThan(2);
  });

  test("behavior: an empty secret yields no representations", () => {
    expect(secretRepresentations("").size).toBe(0);
  });

  test("behavior: includes a JSON-escaped form distinct from the raw value", () => {
    const secret = 'tok"en\\secret';
    const escaped = JSON.stringify(secret).slice(1, -1);
    const representations = secretRepresentations(secret);

    expect(escaped).not.toBe(secret);
    expect(representations.has(escaped)).toBe(true);
  });

  test("behavior: a non-URL secret keeps only its raw serialization variants", () => {
    const secret = "plain secret/token";
    const representations = secretRepresentations(secret);

    // The JSON-escaped form equals the raw value here, so only the raw and
    // percent-encoded representations remain.
    expect([...representations].sort()).toEqual(
      [secret, encodeURIComponent(secret)].sort(),
    );
  });

  test("behavior: derives the decoded path segment", () => {
    const representations = secretRepresentations(
      "https://rpc.example.com/v2/KEY%2FSECRET0123",
    );

    expect(representations.has("KEY%2FSECRET0123")).toBe(true);
    expect(representations.has("KEY/SECRET0123")).toBe(true);
  });

  test("behavior: derives the basic-auth Authorization value", () => {
    const representations = secretRepresentations(
      "https://user0123:pass0123@rpc.example.com/",
    );

    expect(
      representations.has(Buffer.from("user0123:pass0123").toString("base64")),
    ).toBe(true);
  });

  test("behavior: skips a short basic-auth password", () => {
    const representations = secretRepresentations(
      "https://u:1@rpc.example.com/",
    );

    expect(representations.has("1")).toBe(false);
  });
});

describe("redactSecrets", () => {
  test("default: redacts an exact URL occurrence", () => {
    expect(
      redactSecrets(`error sending request for url (${MAINNET})`, [MAINNET]),
    ).toEqual({
      content: `error sending request for url (${REDACTION})`,
      replacements: 1,
    });
  });

  test("behavior: redacts the percent-encoded form", () => {
    const encoded = encodeURIComponent(MAINNET);

    expect(redactSecrets(`fork=${encoded}`, [MAINNET]).content).toBe(
      `fork=${REDACTION}`,
    );
  });

  test("behavior: redacts the API key even when the full URL is absent", () => {
    expect(
      redactSecrets('{"message":"auth failed for KEY0123456789abcdef"}', [
        MAINNET,
      ]).content,
    ).toBe(`{"message":"auth failed for ${REDACTION}"}`);
  });

  test("behavior: redacts multiple secrets and leaves the host intact", () => {
    const report = `mainnet ${MAINNET} base ${BASE}`;
    const result = redactSecrets(report, [MAINNET, BASE]);

    expect(result.content).toBe(`mainnet ${REDACTION} base ${REDACTION}`);
    // The host is not secret and stays readable for diagnosing which fork broke.
    expect(
      redactSecrets("connect eth-mainnet.example.com failed", [MAINNET])
        .content,
    ).toContain("eth-mainnet.example.com");
  });

  test("behavior: an empty secret list leaves content unchanged", () => {
    expect(redactSecrets("nothing to redact", [])).toEqual({
      content: "nothing to redact",
      replacements: 0,
    });
  });

  test("behavior: counts every occurrence redacted", () => {
    expect(
      redactSecrets(`${MAINNET} ${MAINNET} ${MAINNET}`, [MAINNET]).replacements,
    ).toBe(3);
  });

  test("behavior: redacts a report containing only the JSON-escaped form", () => {
    const secret = 'tok"en\\secret';
    const escaped = JSON.stringify(secret).slice(1, -1);

    expect(redactSecrets(`{"token":"${escaped}"}`, [secret])).toEqual({
      content: `{"token":"${REDACTION}"}`,
      replacements: 1,
    });
  });

  test("behavior: masks token-shaped strings without a configured secret", () => {
    expect(redactSecrets("Authorization: Bearer abcdef0123456789", [])).toEqual(
      {
        content: `Authorization: Bearer ${REDACTION}`,
        replacements: 1,
      },
    );
    expect(
      redactSecrets("fatal: token ghp_abcdefghij0123456789 rejected", []),
    ).toEqual({
      content: `fatal: token ${REDACTION} rejected`,
      replacements: 1,
    });
  });
});

describe("sanitizeReports", () => {
  test("default: scrubs report files into the output directory", () => {
    const inputDir = join(makeTempDir(), "vitest-reports");
    const outputDir = join(makeTempDir(), "sanitized");
    mkdirSync(inputDir, { recursive: true });
    writeFileSync(
      join(inputDir, "blue-sdk.json"),
      `{"error":"request to ${MAINNET} failed"}`,
    );

    const result = sanitizeReports({ inputDir, outputDir, secrets: [MAINNET] });

    expect(result).toEqual({ files: 1, replacements: 1 });
    expect(readFileSync(join(outputDir, "blue-sdk.json"), "utf8")).toBe(
      `{"error":"request to ${REDACTION} failed"}`,
    );
  });

  test("behavior: a missing input directory is a no-op", () => {
    const outputDir = join(makeTempDir(), "sanitized");

    expect(
      sanitizeReports({
        inputDir: join(makeTempDir(), "absent"),
        outputDir,
        secrets: [MAINNET],
      }),
    ).toEqual({ files: 0, replacements: 0 });
  });

  test("behavior: an empty input directory is a no-op", () => {
    const inputDir = makeTempDir();

    expect(
      sanitizeReports({
        inputDir,
        outputDir: join(makeTempDir(), "out"),
        secrets: [],
      }),
    ).toEqual({ files: 0, replacements: 0 });
  });

  test("behavior: skips non-regular entries instead of following them", () => {
    const inputDir = makeTempDir();
    const secretFile = join(makeTempDir(), "outside.json");
    writeFileSync(secretFile, `leak ${MAINNET}`);
    symlinkSync(secretFile, join(inputDir, "sneaky.json"));
    writeFileSync(join(inputDir, "real.json"), "clean");

    const result = sanitizeReports({
      inputDir,
      outputDir: join(makeTempDir(), "out"),
      secrets: [MAINNET],
    });

    // Only the real regular file is scrubbed and published; the symlink is ignored.
    expect(result.files).toBe(1);
  });

  test("error: a pre-existing output directory is refused", () => {
    const inputDir = makeTempDir();
    writeFileSync(join(inputDir, "blue-sdk.json"), `leak ${MAINNET}`);
    const outputDir = join(makeTempDir(), "sanitized");
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(join(outputDir, "planted.json"), "unscrubbed");

    expect(() =>
      sanitizeReports({ inputDir, outputDir, secrets: [MAINNET] }),
    ).toThrow(/EEXIST/);
  });
});

describe("main", () => {
  function setup(reportContent?: string): {
    inputDir: string;
    outputDir: string;
    outputFile: string;
  } {
    const workDir = makeTempDir();
    const inputDir = join(workDir, "vitest-reports");
    if (reportContent != null) {
      mkdirSync(inputDir, { recursive: true });
      writeFileSync(join(inputDir, "blue-sdk.json"), reportContent);
    }

    return {
      inputDir,
      outputDir: join(workDir, "vitest-reports-sanitized"),
      outputFile: join(workDir, "github-output"),
    };
  }

  test("default: scrubs the report and writes the output path", () => {
    const { inputDir, outputDir, outputFile } = setup(
      `{"error":"${MAINNET} failed"}`,
    );

    const returned = main({
      argv: [inputDir, outputDir],
      env: { SECRET_VALUES: MAINNET, EXPECT_RPC_SECRETS: "true" },
      outputFile,
      writeOutput: () => {},
    });

    expect(returned).toBe(outputDir);
    expect(readFileSync(outputFile, "utf8")).toBe(`path=${outputDir}\n`);
    expect(readFileSync(join(outputDir, "blue-sdk.json"), "utf8")).toBe(
      `{"error":"${REDACTION} failed"}`,
    );
  });

  test("behavior: a non-fork shard with no secrets still uploads its report", () => {
    const { inputDir, outputDir, outputFile } = setup('{"error":"boom"}');

    const returned = main({
      argv: [inputDir, outputDir],
      env: { SECRET_VALUES: "\n\n", EXPECT_RPC_SECRETS: "false" },
      outputFile,
      writeOutput: () => {},
    });

    expect(returned).toBe(outputDir);
    expect(readFileSync(outputFile, "utf8")).toBe(`path=${outputDir}\n`);
  });

  test("behavior: no report writes no output path", () => {
    const { inputDir, outputDir, outputFile } = setup();

    const returned = main({
      argv: [inputDir, outputDir],
      env: { SECRET_VALUES: MAINNET, EXPECT_RPC_SECRETS: "true" },
      outputFile,
      writeOutput: () => {},
    });

    expect(returned).toBeUndefined();
    expect(() => readFileSync(outputFile, "utf8")).toThrow();
  });

  test("error: a fork shard without secrets refuses to upload", () => {
    const { inputDir, outputDir, outputFile } = setup(`leak ${MAINNET}`);

    expect(() =>
      main({
        argv: [inputDir, outputDir],
        env: { SECRET_VALUES: "\n\n", EXPECT_RPC_SECRETS: "true" },
        outputFile,
        writeOutput: () => {},
      }),
    ).toThrow(/EXPECT_RPC_SECRETS/);
  });

  test("error: missing arguments", () => {
    expect(() =>
      main({
        argv: ["only-input"],
        env: { SECRET_VALUES: "" },
        writeOutput: () => {},
      }),
    ).toThrow(/Usage/);
  });

  test("error: an unset SECRET_VALUES is a wiring failure", () => {
    const { inputDir, outputDir } = setup(`leak ${MAINNET}`);

    expect(() =>
      main({ argv: [inputDir, outputDir], env: {}, writeOutput: () => {} }),
    ).toThrow(/SECRET_VALUES/);
  });
});
