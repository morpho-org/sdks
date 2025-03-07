import type { CallParameters, UnionPick } from "viem";

export type FetchParameters = UnionPick<
  CallParameters,
  "account" | "blockNumber" | "blockTag" | "stateOverride"
> & {
  chainId?: number;
};

export type DeploylessFetchParameters = FetchParameters & {
  deployless?: boolean;
};
