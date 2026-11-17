import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { version } from "./index.js";

test("root exports the installed package version", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version: string };
  expect(version).toBe(manifest.version);
});
