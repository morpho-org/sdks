import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const GATE = join(SCRIPTS_DIR, "claude-review-gate.ts");
const SCRUB = join(SCRIPTS_DIR, "scrub-transcript.ts");
const TRUSTED = join(SCRIPTS_DIR, "trusted-scripts.ts");
const POST_CLAUDE = join(SCRIPTS_DIR, "post-claude.ts");

function run(argv: readonly string[], env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [...argv], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "ci-cli-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
}

describe("entry guard", () => {
  test("behavior: a symlinked invocation path still runs main (exits 1 on unknown mode)", () => {
    withTempDir((dir) => {
      const link = join(dir, "scripts-link");
      symlinkSync(SCRIPTS_DIR, link);
      const result = run([join(link, "post-claude.ts"), "nope"], {});

      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/^::error::Unknown mode "nope"/);
    });
  });
});

describe("claude-review-gate CLI", () => {
  test("error: verify with unwired MAX_ID_BEFORE exits 1 with a sanitized annotation", () => {
    const result = run([GATE, "verify"], {
      GH_TOKEN: "ghs_test",
      GITHUB_REPOSITORY: "morpho-org/sdks",
      GITHUB_RUN_ID: "1",
      HEAD_SHA: "abc",
      MAX_ID_BEFORE: "",
      PR_NUMBER: "1",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/^::error::Missing MAX_ID_BEFORE/);
  });

  test("error: unknown mode exits 1", () => {
    const result = run([GATE, "nope"], {});

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/^::error::Unknown mode "nope"/);
  });
});

describe("scrub-transcript CLI", () => {
  test("default: writes the scrubbed file and the path step output, exits 0", () => {
    withTempDir((dir) => {
      const input = join(dir, "in.json");
      const output = join(dir, "out.json");
      const githubOutput = join(dir, "github-output");
      writeFileSync(input, '{"Authorization":"Bearer super-secret"}');

      const result = run([SCRUB, input, output], {
        GITHUB_OUTPUT: githubOutput,
        RUNNER_TEMP: dir,
        SECRET_VALUES: "super-secret\n",
      });

      expect(result.status).toBe(0);
      expect(readFileSync(output, "utf8")).not.toContain("super-secret");
      expect(readFileSync(githubOutput, "utf8")).toBe(`path=${output}\n`);
    });
  });

  test("error: unset SECRET_VALUES exits 1 with a sanitized annotation", () => {
    withTempDir((dir) => {
      const input = join(dir, "in.json");
      writeFileSync(input, "plain");
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        GITHUB_OUTPUT: join(dir, "github-output"),
        RUNNER_TEMP: dir,
      };
      delete env.SECRET_VALUES;

      const result = spawnSync(
        process.execPath,
        [SCRUB, input, join(dir, "out.json")],
        { encoding: "utf8", env },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/^::error::.*SECRET_VALUES/);
    });
  });
});

describe("trusted-scripts CLI", () => {
  test("error: verify against a mismatched digest exits 1 with a sanitized annotation", () => {
    withTempDir((dir) => {
      writeFileSync(join(dir, "a.ts"), "a");

      const result = run([TRUSTED, "verify", dir, "0".repeat(64)], {});

      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(
        /^::error::Trusted scripts in .* were modified after the snapshot/,
      );
    });
  });

  test("default: snapshot then verify exits 0", () => {
    withTempDir((dir) => {
      const src = join(dir, "src");
      mkdirSync(src);
      writeFileSync(join(src, "a.ts"), "a");
      const githubOutput = join(dir, "github-output");
      const dest = join(dir, "dest");

      const snap = run([TRUSTED, "snapshot", src, dest], {
        GITHUB_OUTPUT: githubOutput,
      });
      expect(snap.status, snap.stderr).toBe(0);
      const digest = readFileSync(githubOutput, "utf8").match(
        /^digest=(.*)$/m,
      )?.[1];
      if (digest == null) throw new Error("digest output missing");

      const result = run([TRUSTED, "verify", dest, digest], {});
      expect(result.status, result.stderr).toBe(0);
    });
  });
});

describe("post-claude CLI", () => {
  test("error: unknown mode exits 1 without touching the environment", () => {
    const result = run([POST_CLAUDE, "nope"], {});

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/^::error::Unknown mode "nope"/);
  });

  test("default: scrub runs the trusted check then the scrubber, exits 0", () => {
    withTempDir((dir) => {
      const trusted = join(dir, "trusted");
      mkdirSync(trusted);
      writeFileSync(join(trusted, "a.ts"), "a");
      const snapOutput = join(dir, "snap-output");
      const dest = join(dir, "dest");
      const snap = run([TRUSTED, "snapshot", trusted, dest], {
        GITHUB_OUTPUT: snapOutput,
      });
      expect(snap.status, snap.stderr).toBe(0);
      const digest = readFileSync(snapOutput, "utf8").match(
        /^digest=(.*)$/m,
      )?.[1];
      if (digest == null) throw new Error("digest output missing");

      const input = join(dir, "execution.json");
      writeFileSync(input, "Authorization: Bearer abc");
      const output = join(dir, "scrubbed.json");
      const githubOutput = join(dir, "github-output");
      const result = run([POST_CLAUDE, "scrub", input, output], {
        GITHUB_OUTPUT: githubOutput,
        RUNNER_TEMP: dir,
        SCRIPTS_DIGEST: digest,
        SECRET_VALUES: "",
        TRUSTED_SCRIPTS_DIR: dest,
      });

      expect(result.status, result.stderr).toBe(0);
      expect(readFileSync(output, "utf8")).toBe("Authorization: Bearer ***");
      expect(readFileSync(githubOutput, "utf8")).toBe(`path=${output}\n`);
    });
  });
});
