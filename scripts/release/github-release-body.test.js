import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import {
  buildGitHubReleaseBody,
  extractVersionSection,
  main,
  matchReleaseTag,
  readReleasePackages,
  writeGitHubReleaseBody,
} from "./github-release-body.mjs";

const tempDirs = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    rmSync(tempDir, { force: true, recursive: true });
  }
});

describe("readReleasePackages", () => {
  test("default", () => {
    const packagesDir = createPackagesDir();
    writeFileSync(join(packagesDir, "notes.txt"), "ignored\n");
    writePackage({
      changelog: changelogFor("2.0.0", "- alpha\n"),
      dir: "beta",
      manifest: { name: "@morpho-org/beta", version: "2.0.0" },
      packagesDir,
    });
    writePackage({
      changelog: changelogFor("1.0.0", "- alpha\n"),
      dir: "alpha",
      manifest: { name: "@morpho-org/alpha", version: "1.0.0" },
      packagesDir,
    });

    expect(readReleasePackages({ packagesDir })).toEqual([
      {
        changelogPath: resolve(packagesDir, "alpha", "CHANGELOG.md"),
        name: "@morpho-org/alpha",
        version: "1.0.0",
      },
      {
        changelogPath: resolve(packagesDir, "beta", "CHANGELOG.md"),
        name: "@morpho-org/beta",
        version: "2.0.0",
      },
    ]);
  });

  test("behavior: skips empty or missing package names", () => {
    const packagesDir = createPackagesDir();
    writePackage({
      dir: "empty",
      manifest: { name: "", version: "1.0.0" },
      packagesDir,
    });
    writePackage({
      dir: "missing",
      manifest: { version: "1.0.0" },
      packagesDir,
    });

    expect(readReleasePackages({ packagesDir })).toEqual([]);
  });

  test("behavior: skips empty or missing package versions and missing manifests", () => {
    const packagesDir = createPackagesDir();
    mkdirSync(join(packagesDir, "missing-manifest"));
    writePackage({
      dir: "empty",
      manifest: { name: "@morpho-org/empty", version: "" },
      packagesDir,
    });
    writePackage({
      dir: "missing",
      manifest: { name: "@morpho-org/missing" },
      packagesDir,
    });

    expect(readReleasePackages({ packagesDir })).toEqual([]);
  });
});

describe("matchReleaseTag", () => {
  test("default", () => {
    const packages = [
      releasePackage({ name: "@morpho-org/blue-sdk", version: "1.2.3" }),
    ];

    expect(
      matchReleaseTag({ packages, tag: "@morpho-org/blue-sdk@1.2.3" }),
    ).toMatchObject({
      name: "@morpho-org/blue-sdk",
      version: "1.2.3",
    });
  });

  test("behavior: supports tags without the @ version separator", () => {
    const packages = [
      releasePackage({ name: "@morpho-org/blue-sdk", version: "1.2.3" }),
    ];

    expect(
      matchReleaseTag({ packages, tag: "@morpho-org/blue-sdk-v1.2.3" }),
    ).toMatchObject({
      name: "@morpho-org/blue-sdk",
      version: "1.2.3",
    });
  });

  test("behavior: avoids prefix collisions by matching exact tag candidates", () => {
    const packages = [
      releasePackage({ name: "@morpho-org/blue-sdk", version: "9.9.9" }),
      releasePackage({ name: "@morpho-org/blue-sdk-viem", version: "1.2.3" }),
    ];

    expect(
      matchReleaseTag({
        packages,
        tag: "@morpho-org/blue-sdk-viem-v1.2.3",
      }),
    ).toMatchObject({
      name: "@morpho-org/blue-sdk-viem",
      version: "1.2.3",
    });
  });

  test("error: ambiguous tag ownership", () => {
    const packages = [
      releasePackage({ name: "@morpho-org/blue-sdk", version: "1.2.3" }),
      releasePackage({ name: "@morpho-org/blue-sdk", version: "1.2.3" }),
    ];

    expect(() =>
      matchReleaseTag({ packages, tag: "@morpho-org/blue-sdk@1.2.3" }),
    ).toThrow(
      'Tag "@morpho-org/blue-sdk@1.2.3" is ambiguous; matches "@morpho-org/blue-sdk", "@morpho-org/blue-sdk".',
    );
  });

  test("error: missing matching package", () => {
    const packages = [
      releasePackage({ name: "@morpho-org/blue-sdk", version: "1.2.3" }),
    ];

    expect(() =>
      matchReleaseTag({ packages, tag: "@morpho-org/blue-sdk1.2.3" }),
    ).toThrow('Cannot map tag "@morpho-org/blue-sdk1.2.3" to a package.');
  });
});

