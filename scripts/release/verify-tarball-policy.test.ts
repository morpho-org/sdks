import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import {
  evaluateTarballPolicy,
  listPublicPackageNames,
  listTarballEntries,
  loadPolicy,
  main,
  matchesAllowlist,
  type PackedManifest,
  type ReleasePolicy,
  readTarballManifest,
  verifyTarballs,
} from "./verify-tarball-policy.ts";

const SCRIPT_PATH = resolve("scripts/release/verify-tarball-policy.ts");

const tempDirs: string[] = [];

const policy: ReleasePolicy = {
  defaults: {
    files: ["package.json", "README.md", "LICENSE", "CHANGELOG.md", "lib/**"],
    repositoryUrls: ["git+https://github.com/morpho-org/sdks.git"],
  },
  packages: {
    "@morpho-org/alpha": { dependencies: ["viem", "zod"] },
    "@morpho-org/beta": { files: ["bare.js"], dependencies: [] },
  },
};

const compliantManifest: PackedManifest = {
  name: "@morpho-org/alpha",
  version: "1.0.0",
  repository: {
    type: "git",
    url: "git+https://github.com/morpho-org/sdks.git",
  },
  scripts: { build: "tsc", prepublish: "pnpm build", test: "vitest" },
  dependencies: { zod: "^4.0.0" },
  peerDependencies: { viem: "^2.0.0" },
};

const compliantEntries = [
  "package/package.json",
  "package/README.md",
  "package/LICENSE",
  "package/CHANGELOG.md",
  "package/lib/esm/index.js",
  "package/lib/cjs/index.js",
];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    rmSync(tempDir, { force: true, recursive: true });
  }
});

describe("matchesAllowlist", () => {
  test("default", () => {
    expect(matchesAllowlist("package.json", ["package.json"])).toBe(true);
    expect(matchesAllowlist("lib/esm/a.js", ["lib/**"])).toBe(true);
  });

  test("behavior: directory patterns do not match sibling prefixes or the directory itself", () => {
    expect(matchesAllowlist("library/a.js", ["lib/**"])).toBe(false);
    expect(matchesAllowlist("lib", ["lib/**"])).toBe(false);
    expect(matchesAllowlist("package.json.bak", ["package.json"])).toBe(false);
  });

  test("behavior: non-canonical paths never match, even under an allowed directory", () => {
    expect(matchesAllowlist("lib/../postinstall.js", ["lib/**"])).toBe(false);
    expect(matchesAllowlist("lib/./a.js", ["lib/**"])).toBe(false);
    expect(matchesAllowlist("lib//a.js", ["lib/**"])).toBe(false);
    expect(matchesAllowlist("lib/a.js/", ["lib/**"])).toBe(false);
  });
});

describe("evaluateTarballPolicy", () => {
  test("default", () => {
    expect(
      evaluateTarballPolicy({
        entries: compliantEntries,
        manifest: compliantManifest,
        policy,
      }),
    ).toEqual([]);
  });

  test("behavior: accepts per-package extra files and a string repository", () => {
    expect(
      evaluateTarballPolicy({
        entries: ["package/package.json", "package/bare.js", "package/lib/"],
        manifest: {
          name: "@morpho-org/beta",
          repository: "git+https://github.com/morpho-org/sdks.git",
        },
        policy,
      }),
    ).toEqual([]);
  });

  test("behavior: rejects packages missing from the policy", () => {
    expect(
      evaluateTarballPolicy({
        entries: compliantEntries,
        manifest: { ...compliantManifest, name: "@morpho-org/gamma" },
        policy,
      }),
    ).toEqual([
      'package "@morpho-org/gamma" is not listed in the release policy',
    ]);
    expect(
      evaluateTarballPolicy({ entries: [], manifest: {}, policy }),
    ).toEqual(['package "<unnamed>" is not listed in the release policy']);
  });

  test("behavior: rejects files outside the allowlist and entries outside package/", () => {
    expect(
      evaluateTarballPolicy({
        entries: [
          ...compliantEntries,
          "package/lib/.cache/init.js",
          "package/postinstall.js",
          "zzz/package.json",
        ],
        manifest: compliantManifest,
        policy,
      }),
    ).toEqual([
      'file "postinstall.js" is not in the files allowlist',
      'entry "zzz/package.json" is outside package/',
    ]);
  });

  test("behavior: rejects path traversal and duplicate separators under an allowed directory", () => {
    expect(
      evaluateTarballPolicy({
        entries: [
          ...compliantEntries,
          "package/lib/../postinstall.js",
          "package/lib//x.js",
          "package/lib/./y.js",
        ],
        manifest: compliantManifest,
        policy,
      }),
    ).toEqual([
      'file "lib/../postinstall.js" is not a canonical path',
      'file "lib//x.js" is not a canonical path',
      'file "lib/./y.js" is not a canonical path',
    ]);
  });

  test("behavior: rejects install lifecycle scripts only", () => {
    expect(
      evaluateTarballPolicy({
        entries: compliantEntries,
        manifest: {
          ...compliantManifest,
          scripts: {
            ...(compliantManifest.scripts as Record<string, string>),
            postinstall: "node lib/.cache/init.js",
            prepare: "husky",
          },
        },
        policy,
      }),
    ).toEqual([
      "manifest declares install lifecycle scripts: postinstall, prepare",
    ]);
    expect(
      evaluateTarballPolicy({
        entries: compliantEntries,
        manifest: { ...compliantManifest, scripts: "rm -rf /" },
        policy,
      }),
    ).toEqual(['manifest field "scripts" is not an object']);
  });

  test("behavior: rejects bin and bundled dependencies", () => {
    expect(
      evaluateTarballPolicy({
        entries: compliantEntries,
        manifest: {
          ...compliantManifest,
          bin: { alpha: "lib/cli.js" },
          bundledDependencies: ["zod"],
        },
        policy,
      }),
    ).toEqual([
      'manifest declares forbidden field "bin"',
      'manifest declares forbidden field "bundledDependencies"',
    ]);
  });

  test("behavior: rejects dependencies outside the allowlist in every installed field", () => {
    expect(
      evaluateTarballPolicy({
        entries: compliantEntries,
        manifest: {
          ...compliantManifest,
          dependencies: { zod: "^4.0.0", "evil-pkg": "1.0.0" },
          optionalDependencies: { fsevents: "^2.0.0" },
          peerDependencies: "viem",
        },
        policy,
      }),
    ).toEqual([
      'dependencies "evil-pkg" is not in the dependency allowlist',
      'optionalDependencies "fsevents" is not in the dependency allowlist',
      'manifest field "peerDependencies" is not an object',
    ]);
  });

  test("behavior: rejects an unexpected repository URL", () => {
    expect(
      evaluateTarballPolicy({
        entries: compliantEntries,
        manifest: {
          ...compliantManifest,
          repository: { type: "git", url: "https://github.com/evil/sdks.git" },
        },
        policy,
      }),
    ).toEqual([
      'manifest repository "https://github.com/evil/sdks.git" is not an allowed repository URL',
    ]);
    expect(
      evaluateTarballPolicy({
        entries: compliantEntries,
        manifest: { ...compliantManifest, repository: undefined },
        policy,
      }),
    ).toEqual([
      'manifest repository "undefined" is not an allowed repository URL',
    ]);
  });
});

