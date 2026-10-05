import { isAbsolute, relative } from "node:path";

/**
 * Returns whether a resolved path is the base directory itself or contained within it.
 *
 * @param basePath The absolute base directory.
 * @param candidatePath The absolute path to check.
 * @returns Whether candidatePath is basePath or sits inside it.
 */
export function isPathInside(basePath: string, candidatePath: string): boolean {
  const relativePath = relative(basePath, candidatePath);

  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !isAbsolute(relativePath))
  );
}
