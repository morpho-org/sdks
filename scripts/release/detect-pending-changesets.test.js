import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  getGitHubOutput,
  listPendingChangesets,
  reportPendingChangesets,
} from "./detect-pending-changesets.mjs";

const tempDirs = [];

afterEach(() => {
  vi.restoreAllMocks();

  for (const tempDir of tempDirs.splice(0)) {
    rmSync(tempDir, { force: true, recursive: true });
  }
});

describe("listPendingChangesets", () => {
  test("default", () => {
    const root = createTempDir();
    const changesetDir = join(root, ".changeset");
    mkdirSync(changesetDir);
    writeFileSync(join(changesetDir, "README.md"), "# Changesets\n");
    writeFileSync(join(changesetDir, "alpha.md"), "---\n");
    writeFileSync(join(changesetDir, "beta.md"), "---\n");
    writeFileSync(join(changesetDir, "notes.txt"), "ignored\n");

    expect(listPendingChangesets({ changesetDir })).toEqual([
      join(changesetDir, "alpha.md"),
      join(changesetDir, "beta.md"),
    ]);
  });

  test("behavior: missing changeset directory", () => {
    expect(
      listPendingChangesets({
        changesetDir: join(createTempDir(), ".changeset"),
      }),
    ).toEqual([]);
  });
});

describe("getGitHubOutput", () => {
  test("default", () => {
    expect(getGitHubOutput([".changeset/alpha.md"])).toBe(
      "has_changesets=true\n",
    );
  });

  test("behavior: no pending changesets", () => {
    expect(getGitHubOutput([])).toBe("has_changesets=false\n");
  });
});

describe("reportPendingChangesets", () => {
  test("default", () => {
    const root = createTempDir();
    const changesetDir = join(root, ".changeset");
    const outputFile = join(root, "github-output.txt");
    mkdirSync(changesetDir);
    writeFileSync(join(changesetDir, "alpha.md"), "---\n");
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    expect(reportPendingChangesets({ changesetDir, outputFile })).toEqual([
      join(changesetDir, "alpha.md"),
    ]);
    expect(readFileSync(outputFile, "utf8")).toBe("has_changesets=true\n");
    expect(stdout).toHaveBeenCalledWith("Pending changesets:\n");
    expect(stdout).toHaveBeenCalledWith(`${join(changesetDir, "alpha.md")}\n`);
  });
});

function createTempDir() {
  const tempDir = mkdtempSync(join(tmpdir(), "release-script-"));
  tempDirs.push(tempDir);
  return tempDir;
}
