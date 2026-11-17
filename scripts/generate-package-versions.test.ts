import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

import {
  generatePackageVersions,
  getPackageVersionSource,
  renderPackageVersionSource,
} from "./generate-package-versions.ts";

const MIDNIGHT_VERSION_SOURCE_PATH = "packages/midnight-sdk/src/version.ts";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    rmSync(tempDir, { force: true, recursive: true });
  }
});

describe("generatePackageVersions", () => {
  test("default", () => {
    const root = createFixture("1.2.3");

    expect(generatePackageVersions({ cwd: root })).toEqual([
      MIDNIGHT_VERSION_SOURCE_PATH,
    ]);
    expect(readFileSync(join(root, MIDNIGHT_VERSION_SOURCE_PATH), "utf8")).toBe(
      renderPackageVersionSource("1.2.3", "@morpho-org/midnight-sdk"),
    );
  });

  test("behavior: all sources match their package manifests", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    for (const entry of readdirSync(join(root, "packages"))) {
      const manifestPath = `packages/${entry}/package.json`;
      if (!existsSync(join(root, manifestPath))) continue;
      const expected = getPackageVersionSource({ cwd: root, manifestPath });
      expect(
        readFileSync(join(root, `packages/${entry}/src/version.ts`), "utf8"),
      ).toBe(expected);
    }
  });

  test("behavior: multiple packages and prerelease versions", () => {
    const root = createFixture("1.2.3-next.0");
    mkdirSync(join(root, "packages/blue-sdk/src"), { recursive: true });
    writeFileSync(
      join(root, "packages/blue-sdk/package.json"),
      JSON.stringify({ name: "@morpho-org/blue-sdk", version: "2.3.4" }),
    );
    expect(generatePackageVersions({ cwd: root })).toEqual([
      "packages/blue-sdk/src/version.ts",
      MIDNIGHT_VERSION_SOURCE_PATH,
    ]);
    expect(
      readFileSync(join(root, "packages/blue-sdk/src/version.ts"), "utf8"),
    ).toBe(renderPackageVersionSource("2.3.4", "@morpho-org/blue-sdk"));
    expect(readFileSync(join(root, MIDNIGHT_VERSION_SOURCE_PATH), "utf8")).toBe(
      renderPackageVersionSource("1.2.3-next.0", "@morpho-org/midnight-sdk"),
    );
  });

  test("behavior: empty workspace", () => {
    const root = createFixture("1.2.3");
    rmSync(join(root, "packages/midnight-sdk"), { recursive: true });
    expect(generatePackageVersions({ cwd: root })).toEqual([]);
  });

  test("behavior: generates version sources for private packages", () => {
    const root = createFixture("1.2.3");
    writeFileSync(
      join(root, "packages/midnight-sdk/package.json"),
      JSON.stringify({
        name: "@morpho-org/midnight-sdk",
        version: "1.2.3",
        private: true,
      }),
    );
    expect(generatePackageVersions({ cwd: root })).toEqual([
      MIDNIGHT_VERSION_SOURCE_PATH,
    ]);
    expect(readFileSync(join(root, MIDNIGHT_VERSION_SOURCE_PATH), "utf8")).toBe(
      renderPackageVersionSource("1.2.3", "@morpho-org/midnight-sdk"),
    );
  });

  test("error: unsafe package name", () => {
    expect(() => renderPackageVersionSource("1.0.0", "*/ injected")).toThrow(
      "Package name must be a scoped npm package name.",
    );
  });

  test.each([false, true])(
    "error: missing package version (private: %s)",
    (isPrivate) => {
      const root = createFixture(undefined);
      writeFileSync(
        join(root, "packages/midnight-sdk/package.json"),
        JSON.stringify({
          name: "@morpho-org/midnight-sdk",
          private: isPrivate,
        }),
      );

      expect(() => generatePackageVersions({ cwd: root })).toThrow(
        "Package version must be a non-empty string.",
      );
    },
  );

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

    expect(() => generatePackageVersions({ cwd: root })).toThrow(
      `Invalid package manifest path "packages/midnight-sdk/package.json".`,
    );
  });

  test("error: symlinked version source", () => {
    const root = createFixture("1.2.3");
    const externalRoot = mkdtempSync(
      join(tmpdir(), "midnight-package-external-"),
    );
    tempDirs.push(externalRoot);
    const sourcePath = join(root, MIDNIGHT_VERSION_SOURCE_PATH);
    const externalSourcePath = join(externalRoot, "version.ts");
    writeFileSync(externalSourcePath, "external\n");
    symlinkSync(externalSourcePath, sourcePath);

    expect(() => generatePackageVersions({ cwd: root })).toThrow(
      `Invalid package version source path "${MIDNIGHT_VERSION_SOURCE_PATH}".`,
    );
    expect(readFileSync(externalSourcePath, "utf8")).toBe("external\n");
  });

  test("error: version source parent outside repository", () => {
    const root = createFixture("1.2.3");
    const externalRoot = mkdtempSync(
      join(tmpdir(), "midnight-package-external-"),
    );
    tempDirs.push(externalRoot);
    const sourceParentPath = join(root, "packages/midnight-sdk/src");
    rmSync(sourceParentPath, { recursive: true });
    symlinkSync(externalRoot, sourceParentPath);

    expect(() => generatePackageVersions({ cwd: root })).toThrow(
      `Invalid package version source path "${MIDNIGHT_VERSION_SOURCE_PATH}".`,
    );
  });
});

function createFixture(version: string | undefined) {
  const root = mkdtempSync(join(tmpdir(), "midnight-package-version-"));
  tempDirs.push(root);
  mkdirSync(join(root, "packages/midnight-sdk/src"), { recursive: true });
  writeFileSync(
    join(root, "packages/midnight-sdk/package.json"),
    `${JSON.stringify({ name: "@morpho-org/midnight-sdk", version })}\n`,
  );

  return root;
}