describe("loadPolicy", () => {
  test("default", () => {
    const root = createTempDir();
    const policyPath = join(root, "policy.json");
    writeFileSync(policyPath, JSON.stringify(policy));

    expect(loadPolicy(policyPath)).toEqual(policy);
  });

  test("behavior: the committed policy is valid", () => {
    const committed = loadPolicy("scripts/release/release-policy.json");

    expect(Object.keys(committed.packages)).toEqual(
      listPublicPackageNames(process.cwd()),
    );
  });

  test("error: malformed policy", () => {
    const root = createTempDir();
    const policyPath = join(root, "policy.json");

    writeFileSync(policyPath, JSON.stringify({ packages: {} }));
    expect(() => loadPolicy(policyPath)).toThrow(
      "expected defaults.files, defaults.repositoryUrls and packages",
    );

    writeFileSync(
      policyPath,
      JSON.stringify({
        ...policy,
        packages: { "@morpho-org/alpha": { dependencies: "viem" } },
      }),
    );
    expect(() => loadPolicy(policyPath)).toThrow(
      'package "@morpho-org/alpha" needs a dependencies array',
    );
  });
});

describe("verifyTarballs", () => {
  test("default", () => {
    const root = createWorkspace(["@morpho-org/alpha", "@morpho-org/beta"]);
    const tarballDir = join(root, "tarballs");
    createTarball(join(tarballDir, "alpha.tgz"), {
      manifest: compliantManifest,
      files: ["lib/esm/index.js"],
    });

    expect(listTarballEntries(join(tarballDir, "alpha.tgz")).sort()).toEqual([
      "package/",
      "package/lib/",
      "package/lib/esm/",
      "package/lib/esm/index.js",
      "package/package.json",
    ]);
    expect(readTarballManifest(join(tarballDir, "alpha.tgz"))).toEqual(
      compliantManifest,
    );

    const result = verifyTarballs({ cwd: root, policy, tarballDir });
    expect(result.checked).toEqual(["alpha.tgz"]);
    expect(result.violations.size).toBe(0);
  });

  test("behavior: reports violations per tarball and public packages without a policy entry", () => {
    const root = createWorkspace(["@morpho-org/alpha", "@morpho-org/gamma"]);
    const tarballDir = join(root, "tarballs");
    createTarball(join(tarballDir, "alpha.tgz"), {
      manifest: compliantManifest,
      files: ["lib/a.js"],
    });
    createTarball(join(tarballDir, "gamma.tgz"), {
      manifest: { ...compliantManifest, name: "@morpho-org/gamma" },
      files: ["lib/a.js"],
    });

    const result = verifyTarballs({ cwd: root, policy, tarballDir });
    expect(result.checked).toEqual(["alpha.tgz", "gamma.tgz"]);
    expect([...result.violations]).toEqual([
      [
        "@morpho-org/gamma",
        [
          'public workspace package "@morpho-org/gamma" has no entry in the release policy',
        ],
      ],
      [
        "gamma.tgz",
        ['package "@morpho-org/gamma" is not listed in the release policy'],
      ],
    ]);
  });

  test("error: empty tarball directory", () => {
    const root = createWorkspace([]);
    const tarballDir = join(root, "tarballs");
    mkdirSync(tarballDir);

    expect(() => verifyTarballs({ cwd: root, policy, tarballDir })).toThrow(
      "No .tgz tarballs found",
    );
  });
});

