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
export const channel = branch !== "main" ? branch : "latest";

export const packageName = `@morpho-org/${basename(process.cwd())}`;
export const tagParams = {
  prefix: `${packageName}-`,
  skipUnstable: branch === "main",
};

let [{ version }, { version: channelVersion }] = await Promise.all([
  fetch(`https://registry.npmjs.org/${packageName}/latest`)
    .then((res) => res.json())
    .catch(() => ({})),
  fetch(`https://registry.npmjs.org/${packageName}/${channel}`)
    .then((res) => res.json())
    .catch(() => ({})),
]);

export const lastTag =
  channelVersion != null ? `${tagParams.prefix}v${channelVersion}` : null;

const bumper = new Bumper(git)
  .tag(tagParams)
  .commits({ ...commitOpts, path: "." }, parser);

let { releaseType } = await bumper.bump(whatBump);

if (channelVersion == null)
  version = branch === "main" ? "1.0.0" : `1.0.0-${channel}.0`;
else if (releaseType != null) {
  if (branch === "main") version = inc(version, releaseType);
  else {
    const { releaseType: mainReleaseType } = await bumper
      .tag({ ...tagParams, skipUnstable: true })
      .bump(whatBump);

    releaseType = `pre${mainReleaseType}`;
    version = inc(version, mainReleaseType, branch, "0");

    const newChannelVersion = inc(channelVersion, "prerelease", branch, "0");
    if (gt(newChannelVersion, version)) {
      releaseType = "prerelease";
      version = newChannelVersion;
    }
  }
}

if (!version) {
  console.error(`Cannot determine version for ${packageName}`);
  process.exit(1);
}

export { releaseType, version };
