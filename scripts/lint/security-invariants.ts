import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { isMain } from "../ci/workflow.ts";

const ID_PATTERN = /INV-\d{2}/;

/**
 * Returns the invariant IDs declared in the SECURITY.md "Security invariants" table: every row after
 * the `| ID |` header and its separator, until the first non-table line. Each row must start with
 * an `INV-NN` cell.
 */
export const parseDocumentedIds = (markdown: string): string[] => {
  const lines = markdown.split("\n");
  const header = lines.findIndex((line) => /^\|\s*ID\s*\|/.test(line));
  if (header === -1) return [];
  const rows: string[] = [];
  for (const line of lines.slice(header + 2)) {
    if (!line.startsWith("|")) break;
    rows.push((line.split("|")[1] ?? "").trim());
  }
  const malformed = rows.filter(
    (cell) => !new RegExp(`^${ID_PATTERN.source}$`).test(cell),
  );
  if (malformed.length > 0)
    throw new Error(
      `Malformed invariant IDs in SECURITY.md (expected INV-NN): ${malformed.map((cell) => `"${cell}"`).join(", ")}`,
    );
  const duplicates = rows.filter((id, index) => rows.indexOf(id) !== index);
  if (duplicates.length > 0)
    throw new Error(
      `Duplicate invariant IDs in SECURITY.md: ${duplicates.join(", ")}`,
    );
  return rows;
};

const SKIPPING_MODIFIERS = new Set(["skip", "todo", "fails"]);

/**
 * Returns the invariant IDs that open a `describe`/`test`/`it` title as `[INV-NN]`.
 * Tags on skipped, todo or fails blocks are returned separately so they do not count as coverage.
 */
export const parseTaggedIds = (
  source: string,
): { readonly active: string[]; readonly skipped: string[] } => {
  const active = new Set<string>();
  const skipped = new Set<string>();
  const pattern = new RegExp(
    `\\b(?:describe|test|it)(?:\\.(\\w+))?\\(\\s*["'\`]\\[(${ID_PATTERN.source})\\]`,
    "g",
  );
  for (const [, modifier, id] of source.matchAll(pattern))
    (modifier != null && SKIPPING_MODIFIERS.has(modifier)
      ? skipped
      : active
    ).add(id as string);
  return { active: [...active], skipped: [...skipped] };
};

/** Compares documented and tagged IDs; returns one message per mismatch. */
export const checkInvariants = ({
  documented,
  tagged,
  skipped = new Map(),
}: {
  readonly documented: readonly string[];
  readonly tagged: ReadonlyMap<string, readonly string[]>;
  readonly skipped?: ReadonlyMap<string, readonly string[]>;
}): string[] => {
  const errors: string[] = [];
  for (const [id, files] of skipped)
    errors.push(
      `[${id}] is tagged on a skipped, todo or fails block in ${files.join(", ")}; such blocks do not count as coverage.`,
    );
  if (documented.length === 0)
    errors.push(
      "SECURITY.md declares no invariant IDs (expected rows like `| INV-01 | … |`).",
    );
  for (const id of documented)
    if (!tagged.has(id))
      errors.push(
        `${id} is documented in SECURITY.md but no test is tagged [${id}].`,
      );
  for (const [id, files] of tagged)
    if (!documented.includes(id))
      errors.push(
        `[${id}] is tagged in ${files.join(", ")} but is not documented in SECURITY.md.`,
      );
  return errors;
};

const collectTestFiles = (dir: string, files: string[] = []): string[] => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (
      entry.name === "node_modules" ||
      entry.name === "lib" ||
      entry.name === "dist"
    )
      continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) collectTestFiles(path, files);
    else if (entry.name.endsWith(".test.ts")) files.push(path);
  }
  return files;
};

const main = (): void => {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const documented = parseDocumentedIds(
    readFileSync(join(root, "SECURITY.md"), "utf-8"),
  );
  const tagged = new Map<string, string[]>();
  const skipped = new Map<string, string[]>();
  for (const file of collectTestFiles(join(root, "packages"))) {
    const ids = parseTaggedIds(readFileSync(file, "utf-8"));
    for (const [found, into] of [
      [ids.active, tagged],
      [ids.skipped, skipped],
    ] as const)
      for (const id of found)
        into.set(id, [...(into.get(id) ?? []), relative(root, file)]);
  }

  const errors = checkInvariants({ documented, tagged, skipped });
  if (errors.length > 0) {
    for (const error of errors) console.error(error);
    process.exit(1);
  }
  console.log(
    `All ${documented.length} SECURITY.md invariants have tagged tests.`,
  );
};

if (isMain(import.meta.url)) main();
