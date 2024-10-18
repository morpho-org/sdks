import { spawnSync } from "node:child_process";
import { basename } from "node:path";
import { Bumper } from "conventional-recommended-bump";
import { inc } from "semver";

const prefix = `@morpho-org/${basename(process.cwd())}-`;
const bumper = new Bumper().tag({ prefix }).commits({ path: "." });

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

const [branch, version] = await Promise.all([
  bumper.gitClient.getCurrentBranch(),
  bumper.gitClient.getVersionFromTags({ prefix }),
]);

if (!version) {
  console.error("Cannot find version from tags");
  process.exit(1);
}

if (releaseType) {
  if (branch !== "main") releaseType = "prerelease";

  const newVersion = inc(
    version,
    releaseType,
    branch !== "main" ? branch : undefined,
    "0",
  );

  console.debug(
    `Version bump from ${version} to ${newVersion} on branch ${branch} (release type: ${releaseType})`,
  );

  let { stderr, stdout, error } = spawnSync("pnpm", ["version", newVersion], {
    encoding: "utf8",
  });
  if (error) console.error(error);
  if (stderr) console.error(stderr);
  if (stdout) console.log(stdout);

  ({ stderr, stdout, error } = spawnSync(
    "pnpm",
    [
      "publish",
      "--no-git-checks",
      "--access",
      "public",
      "--tag",
      branch !== "main" ? branch : "latest",
    ],
    { encoding: "utf8" },
  ));
  if (error) console.error(error);
  if (stderr) console.error(stderr);
  if (stdout) console.log(stdout);

  const tag = `${prefix}v${version}`;
  const newTag = `${prefix}v${newVersion}`;

  process.exit(1);

  const notesReq = await fetch(
    "https://api.github.com/repos/morpho-org/sdks/releases/generate-notes",
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        tag_name: newTag,
        target_commitish: branch,
        previous_tag_name: tag,
      }),
    },
  );

  const notes = await notesReq.json();
  if (!notesReq.ok) {
    console.error(notes);
    process.exit(1);
  }

  const createReq = await fetch(
    "https://api.github.com/repos/morpho-org/sdks/releases",
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        ...notes,
        tag_name: newTag,
        target_commitish: branch,
        prerelease: branch !== "main",
        draft: false,
      }),
    },
  );

  if (!createReq.ok) {
    console.error(await createReq.json());
    process.exit(1);
  }
} else console.debug(`No version bump from ${version} on branch ${branch}`);

process.exit(0);
