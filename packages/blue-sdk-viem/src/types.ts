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
