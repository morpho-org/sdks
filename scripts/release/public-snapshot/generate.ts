import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { parseArgs } from "node:util";

/** Path of the allowlist, read from the release commit itself. */
export const ALLOWLIST_PATH = "scripts/release/public-snapshot/allowlist.json";

/** Directory whose files are copied to the same path without the prefix. */
const PUBLIC_PREFIX = "public/";

const DENIED_PREFIXES = [
  ".github/",
  ".agents/",
  ".claude/",
  ".codex/",
  ".review/",
  ".changeset/",
  "scripts/release/",
  "scripts/ci/",
  "docs/retros/",
  "docs/templates/",
] as const;

/** Lowercase, like {@link DENIED_PREFIXES}: denials ignore case. */
const DENIED_NAMES = new Set(["agents.md", "claude.md"]);

const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

interface TreeEntry {
  mode: string;
  sha: string;
  path: string;
}

interface PublicTreeFile {
  readonly path: string;
  readonly mode: "100644" | "100755" | "120000";
  readonly sha256: string;
}

type DependencyMaps = Partial<
  Record<(typeof DEPENDENCY_FIELDS)[number], Readonly<Record<string, string>>>
>;

type PackageManifest = { readonly name: string } & DependencyMaps;

/** Content of `public-tree.json`. */
export interface PublicTreeManifest {
  readonly sourceCommit: string;
  readonly treeHash: string;
  readonly files: readonly PublicTreeFile[];
}

/**
 * Returns whether a source path can never be public, whatever the allowlist says.
 *
 * @param path - Repository-relative POSIX path.
 * @returns Whether the path is hard-denied.
 */
export function isDenied(path: string): boolean {
  const name = posix.basename(path).toLowerCase();
  if (DENIED_NAMES.has(name)) return true;
  if (name.startsWith(".env") && name !== ".env.example") return true;
  const lowerPath = path.toLowerCase();
  return DENIED_PREFIXES.some((prefix) => lowerPath.startsWith(prefix));
}

