import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isMain, reportCliError } from "./workflow.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const flags = new Set([
  "--dev",
  "-d",
  "--exact",
  "-E",
  "--optional",
  "--peer",
  "--latest",
  "-L",
]);

/**
 * Resolves dependency changes without scripts or installation, validates every
 * locked publication timestamp, then installs the validated frozen lockfile.
 * Accepts --workspace packages/<name> to edit a workspace instead of the root.
 * Only dependency selectors and the listed dependency-kind/version flags are accepted.
 * @param args - The add or update command followed by package selectors and flags.
 * @param run - Injectable command boundary; failures must throw to stop the sequence.
 */
export function updateDependencies(
  args: readonly string[],
  run: (command: string, args: readonly string[]) => void = (
    command,
    commandArgs,
  ) => {
    execFileSync(command, commandArgs, { cwd: root, stdio: "inherit" });
  },
): void {
  const [command, ...options] = args;
  if (command !== "add" && command !== "update")
    throw new Error("Use deps:add or deps:update to change dependencies.");
  const selectors: string[] = [];
  let workspace: string | undefined;
  for (let index = 0; index < options.length; index++) {
    const option = options[index] ?? "";
    if (option !== "--workspace") {
      selectors.push(option);
      continue;
    }
    const path = options[++index];
    if (
      workspace !== undefined ||
      !path ||
      !/^packages\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(path) ||
      !existsSync(join(root, path, "package.json")) ||
      realpathSync(resolve(root, path)) !== resolve(root, path)
    )
      throw new Error(
        "--workspace requires an existing packages/<name> directory without symlinks.",
      );
    workspace = path;
  }
  if (command === "add" && !selectors.some((arg) => !arg.startsWith("-")))
    throw new Error("deps:add requires a package selector.");
  for (const arg of selectors) {
    if (!arg || (arg.startsWith("-") && !flags.has(arg)))
      throw new Error(
        `Unsupported dependency argument "${arg}". Use package selectors and dependency-kind/version flags only.`,
      );
  }
  run("bun", [
    command,
    ...(workspace ? ["--cwd", resolve(root, workspace)] : []),
    ...selectors,
    "--lockfile-only",
    "--ignore-scripts",
  ]);
  run(process.execPath, [
    fileURLToPath(new URL("./check-release-age.ts", import.meta.url)),
    "--all",
  ]);
  run("bun", ["install", "--frozen-lockfile"]);
}

if (isMain(import.meta.url)) {
  try {
    updateDependencies(process.argv.slice(2));
  } catch (error) {
    reportCliError(error);
  }
}
