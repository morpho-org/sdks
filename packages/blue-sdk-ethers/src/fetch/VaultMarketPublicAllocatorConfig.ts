import type { Provider } from "ethers";
import { PublicAllocator__factory } from "ethers-types";

import {
  type Address,
  ChainUtils,
  type MarketId,
  VaultMarketPublicAllocatorConfig,
  addresses,
} from "@morpho-org/blue-sdk";
import type { FetchOptions } from "../types";

export async function fetchVaultMarketPublicAllocatorConfig(
  vault: Address,
  marketId: MarketId,
  runner: { provider: Provider },
  { chainId, overrides = {} }: FetchOptions = {},
) {
  chainId = ChainUtils.parseSupportedChainId(
    chainId ?? (await runner.provider.getNetwork()).chainId,
  );

  const { publicAllocator } = addresses[chainId];

  const [maxIn, maxOut] = await PublicAllocator__factory.connect(
    publicAllocator,
    // @ts-ignore incompatible commonjs type
    runner,
  ).flowCaps(vault, marketId, overrides);

  return new VaultMarketPublicAllocatorConfig({
    vault,
    marketId,
    maxIn,
    maxOut,
  });
}
