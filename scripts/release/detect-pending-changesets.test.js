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
  main,
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

  test("behavior: skips directories and non-markdown files", () => {
    const root = createTempDir();
    const changesetDir = join(root, ".changeset");
    mkdirSync(changesetDir);
    mkdirSync(join(changesetDir, "nested.md"));
    writeFileSync(join(changesetDir, "alpha.md"), "---\n");
    writeFileSync(join(changesetDir, "notes.txt"), "ignored\n");

    expect(listPendingChangesets({ changesetDir })).toEqual([
      join(changesetDir, "alpha.md"),
    ]);
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
    const writeOutput = vi.fn();
    mkdirSync(changesetDir);
    writeFileSync(join(changesetDir, "alpha.md"), "---\n");

    expect(
      reportPendingChangesets({ changesetDir, outputFile, writeOutput }),
    ).toEqual([join(changesetDir, "alpha.md")]);
    expect(readFileSync(outputFile, "utf8")).toBe("has_changesets=true\n");
    expect(writeOutput).toHaveBeenCalledWith("Pending changesets:\n");
    expect(writeOutput).toHaveBeenCalledWith(
      `${join(changesetDir, "alpha.md")}\n`,
    );
  });

  test("behavior: sanitizes logged changeset filenames", () => {
    const root = createTempDir();
    const changesetDir = join(root, ".changeset");
    const outputFile = join(root, "github-output.txt");
    const writeOutput = vi.fn();
    mkdirSync(changesetDir);
    writeFileSync(join(changesetDir, "\n::add-mask::secret\t.md"), "---\n");

    expect(
      reportPendingChangesets({ changesetDir, outputFile, writeOutput }),
    ).toEqual([join(changesetDir, "\n::add-mask::secret\t.md")]);
    expect(writeOutput).toHaveBeenCalledWith("Pending changesets:\n");
    expect(writeOutput).toHaveBeenCalledWith(
      `${join(changesetDir, "?::add-mask::secret?.md")}\n`,
    );
  });

  test("behavior: skips output and logs when there are no changesets", () => {
    const root = createTempDir();
    const changesetDir = join(root, ".changeset");
    const writeOutput = vi.fn();
    mkdirSync(changesetDir);

    expect(reportPendingChangesets({ changesetDir, writeOutput })).toEqual([]);
    expect(writeOutput).not.toHaveBeenCalled();
  });

  test("behavior: logs without writing an empty output file path", () => {
    const root = createTempDir();
    const changesetDir = join(root, ".changeset");
    const writeOutput = vi.fn();
    mkdirSync(changesetDir);
    writeFileSync(join(changesetDir, "alpha.md"), "---\n");

    expect(
      reportPendingChangesets({
        changesetDir,
        outputFile: "",
        writeOutput,
      }),
    ).toEqual([join(changesetDir, "alpha.md")]);
    expect(writeOutput).toHaveBeenCalledWith("Pending changesets:\n");
  });
});

describe("main", () => {
  test("default", () => {
    const root = createTempDir();
    const changesetDir = join(root, ".changeset");
    const outputFile = join(root, "github-output.txt");
    const writeOutput = vi.fn();
    mkdirSync(changesetDir);
    writeFileSync(join(changesetDir, "alpha.md"), "---\n");

    expect(main({ changesetDir, outputFile, writeOutput })).toEqual([
      join(changesetDir, "alpha.md"),
    ]);
    expect(readFileSync(outputFile, "utf8")).toBe("has_changesets=true\n");
    expect(writeOutput).toHaveBeenCalledWith("Pending changesets:\n");
  });
});

function createTempDir() {
  const tempDir = mkdtempSync(join(tmpdir(), "release-script-"));
  tempDirs.push(tempDir);
  return tempDir;
}
