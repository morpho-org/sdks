import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Extractor, ExtractorConfig } from "@microsoft/api-extractor";
import { normalizeDeclarationComments } from "./comments.mjs";
import { filterDocModel } from "./model.mjs";

const require = createRequire(import.meta.url);
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const workRoot = join(repo, ".api-docs");
mkdirSync(workRoot, { recursive: true });
const work = mkdtempSync(join(workRoot, "run-"));
const declarations = join(work, "declarations");
const models = join(work, "models");
const markdown = join(work, "markdown");
const destination = join(repo, "docs/api");

try {
  const tsconfig = JSON.parse(
    readFileSync(join(repo, "tsconfig.docs.json"), "utf8"),
  );
  const template = ExtractorConfig.loadFile(join(repo, "api-extractor.json"));
  const packages = tsconfig.files.map((entry) => entry.split("/")[1]);
  const manifests = new Map(
    packages.map((name) => [
      name,
      JSON.parse(
        readFileSync(join(repo, "packages", name, "package.json"), "utf8"),
      ),
    ]),
  );
  const workspacePackages = new Map(
    [...manifests].map(([name, manifest]) => [
      manifest.name,
      join(declarations, name),
    ]),
  );

  console.log(
    "Emitting documentation declarations with the workspace TypeScript compiler...",
  );
  for (const name of packages) {
    const configPath = join(work, `${name}.tsconfig.json`);
    writeFileSync(
      configPath,
      JSON.stringify({
        extends: join(repo, "packages", name, "tsconfig.build.esm.json"),
        compilerOptions: {
          ...tsconfig.compilerOptions,
          rootDir: join(repo, "packages", name, "src"),
          outDir: join(declarations, name, "src"),
          declarationMap: false,
          incremental: true,
          tsBuildInfoFile: join(work, `${name}.tsbuildinfo`),
        },
      }),
    );
    execFileSync(
      process.execPath,
      [
        join(dirname(require.resolve("typescript/package.json")), "bin/tsc"),
        "-p",
        configPath,
      ],
      { cwd: repo, stdio: "inherit" },
    );
  }

  for (const [name, packageJson] of manifests) {
    const packageFolder = join(repo, "packages", name);
    const stagedPackage = join(declarations, name);
    const entryPoints = packageJson.exports ?? {
      ".": packageJson.main,
      ...Object.fromEntries(
        Object.entries(packageJson.typesVersions?.["*"] ?? {}).map(
          ([subpath, targets]) => [`./${subpath}`, targets[0]],
        ),
      ),
    };
    const declarationExports = {};
    for (const [subpath, target] of Object.entries(entryPoints)) {
      if (subpath === "./package.json" && target === "./package.json") {
        declarationExports[subpath] = target;
        continue;
      }
      if (typeof target !== "string" || !target.endsWith(".ts"))
        throw new Error(
          `Unsupported documentation entry point: ${packageJson.name}${subpath}: ${JSON.stringify(target)}`,
        );
      declarationExports[subpath] =
        `./${target.replace(/^\.\//, "").replace(/\.ts$/, ".d.ts")}`;
    }
    writeFileSync(
      join(stagedPackage, "package.json"),
      JSON.stringify({
        name: packageJson.name,
        version: packageJson.version,
        type: packageJson.type,
        types: "./src/index.d.ts",
        exports: declarationExports,
        tsdocMetadata: "./tsdoc-metadata.json",
      }),
    );
    // Real package resolution preserves cross-package symbol identities in API Extractor.
    // Workspace links point to declarations; external links retain package-local resolution.
    for (const dependency of Object.keys({
      ...packageJson.dependencies,
      ...packageJson.peerDependencies,
      ...packageJson.devDependencies,
    })) {
      const target =
        workspacePackages.get(dependency) ??
        join(packageFolder, "node_modules", dependency);
      if (!existsSync(target)) continue;
      const link = join(stagedPackage, "node_modules", dependency);
      mkdirSync(dirname(link), { recursive: true });
      symlinkSync(target, link, "junction");
    }
  }

  const pending = [declarations];
  while (pending.length) {
    const folder = pending.pop();
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) pending.push(path);
      else if (entry.isFile() && entry.name.endsWith(".d.ts"))
        writeFileSync(
          path,
          normalizeDeclarationComments(readFileSync(path, "utf8")),
        );
    }
  }

  // Mark the normalized declarations as TSDoc-compatible before resolving cross-package references.
  for (const name of packages) {
    writeFileSync(
      join(declarations, name, "tsdoc-metadata.json"),
      JSON.stringify({
        tsdocVersion: "0.12",
        toolPackages: [
          {
            packageName: "@microsoft/api-extractor",
            packageVersion: Extractor.version,
          },
        ],
      }),
    );
  }

  const warnings = [];
  for (const name of packages) {
    console.log(`Extracting ${name}...`);
    const packageFolder = join(declarations, name);
    const config = ExtractorConfig.prepare({
      configObject: {
        ...template,
        projectFolder: packageFolder,
        compiler: {
          overrideTsconfig: {
            compilerOptions: {
              types: tsconfig.compilerOptions.types,
              target: "ESNext",
              module: "NodeNext",
              moduleResolution: "NodeNext",
              strict: true,
              skipLibCheck: true,
            },
            files: [join(packageFolder, "src/index.d.ts")],
          },
        },
        docModel: {
          ...template.docModel,
          apiJsonFilePath: join(models, `${name}.api.json`),
        },
      },
      configObjectFullPath: join(repo, "api-extractor.json"),
      packageJsonFullPath: join(packageFolder, "package.json"),
    });
    const result = Extractor.invoke(config, {
      localBuild: true,
      messageCallback(message) {
        if (message.logLevel === "warning") {
          warnings.push(`${name}: ${message.formatMessageWithLocation(repo)}`);
          message.handled = true;
        }
      },
    });
    if (!result.succeeded)
      throw new Error(`API extraction failed for ${name}.`);
    const modelPath = join(models, `${name}.api.json`);
    writeFileSync(
      modelPath,
      JSON.stringify(
        filterDocModel(JSON.parse(readFileSync(modelPath, "utf8"))),
      ),
    );
  }
  writeFileSync(join(workRoot, "warnings.log"), warnings.join("\n"));
  if (warnings.length)
    console.warn(
      `${warnings.length} documentation warnings; see .api-docs/warnings.log.`,
    );

  execFileSync(
    process.execPath,
    [
      join(
        dirname(require.resolve("@microsoft/api-documenter/package.json")),
        "bin/api-documenter",
      ),
      "markdown",
      "--input-folder",
      models,
      "--output-folder",
      markdown,
    ],
    { cwd: repo, stdio: "inherit" },
  );
  for (const name of readdirSync(markdown)) {
    const path = join(markdown, name);
    writeFileSync(
      path,
      `${readFileSync(path, "utf8")
        .replaceAll("\r\n", "\n")
        .replace(/[\t ]+$/gm, "")
        .trimEnd()}\n`,
    );
  }
  writeFileSync(
    join(markdown, "README.md"),
    readFileSync(join(markdown, "index.md")),
  );

  // Publish only after every package and the renderer succeed; keep the old reference on failure.
  const previous = join(work, "previous");
  if (existsSync(destination)) renameSync(destination, previous);
  try {
    renameSync(markdown, destination);
  } catch (error) {
    if (existsSync(previous)) renameSync(previous, destination);
    throw error;
  }
  console.log(
    `Generated ${readdirSync(destination).length} Markdown files in ${relative(repo, destination)}.`,
  );
  rmSync(work, { recursive: true, force: true });
} catch (error) {
  console.error(error);
  console.error(
    `Documentation intermediates retained in ${relative(repo, work)}.`,
  );
  process.exitCode = 1;
}
