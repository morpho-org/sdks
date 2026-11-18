import { execFileSync } from "node:child_process";
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
import { afterAll, describe, expect, test } from "vitest";

import { listPublicPackages } from "./pack.ts";
import { loadBundledPacote } from "./read-tarball-identity.ts";
import {
  orderByDependencies,
  selectChannelTarballs,
  verifyChecksums,
  verifyReleaseMatch,
  verifyReleaseSet,
  verifyTarballStructure,
} from "./verify-release-set.ts";
import { loadBundledTar } from "./verify-tarball-collisions.ts";

const NPM_ROOT = execFileSync("npm", ["root", "-g"], {
  encoding: "utf8",
}).trim();
const tar = loadBundledTar(NPM_ROOT);
const pacote = loadBundledPacote(NPM_ROOT);

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "release-set-test-"));
  dirs.push(dir);
  return dir;
}

/** Packs `package/` trees with GNU tar and writes SHA256SUMS. */
function tarballs(packages: Record<string, Record<string, string>>): string {
  const out = tempDir();
  for (const [file, files] of Object.entries(packages)) {
    const src = tempDir();
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(join(src, path, ".."), { recursive: true });
      if (content.startsWith("->"))
        symlinkSync(content.slice(2), join(src, path));
      else writeFileSync(join(src, path), content);
    }
    execFileSync("tar", ["-czf", join(out, file), "-C", src, "package"]);
  }
  execFileSync("sh", ["-c", "sha256sum ./*.tgz > SHA256SUMS"], { cwd: out });
  return out;
}

const manifest = (extra: object = {}) =>
  JSON.stringify({ name: "@x/a", version: "1.0.0", ...extra });

const releaseTarball = ({
  name,
  file,
  dependencies = [],
}: {
  name: string;
  file: string;
  dependencies?: readonly string[];
}) => ({ name, version: "1.0.0", file, dependencies });

describe("orderByDependencies", () => {
  test("orders a diamond dependency graph", () => {
    expect(
      orderByDependencies([
        releaseTarball({
          name: "@x/a",
          file: "a.tgz",
          dependencies: ["@x/b", "@x/c"],
        }),
        releaseTarball({ name: "@x/b", file: "b.tgz", dependencies: ["@x/d"] }),
        releaseTarball({ name: "@x/c", file: "c.tgz", dependencies: ["@x/d"] }),
        releaseTarball({ name: "@x/d", file: "d.tgz" }),
      ]).map(({ name }) => name),
    ).toEqual(["@x/d", "@x/b", "@x/c", "@x/a"]);
  });

  test("orders peer dependencies and ignores names outside the release set", () => {
    expect(
      orderByDependencies([
        releaseTarball({
          name: "@x/a",
          file: "a.tgz",
          dependencies: ["@x/peer", "@outside/pkg"],
        }),
        releaseTarball({ name: "@x/peer", file: "z.tgz" }),
      ]).map(({ name }) => name),
    ).toEqual(["@x/peer", "@x/a"]);
  });

  test("breaks ties by file name at each step", () => {
    expect(
      orderByDependencies([
        releaseTarball({ name: "@x/c", file: "c.tgz" }),
        releaseTarball({ name: "@x/b", file: "b.tgz", dependencies: ["@x/a"] }),
        releaseTarball({ name: "@x/a", file: "a.tgz" }),
      ]).map(({ name }) => name),
    ).toEqual(["@x/a", "@x/b", "@x/c"]);
  });

  test("rejects duplicate package names", () => {
    expect(() =>
      orderByDependencies([
        releaseTarball({ name: "@x/a", file: "a.tgz" }),
        releaseTarball({ name: "@x/a", file: "b.tgz" }),
      ]),
    ).toThrow("Two tarballs for @x/a.");
  });

  test("reports a dependency cycle", () => {
    expect(() =>
      orderByDependencies([
        releaseTarball({ name: "@x/a", file: "a.tgz", dependencies: ["@x/b"] }),
        releaseTarball({ name: "@x/b", file: "b.tgz", dependencies: ["@x/a"] }),
      ]),
    ).toThrow(
      "Release package dependencies contain a cycle: @x/a -> @x/b -> @x/a.",
    );
  });
});

