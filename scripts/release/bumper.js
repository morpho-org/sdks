import { basename } from "node:path";
import createPreset from "conventional-changelog-conventionalcommits";
import { Bumper } from "conventional-recommended-bump";

export const { commits: commitOpts, parser, writer } = createPreset();

export const prefix = `@morpho-org/${basename(process.cwd())}-`;
export const bumper = new Bumper()
  .tag({ prefix })
  .commits({ ...commitOpts, path: "." }, parser);

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

export const [branch, version] = await Promise.all([
  bumper.gitClient.getCurrentBranch(),
  bumper.gitClient.getVersionFromTags({ prefix }),
]);

if (!version) {
  console.error("Cannot find version from tags");
  process.exit(1);
}

export const tag = `${prefix}v${version}`;
