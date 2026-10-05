#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { type PackageIdentity, publicIdentity } from "../../publish/pack.ts";

/**
 * Lists the public packages that are new, renamed or bumped between `base` and `sha`:
 * any public package whose `name` or `version` differs from `base`, including one that
 * was private or missing there. A push is a release when this is non-empty. The
 * public-snapshot workflow also runs on a manual dispatch from `main`, so a sync must
 * check this list itself rather than trust that an artifact exists.
 *
 * @param options.repo - Repository path.
 * @param options.sha - Commit to check.
 * @param options.base - Commit to compare with, such as the state of `main` before a
 * push. Defaults to the first parent of `sha`; an all-zero SHA (a new branch) also
 * falls back to it.
 * @returns Released packages, sorted by name.
 * @throws If a public `package.json` has no string `name` or `version`.
 */
export function listReleasedPackages(options: {
  repo: string;
  sha: string;
  base?: string;
}): PackageIdentity[] {
  const { repo, sha } = options;
  const base =
    options.base && !/^0+$/.test(options.base) ? options.base : `${sha}^`;
  const [
    before = new Map<string, PackageIdentity>(),
    after = new Map<string, PackageIdentity>(),
  ] = [base, sha].map((revision) => {
    const versions = new Map<string, PackageIdentity>();
    // Only manifests that exist are read, so any git failure is a real error.
    const paths = execFileSync(
      "git",
      [
        "-C",
        repo,
        "ls-tree",
        "-r",
        "-z",
        "--name-only",
        revision,
        "--",
        "packages",
      ],
      { encoding: "utf8" },
    )
      .split("\0")
      .filter((path) => /^packages\/[^/]+\/package\.json$/.test(path));
    for (const path of paths) {
      const manifest: unknown = JSON.parse(
        execFileSync("git", ["-C", repo, "show", `${revision}:${path}`], {
          encoding: "utf8",
        }),
      );
      // Throws on an incomplete public manifest, like listPublicPackages, or a
      // release could go undetected and skip the gates.
      const identity = publicIdentity(manifest);
      if (identity) versions.set(path, identity);
    }
    return versions;
  });
  return (
    [...after]
      // A rename at an unchanged version is a new npm package too.
      .filter(([path, pkg]) => {
        const previous = before.get(path);
        return previous?.name !== pkg.name || previous.version !== pkg.version;
      })
      .map(([, pkg]) => pkg)
      .sort((a, b) => a.name.localeCompare(b.name))
  );
}

/**
 * Formats the `$GITHUB_OUTPUT` lines the public-snapshot jobs gate on.
 *
 * @param released - Released packages.
 * @returns `released=<bool>` and `packages=<json>` lines.
 */
export function formatGithubOutput(released: readonly PackageIdentity[]) {
  return `released=${released.length > 0}\npackages=${JSON.stringify(released)}\n`;
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      sha: { type: "string" },
      base: { type: "string" },
      repo: { type: "string", default: "." },
    },
  });
  if (!values.sha) {
    throw new Error(
      "Usage: detect-release.ts --sha <SHA> [--base <SHA>] [--repo <path>]",
    );
  }
  const released = listReleasedPackages({
    repo: values.repo,
    sha: values.sha,
    base: values.base,
  });
  for (const { name, version } of released) console.log(`${name}@${version}`);
  if (released.length === 0) console.log("Not a release commit.");
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, formatGithubOutput(released));
  }
}
