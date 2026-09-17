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
        publishConfig: {
          access: "public",
          registry: "https://registry.npmjs.org/",
        },
      }),
    ).not.toThrow();
  });

  test("behavior: allows an absent publishConfig", () => {
    expect(() => verifyPublishConfig({})).not.toThrow();
  });

  test("behavior: allows the npm registry without a trailing slash", () => {
    expect(() =>
      verifyPublishConfig({
        publishConfig: { registry: "https://registry.npmjs.org" },
      }),
    ).not.toThrow();
  });

  test.each(["proxy", "https-proxy", "strict-ssl", "ca", "tag"])(
    "error: rejects disallowed key %s",
    (key) => {
      expect(() =>
        verifyPublishConfig({ publishConfig: { [key]: "untrusted" } }),
      ).toThrow(`Disallowed publishConfig key "${key}"`);
    },
  );

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
        publishConfig: { registry: "https://registry.example" },
      }),
    ).toThrow(
      'Invalid publishConfig.registry in manifest: expected "https://registry.npmjs.org" or "https://registry.npmjs.org/", got "https://registry.example".',
    );
  });

  test.each([
    ["array", ["public"]],
    ["string", "public"],
  ])("error: rejects a non-object publishConfig (%s)", (_type, value) => {
    expect(() => verifyPublishConfig({ publishConfig: value })).toThrow(
      `expected an object, got ${_type}`,
    );
  });
});

describe("main", () => {
  test("default", () => {
    const manifestPath = writeTempManifest({
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

  test("error: unreadable manifest path", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "verify-manifest-"));
    tempDirs.push(tempDir);

    expect(() => main([join(tempDir, "missing.json")])).toThrow(/ENOENT/);
  });

  test("error: malformed manifest JSON", () => {
    const manifestPath = writeTempFile("{ not json");

    expect(() => main([manifestPath])).toThrow(SyntaxError);
  });

  test.each([
    ["null", "null"],
    ["string", '"public"'],
    ["number", "42"],
    ["array", '[{ "publishConfig": { "proxy": "http://proxy.example" } }]'],
  ])("error: rejects a non-object manifest root (%s)", (type, json) => {
    const manifestPath = writeTempFile(json);

    expect(() => main([manifestPath])).toThrow(
      `expected a JSON object root, got ${type}.`,
    );
  });
});

describe("cli", () => {
  test("default", () => {
    const manifestPath = writeTempManifest({
      publishConfig: { access: "public" },
    });

    expect(() =>
      execFileSync("node", [scriptPath, manifestPath], { encoding: "utf8" }),
    ).not.toThrow();
  });

  test("error: exits 1 with an annotation", () => {
    const manifestPath = writeTempManifest({
      publishConfig: { proxy: "http://proxy.example" },
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
        '::error::Disallowed publishConfig key "proxy"',
      );
    }
  });
});

function writeTempManifest(manifest: Record<string, unknown>): string {
  return writeTempFile(`${JSON.stringify(manifest, null, 2)}\n`);
}

function writeTempFile(contents: string): string {
  const tempDir = mkdtempSync(join(tmpdir(), "verify-manifest-"));
  tempDirs.push(tempDir);
  const manifestPath = join(tempDir, "package.json");
  writeFileSync(manifestPath, contents);
  return manifestPath;
}
