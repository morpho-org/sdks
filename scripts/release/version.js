import { version } from "./bumper.js";

const { stdout } = spawnSync("pnpm", ["version", version], {
  encoding: "utf8",
});

if (stdout) console.log(stdout); // Ignore versioning errors.
