import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const dependencyTypes = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];
const ignoredSpecifiers = [
  "catalog:",
  "workspace:",
  "file:",
  "link:",
  "portal:",
  "patch:",
];

const escapeGitHubAnnotation = (value) =>
  String(value)
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");

const unquote = (value) => {
  const trimmed = value.trim();
  if (trimmed.startsWith('"')) return JSON.parse(trimmed);
  if (trimmed.startsWith("'"))
    return trimmed.slice(1, -1).replaceAll("''", "'");
  return trimmed;
};

const packageJsonPathsFromGit = () => {
  try {
    return execFileSync(
      "git",
      ["ls-files", "package.json", "packages/*/package.json"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    )
      .split("\n")
      .filter(Boolean)
      .sort();
  } catch {
    return [];
  }
};

const packageJsonPathsFromWorkspace = () => {
  const paths = ["package.json"];
  const packagesDir = "packages";
  if (!existsSync(packagesDir)) return paths;

  for (const entry of readdirSync(packagesDir).sort()) {
    const packageJsonPath = join(packagesDir, entry, "package.json");
    if (
      statSync(join(packagesDir, entry)).isDirectory() &&
      existsSync(packageJsonPath)
    )
      paths.push(packageJsonPath);
  }
  return paths;
};

const packageJsonPaths = () => {
  const gitPaths = packageJsonPathsFromGit();
  return gitPaths.length > 0 ? gitPaths : packageJsonPathsFromWorkspace();
};

const addCatalogEntry = (entries, { specifier, name, range }) => {
  const ranges = entries.get(name) ?? new Map();
  ranges.set(range, specifier);
  entries.set(name, ranges);
};

const readCatalogEntries = () => {
  const catalogEntries = new Map();
  const lines = readFileSync("pnpm-workspace.yaml", "utf8").split(/\r?\n/);
  let section;
  let namedCatalog;

  for (const line of lines) {
    if (line === "catalog:") {
      section = "catalog";
      namedCatalog = undefined;
      continue;
    }
    if (line === "catalogs:") {
      section = "catalogs";
      namedCatalog = undefined;
      continue;
    }
    if (line.length > 0 && !line.startsWith(" ")) {
      section = undefined;
      namedCatalog = undefined;
      continue;
    }

    if (section === "catalog") {
      const match = line.match(/^ {2}(.+?):\s+(.+)$/);
      if (match)
        addCatalogEntry(catalogEntries, {
          specifier: "catalog:",
          name: unquote(match[1]),
          range: unquote(match[2]),
        });
      continue;
    }

    if (section === "catalogs") {
      const catalogMatch = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
      if (catalogMatch) {
        namedCatalog = catalogMatch[1];
        continue;
      }
      const entryMatch = line.match(/^ {4}(.+?):\s+(.+)$/);
      if (namedCatalog && entryMatch)
        addCatalogEntry(catalogEntries, {
          specifier: `catalog:${namedCatalog}`,
          name: unquote(entryMatch[1]),
          range: unquote(entryMatch[2]),
        });
    }
  }

  return catalogEntries;
};

const catalogEntries = readCatalogEntries();
const literalDeclarations = new Map();
const errors = [];
const paths = packageJsonPaths();

for (const packageJsonPath of paths) {
  const manifest = JSON.parse(readFileSync(packageJsonPath, "utf8"));

  for (const dependencyType of dependencyTypes) {
    const dependencies = manifest[dependencyType] ?? {};

    for (const [name, specifier] of Object.entries(dependencies)) {
      if (ignoredSpecifiers.some((prefix) => specifier.startsWith(prefix)))
        continue;

      const catalogSpecifier = catalogEntries.get(name)?.get(specifier);
      if (catalogSpecifier) {
        errors.push({
          path: packageJsonPath,
          title: `${name} range already exists in pnpm catalog`,
          message: `${packageJsonPath} declares ${dependencyType}.${name} as ${specifier}; use ${catalogSpecifier} instead.`,
        });
        continue;
      }

      const key = JSON.stringify([name, specifier]);
      const declarations = literalDeclarations.get(key) ?? [];
      declarations.push({ packageJsonPath, dependencyType, name, specifier });
      literalDeclarations.set(key, declarations);
    }
  }
}

for (const declarations of literalDeclarations.values()) {
  if (declarations.length < 2) continue;
  const [{ name, specifier }] = declarations;
  const locations = declarations
    .map(
      ({ packageJsonPath, dependencyType }) =>
        `${packageJsonPath} ${dependencyType}.${name}`,
    )
    .join("; ");
  errors.push({
    path: declarations[0].packageJsonPath,
    title: `${name} range is duplicated outside pnpm catalog`,
    message: `${name}@${specifier} is declared in multiple manifests (${locations}); add it to pnpm-workspace.yaml#catalog or #catalogs and switch these declarations to catalog:.`,
  });
}

for (const error of errors)
  console.error(
    `::error file=${escapeGitHubAnnotation(relative(process.cwd(), error.path))},title=${escapeGitHubAnnotation(error.title)}::${escapeGitHubAnnotation(error.message)}`,
  );

if (errors.length > 0) {
  console.error(
    `Catalog dependency check failed with ${errors.length} error(s).`,
  );
  process.exit(1);
}

console.log(
  `Catalog dependency check passed for ${paths.length} package.json files.`,
);
