import { spawnSync } from "node:child_process";
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
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

import {
  redactSecrets,
  sanitizeVitestReports,
  VitestReportSanitizationError,
} from "./redact-vitest-reports.mjs";

const tempDirectories = [];
const scriptPath = fileURLToPath(
  new URL("./redact-vitest-reports.mjs", import.meta.url),
);
const rpcEnvironment = {
  ...process.env,
  MAINNET_RPC_URL: "https://mainnet.example/private-key",
  BASE_RPC_URL: "https://base.example/private-key",
  ARBITRUM_RPC_URL: "https://arbitrum.example/private-key",
};

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("redactSecrets", () => {
  test("default", () => {
    const secret = 'https://user:p@ss"word@rpc.example/v1/key';
    const jsonEscaped = JSON.stringify(secret).slice(1, -1);
    const urlEncoded = encodeURIComponent(secret);

    const result = redactSecrets(
      `raw=${secret}\njson=${jsonEscaped}\nencoded=${urlEncoded}`,
      [secret],
    );

    expect(result.replacements).toBe(3);
    expect(result.content).not.toContain(secret);
    expect(result.content).not.toContain(jsonEscaped);
    expect(result.content).not.toContain(urlEncoded);
    expect(result.content.match(/<redacted-rpc-url>/g)).toHaveLength(3);
  });

  test("behavior: redacts URL-parser-normalized credentials", () => {
    const secret = "https://user:p@ss@rpc.example/v1/key";
    const normalized = new URL(secret).href;
    const normalizedJson = JSON.stringify(normalized).slice(1, -1);
    const normalizedEncoded = encodeURIComponent(normalized);

    expect(normalized).not.toBe(secret);
    const result = redactSecrets(
      `normalized=${normalized}\njson=${normalizedJson}\nencoded=${normalizedEncoded}`,
      [secret],
    );

    expect(result.replacements).toBe(3);
    expect(result.content).not.toContain(normalized);
    expect(result.content).not.toContain(normalizedJson);
    expect(result.content).not.toContain(normalizedEncoded);
  });

  test("behavior: redacts identifying fragments from partial URLs", () => {
    const secret =
      "https://user:password@rpc.example/v1/private-key?token=query-secret";
    const result = redactSecrets(
      "host=rpc.example path=private-key token=query-secret",
      [secret],
    );

    expect(result.content).toBe(
      "host=<redacted-rpc-url> path=<redacted-rpc-url> token=<redacted-rpc-url>",
    );
  });

  test("behavior: ignores empty URL representations", () => {
    const secret = "localhost:8545";

    expect(redactSecrets(`endpoint=${secret}`, [secret])).toEqual({
      content: "endpoint=<redacted-rpc-url>",
      replacements: 1,
    });
  });
});

describe("sanitizeVitestReports", () => {
  test("default", () => {
    const directory = createTempDirectory();
    const nestedDirectory = join(directory, "nested");
    const secret = "https://rpc.example/v1/private-key";
    mkdirSync(nestedDirectory);
    writeFileSync(
      join(directory, "first.json"),
      JSON.stringify({ error: `request failed for ${secret}` }),
    );
    writeFileSync(
      join(nestedDirectory, "second.json"),
      JSON.stringify({ output: encodeURIComponent(secret) }),
    );

    expect(sanitizeVitestReports(directory, [secret])).toEqual({
      files: 2,
      replacements: 2,
    });
    const firstReport = readFileSync(join(directory, "first.json"), "utf8");
    expect(firstReport).not.toContain(secret);
    expect(() => JSON.parse(firstReport)).not.toThrow();
    expect(
      readFileSync(join(nestedDirectory, "second.json"), "utf8"),
    ).not.toContain(encodeURIComponent(secret));
  });

  test("behavior: preserves short query metadata in valid JSON", () => {
    const directory = createTempDirectory();
    const reportPath = join(directory, "report.json");
    const secret = "https://rpc.example/private-key?chain=1";
    writeFileSync(
      reportPath,
      JSON.stringify({ chain: 1, error: `request failed for ${secret}` }),
    );

    sanitizeVitestReports(directory, [secret]);

    const report = readFileSync(reportPath, "utf8");
    expect(JSON.parse(report)).toEqual({
      chain: 1,
      error: "request failed for <redacted-rpc-url>",
    });
  });

  test("error: rejects invalid transformed JSON before writing", () => {
    const directory = createTempDirectory();
    const reportPath = join(directory, "report.json");
    const report = JSON.stringify({ attempt: 1 });
    writeFileSync(reportPath, report);

    expect(() => sanitizeVitestReports(directory, ["1"])).toThrow(
      VitestReportSanitizationError,
    );
    expect(readFileSync(reportPath, "utf8")).toBe(report);
  });

  test("error: VitestReportSanitizationError rejects missing credentials", () => {
    expect(() => sanitizeVitestReports(createTempDirectory(), [])).toThrow(
      VitestReportSanitizationError,
    );
  });

  test("error: VitestReportSanitizationError rejects empty report directories", () => {
    expect(() =>
      sanitizeVitestReports(createTempDirectory(), ["https://rpc.example"]),
    ).toThrow(VitestReportSanitizationError);
  });

  test("error: VitestReportSanitizationError rejects links outside the report root", () => {
    const reportDirectory = createTempDirectory();
    const outsideDirectory = createTempDirectory();
    const outsideReport = join(outsideDirectory, "outside.json");
    const secret = "https://rpc.example/private-key";
    writeFileSync(outsideReport, secret);
    symlinkSync(outsideReport, join(reportDirectory, "escape.json"));

    expect(() => sanitizeVitestReports(reportDirectory, [secret])).toThrow(
      VitestReportSanitizationError,
    );
    expect(readFileSync(outsideReport, "utf8")).toBe(secret);
  });
});

describe("CLI", () => {
  test("error: fails closed through a symlink when an RPC credential is missing", () => {
    const reportDirectory = createTempDirectory();
    const reportPath = join(reportDirectory, "report.json");
    const scriptLink = join(createTempDirectory(), "redact-vitest-reports.mjs");
    const report = `request failed for ${rpcEnvironment.MAINNET_RPC_URL}`;
    const env = { ...rpcEnvironment };
    delete env.ARBITRUM_RPC_URL;
    writeFileSync(reportPath, report);
    symlinkSync(scriptPath, scriptLink);

    const result = spawnSync(process.execPath, [scriptLink, reportDirectory], {
      encoding: "utf8",
      env,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Missing required RPC credentials: ARBITRUM_RPC_URL",
    );
    expect(readFileSync(reportPath, "utf8")).toBe(report);
  });

  test("error: reports the underlying sanitization failure", () => {
    const missingDirectory = join(createTempDirectory(), "missing");

    const result = spawnSync(process.execPath, [scriptPath, missingDirectory], {
      encoding: "utf8",
      env: rpcEnvironment,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      `Could not sanitize reports in "${missingDirectory}"`,
    );
    expect(result.stderr).toContain("Caused by: Error: ENOENT");
  });
});

function createTempDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "vitest-report-redaction-"));
  tempDirectories.push(directory);
  return directory;
}
