import { basename } from "node:path";
import { ConventionalGitClient } from "@conventional-changelog/git-client";
import createPreset from "conventional-changelog-conventionalcommits";
import { Bumper } from "conventional-recommended-bump";
import { gt, inc } from "semver";

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

export const packageName = `@morpho-org/${basename(process.cwd())}`;
export const tagParams = {
  prefix: `${packageName}-`,
  skipUnstable: branch === "main",
};

export const lastVersion = await git.getVersionFromTags(tagParams);

if (!lastVersion) {
  console.error("Cannot find version from tags");
  process.exit(1);
}

export const lastTag = `${tagParams.prefix}v${lastVersion}`;
export const channel = branch !== "main" ? branch : "latest";

export const bumper = new Bumper(git)
  .tag(tagParams)
  .commits({ ...commitOpts, path: "." }, parser);

let { releaseType } = await bumper.bump(whatBump);

let version = lastVersion;
if (releaseType) {
  if (branch !== "main") releaseType = "prerelease";

  const npmReq = await fetch(
    `https://registry.npmjs.org/${packageName}/${channel}`,
  );
  const npmPackage = await npmReq.json();
  const npmVersion = npmPackage.version;

  version = inc(
    npmVersion == null || gt(lastVersion, npmVersion)
      ? lastVersion
      : npmVersion,
    releaseType,
    branch !== "main" ? branch : undefined,
    "0",
  );
}

console.log(version, lastVersion, releaseType);

export { releaseType, version };
