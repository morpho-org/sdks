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

  test("error: symlinked package manifest", () => {
    const root = createFixture("1.2.3");
    const externalRoot = mkdtempSync(
      join(tmpdir(), "midnight-package-external-"),
    );
    tempDirs.push(externalRoot);
    const manifestPath = join(root, "packages/midnight-sdk/package.json");
    const externalManifestPath = join(externalRoot, "package.json");
    writeFileSync(
      externalManifestPath,
      `${JSON.stringify({ name: "@morpho-org/midnight-sdk", version: "9.9.9" })}\n`,
    );
    rmSync(manifestPath);
    symlinkSync(externalManifestPath, manifestPath);

    expect(() => generateMidnightPackageVersion({ cwd: root })).toThrow(
      `Invalid Midnight SDK manifest path "packages/midnight-sdk/package.json".`,
    );
  });

  test("error: symlinked version source", () => {
    const root = createFixture("1.2.3");
    const externalRoot = mkdtempSync(
      join(tmpdir(), "midnight-package-external-"),
    );
    tempDirs.push(externalRoot);
    const sourcePath = join(root, MIDNIGHT_VERSION_SOURCE_PATH);
    const externalSourcePath = join(externalRoot, "version.generated.ts");
    writeFileSync(externalSourcePath, "external\n");
    symlinkSync(externalSourcePath, sourcePath);

    expect(() => generateMidnightPackageVersion({ cwd: root })).toThrow(
      `Invalid Midnight SDK version source path "${MIDNIGHT_VERSION_SOURCE_PATH}".`,
    );
    expect(readFileSync(externalSourcePath, "utf8")).toBe("external\n");
  });

  test("error: version source parent outside repository", () => {
    const root = createFixture("1.2.3");
    const externalRoot = mkdtempSync(
      join(tmpdir(), "midnight-package-external-"),
    );
    tempDirs.push(externalRoot);
    const sourceParentPath = join(root, "packages/midnight-sdk/src/api");
    rmSync(sourceParentPath, { recursive: true });
    symlinkSync(externalRoot, sourceParentPath);

    expect(() => generateMidnightPackageVersion({ cwd: root })).toThrow(
      `Invalid Midnight SDK version source path "${MIDNIGHT_VERSION_SOURCE_PATH}".`,
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
