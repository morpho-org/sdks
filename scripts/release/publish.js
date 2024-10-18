import { setOutput } from "@actions/core";
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

  setOutput("tag", newTag);
  setOutput("version", newVersion);
  setOutput("channel", channel);
  setOutput(
    "changelog",
    await writeChangelogString(
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
  );
}

process.exit(0); // Sometimes hangs.
