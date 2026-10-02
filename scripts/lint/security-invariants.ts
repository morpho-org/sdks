import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ID_PATTERN = /INV-\d{2}/;

/** Returns the invariant IDs declared in the SECURITY.md "Security invariants" table. */
export const parseDocumentedIds = (markdown: string): string[] => {
  const ids = [
    ...markdown.matchAll(
      new RegExp(`^\\|\\s*(${ID_PATTERN.source})\\s*\\|`, "gm"),
    ),
  ].map((match) => match[1] as string);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length > 0)
    throw new Error(
      `Duplicate invariant IDs in SECURITY.md: ${duplicates.join(", ")}`,
    );
  return ids;
};

/** Returns the invariant IDs tagged as `[INV-NN]` in a test file's source. */
export const parseTaggedIds = (source: string): string[] => [
  ...new Set(
    [...source.matchAll(new RegExp(`\\[(${ID_PATTERN.source})\\]`, "g"))].map(
      (match) => match[1] as string,
    ),
  ),
];

/** Compares documented and tagged IDs; returns one message per mismatch. */
export const checkInvariants = (
  documented: readonly string[],
  tagged: ReadonlyMap<string, readonly string[]>,
): string[] => {
  const errors: string[] = [];
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
  for (const file of collectTestFiles(join(root, "packages")))
    for (const id of parseTaggedIds(readFileSync(file, "utf-8")))
      tagged.set(id, [...(tagged.get(id) ?? []), relative(root, file)]);

  const errors = checkInvariants(documented, tagged);
  if (errors.length > 0) {
    for (const error of errors) console.error(error);
    process.exit(1);
  }
  console.log(
    `All ${documented.length} SECURITY.md invariants have tagged tests.`,
  );
};

if (
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(process.argv[1]).href
)
  main();
