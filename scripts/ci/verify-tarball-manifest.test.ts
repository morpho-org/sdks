import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

import {
  main,
  verifyManifestIdentity,
  verifyPublishConfig,
  verifyTarballManifest,
} from "./verify-tarball-manifest.ts";

const scriptPath = fileURLToPath(
  new URL("./verify-tarball-manifest.ts", import.meta.url),
);
const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    rmSync(tempDir, { force: true, recursive: true });
  }
});

describe("verifyPublishConfig", () => {
  test("default", () => {
    expect(() =>
      verifyPublishConfig({
        name: "@morpho-org/alpha",
        version: "1.0.0",
        publishConfig: {
          access: "public",
          registry: "https://registry.npmjs.org/",
        },
      }),
    ).not.toThrow();
  });

  test("behavior: allows a manifest without publishConfig", () => {
    expect(() =>
      verifyPublishConfig({ name: "@morpho-org/alpha", version: "1.0.0" }),
    ).not.toThrow();
  });

  test("behavior: allows registry without trailing slash", () => {
    expect(() =>
      verifyPublishConfig({
        publishConfig: {
          access: "public",
          registry: "https://registry.npmjs.org",
        },
      }),
    ).not.toThrow();
  });

  test("error: rejects proxy", () => {
    expect(() =>
      verifyPublishConfig({
        publishConfig: {
          access: "public",
          proxy: "http://evil.example",
          registry: "https://registry.npmjs.org/",
        },
      }),
    ).toThrow('Disallowed publishConfig key "proxy"');
  });

  test("error: rejects https-proxy", () => {
    expect(() =>
      verifyPublishConfig({
        publishConfig: { "https-proxy": "http://evil.example" },
      }),
    ).toThrow('Disallowed publishConfig key "https-proxy"');
  });

  test("error: rejects strict-ssl", () => {
    expect(() =>
      verifyPublishConfig({ publishConfig: { "strict-ssl": false } }),
    ).toThrow('Disallowed publishConfig key "strict-ssl"');
  });

  test("error: rejects non-public access", () => {
    expect(() =>
      verifyPublishConfig({ publishConfig: { access: "restricted" } }),
    ).toThrow(
      'Invalid publishConfig.access in manifest: expected "public", got "restricted".',
    );
  });

  test("error: rejects a non-npmjs registry", () => {
    expect(() =>
      verifyPublishConfig({
        publishConfig: { registry: "https://evil.example" },
      }),
    ).toThrow(
      'Invalid publishConfig.registry in manifest: expected "https://registry.npmjs.org" or "https://registry.npmjs.org/", got "https://evil.example".',
    );
  });

  test("error: reports non-string access and registry values verbatim", () => {
    expect(() =>
      verifyPublishConfig({ publishConfig: { access: ["public"] } }),
    ).toThrow('expected "public", got ["public"].');
    expect(() =>
      verifyPublishConfig({
        publishConfig: { registry: { url: "https://registry.npmjs.org" } },
      }),
    ).toThrow('got {"url":"https://registry.npmjs.org"}.');
  });

  test("error: rejects a __proto__ key parsed from JSON", () => {
    expect(() =>
      verifyPublishConfig(
        JSON.parse(
          '{"publishConfig":{"__proto__":{"proxy":"http://evil.example"}}}',
        ),
      ),
    ).toThrow('Disallowed publishConfig key "__proto__"');
  });

  test("error: rejects a non-object publishConfig", () => {
    expect(() => verifyPublishConfig({ publishConfig: ["public"] })).toThrow(
      "expected an object, got array",
    );
    expect(() => verifyPublishConfig({ publishConfig: "public" })).toThrow(
      "expected an object, got string",
    );
  });
});

describe("verifyManifestIdentity", () => {
  test("default", () => {
    expect(
      verifyManifestIdentity({ name: "@morpho-org/alpha", version: "1.2.3" }),
    ).toEqual({ name: "@morpho-org/alpha", version: "1.2.3" });
    expect(
      verifyManifestIdentity({
        name: "morpho-ts",
        version: "0.0.0-beta.1+build.5",
      }),
    ).toEqual({ name: "morpho-ts", version: "0.0.0-beta.1+build.5" });
  });

  test("error: rejects a missing or non-string name", () => {
    expect(() => verifyManifestIdentity({ version: "1.0.0" })).toThrow(
      "Invalid name in manifest: expected an npm package name, got undefined.",
    );
    expect(() =>
      verifyManifestIdentity({ name: 42, version: "1.0.0" }),
    ).toThrow(
      "Invalid name in manifest: expected an npm package name, got 42.",
    );
  });

  test("behavior: accepts a name of exactly 214 chars", () => {
    const name = "a".repeat(214);
    expect(verifyManifestIdentity({ name, version: "1.0.0" })).toEqual({
      name,
      version: "1.0.0",
    });
  });

  test("error: rejects names with uppercase, whitespace, newlines, or over 214 chars", () => {
    for (const name of ["Morpho", "morpho ts", "morpho\nts", "a".repeat(215)]) {
      expect(() => verifyManifestIdentity({ name, version: "1.0.0" })).toThrow(
        `Invalid name in manifest: expected an npm package name, got ${JSON.stringify(name)}.`,
      );
    }
  });

  test("error: rejects a missing, non-string, or non-semver version", () => {
    expect(() => verifyManifestIdentity({ name: "alpha" })).toThrow(
      "Invalid version in manifest: expected a semver version, got undefined.",
    );
    expect(() => verifyManifestIdentity({ name: "alpha", version: 1 })).toThrow(
      "Invalid version in manifest: expected a semver version, got 1.",
    );
    for (const version of ["v1.0.0", "1.0.0\n"]) {
      expect(() => verifyManifestIdentity({ name: "alpha", version })).toThrow(
        `Invalid version in manifest: expected a semver version, got ${JSON.stringify(version)}.`,
      );
    }
  });
});

