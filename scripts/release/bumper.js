import { basename } from "node:path";
import createPreset from "conventional-changelog-conventionalcommits";
import { Bumper } from "conventional-recommended-bump";
import { gt, inc } from "semver";

export const { commits: commitOpts, parser, writer } = createPreset();

export const packageName = `@morpho-org/${basename(process.cwd())}`;
export const prefix = `${packageName}-`;
export const bumper = new Bumper()
  .tag({ prefix })
  .commits({ ...commitOpts, path: "." }, parser);

export let commits;

export const whatBump = async (_commits) => {
  commits = _commits;

  console.log(commits);

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

export const [branch, lastVersion] = await Promise.all([
  bumper.gitClient.getCurrentBranch(),
  bumper.gitClient.getVersionFromTags({ prefix }),
]);

if (!lastVersion) {
  console.error("Cannot find version from tags");
  process.exit(1);
}

export const lastTag = `${prefix}v${lastVersion}`;
export const channel = branch !== "main" ? branch : "latest";

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
    gt(lastVersion, npmVersion) ? lastVersion : npmVersion,
    releaseType,
    branch !== "main" ? branch : undefined,
    "0",
  );
}

export { releaseType, version };
