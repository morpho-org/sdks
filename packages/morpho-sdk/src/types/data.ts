import type { CallParameters, UnionPick } from "viem";

/**
 * Viem call options forwarded to SDK data-fetching helpers.
 */
export type FetchParameters = UnionPick<
  CallParameters,
  "account" | "blockNumber" | "blockTag" | "stateOverride"
>;