describe("verifyTarballManifest", () => {
  test("default", () => {
    expect(
      verifyTarballManifest({
        name: "@morpho-org/alpha",
        version: "1.2.3",
        publishConfig: { access: "public" },
      }),
    ).toEqual({ name: "@morpho-org/alpha", version: "1.2.3" });
  });

  test("error: rejects a bad publishConfig before checking identity", () => {
    expect(() =>
      verifyTarballManifest({
        publishConfig: { proxy: "http://evil.example" },
      }),
    ).toThrow('Disallowed publishConfig key "proxy"');
  });
});

describe("main", () => {
  test("default", () => {
    const manifestPath = writeTempManifest({
      name: "@morpho-org/alpha",
      version: "1.2.3",
      publishConfig: {
        access: "public",
        registry: "https://registry.npmjs.org/",
      },
    });

    expect(() => main([manifestPath])).not.toThrow();
  });

  test("error: missing manifest path", () => {
    expect(() => main([])).toThrow(
      "Usage: node scripts/ci/verify-tarball-manifest.ts <manifest-path>",
    );
  });

  test("error: rejects a directory at the manifest path", () => {
    const tempDir = createTempDir();
    const manifestPath = join(tempDir, "package.json");
    mkdirSync(manifestPath);
    writeFileSync(join(manifestPath, "index.js"), "process.exit(42)\n");

    expect(() => main([manifestPath])).toThrow(
      `Manifest path "${manifestPath}" is not a regular file.`,
    );
  });

  test("error: rejects a manifest whose top level is not a JSON object", () => {
    for (const content of ["null\n", '"public"\n', '["public"]\n']) {
      const tempDir = createTempDir();
      const manifestPath = join(tempDir, "package.json");
      writeFileSync(manifestPath, content);

      expect(() => main([manifestPath])).toThrow("is not a JSON object.");
    }
  });

  test("error: rejects a manifest that is not valid JSON", () => {
    const tempDir = createTempDir();
    const manifestPath = join(tempDir, "package.json");
    writeFileSync(
      manifestPath,
      'module.exports = { name: "x" }; process.exit(42)\n',
    );

    expect(() => main([manifestPath])).toThrow(SyntaxError);
  });

  test("error: rejects a symlink at the manifest path", () => {
    const realPath = writeTempManifest({ name: "@morpho-org/alpha" });
    const tempDir = createTempDir();
    const manifestPath = join(tempDir, "package.json");
    symlinkSync(realPath, manifestPath);

    expect(() => main([manifestPath])).toThrow(
      `Manifest path "${manifestPath}" is not a regular file.`,
    );
  });
});

describe("cli", () => {
  test("default", () => {
    const manifestPath = writeTempManifest({
      name: "@morpho-org/foo",
      version: "1.2.3",
      publishConfig: {
        access: "public",
        registry: "https://registry.npmjs.org/",
      },
    });

    expect(
      execFileSync("node", [scriptPath, manifestPath], { encoding: "utf8" }),
    ).toBe("@morpho-org/foo@1.2.3\n");
  });

  test("error: exits 1 with the message on stderr", () => {
    const manifestPath = writeTempManifest({
      name: "@morpho-org/alpha",
      publishConfig: { proxy: "http://evil.example" },
    });

    let execError: { status: number; stderr: string } | undefined;
    try {
      execFileSync("node", [scriptPath, manifestPath], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      execError = error as { status: number; stderr: string };
    }

    expect(execError, "expected the CLI to exit non-zero").toBeDefined();
    expect(execError?.status).toBe(1);
    expect(execError?.stderr).toContain('Disallowed publishConfig key "proxy"');
  });

  test("error: exits 1 for a manifest that is not valid JSON", () => {
    const tempDir = createTempDir();
    const manifestPath = join(tempDir, "package.json");
    writeFileSync(
      manifestPath,
      'module.exports = { name: "x" }; process.exit(42)\n',
    );

    let execError: { status: number; stderr: string } | undefined;
    try {
      execFileSync("node", [scriptPath, manifestPath], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      execError = error as { status: number; stderr: string };
    }

    expect(execError, "expected the CLI to exit non-zero").toBeDefined();
    expect(execError?.status).toBe(1);
    expect(execError?.stderr).toContain("::error::");
  });

  test("error: exits 1 for a directory at the manifest path", () => {
    const tempDir = createTempDir();
    const manifestPath = join(tempDir, "package.json");
    mkdirSync(manifestPath);
    writeFileSync(join(manifestPath, "index.js"), "process.exit(42)\n");

    let execError: { status: number; stderr: string } | undefined;
    try {
      execFileSync("node", [scriptPath, manifestPath], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      execError = error as { status: number; stderr: string };
    }

    expect(execError, "expected the CLI to exit non-zero").toBeDefined();
    expect(execError?.status).toBe(1);
    expect(execError?.stderr).toContain("::error::");
    expect(execError?.stderr).toContain("is not a regular file");
  });
});

function createTempDir(): string {
  const tempDir = mkdtempSync(join(tmpdir(), "verify-manifest-"));
  tempDirs.push(tempDir);
  return tempDir;
}

function writeTempManifest(manifest: Record<string, unknown>): string {
  const tempDir = createTempDir();
  const manifestPath = join(tempDir, "package.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifestPath;
}