describe("extractVersionSection", () => {
  test("default", () => {
    expect(
      extractVersionSection({
        changelog: [
          "# @morpho-org/blue-sdk",
          "",
          "## 1.2.3",
          "",
          "- current",
          "",
          "## 1.2.2",
          "",
          "- previous",
          "",
        ].join("\n"),
        version: "1.2.3",
      }),
    ).toBe("## 1.2.3\n\n- current\n");
  });

  test("behavior: escapes regex metacharacters in versions", () => {
    expect(
      extractVersionSection({
        changelog: [
          "# pkg",
          "",
          "## 1.2.3-next.1+build.5",
          "",
          "- current",
          "",
          "## 1.2.2",
          "",
          "- previous",
          "",
        ].join("\n"),
        version: "1.2.3-next.1+build.5",
      }),
    ).toBe("## 1.2.3-next.1+build.5\n\n- current\n");
  });

  test("behavior: keeps non-version h2 headings inside a version section", () => {
    expect(
      extractVersionSection({
        changelog: [
          "# pkg",
          "",
          "## 1.2.3",
          "",
          "## Migration Notes",
          "",
          "- still part of 1.2.3",
          "",
          "## 1.2.2",
          "",
          "- previous",
          "",
        ].join("\n"),
        version: "1.2.3",
      }),
    ).toBe("## 1.2.3\n\n## Migration Notes\n\n- still part of 1.2.3\n");
  });

  test("error: missing version section", () => {
    expect(
      extractVersionSection({
        changelog: "# pkg\n\n## 1.2.2\n\n- previous\n",
        version: "1.2.3",
      }),
    ).toBeUndefined();
  });

  test("behavior: reads section through end of changelog", () => {
    expect(
      extractVersionSection({
        changelog: ["# pkg", "", "## 1.2.3", "", "- current", ""].join("\n"),
        version: "1.2.3",
      }),
    ).toBe("## 1.2.3\n\n- current\n");
  });
});

describe("buildGitHubReleaseBody", () => {
  test("default", () => {
    const packagesDir = createPackagesDir();
    writePackage({
      changelog: changelogFor("1.2.3", "### Patch Changes\n\n- current\n"),
      dir: "blue-sdk",
      manifest: { name: "@morpho-org/blue-sdk", version: "1.2.3" },
      packagesDir,
    });

    expect(
      buildGitHubReleaseBody({
        packagesDir,
        tag: "@morpho-org/blue-sdk@1.2.3",
      }),
    ).toBe("## 1.2.3\n\n### Patch Changes\n\n- current\n");
  });

  test("behavior: duplicates shared changelog content per package release", () => {
    const packagesDir = createPackagesDir();
    const sharedBody = "### Patch Changes\n\n- Shared changeset entry\n";
    writePackage({
      changelog: changelogFor("1.2.3", sharedBody),
      dir: "blue-sdk",
      manifest: { name: "@morpho-org/blue-sdk", version: "1.2.3" },
      packagesDir,
    });
    writePackage({
      changelog: changelogFor("4.5.6", sharedBody),
      dir: "blue-sdk-viem",
      manifest: { name: "@morpho-org/blue-sdk-viem", version: "4.5.6" },
      packagesDir,
    });

    expect(
      buildGitHubReleaseBody({
        packagesDir,
        tag: "@morpho-org/blue-sdk@1.2.3",
      }),
    ).toBe("## 1.2.3\n\n### Patch Changes\n\n- Shared changeset entry\n");
    expect(
      buildGitHubReleaseBody({
        packagesDir,
        tag: "@morpho-org/blue-sdk-viem@4.5.6",
      }),
    ).toBe("## 4.5.6\n\n### Patch Changes\n\n- Shared changeset entry\n");
  });

  test("error: missing changelog", () => {
    const packagesDir = createPackagesDir();
    writePackage({
      dir: "blue-sdk",
      manifest: { name: "@morpho-org/blue-sdk", version: "1.2.3" },
      packagesDir,
    });

    expect(() =>
      buildGitHubReleaseBody({
        packagesDir,
        tag: "@morpho-org/blue-sdk@1.2.3",
      }),
    ).toThrow('Cannot find a changelog for "@morpho-org/blue-sdk".');
  });

  test("error: changelog path outside packages directory", () => {
    const root = createTempDir();
    const packagesDir = join(root, "packages");
    const outsideChangelog = join(root, "CHANGELOG.md");
    mkdirSync(packagesDir);
    writeFileSync(outsideChangelog, changelogFor("1.2.3", "- leaked\n"));

    expect(() =>
      buildGitHubReleaseBody({
        packages: [
          releasePackage({
            changelogPath: outsideChangelog,
            name: "@morpho-org/blue-sdk",
            version: "1.2.3",
          }),
        ],
        packagesDir,
        tag: "@morpho-org/blue-sdk@1.2.3",
      }),
    ).toThrow('Cannot find a changelog for "@morpho-org/blue-sdk".');
  });

  test("error: missing version section", () => {
    const packagesDir = createPackagesDir();
    writePackage({
      changelog: changelogFor("1.2.2", "- previous\n"),
      dir: "blue-sdk",
      manifest: { name: "@morpho-org/blue-sdk", version: "1.2.3" },
      packagesDir,
    });

    expect(() =>
      buildGitHubReleaseBody({
        packagesDir,
        tag: "@morpho-org/blue-sdk@1.2.3",
      }),
    ).toThrow(
      `Cannot find version "1.2.3" in ${join(
        packagesDir,
        "blue-sdk",
        "CHANGELOG.md",
      )}.`,
    );
  });
});