function git(repo: string, args: string[]): Buffer {
  return execFileSync("git", ["-C", repo, ...args], {
    maxBuffer: 1 << 30,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/**
 * Generates the public tree of a commit, read from git objects only.
 *
 * Selects allowlisted paths minus hard-denied ones, plus `public/` files mapped to
 * their path without the prefix. Writes them under `<outDir>/tree` (regular files
 * normalised to 644/755, in-tree symlinks kept as 120000), and
 * `<outDir>/public-tree.json` with every file's mode and SHA-256 plus the git tree hash.
 *
 * @param options.repo - Path of the internal repository.
 * @param options.sha - Release commit to snapshot.
 * @param options.outDir - Output directory; must not exist or be empty.
 * @returns The manifest written to `public-tree.json`.
 * @throws If `sha` or the allowlist can't be read, the allowlist is malformed, an
 *   allowlist entry selects nothing, a `public/` file maps to a hard-denied or
 *   already-selected path, a path has control characters, an entry is a submodule,
 *   a selected file is also the parent directory of another one, a symlink leaves the
 *   tree, a package manifest has no name or a malformed dependency field, a public package has a
 *   `workspace:` dependency on a private one, or `outDir` is not empty.
 */
export function generatePublicSnapshot(options: {
  repo: string;
  sha: string;
  outDir: string;
}): PublicTreeManifest {
  const { repo, outDir } = options;
  const sha = git(repo, [
    "rev-parse",
    "--verify",
    "--end-of-options",
    `${options.sha}^{commit}`,
  ])
    .toString()
    .trim();
  const allowlist: unknown = JSON.parse(
    git(repo, ["show", `${sha}:${ALLOWLIST_PATH}`]).toString(),
  );
  if (
    typeof allowlist !== "object" ||
    allowlist === null ||
    !("include" in allowlist) ||
    !Array.isArray(allowlist.include) ||
    allowlist.include.length === 0 ||
    !allowlist.include.every(
      (pattern: unknown) => typeof pattern === "string" && pattern !== "",
    )
  ) {
    throw new Error(
      `"${ALLOWLIST_PATH}" at ${sha} must have a non-empty "include" array of globs.`,
    );
  }
  const include: readonly string[] = allowlist.include;

  const entries = git(repo, ["ls-tree", "-r", "-z", "--full-tree", sha])
    .toString()
    .split("\0")
    .filter(Boolean)
    .map((line): TreeEntry => {
      const tab = line.indexOf("\t");
      const [mode = "", , objectSha = ""] = line.slice(0, tab).split(" ");
      return { mode, sha: objectSha, path: line.slice(tab + 1) };
    });

  const chosen = new Map<string, TreeEntry>();
  for (const pattern of include) {
    const matches = entries.filter(
      (entry) =>
        !entry.path.startsWith(PUBLIC_PREFIX) &&
        !isDenied(entry.path) &&
        posix.matchesGlob(entry.path, pattern),
    );
    if (matches.length === 0) {
      throw new Error(
        `Allowlist entry "${pattern}" matches no public file. Remove it, or check that it doesn't name a hard-denied path.`,
      );
    }
    for (const entry of matches) chosen.set(entry.path, entry);
  }
  for (const entry of entries) {
    if (!entry.path.startsWith(PUBLIC_PREFIX)) continue;
    const target = entry.path.slice(PUBLIC_PREFIX.length);
    // Public workflows live under `public/.github/`; only their file names are checked.
    const deniedTarget = target.toLowerCase().startsWith(".github/")
      ? isDenied(posix.basename(target))
      : isDenied(target);
    if (deniedTarget) {
      throw new Error(
        `"${entry.path}" maps to "${target}", which is hard-denied. Remove it from public/.`,
      );
    }
    if (chosen.has(target)) {
      throw new Error(
        `"${entry.path}" maps to "${target}", which the allowlist already selects. Keep only one.`,
      );
    }
    chosen.set(target, { ...entry, path: target });
  }
  for (const entry of chosen.values()) {
    if (entry.mode === "160000") {
      throw new Error(
        `"${entry.path}" is a submodule. Submodules can't be public.`,
      );
    }
    if (
      [...entry.path].some((char) => {
        const code = char.charCodeAt(0);
        return code < 0x20 || code === 0x7f;
      })
    ) {
      throw new Error(
        `"${JSON.stringify(entry.path)}" has a control character. Rename it before release.`,
      );
    }
  }
  const selected = [...chosen.values()].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );

  const paths = new Set(selected.map((entry) => entry.path));
  for (const { path } of selected) {
    for (
      let parent = posix.dirname(path);
      parent !== ".";
      parent = posix.dirname(parent)
    ) {
      if (paths.has(parent)) {
        throw new Error(
          `"${parent}" is a file in the public tree, but "${path}" needs it to be a directory. Keep only one.`,
        );
      }
    }
  }

  const blobs = new Map<string, Buffer>();
  const shas = [...new Set(selected.map((entry) => entry.sha))];
  const batch =
    shas.length === 0
      ? Buffer.alloc(0)
      : execFileSync("git", ["-C", repo, "cat-file", "--batch"], {
          input: `${shas.join("\n")}\n`,
          maxBuffer: 1 << 30,
        });
  let offset = 0;
  while (offset < batch.length) {
    const headerEnd = batch.indexOf(0x0a, offset);
    const [blobSha, type, size] = batch
      .subarray(offset, headerEnd)
      .toString()
      .split(" ");
    if (type !== "blob" || blobSha == null || size == null) {
      throw new Error(
        `Expected a blob, got "${batch.subarray(offset, headerEnd)}".`,
      );
    }
    const start = headerEnd + 1;
    blobs.set(blobSha, batch.subarray(start, start + Number(size)));
    offset = start + Number(size) + 1;
  }

  const files = selected.map((entry): PublicTreeFile & { content: Buffer } => {
    const content = blobs.get(entry.sha);
    if (content == null) {
      throw new Error(`git cat-file returned no blob for "${entry.path}".`);
    }
    if (entry.mode === "120000") {
      const target = posix.normalize(
        posix.join(posix.dirname(entry.path), content.toString()),
      );
      if (posix.isAbsolute(content.toString()) || !paths.has(target)) {
        throw new Error(
          `Symlink "${entry.path}" points to "${content}", which is outside the public tree.`,
        );
      }
    }
    return {
      path: entry.path,
      mode:
        entry.mode === "120000"
          ? "120000"
          : entry.mode === "100755"
            ? "100755"
            : "100644",
      sha256: createHash("sha256").update(content).digest("hex"),
      content,
    };
  });

  const packageNames = new Map<string, PackageManifest>();
  for (const file of files) {
    if (!/^packages\/[^/]+\/package\.json$/.test(file.path)) continue;
    const parsed: unknown = JSON.parse(file.content.toString());
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("name" in parsed) ||
      typeof parsed.name !== "string"
    ) {
      throw new Error(`"${file.path}" has no package name.`);
    }
    const dependencies: DependencyMaps = {};
    for (const field of DEPENDENCY_FIELDS) {
      const value: unknown = Reflect.get(parsed, field);
      if (value === undefined) continue;
      const malformed = new Error(
        `"${file.path}" has a malformed "${field}". It must map package names to version ranges.`,
      );
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw malformed;
      }
      const ranges: Record<string, string> = {};
      for (const [name, range] of Object.entries(value)) {
        if (typeof range !== "string") throw malformed;
        ranges[name] = range;
      }
      dependencies[field] = ranges;
    }
    packageNames.set(file.path, { ...dependencies, name: parsed.name });
  }
  const publicNames = new Set(
    [...packageNames.values()].map(({ name }) => name),
  );
  for (const manifest of packageNames.values()) {
    for (const field of DEPENDENCY_FIELDS) {
      for (const [name, range] of Object.entries(manifest[field] ?? {})) {
        if (range.startsWith("workspace:") && !publicNames.has(name)) {
          throw new Error(
            `"${manifest.name}" depends on "${name}", which isn't in the public tree.`,
          );
        }
      }
    }
  }

  const indexDir = mkdtempSync(join(tmpdir(), "public-snapshot-"));
  let treeHash: string;
  try {
    const env = { ...process.env, GIT_INDEX_FILE: join(indexDir, "index") };
    const info = selected
      .map((entry, i) => `${files[i]?.mode} ${entry.sha}\t${entry.path}`)
      .join("\0");
    // `-z` takes paths verbatim; newline records would C-unquote a leading `"`.
    execFileSync(
      "git",
      ["-C", repo, "update-index", "-z", "--add", "--index-info"],
      {
        env,
        input: `${info}\0`,
      },
    );
    treeHash = execFileSync("git", ["-C", repo, "write-tree"], { env })
      .toString()
      .trim();
  } finally {
    rmSync(indexDir, { recursive: true, force: true });
  }

  if (existsSync(outDir) && readdirSync(outDir).length > 0) {
    throw new Error(`Output directory "${outDir}" is not empty.`);
  }
  const treeDir = join(outDir, "tree");
  for (const file of files) {
    const target = join(treeDir, file.path);
    mkdirSync(dirname(target), { recursive: true });
    if (file.mode === "120000") {
      symlinkSync(file.content.toString(), target);
      continue;
    }
    writeFileSync(target, file.content);
    chmodSync(target, file.mode === "100755" ? 0o755 : 0o644);
  }

  const manifest: PublicTreeManifest = {
    sourceCommit: sha,
    treeHash,
    files: files.map(({ path, mode, sha256 }) => ({ path, mode, sha256 })),
  };
  writeFileSync(
    join(outDir, "public-tree.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      sha: { type: "string" },
      out: { type: "string" },
      repo: { type: "string", default: "." },
    },
  });
  if (!values.sha || !values.out) {
    throw new Error(
      "Usage: generate.ts --sha <RELEASE_SHA> --out <dir> [--repo <path>]",
    );
  }
  const manifest = generatePublicSnapshot({
    repo: values.repo,
    sha: values.sha,
    outDir: values.out,
  });
  console.log(
    `Public tree ${manifest.treeHash}: ${manifest.files.length} files from ${manifest.sourceCommit}.`,
  );
}
