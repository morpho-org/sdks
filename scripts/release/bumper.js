import { basename } from "node:path";
import { Bumper } from "conventional-recommended-bump";

export const prefix = `@morpho-org/${basename(process.cwd())}-`;
export const bumper = new Bumper().tag({ prefix }).commits({ path: "." });

export const whatBump = (commits) => {
  if (commits.length === 0) return;

  let level = 2;

  commits.forEach((commit) => {
    if (commit.notes.length > 0) {
      level = 0;
    } else if (commit.type === "feat") {
      if (level === 2) {
        level = 1;
      }
    }
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
