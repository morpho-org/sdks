import { ChainId } from "@morpho-org/blue-sdk";
import { CallParameters, UnionPick } from "viem";

export type FetchParameters = UnionPick<
  CallParameters,
  "account" | "blockNumber" | "blockTag" | "stateOverride"
> & {
  chainId?: ChainId;
};

export type DeploylessFetchParameters = FetchParameters & {
  deployless?: boolean;
};
