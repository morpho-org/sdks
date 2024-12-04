import { setOutput } from "@actions/core";
import { writeChangelogString } from "conventional-changelog-writer";
import {
  branch,
  channel,
  commits,
  lastTag,
  prefix,
  releaseType,
  version,
  writer,
} from "./bumper.js";

if (releaseType) {
  const tag = `${prefix}v${version}`;

  setOutput("tag", tag);
  setOutput("version", version);
  setOutput("branch", branch);
  setOutput("channel", channel);
  setOutput(
    "changelog",
    await writeChangelogString(
      commits,
      {
        version: `[${tag}](https://github.com/morpho-org/sdks/compare/${lastTag}...${tag})`,
        host: "https://github.com",
        owner: "morpho-org",
        repository: "sdks",
        commit: "commit",
      },
      writer,
    ),
  );
}

process.exit(0); // Sometimes hangs.