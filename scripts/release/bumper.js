import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { ConventionalGitClient } from "@conventional-changelog/git-client";
import createPreset from "conventional-changelog-conventionalcommits";
import { Bumper } from "conventional-recommended-bump";

export const { commits: commitOpts, parser, writer } = createPreset();

export let commits;

export const whatBump = async (_commits) => {
  commits = _commits;

  if (commits.length === 0) return;

  let level = 2;

  commits.forEach((commit) => {
    if (commit.notes.length > 0) level = 0;
    else if (
      level === 2 &&
      (commit.type === "feat" || commit.type === "feature")
    )
      level = 1;
  });

  return { level };
};

export const git = new ConventionalGitClient();
export const branch = await git.getCurrentBranch();
export const channel = branch !== "main" ? branch : "latest";

const shortName = basename(process.cwd());
export const packageName = `@gfxlabs/${shortName}`;

export const tagParams = {
  prefix: `${packageName}-`,
  skipUnstable: branch === "main",
};

// Read the base version from the local package.json.
// This is manually bumped when syncing with upstream.
const pkgJson = JSON.parse(readFileSync("package.json", "utf8"));
const localVersion = pkgJson.version; // e.g. "2.0.0-1"

// Parse local version: "<base>-<N>" e.g. "2.0.0-1" -> base "2.0.0", suffix 1
const match = localVersion.match(/^(.+)-(\d+)$/);
const base = match ? match[1] : localVersion;
const currentSuffix = match ? Number.parseInt(match[2], 10) : 0;

// Fetch our fork's latest published version for this channel.
const forkChannelVersion = await fetch(
  `https://registry.npmjs.org/${packageName}/${channel}`,
)
  .then((res) => res.json())
  .then((data) => data.version)
  .catch(() => null);

export const lastTag =
  forkChannelVersion != null
    ? `${tagParams.prefix}v${forkChannelVersion}`
    : null;

// Check if there are new commits to release.
const bumper = new Bumper(git)
  .tag(tagParams)
  .commits({ ...commitOpts, path: "." }, parser);

let { releaseType } = await bumper.bump(whatBump);

/**
 * Fork versioning scheme: <base>-<N>
 *
 * The base version (e.g. "2.0.0") is set manually in package.json when
 * syncing with upstream. The suffix N is auto-incremented on each release.
 *
 * - If we have never published, use the version from package.json as-is.
 * - If the base in package.json differs from what's published, the base
 *   was bumped manually after an upstream sync -- reset to <base>-1.
 * - Otherwise increment the fork suffix: <base>-<N+1>.
 * - Only publish when there are new commits (releaseType != null) OR
 *   when there is no prior fork release at all.
 */

let version;

if (forkChannelVersion == null) {
  // First ever release -- use local version as-is.
  version = localVersion;
  releaseType = releaseType ?? "patch"; // Ensure we trigger a release.
} else if (releaseType != null) {
  // Parse the published fork version.
  const pubMatch = forkChannelVersion.match(/^(.+)-(\d+)$/);
  const publishedBase = pubMatch ? pubMatch[1] : forkChannelVersion;
  const publishedSuffix = pubMatch ? Number.parseInt(pubMatch[2], 10) : 0;

  if (base !== publishedBase) {
    // Base was bumped (upstream sync) -- reset suffix.
    version = `${base}-1`;
  } else {
    // Same base -- increment suffix from the higher of local or published.
    const nextSuffix = Math.max(currentSuffix, publishedSuffix) + 1;
    version = `${base}-${nextSuffix}`;
  }
}

if (!version) {
  console.error(`No new release needed for ${packageName}`);
  process.exit(0);
}

export { releaseType, version };