describe("writeGitHubReleaseBody", () => {
  test("default", () => {
    const root = createTempDir();
    const packagesDir = join(root, "packages");
    const bodyFile = join(root, "body.md");
    mkdirSync(packagesDir);
    writePackage({
      changelog: changelogFor("1.2.3", "- current\n"),
      dir: "blue-sdk",
      manifest: { name: "@morpho-org/blue-sdk", version: "1.2.3" },
      packagesDir,
    });

    writeGitHubReleaseBody({
      bodyFile,
      packagesDir,
      tag: "@morpho-org/blue-sdk@1.2.3",
    });

    expect(readFileSync(bodyFile, "utf8")).toBe("## 1.2.3\n\n- current\n");
  });
});

describe("main", () => {
  test("default", () => {
    const root = createTempDir();
    const packagesDir = join(root, "packages");
    const bodyFile = join(root, "body.md");
    mkdirSync(packagesDir);
    writePackage({
      changelog: changelogFor("1.2.3", "- current\n"),
      dir: "blue-sdk",
      manifest: { name: "@morpho-org/blue-sdk", version: "1.2.3" },
      packagesDir,
    });
    main(["@morpho-org/blue-sdk@1.2.3", bodyFile], { packagesDir });

    expect(readFileSync(bodyFile, "utf8")).toBe("## 1.2.3\n\n- current\n");
  });

  test("error: missing arguments", () => {
    expect(() => main([])).toThrow(
      "Usage: node scripts/release/github-release-body.mjs <tag> <body-file>",
    );
  });
});

function releasePackage(options) {
  return {
    changelogPath: options.changelogPath ?? "CHANGELOG.md",
    name: options.name,
    version: options.version,
  };
}

function changelogFor(version, body) {
  return [
    "# Changelog",
    "",
    `## ${version}`,
    "",
    body.trimEnd(),
    "",
    "## 0.0.0",
    "",
    "- previous",
    "",
  ].join("\n");
}

function createPackagesDir() {
  const root = createTempDir();
  const packagesDir = join(root, "packages");
  mkdirSync(packagesDir);
  return packagesDir;
}

function createTempDir() {
  const tempDir = mkdtempSync(join(tmpdir(), "release-script-"));
  tempDirs.push(tempDir);
  return tempDir;
}

function writePackage(options) {
  const packageDir = join(options.packagesDir, options.dir);
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(
    join(packageDir, "package.json"),
    `${JSON.stringify(options.manifest, null, 2)}\n`,
  );

  if (options.changelog != null) {
    writeFileSync(join(packageDir, "CHANGELOG.md"), options.changelog);
  }
}
