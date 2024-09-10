import { ChainId } from "@morpho-org/blue-sdk";
import { Account, Address, BlockTag, StateOverride } from "viem";

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

export interface FetchOptions {
  chainId?: ChainId;
  overrides?: ViewOverrides;
}
