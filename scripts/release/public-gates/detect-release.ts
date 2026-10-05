#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { type PackageIdentity, publicIdentity } from "../../publish/pack.ts";

/**
 * Lists the public packages whose version a commit changes. A commit is a release
 * commit when this is non-empty. The public-snapshot workflow also runs on a manual
 * dispatch from `main`, so a sync must check this list itself rather than trust
 * that an artifact exists.
 *
 * @param options.repo - Repository path.
 * @param options.sha - Commit to check against its first parent.
 * @returns Released packages, sorted by name.
 */
export function listReleasedPackages(options: {
  repo: string;
  sha: string;
}): PackageIdentity[] {
  const { repo, sha } = options;
  const [before = new Map(), after = new Map()] = [`${sha}^`, sha].map(
    (revision) => {
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
        const identity = publicIdentity(manifest);
        if (identity) versions.set(path, identity);
      }
      return versions;
    },
  );
  return [...after]
    .filter(([path, pkg]) => before.get(path)?.version !== pkg.version)
    .map(([, pkg]) => pkg)
    .sort((a, b) => a.name.localeCompare(b.name));
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      sha: { type: "string" },
      repo: { type: "string", default: "." },
    },
  });
  if (!values.sha) {
    throw new Error("Usage: detect-release.ts --sha <SHA> [--repo <path>]");
  }
  const released = listReleasedPackages({ repo: values.repo, sha: values.sha });
  for (const { name, version } of released) console.log(`${name}@${version}`);
  if (released.length === 0) console.log("Not a release commit.");
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `released=${released.length > 0}\npackages=${JSON.stringify(released)}\n`,
    );
  }
}
