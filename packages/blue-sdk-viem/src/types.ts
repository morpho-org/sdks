import type { BlockNumberOrTag } from "@morpho-org/morpho-ts";
import type { CallParameters, UnionPick } from "viem";

/** Common viem call parameters accepted by blue-sdk-viem fetchers. */
export type FetchParameters = UnionPick<
  CallParameters,
  "account" | "stateOverride"
> & {
  /** Optional numbered block or named tag; omission preserves the client default. */
  readonly block?: BlockNumberOrTag;
  /**
   * Chain id used to resolve protocol addresses.
   *
   * @deprecated Configure the viem client's chain instead. This override will be removed in the next major version.
   */
  chainId?: number;
};

/** Fetch parameters for readers that can use deployless bytecode queries. */
export type DeploylessFetchParameters = FetchParameters & {
  /**
   * If `true`, the function will use deployless reads and fallback to multicall if it fails.
   *
   * If `"force"`, the function will use deployless reads without fallback to multicall. If deployless reads fail, the function will throw an error.
   *
   * If `false`, the function will use multicall reads.
   *
   * Default is `true`.
   */
  deployless?: boolean | "force";
};
