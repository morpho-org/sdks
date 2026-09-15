/** Named Ethereum block selectors supported by SDK reads. */
export type BlockTag = "latest" | "earliest" | "pending" | "safe" | "finalized";

/**
 * Selects either a numbered block or a named Ethereum block tag.
 * Omit the enclosing `block` option to retain the RPC client's default.
 *
 * @example
 * ```ts
 * import type { BlockNumberOrTag } from "@morpho-org/morpho-ts";
 * const block: BlockNumberOrTag = { type: "number", value: 20_000_000n };
 * ```
 */
export type BlockNumberOrTag =
  | { readonly type: "number"; readonly value: bigint }
  | { readonly type: "tag"; readonly value: BlockTag };

/**
 * Converts an SDK block selector to mutually exclusive viem-compatible fields.
 * This pure conversion has no viem dependency and preserves an omitted selector.
 *
 * @param block - Optional numbered block or named tag.
 * @returns One block selector field, or an empty object for the client's default.
 * @example
 * ```ts
 * import { toBlockParameters } from "@morpho-org/morpho-ts";
 * const parameters = toBlockParameters({ type: "number", value: 20_000_000n });
 * // { blockNumber: 20_000_000n }
 * ```
 */
export function toBlockParameters(
  block?: BlockNumberOrTag,
):
  | { readonly blockNumber: bigint; readonly blockTag?: never }
  | { readonly blockNumber?: never; readonly blockTag: BlockTag }
  | { readonly blockNumber?: never; readonly blockTag?: never } {
  if (block === undefined) return {};
  switch (block.type) {
    case "number":
      return { blockNumber: block.value };
    case "tag":
      return { blockTag: block.value };
  }
}
