import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import {
  MASK,
  main,
  readSecretValues,
  scrubTranscript,
} from "./scrub-transcript.mjs";

const tempDirs = [];

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
    ].join("\n");

    const scrubbed = scrubTranscript(transcript, []);

    expect(scrubbed).not.toMatch(/ghs_[A-Za-z0-9]/);
    expect(scrubbed).not.toMatch(/ghp_[A-Za-z0-9]/);
    expect(scrubbed).not.toMatch(/github_pat_/);
    expect(scrubbed).not.toMatch(/sk-ant-/);
    expect(scrubbed).toContain(`Authorization: Bearer ${MASK}"`);
    expect(scrubbed).toContain("https://x-access-token:***@github.com/o/r");
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

  test("behavior: missing variable", () => {
    expect(readSecretValues({})).toEqual([]);
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

    main({
      argv: [input, output],
      env: { SECRET_VALUES: "super-secret" },
      writeOutput: () => {},
    });

    expect(readFileSync(output, "utf8")).toBe(`token=${MASK} and ${MASK}`);
  });

  test("error: missing arguments", () => {
    expect(() => main({ argv: ["only-input"], env: {} })).toThrow(/Usage/);
  });
});

function createTempDir() {
  const tempDir = mkdtempSync(join(tmpdir(), "scrub-transcript-"));
  tempDirs.push(tempDir);
  return tempDir;
}
