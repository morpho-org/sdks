import type { CallParameters, UnionPick } from "viem";

/** Common viem call parameters accepted by blue-sdk-viem fetchers. */
export type FetchParameters = UnionPick<
  CallParameters,
  "account" | "blockNumber" | "blockTag" | "stateOverride"
> & {
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
