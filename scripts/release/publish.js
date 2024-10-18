import { spawnSync } from "node:child_process";
import { writeChangelogString } from "conventional-changelog-writer";
import { gt, inc } from "semver";
import {
  branch,
  bumper,
  channel,
  commits,
  packageName,
  prefix,
  tag,
  version,
  whatBump,
  writer,
} from "./bumper.js";

let { releaseType } = await bumper.bump(whatBump);

if (releaseType) {
  if (branch !== "main") releaseType = "prerelease";

  const npmReq = await fetch(
    `https://registry.npmjs.org/${packageName}/${channel}`,
  );
  const npmPackage = await npmReq.json();
  const npmVersion = npmPackage.version;

  const newVersion = inc(
    gt(version, npmVersion) ? version : npmVersion,
    releaseType,
    branch !== "main" ? branch : undefined,
    "0",
  );

  const newTag = `${prefix}v${newVersion}`;

  console.debug(
    `Version bump from ${version} to ${newVersion} on branch ${branch} (release type: ${releaseType})`,
  );

  let { stderr, stdout, error } = spawnSync("pnpm", ["version", newVersion], {
    encoding: "utf8",
  });
  if (stdout) console.log(stdout); // Ignore versioning errors.
  if (error) console.log("pnpm version error:", error);
  if (stderr) console.log(stderr);

  console.debug(`Publish version ${newVersion} on channel ${channel}`);

  ({ stderr, stdout, error } = spawnSync(
    "pnpm",
    ["publish", "--no-git-checks", "--access", "public", "--tag", channel],
    { encoding: "utf8" },
  ));
  if (stdout) console.log(stdout);
  if (error) {
    console.error("pnpm publish error:", error);
    process.exit(1);
  }
  if (stderr) {
    console.error(stderr);
    process.exit(1);
  }

  console.debug(`Create release ${newTag}`);

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
        name: newTag,
        body: await writeChangelogString(
          commits,
          {
            version: `[${newTag}](https://github.com/morpho-org/sdks/compare/${tag}...${newTag})`,
            host: "https://github.com",
            owner: "morpho-org",
            repository: "sdks",
            commit: "commit",
            types: [
              { type: "feat", section: "Features" },
              { type: "fix", section: "Bug Fixes" },
              { type: "chore", hidden: true },
              { type: "docs", hidden: true },
              { type: "style", hidden: true },
              { type: "refactor", hidden: true },
              { type: "perf", hidden: true },
              { type: "test", hidden: true },
            ],
          },
          writer,
        ),
        tag_name: newTag,
        target_commitish: branch,
        prerelease: branch !== "main",
        draft: false,
      }),
    },
  );

  if (!createReq.ok) {
    console.error("github release error:", await createReq.text());
    process.exit(1);
  }
} else console.debug(`No version bump from ${version} on branch ${branch}`);

process.exit(0); // Sometimes hangs.
