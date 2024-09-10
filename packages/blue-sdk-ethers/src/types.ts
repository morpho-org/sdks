import { ChainId } from "@morpho-org/blue-sdk";
import { ViewOverrides } from "ethers-types/dist/common";

export interface FetchOptions {
  chainId?: ChainId;
  overrides?: ViewOverrides;
}