describe("main", () => {
  test("default", () => {
    const root = createWorkspace(["@morpho-org/alpha"]);
    writeFileSync(join(root, "policy.json"), JSON.stringify(policy));
    createTarball(join(root, "tarballs/alpha.tgz"), {
      manifest: compliantManifest,
      files: ["lib/a.js"],
    });
    const output: string[] = [];

    expect(
      main(["tarballs", "policy.json"], {
        cwd: root,
        writeOutput: (message) => output.push(message),
      }),
    ).toBe(true);
    expect(output).toEqual(["alpha.tgz: OK\n"]);
  });

  test("behavior: prints GitHub error annotations and returns false on violations", () => {
    const root = createWorkspace(["@morpho-org/alpha"]);
    writeFileSync(join(root, "policy.json"), JSON.stringify(policy));
    createTarball(join(root, "tarballs/alpha.tgz"), {
      manifest: { ...compliantManifest, bin: "lib/cli.js" },
      files: ["lib/a.js", "evil.js"],
    });
    const output: string[] = [];

    expect(
      main(["tarballs", "policy.json"], {
        cwd: root,
        writeOutput: (message) => output.push(message),
      }),
    ).toBe(false);
    expect(output).toEqual([
      "alpha.tgz: FAIL (2)\n",
      '::error::alpha.tgz: file "evil.js" is not in the files allowlist\n',
      '::error::alpha.tgz: manifest declares forbidden field "bin"\n',
    ]);
  });

  test("error: missing tarball directory argument", () => {
    expect(() => main([], { writeOutput: () => {} })).toThrow("Usage:");
  });
});

describe("cli", () => {
  test("default: exits 0 with the default policy path", () => {
    const root = createWorkspace(["@morpho-org/alpha"]);
    writeDefaultPolicy(root);
    createTarball(join(root, "tarballs/alpha.tgz"), {
      manifest: compliantManifest,
      files: ["lib/a.js"],
    });

    const result = spawnSync(process.execPath, [SCRIPT_PATH, "tarballs"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("alpha.tgz: OK\n");
  });

  test("behavior: exits 1 on a policy violation", () => {
    const root = createWorkspace(["@morpho-org/alpha"]);
    writeDefaultPolicy(root);
    createTarball(join(root, "tarballs/alpha.tgz"), {
      manifest: compliantManifest,
      files: ["lib/a.js", "evil.js"],
    });

    const result = spawnSync(process.execPath, [SCRIPT_PATH, "tarballs"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe(
      'alpha.tgz: FAIL (1)\n::error::alpha.tgz: file "evil.js" is not in the files allowlist\n',
    );
  });

  test("error: exits 1 when the tarball directory is missing", () => {
    const root = createWorkspace([]);
    writeDefaultPolicy(root);

    const result = spawnSync(process.execPath, [SCRIPT_PATH, "tarballs"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("::error::ENOENT");
  });
});

function writeDefaultPolicy(root: string) {
  mkdirSync(join(root, "scripts/release"), { recursive: true });
  writeFileSync(
    join(root, "scripts/release/release-policy.json"),
    JSON.stringify(policy),
  );
}

function createTempDir() {
  const tempDir = mkdtempSync(join(tmpdir(), "verify-tarball-policy-"));
  tempDirs.push(tempDir);

  return tempDir;
}

function createWorkspace(publicPackageNames: readonly string[]) {
  const root = createTempDir();
  mkdirSync(join(root, "packages/private"), { recursive: true });
  writeFileSync(
    join(root, "packages/private/package.json"),
    JSON.stringify({ name: "@morpho-org/private", private: true }),
  );
  mkdirSync(join(root, "packages/no-manifest"));

  publicPackageNames.forEach((name, index) => {
    const dir = join(root, "packages", `pkg-${index}`);
    mkdirSync(dir);
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name }));
  });

  return root;
}

function createTarball(
  tarballPath: string,
  { manifest, files }: { manifest: PackedManifest; files: readonly string[] },
) {
  const stage = join(createTempDir(), "package");
  mkdirSync(stage, { recursive: true });
  writeFileSync(join(stage, "package.json"), JSON.stringify(manifest));
  for (const file of files) {
    mkdirSync(join(stage, file, ".."), { recursive: true });
    writeFileSync(join(stage, file), "");
  }

  mkdirSync(join(tarballPath, ".."), { recursive: true });
  execFileSync("tar", [
    "-czf",
    tarballPath,
    "-C",
    join(stage, ".."),
    "package",
  ]);
}
