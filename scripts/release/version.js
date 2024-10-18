import { spawnSync } from "node:child_process";
import { version } from "./bumper.js";

spawnSync("pnpm", ["version", version, "--no-git-tag-version"], {
  encoding: "utf8",
});

process.exit(0); // Sometimes hangs.
