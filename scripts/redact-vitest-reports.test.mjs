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
  redactSecrets,
  sanitizeVitestReports,
  VitestReportSanitizationError,
} from "./redact-vitest-reports.mjs";

const tempDirectories = [];

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

function createTempDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "vitest-report-redaction-"));
  tempDirectories.push(directory);
  return directory;
}