describe("verifyTarballStructure", () => {
  const ok = [
    { path: "package/", type: "Directory" },
    { path: "package/package.json", type: "File" },
    { path: "package/lib/index.js", type: "File" },
  ];

  test("accepts an npm layout", () => {
    expect(() => verifyTarballStructure("a.tgz", ok)).not.toThrow();
  });

  test.each([
    { name: "a second root", entry: { path: "other/x", type: "File" } },
    { name: "a dot segment", entry: { path: "package/./x", type: "File" } },
    { name: "a parent segment", entry: { path: "package/../x", type: "File" } },
    { name: "an empty segment", entry: { path: "package//x", type: "File" } },
    {
      name: "a unique backslash file",
      entry: { path: "package/lib\\esm\\blue\\Market.js", type: "File" },
    },
    {
      name: "a backslash directory",
      entry: { path: "package/lib\\esm/", type: "Directory" },
    },
    { name: "a symlink", entry: { path: "package/l", type: "SymbolicLink" } },
    { name: "a hard link", entry: { path: "package/l", type: "Link" } },
    {
      name: "an entry below package.json",
      entry: { path: "package/package.json/x", type: "File" },
    },
    {
      name: "a package.json directory",
      entry: { path: "package/package.json/", type: "Directory" },
    },
    {
      name: "a second package.json",
      entry: { path: "package/package.json", type: "File" },
    },
  ])("rejects $name", ({ entry }) => {
    expect(() => verifyTarballStructure("a.tgz", [...ok, entry])).toThrow();
  });

  test("rejects a missing package.json", () => {
    expect(() =>
      verifyTarballStructure("a.tgz", [{ path: "package/x", type: "File" }]),
    ).toThrow("exactly one package/package.json");
  });
});

describe("verifyReleaseMatch", () => {
  const a = { file: "a.tgz", name: "@x/a", version: "1.0.0" };
  const expected = [{ name: "@x/a", version: "1.0.0" }];

  test("accepts exactly the declared packages", () => {
    expect(() => verifyReleaseMatch(expected, [a])).not.toThrow();
  });

  test.each([
    { name: "a missing tarball", received: [] },
    { name: "a wrong version", received: [{ ...a, version: "2.0.0" }] },
    { name: "a duplicate", received: [a, a] },
    { name: "an extra package", received: [a, { ...a, name: "@x/b" }] },
  ])("rejects $name", ({ received }) => {
    expect(() => verifyReleaseMatch(expected, received)).toThrow();
  });
});

describe("selectChannelTarballs", () => {
  const stable = { file: "a.tgz", name: "@x/a", version: "1.0.0" };
  const pre = { file: "b.tgz", name: "@x/b", version: "1.1.0-next.0" };

  test("preserves the dependency order provided by the release set", () => {
    const ordered = [{ file: "b.tgz", name: "@x/b", version: "1.0.0" }, stable];
    expect(selectChannelTarballs(ordered, "latest")).toEqual(ordered);
  });

  test("latest publishes every stable version and rejects a prerelease", () => {
    expect(selectChannelTarballs([stable], "latest")).toEqual([stable]);
    expect(() => selectChannelTarballs([stable, pre], "latest")).toThrow(
      "@x/b@1.1.0-next.0 is not a stable x.y.z version",
    );
  });

  test("next publishes only prereleases, leaving stable versions to main", () => {
    expect(selectChannelTarballs([stable, pre], "next")).toEqual([pre]);
    expect(selectChannelTarballs([stable], "next")).toEqual([]);
  });

  test.each(["latest", "next"] as const)(
    "%s rejects a version that is neither x.y.z nor a prerelease",
    (channel) => {
      for (const version of ["1.2.3+build.1", "1.2.3-next.0+build.1", "1.2"]) {
        expect(() =>
          selectChannelTarballs([{ ...stable, version }], channel),
        ).toThrow(`@x/a@${version} is neither a stable x.y.z version`);
      }
    },
  );
});

describe("verifyChecksums", () => {
  test("rejects a missing SHA256SUMS", () => {
    const dir = tarballs({ "a.tgz": { "package/package.json": manifest() } });
    rmSync(join(dir, "SHA256SUMS"));
    expect(() => verifyChecksums(dir)).toThrow("Missing");
  });

  test("rejects an edited tarball", () => {
    const dir = tarballs({ "a.tgz": { "package/package.json": manifest() } });
    writeFileSync(join(dir, "a.tgz"), "x");
    expect(() => verifyChecksums(dir)).toThrow("doesn't match");
  });

  test("rejects a listed tarball that is missing", () => {
    const dir = tarballs({ "a.tgz": { "package/package.json": manifest() } });
    writeFileSync(join(dir, "SHA256SUMS"), `${"0".repeat(64)}  ./b.tgz\n`, {
      flag: "a",
    });
    expect(() => verifyChecksums(dir)).toThrow("missing tarballs");
  });

  test.each([
    { name: "a malformed line", line: "not a checksum" },
    { name: "a duplicate line", line: null },
  ])("rejects $name", ({ line }) => {
    const dir = tarballs({ "a.tgz": { "package/package.json": manifest() } });
    const sums = join(dir, "SHA256SUMS");
    writeFileSync(sums, `${line ?? readFileSync(sums, "utf8").trim()}\n`, {
      flag: "a",
    });
    expect(() => verifyChecksums(dir)).toThrow("Invalid SHA256SUMS line");
  });

  test("rejects an empty directory", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "SHA256SUMS"), "");
    expect(() => verifyChecksums(dir)).toThrow("No tarballs");
  });
});

