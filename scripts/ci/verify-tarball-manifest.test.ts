import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { main, verifyPublishConfig } from "./verify-tarball-manifest.ts";

const scriptPath = new URL("./verify-tarball-manifest.ts", import.meta.url)
  .pathname;
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

  test("error: rejects a non-object publishConfig", () => {
    expect(() => verifyPublishConfig({ publishConfig: ["public"] })).toThrow(
      "expected an object, got array",
    );
    expect(() => verifyPublishConfig({ publishConfig: "public" })).toThrow(
      "expected an object, got string",
    );
  });
});

describe("main", () => {
  test("default", () => {
    const manifestPath = writeTempManifest({
      name: "@morpho-org/alpha",
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
});

describe("cli", () => {
  test("default", () => {
    const manifestPath = writeTempManifest({
      name: "@morpho-org/alpha",
      publishConfig: {
        access: "public",
        registry: "https://registry.npmjs.org/",
      },
    });

    expect(() =>
      execFileSync("node", [scriptPath, manifestPath], { encoding: "utf8" }),
    ).not.toThrow();
  });

  test("error: exits 1 with the message on stderr", () => {
    const manifestPath = writeTempManifest({
      name: "@morpho-org/alpha",
      publishConfig: { proxy: "http://evil.example" },
    });

    try {
      execFileSync("node", [scriptPath, manifestPath], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      expect.unreachable("expected the CLI to exit non-zero");
    } catch (error) {
      const execError = error as { status: number; stderr: string };
      expect(execError.status).toBe(1);
      expect(execError.stderr).toContain(
        'Disallowed publishConfig key "proxy"',
      );
    }
  });
});

function writeTempManifest(manifest: Record<string, unknown>): string {
  const tempDir = mkdtempSync(join(tmpdir(), "verify-manifest-"));
  tempDirs.push(tempDir);
  const manifestPath = join(tempDir, "package.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifestPath;
}
