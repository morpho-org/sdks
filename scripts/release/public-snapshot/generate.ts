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

const DENIED_NAMES = new Set(["AGENTS.md", "CLAUDE.md"]);

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

/** One file of the public tree, as recorded in `public-tree.json`. */
export interface PublicTreeFile {
  readonly path: string;
  readonly mode: "100644" | "100755" | "120000";
  readonly sha256: string;
}

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
  const name = posix.basename(path);
  if (DENIED_NAMES.has(name)) return true;
  if (name.startsWith(".env") && name !== ".env.example") return true;
  return DENIED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function git(repo: string, args: string[]): Buffer {
  return execFileSync("git", ["-C", repo, ...args], {
    maxBuffer: 1 << 30,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function readBlobs(repo: string, shas: readonly string[]): Map<string, Buffer> {
  const blobs = new Map<string, Buffer>();
  if (shas.length === 0) return blobs;
  const output = execFileSync("git", ["-C", repo, "cat-file", "--batch"], {
    input: `${shas.join("\n")}\n`,
    maxBuffer: 1 << 30,
  });
  let offset = 0;
  while (offset < output.length) {
    const headerEnd = output.indexOf(0x0a, offset);
    const [sha, type, size] = output
      .subarray(offset, headerEnd)
      .toString()
      .split(" ");
    if (type !== "blob" || sha == null || size == null) {
      throw new Error(
        `Expected a blob, got "${output.subarray(offset, headerEnd)}".`,
      );
    }
    const start = headerEnd + 1;
    blobs.set(sha, output.subarray(start, start + Number(size)));
    offset = start + Number(size) + 1;
  }
  return blobs;
}

/**
 * Selects the public files of a commit: allowlisted paths minus hard-denied ones, plus
 * `public/` files mapped to their target path.
 *
 * @param entries - Every entry of the commit's tree.
 * @param include - Allowlist globs.
 * @returns The public entries, keyed by output path and sorted.
 * @throws If an allowlist entry selects nothing, a `public/` file collides with an
 *   allowlisted path, or an entry is a submodule.
 */
export function selectPublicEntries(
  entries: readonly TreeEntry[],
  include: readonly string[],
): TreeEntry[] {
  const selected = new Map<string, TreeEntry>();
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
    for (const entry of matches) selected.set(entry.path, entry);
  }
  for (const entry of entries) {
    if (!entry.path.startsWith(PUBLIC_PREFIX) || isDenied(entry.path)) continue;
    const target = entry.path.slice(PUBLIC_PREFIX.length);
    if (selected.has(target)) {
      throw new Error(
        `"${entry.path}" maps to "${target}", which the allowlist already selects. Keep only one.`,
      );
    }
    selected.set(target, { ...entry, path: target });
  }
  for (const entry of selected.values()) {
    if (entry.mode === "160000") {
      throw new Error(
        `"${entry.path}" is a submodule. Submodules can't be public.`,
      );
    }
  }
  return [...selected.values()].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );
}

/**
 * Generates the public tree of a commit, read from git objects only.
 *
 * Writes the files under `<outDir>/tree` with modes normalised to 644/755, and
 * `<outDir>/public-tree.json` with every file's mode and SHA-256 plus the git tree hash.
 *
 * @param options.repo - Path of the internal repository.
 * @param options.sha - Release commit to snapshot.
 * @param options.outDir - Output directory; must not exist or be empty.
 * @returns The manifest written to `public-tree.json`.
 * @throws If the allowlist, a symlink or a workspace dependency breaks a public-tree rule.
 */
export function generatePublicSnapshot(options: {
  repo: string;
  sha: string;
  outDir: string;
}): PublicTreeManifest {
  const { repo, outDir } = options;
  const sha = git(repo, ["rev-parse", "--verify", `${options.sha}^{commit}`])
    .toString()
    .trim();
  const { include } = JSON.parse(
    git(repo, ["show", `${sha}:${ALLOWLIST_PATH}`]).toString(),
  ) as { include: string[] };

  const entries = git(repo, ["ls-tree", "-r", "-z", "--full-tree", sha])
    .toString()
    .split("\0")
    .filter(Boolean)
    .map((line): TreeEntry => {
      const [meta = "", path = ""] = line.split("\t");
      const [mode = "", , objectSha = ""] = meta.split(" ");
      return { mode, sha: objectSha, path };
    });
  const selected = selectPublicEntries(entries, include);
  const blobs = readBlobs(repo, [
    ...new Set(
      selected.filter((e) => e.mode !== "160000").map((entry) => entry.sha),
    ),
  ]);
  const paths = new Set(selected.map((entry) => entry.path));

  const files = selected.map((entry): PublicTreeFile & { content: Buffer } => {
    const content = blobs.get(entry.sha) ?? Buffer.alloc(0);
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

  const packageNames = new Map<string, string>();
  for (const file of files) {
    if (!/^packages\/[^/]+\/package\.json$/.test(file.path)) continue;
    packageNames.set(file.path, JSON.parse(file.content.toString()).name);
  }
  const publicNames = new Set(packageNames.values());
  for (const file of files) {
    if (!packageNames.has(file.path)) continue;
    const manifest = JSON.parse(file.content.toString());
    for (const field of DEPENDENCY_FIELDS) {
      for (const [name, range] of Object.entries(manifest[field] ?? {})) {
        if (String(range).startsWith("workspace:") && !publicNames.has(name)) {
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
      .join("\n");
    execFileSync("git", ["-C", repo, "update-index", "--add", "--index-info"], {
      env,
      input: `${info}\n`,
    });
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
