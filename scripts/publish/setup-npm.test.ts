import { createHash } from "node:crypto";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { main, verifyNpmArchive } from "./setup-npm.ts";

describe("verifyNpmArchive", () => {
  test("compares the archive bytes with a fixed digest", () => {
    const bytes = Buffer.from("archive");
    const digest = createHash("sha512").update(bytes).digest("base64");
    expect(() => verifyNpmArchive(bytes, digest)).not.toThrow();
    expect(() => verifyNpmArchive(Buffer.from("tampered"), digest)).toThrow(
      "pinned SHA-512",
    );
    expect(() => verifyNpmArchive(bytes)).toThrow("pinned SHA-512");
  });
});

describe("main", () => {
  test.each(["503", "tampered"])(
    "fails closed on %s before touching the filesystem",
    async (mode) => {
      const root = mkdtempSync(join(tmpdir(), "setup-npm-"));
      const env = {
        RUNNER_TEMP: root,
        GITHUB_ENV: join(root, "env"),
        GITHUB_PATH: join(root, "path"),
      };
      await expect(
        main(env, async (url) => {
          expect(url).toBe("https://registry.npmjs.org/npm/-/npm-11.21.0.tgz");
          return new Response("tampered", {
            status: mode === "503" ? 503 : 200,
          });
        }),
      ).rejects.toThrow(mode === "503" ? "returned 503" : "pinned SHA-512");
      expect(existsSync(join(root, "release-npm"))).toBe(false);
      expect(existsSync(env.GITHUB_ENV)).toBe(false);
      expect(existsSync(env.GITHUB_PATH)).toBe(false);
    },
  );

  test("requires Actions paths before downloading", async () => {
    await expect(main({})).rejects.toThrow("RUNNER_TEMP");
  });
});
