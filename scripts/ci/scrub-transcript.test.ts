import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import {
  assertInputUnder,
  MASK,
  main,
  readSecretValues,
  scrubTranscript,
} from "./scrub-transcript.ts";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    rmSync(tempDir, { force: true, recursive: true });
  }
});

describe("scrubTranscript", () => {
  test("default: masks exact secret values", () => {
    expect(
      scrubTranscript("key=my-secret-value other=keep", ["my-secret-value"]),
    ).toBe(`key=${MASK} other=keep`);
  });

  test("behavior: masks JSON-escaped secret values", () => {
    const secret = 'ab"c/d';
    const transcript = `{"output":"token ${JSON.stringify(secret).slice(1, -1)}"}`;

    expect(scrubTranscript(transcript, [secret])).toBe(
      `{"output":"token ${MASK}"}`,
    );
  });

  test("behavior: masks token-shaped strings without knowing the value", () => {
    const transcript = [
      "url https://x-access-token:ghs_abcdefghijklmnopqrstuvwxyz0123@github.com/o/r",
      "pat ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345",
      "fine github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz",
      "anthropic sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789",
      'header "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload"',
      "installation ghs_12345_eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc_DEF-ghi",
      '{"headers":{"Authorization":"Bearer eyJhbGciOiJIUzI1NiJ9.json"}}',
      '"{\\"Authorization\\":\\"token eyJhbGciOiJIUzI1NiJ9.escaped\\"}"',
      "basic Authorization: Basic dXNlcjpwYXNz",
      "lower authorization: bearer eyJhbGciOiJIUzI1NiJ9.lower",
    ].join("\n");

    const scrubbed = scrubTranscript(transcript, []);

    expect(scrubbed).not.toMatch(/ghs_[A-Za-z0-9]/);
    expect(scrubbed).not.toMatch(/ghp_[A-Za-z0-9]/);
    expect(scrubbed).not.toMatch(/github_pat_/);
    expect(scrubbed).not.toMatch(/sk-ant-/);
    expect(scrubbed).toContain(`Authorization: Bearer ${MASK}"`);
    expect(scrubbed).toContain("https://x-access-token:***@github.com/o/r");
    expect(scrubbed).toContain(`installation ${MASK}`);
    expect(scrubbed).not.toContain("eyJ");
    expect(scrubbed).toContain(`"Authorization":"Bearer ${MASK}"`);
    expect(scrubbed).toContain(`\\"Authorization\\":\\"token ${MASK}\\"`);
    expect(scrubbed).toContain(`basic Authorization: Basic ${MASK}`);
    expect(scrubbed).toContain(`lower authorization: bearer ${MASK}`);
    expect(scrubbed).not.toContain("dXNlcjpwYXNz");
  });

  test("behavior: ignores empty secret values and leaves clean text untouched", () => {
    const transcript = "nothing secret here; ghs_short is not a token";

    expect(scrubTranscript(transcript, ["", ""])).toBe(transcript);
  });
});

describe("readSecretValues", () => {
  test("default", () => {
    expect(readSecretValues({ SECRET_VALUES: "a\n\n b \n" })).toEqual([
      "a",
      "b",
    ]);
  });

  test("behavior: present but blank variable yields no secrets", () => {
    expect(readSecretValues({ SECRET_VALUES: "\n\n" })).toEqual([]);
  });

  test("error: unset variable is a wiring failure", () => {
    expect(() => readSecretValues({})).toThrow(/SECRET_VALUES/);
  });
});

describe("assertInputUnder", () => {
  test("default", () => {
    expect(() => assertInputUnder("/tmp/rt/x.json", "/tmp/rt")).not.toThrow();
    expect(() =>
      assertInputUnder("/tmp/rt/a/b.json", "/tmp/rt/"),
    ).not.toThrow();
  });

  test("error: outside, equal, or traversal paths", () => {
    expect(() => assertInputUnder("/etc/passwd", "/tmp/rt")).toThrow(
      /must live under/,
    );
    expect(() => assertInputUnder("/tmp/rt", "/tmp/rt")).toThrow(
      /must live under/,
    );
    expect(() => assertInputUnder("/tmp/rt/../x", "/tmp/rt")).toThrow(
      /must live under/,
    );
    expect(() => assertInputUnder("/tmp/rt2/x", "/tmp/rt")).toThrow(
      /must live under/,
    );
  });
});

describe("main", () => {
  test("default: writes the scrubbed file", () => {
    const dir = createTempDir();
    const input = join(dir, "in.json");
    const output = join(dir, "out.json");
    writeFileSync(
      input,
      "token=super-secret and ghs_abcdefghijklmnopqrstuvwxyz0123",
    );

    const outputFile = join(dir, "github-output");

    main({
      argv: [input, output],
      env: { RUNNER_TEMP: dir, SECRET_VALUES: "super-secret" },
      outputFile,
      writeOutput: () => {},
    });

    expect(readFileSync(output, "utf8")).toBe(`token=${MASK} and ${MASK}`);
    expect(readFileSync(outputFile, "utf8")).toBe(`path=${output}\n`);
  });

  test("behavior: falls back to GITHUB_OUTPUT when no outputFile is injected", () => {
    const dir = createTempDir();
    const input = join(dir, "in.json");
    const output = join(dir, "out.json");
    const outputFile = join(dir, "github-output");
    writeFileSync(input, "plain");

    main({
      argv: [input, output],
      env: { GITHUB_OUTPUT: outputFile, RUNNER_TEMP: dir, SECRET_VALUES: "" },
      writeOutput: () => {},
    });

    expect(readFileSync(outputFile, "utf8")).toBe(`path=${output}\n`);
  });

  test("error: no output sink", () => {
    const dir = createTempDir();
    const input = join(dir, "in.json");
    writeFileSync(input, "plain");

    expect(() =>
      main({
        argv: [input, join(dir, "out.json")],
        env: { RUNNER_TEMP: dir, SECRET_VALUES: "" },
        writeOutput: () => {},
      }),
    ).toThrow(/GITHUB_OUTPUT/);
  });

  test("error: input outside RUNNER_TEMP is refused before it is read", () => {
    const dir = createTempDir();
    const outside = createTempDir();
    const input = join(outside, "etc-passwd");
    writeFileSync(input, "root:x:0:0");
    const output = join(dir, "out.json");

    expect(() =>
      main({
        argv: [input, output],
        env: { RUNNER_TEMP: dir, SECRET_VALUES: "" },
        outputFile: join(dir, "github-output"),
        writeOutput: () => {},
      }),
    ).toThrow(/must live under/);
    expect(existsSync(output)).toBe(false);
  });

  test("error: missing RUNNER_TEMP", () => {
    const dir = createTempDir();
    const input = join(dir, "in.json");
    writeFileSync(input, "plain");

    expect(() =>
      main({
        argv: [input, join(dir, "out.json")],
        env: { SECRET_VALUES: "" },
        outputFile: join(dir, "github-output"),
        writeOutput: () => {},
      }),
    ).toThrow(/RUNNER_TEMP/);
  });

  test("error: missing arguments", () => {
    expect(() => main({ argv: ["only-input"], env: {} })).toThrow(/Usage/);
  });
});

function createTempDir(): string {
  const tempDir = mkdtempSync(join(tmpdir(), "scrub-transcript-"));
  tempDirs.push(tempDir);
  return tempDir;
}
