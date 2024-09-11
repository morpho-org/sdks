import { ChainId } from "@morpho-org/blue-sdk";
import {
  Account,
  Address,
  BlockTag,
  CallParameters,
  StateOverride,
  UnionEvaluate,
} from "viem";

export type ViewOverrides = {
  account?: Account | Address;
  stateOverride?: StateOverride;
} & (
  | {
      blockNumber?: bigint;
      blockTag?: undefined;
    }
  | {
      blockNumber?: undefined;
      blockTag?: BlockTag;
    }
);

export type FetchParameters = UnionEvaluate<
  Pick<CallParameters, "account" | "blockNumber" | "blockTag" | "stateOverride">
> & {
  chainId?: ChainId;
};
