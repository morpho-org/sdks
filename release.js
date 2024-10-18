import { execSync } from "node:child_process";
import { basename } from "node:path";
import { Bumper } from "conventional-recommended-bump";

const prefix = `@morpho-org/${basename(process.cwd())}-`;
const bumper = new Bumper().tag({ prefix });

let { releaseType } = await bumper.bump((commits) => {
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
});

if (releaseType) {
  const tag = await bumper.tagGetter();
  const version = tag.replace(prefix, "");

  const branch = await bumper.gitClient.getCurrentBranch();
  if (branch !== "main") releaseType = "prerelease";

  const newVersion = inc(
    version,
    releaseType,
    branch !== "main" ? branch : undefined,
    "0",
  );

  console.log(execSync(`pnpm version ${newVersion}`, { encoding: "utf8" }));

  console.log(
    execSync(
      `pnpm publish --no-git-checks --access public --tag ${branch !== "main" ? branch : "latest"}`,
      { encoding: "utf8" },
    ),
  );

  const newTag = `${prefix}v${newVersion}`;

  console.log(
    execSync(
      `gh release create ${newTag} --title ${newTag} ${branch === "main" ? "--latest" : "--prerelease"} --generate-notes --notes-start-tag ${tag}`,
      { encoding: "utf8" },
    ),
  );
}

process.exit(0);
