import { Provider } from "ethers";
import { PublicAllocator__factory } from "ethers-types";
import { ViewOverrides } from "ethers-types/dist/common";

import {
  ChainId,
  ChainUtils,
  getChainAddresses,
  Address,
  MarketId,
  VaultMarketPublicAllocatorConfig,
} from "@morpho-org/blue-sdk";

export async function fetchVaultMarketPublicAllocatorConfig(
  vault: Address,
  marketId: MarketId,
  runner: { provider: Provider },
  { chainId, overrides = {} }: { chainId?: ChainId; overrides?: ViewOverrides } = {}
) {
  chainId = ChainUtils.parseSupportedChainId(chainId ?? (await runner.provider.getNetwork()).chainId);

  const { publicAllocator } = getChainAddresses(chainId);

  if (!publicAllocator) return;

  const [maxIn, maxOut] = await PublicAllocator__factory.connect(publicAllocator, runner).flowCaps(
    vault,
    marketId,
    overrides
  );

  return new VaultMarketPublicAllocatorConfig({
    vault,
    marketId,
    maxIn,
    maxOut,
  });
}

declare module "@morpho-org/blue-sdk" {
  namespace VaultMarketPublicAllocatorConfig {
    let fetch: typeof fetchVaultMarketPublicAllocatorConfig;
  }
}

VaultMarketPublicAllocatorConfig.fetch = fetchVaultMarketPublicAllocatorConfig;
