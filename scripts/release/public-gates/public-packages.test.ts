import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";

import { listPublicPackages } from "./public-packages.ts";

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function tree(files: Record<string, unknown>): string {
  const root = mkdtempSync(join(tmpdir(), "public-packages-test-"));
  dirs.push(root);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), JSON.stringify(content));
  }
  return root;
}

describe("listPublicPackages", () => {
  test("default", () => {
    const root = tree({
      "packages/b/package.json": { name: "b", version: "2.0.0" },
      "packages/a/package.json": { name: "@morpho-org/a", version: "1.0.0" },
      "packages/internal/package.json": { name: "i", private: true },
      "packages/notes/README.json": {},
    });

    expect(listPublicPackages(root)).toEqual([
      {
        dir: "packages/a",
        name: "@morpho-org/a",
        version: "1.0.0",
        tarball: "morpho-org-a-1.0.0.tgz",
      },
      {
        dir: "packages/b",
        name: "b",
        version: "2.0.0",
        tarball: "b-2.0.0.tgz",
      },
    ]);
  });

  test('behavior: "private": false is public', () => {
    const root = tree({
      "packages/a/package.json": {
        name: "a",
        version: "1.0.0",
        private: false,
      },
    });

    expect(listPublicPackages(root).map(({ dir }) => dir)).toEqual([
      "packages/a",
    ]);
  });

  test("error: a public package without a version fails", () => {
    const root = tree({ "packages/a/package.json": { name: "a" } });

    expect(() => listPublicPackages(root)).toThrow(
      '"packages/a/package.json" needs a "name" and a "version".',
    );
  });
});
