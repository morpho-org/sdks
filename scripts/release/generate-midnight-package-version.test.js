import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import {
  generateMidnightPackageVersion,
  MIDNIGHT_VERSION_SOURCE_PATH,
  renderMidnightPackageVersionSource,
} from "./generate-midnight-package-version.mjs";

const tempDirs = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    rmSync(tempDir, { force: true, recursive: true });
  }
});

describe("generateMidnightPackageVersion", () => {
  test("default", () => {
    const root = createFixture("1.2.3");

    expect(generateMidnightPackageVersion({ cwd: root })).toBe(
      renderMidnightPackageVersionSource("1.2.3"),
    );
    expect(readFileSync(join(root, MIDNIGHT_VERSION_SOURCE_PATH), "utf8")).toBe(
      renderMidnightPackageVersionSource("1.2.3"),
    );
  });

  test("error: missing package version", () => {
    const root = createFixture(undefined);

    expect(() => generateMidnightPackageVersion({ cwd: root })).toThrow(
      "Midnight SDK package version must be a non-empty string.",
    );
  });
});

function createFixture(version) {
  const root = mkdtempSync(join(tmpdir(), "midnight-package-version-"));
  tempDirs.push(root);
  mkdirSync(join(root, "packages/midnight-sdk/src/api"), { recursive: true });
  writeFileSync(
    join(root, "packages/midnight-sdk/package.json"),
    `${JSON.stringify({ name: "@morpho-org/midnight-sdk", version })}\n`,
  );

  return root;
}
