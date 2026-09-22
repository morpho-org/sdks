import { InvalidTreeError } from "../errors.js";
import { Tree } from "./Tree.js";
import type { TreeSnapshot } from "./treeTypes.js";

/** @internal Parses tagged standard-ratifier inputs and rejects legacy or mismatched routes. */
export function parseStandardRatifierTree(
  tree: TreeSnapshot<"ecrecover"> | TreeSnapshot<"setter">,
  expected: "ecrecover" | "setter",
): Tree<"ecrecover"> | Tree<"setter"> {
  if (tree.type !== expected) {
    throw new InvalidTreeError(
      `Expected a "${expected}" tree. Create a tree with an explicit matching ratifier type.`,
    );
  }
  return Tree.fromDescriptor(tree);
}
