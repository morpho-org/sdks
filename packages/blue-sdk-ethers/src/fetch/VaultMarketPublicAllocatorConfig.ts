import type { Provider } from "ethers";
import { PublicAllocator__factory } from "ethers-types";

import {
  type Address,
  type MarketId,
  VaultMarketPublicAllocatorConfig,
  getChainAddresses,
} from "@morpho-org/blue-sdk";
import type { FetchOptions } from "../types";

export async function fetchVaultMarketPublicAllocatorConfig(
  vault: Address,
  marketId: MarketId,
  runner: { provider: Provider },
  { chainId, overrides = {} }: FetchOptions = {},
) {
  chainId ??= Number((await runner.provider.getNetwork()).chainId);

  const { publicAllocator } = getChainAddresses(chainId);
  if (publicAllocator == null) return;

  const [maxIn, maxOut] = await PublicAllocator__factory.connect(
    publicAllocator,
    runner,
  ).flowCaps(vault, marketId, overrides);

  return new VaultMarketPublicAllocatorConfig({
    vault,
    marketId,
    maxIn,
    maxOut,
  });
}