describe("verifyReleaseSet", () => {
  const expected = [{ name: "@x/a", version: "1.0.0" }];
  const run = (dir: string) => verifyReleaseSet({ dir, expected, tar, pacote });

  test("returns the tarballs to publish", async () => {
    const dir = tarballs({
      "a.tgz": { "package/package.json": manifest(), "package/index.js": "" },
    });
    await expect(run(dir)).resolves.toEqual([
      { file: join(dir, "a.tgz"), name: "@x/a", version: "1.0.0" },
    ]);
  });

  test("orders from stored dependencies but ignores devDependencies", async () => {
    const names = ["@x/a", "@x/peer", "@x/optional", "@x/dev"];
    const dir = tarballs({
      "a.tgz": {
        "package/package.json": manifest({
          dependencies: { "@outside/pkg": "^1.0.0" },
          peerDependencies: { "@x/peer": "^1.0.0" },
          optionalDependencies: { "@x/optional": "^1.0.0" },
          devDependencies: { "@x/dev": "^1.0.0" },
        }),
      },
      "peer.tgz": {
        "package/package.json": manifest({ name: "@x/peer" }),
      },
      "optional.tgz": {
        "package/package.json": manifest({ name: "@x/optional" }),
      },
      "z-dev.tgz": {
        "package/package.json": manifest({ name: "@x/dev" }),
      },
    });
    const received = await verifyReleaseSet({
      dir,
      expected: names.map((name) => ({ name, version: "1.0.0" })),
      tar,
      pacote,
    });
    expect(received.map(({ name }) => name)).toEqual([
      "@x/optional",
      "@x/peer",
      "@x/a",
      "@x/dev",
    ]);
  });

  test("orders every public workspace dependency before its dependent", () => {
    const packages = listPublicPackages(".");
    const packageNames = new Set(packages.map(({ name }) => name));
    const releaseSet = packages.map((pkg) => {
      const pkgManifest: {
        dependencies?: Record<string, unknown>;
        peerDependencies?: Record<string, unknown>;
        optionalDependencies?: Record<string, unknown>;
      } = JSON.parse(readFileSync(join(pkg.dir, "package.json"), "utf8"));
      const dependencies = [
        pkgManifest.dependencies,
        pkgManifest.peerDependencies,
        pkgManifest.optionalDependencies,
      ].flatMap((declared) => (declared == null ? [] : Object.keys(declared)));
      return {
        file: `${pkg.dir}.tgz`,
        name: pkg.name,
        version: pkg.version,
        dependencies,
      };
    });
    const ordered = orderByDependencies(releaseSet);
    const positions = new Map(
      ordered.map(({ name }, index) => [name, index] as const),
    );
    expect(ordered).toHaveLength(releaseSet.length);
    for (const pkg of releaseSet) {
      const packagePosition = positions.get(pkg.name) ?? -1;
      expect(packagePosition).toBeGreaterThanOrEqual(0);
      for (const dependency of pkg.dependencies) {
        if (packageNames.has(dependency)) {
          const dependencyPosition = positions.get(dependency) ?? -1;
          expect(dependencyPosition).toBeGreaterThanOrEqual(0);
          expect(dependencyPosition).toBeLessThan(packagePosition);
        }
      }
    }
  });

  test("orders the packages from release 59471c3 before their dependents", () => {
    // Dependency edges are frozen from release commit 59471c3.
    const releaseSet = [
      {
        file: "blue-sdk.tgz",
        name: "@morpho-org/blue-sdk",
        version: "8.0.2",
        dependencies: ["@morpho-org/morpho-ts"],
      },
      {
        file: "blue-sdk-viem.tgz",
        name: "@morpho-org/blue-sdk-viem",
        version: "7.1.0",
        dependencies: ["@morpho-org/blue-sdk", "@morpho-org/morpho-ts"],
      },
      {
        file: "evm-simulation.tgz",
        name: "@morpho-org/evm-simulation",
        version: "8.3.0",
        dependencies: [
          "@morpho-org/blue-sdk",
          "@morpho-org/morpho-sdk",
          "@morpho-org/morpho-ts",
        ],
      },
      {
        file: "midnight-sdk.tgz",
        name: "@morpho-org/midnight-sdk",
        version: "2.2.1",
        dependencies: ["@morpho-org/morpho-ts"],
      },
      {
        file: "morpho-sdk.tgz",
        name: "@morpho-org/morpho-sdk",
        version: "9.1.0",
        dependencies: [
          "@morpho-org/blue-sdk",
          "@morpho-org/blue-sdk-viem",
          "@morpho-org/midnight-sdk",
          "@morpho-org/morpho-ts",
        ],
      },
      {
        file: "wdk-protocol-lending-morpho-evm.tgz",
        name: "@morpho-org/wdk-protocol-lending-morpho-evm",
        version: "4.1.0",
        dependencies: [
          "@morpho-org/blue-sdk",
          "@morpho-org/blue-sdk-viem",
          "@morpho-org/morpho-sdk",
        ],
      },
    ];

    expect(orderByDependencies(releaseSet).map(({ name }) => name)).toEqual([
      "@morpho-org/blue-sdk",
      "@morpho-org/blue-sdk-viem",
      "@morpho-org/midnight-sdk",
      "@morpho-org/morpho-sdk",
      "@morpho-org/evm-simulation",
      "@morpho-org/wdk-protocol-lending-morpho-evm",
    ]);
  });

  test("rejects a unique backslash runtime member in a checksummed tarball", async () => {
    const dir = tarballs({
      "a.tgz": {
        "package/package.json": manifest({
          type: "module",
          exports: { "./blue/*": "./lib/esm/blue/*.js" },
        }),
        "package/lib\\esm\\blue\\Market.js": "export const runtime = 'test';",
      },
    });
    await expect(run(dir)).rejects.toThrow("non-canonical entry");
  });

  test("rejects a checksummed file that is not a tarball", async () => {
    const dir = tarballs({ "a.tgz": { "package/package.json": manifest() } });
    writeFileSync(
      join(dir, "a.tgz"),
      readFileSync(join(dir, "a.tgz")).subarray(0, 20),
    );
    execFileSync("sh", ["-c", "sha256sum ./*.tgz > SHA256SUMS"], { cwd: dir });
    await expect(run(dir)).rejects.toThrow("Unable to list tarball");
  });

  test("rejects a package.json that isn't a JSON object", async () => {
    const dir = tarballs({ "a.tgz": { "package/package.json": "null" } });
    await expect(run(dir)).rejects.toThrow(
      'Manifest at "a.tgz:package/package.json" is not a JSON object.',
    );
  });

  test("rejects a disallowed publishConfig", async () => {
    const dir = tarballs({
      "a.tgz": {
        "package/package.json": manifest({
          publishConfig: { registry: "https://evil.example" },
        }),
      },
    });
    await expect(run(dir)).rejects.toThrow("publishConfig");
  });

  test("rejects a symlink", async () => {
    const dir = tarballs({
      "a.tgz": {
        "package/package.json": manifest(),
        "package/leak": "->../../.npmrc",
      },
    });
    await expect(run(dir)).rejects.toThrow("SymbolicLink");
  });

  test("rejects paths that collide on a case-insensitive file system", async () => {
    const dir = tarballs({
      "a.tgz": {
        "package/package.json": manifest(),
        "package/README.md": "",
        "package/readme.md": "",
      },
    });
    await expect(run(dir)).rejects.toThrow();
  });

  test("rejects a package.json that differs from what npm reads", async () => {
    const dir = tarballs({ "a.tgz": { "package/package.json": manifest() } });
    const otherPacote = {
      manifest: async () => ({ name: "@x/a", version: "2.0.0" }),
    };
    await expect(
      verifyReleaseSet({ dir, expected, tar, pacote: otherPacote }),
    ).rejects.toThrow("npm would publish @x/a@2.0.0");
  });

  test("rejects a version the source doesn't declare", async () => {
    const dir = tarballs({
      "a.tgz": { "package/package.json": manifest({ version: "9.9.9" }) },
    });
    await expect(run(dir)).rejects.toThrow("Expected a tarball");
  });
});
