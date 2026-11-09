import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("runtime imports are declared as dependencies or peers", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  const declared = new Set([
    manifest.name,
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ]);
  const sourceRoot = new URL("./", import.meta.url);
  const missing = new Set<string>();

  for (const file of readdirSync(sourceRoot, { recursive: true })) {
    if (
      !file.endsWith(".ts") ||
      file.endsWith(".test.ts") ||
      file.endsWith(".test-d.ts") ||
      /(?:^|\/)__(?:test|mocks|fixtures)__\//.test(file)
    )
      continue;

    const source = readFileSync(new URL(file, sourceRoot), "utf8").replace(
      /\/\*[\s\S]*?\*\//g,
      "",
    );
    const imports = source.matchAll(
      /^\s*(?:import|export)\s+(?!type\b)(?:([\w$*{},\s]+?)\s+from\s*)?["']([^"']+)["']/gm,
    );
    for (const [, clause, specifier] of imports) {
      if (
        clause?.trim().startsWith("{") &&
        clause.trim().endsWith("}") &&
        clause
          .trim()
          .slice(1, -1)
          .split(",")
          .filter((name) => name.trim())
          .every((name) => /^type\s/.test(name.trim()))
      )
        continue;
      if (specifier.startsWith(".") || specifier.startsWith("node:")) continue;

      const parts = specifier.split("/");
      const dependency = specifier.startsWith("@")
        ? parts.slice(0, 2).join("/")
        : parts[0];
      if (!declared.has(dependency)) missing.add(`${file}: ${dependency}`);
    }
  }

  expect([...missing].sort()).toEqual([]);
});
