import type { ChainId } from "@morpho-org/blue-sdk";
import type { ViewOverrides } from "ethers-types/dist/common.js";

export interface FetchOptions {
  chainId?: ChainId;
  overrides?: ViewOverrides;
}
