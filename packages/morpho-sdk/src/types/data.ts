import type { CallParameters, UnionPick } from "viem";

export type FetchParameters = UnionPick<
  CallParameters,
  "account" | "blockNumber" | "blockTag" | "stateOverride"
>;
