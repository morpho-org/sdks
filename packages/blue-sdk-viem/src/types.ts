import type { CallParameters, UnionPick } from "viem";

/** Common viem call parameters accepted by blue-sdk-viem fetchers. */
export type FetchParameters = UnionPick<
  CallParameters,
  "account" | "blockNumber" | "blockTag" | "stateOverride"
>;

/** Fetch parameters for readers that can use deployless bytecode queries. */
export type DeploylessFetchParameters = FetchParameters & {
  /**
   * If `true`, the function will use deployless reads and fallback to multicall if it fails.
   *
   * If `"force"`, the function will use deployless reads without fallback to multicall. If deployless reads fail, the function will throw an error.
   *
   * Two exceptions apply to token metadata. A deployless query that reports `decimals: 0`
   * cannot distinguish a genuine 0-decimal token from a failed or non-standard `decimals()`
   * read, so it is always confirmed with direct reads — even under `"force"`. Those reads are
   * not atomic with the query unless `blockNumber` is pinned. And under both `true` and
   * `"force"`, a query that reports malformed `name()`/`symbol()`/`eip712Domain()` returndata
   * throws `MalformedTokenMetadataError` instead of falling back — the query validates
   * returndata more strictly than viem's decoding.
   *
   * If `false`, the function will use multicall reads.
   *
   * Default is `true`.
   */
  deployless?: boolean | "force";
};
