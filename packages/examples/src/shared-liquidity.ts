import type { ChainId, MarketId } from "@morpho-org/blue-sdk";
import {
  fetchHolding,
  fetchMarket,
  fetchPosition,
  fetchVault,
  fetchVaultMarketConfig,
} from "@morpho-org/blue-sdk-viem";
import { fromEntries } from "@morpho-org/morpho-ts";
import { SimulationState } from "@morpho-org/simulation-sdk";
import type {
  Account,
  BlockTag,
  Chain,
  Client,
  GetBlockParameters,
  Transport,
  UnionPick,
} from "viem";
import { getBlock } from "viem/actions";
import { apiSdk } from "./api";

export default async function getReallocatableLiquidity<
  chain extends Chain | undefined = Chain | undefined,
  account extends Account | undefined = Account | undefined,
>(
  marketId: MarketId,
  client: Client<Transport, chain, account>,
  parameters: { chainId: ChainId } & UnionPick<
    GetBlockParameters<false, Exclude<BlockTag, "pending">>,
    "blockNumber" | "blockTag"
  >,
) {
  const { chainId } = parameters;
  const {
    marketByUniqueKey: { supplyingVaults },
  } = await apiSdk.getMarket({ marketId, chainId });

  const marketIds = new Set(
    supplyingVaults?.flatMap(
      (vault) =>
        vault.state?.allocation?.map(
          (allocation) => allocation.market.uniqueKey,
        ) ?? [],
    ),
  );

  const [block, markets, vaults, vaultsTokens, vaultsMarkets] =
    await Promise.all([
      getBlock<chain, account, false, Exclude<BlockTag, "pending">>(
        client,
        parameters,
      ),
      Promise.all(
        [...marketIds].map((marketId) =>
          fetchMarket(marketId, client, parameters),
        ),
      ),
      Promise.all(
        supplyingVaults?.map((vault) =>
          fetchVault(vault.address, client, parameters),
        ) ?? [],
      ),
      Promise.all(
        supplyingVaults?.map(
          async (vault) =>
            [
              vault.address,
              await Promise.all(
                vault.state?.allocation?.map(
                  async ({ market: { loanAsset } }) =>
                    [
                      loanAsset.address,
                      {
                        holding: await fetchHolding(
                          vault.address,
                          loanAsset.address,
                          client,
                          parameters,
                        ),
                      },
                    ] as const,
                ) ?? [],
              ),
            ] as const,
        ) ?? [],
      ),
      Promise.all(
        supplyingVaults?.map(
          async (vault) =>
            [
              vault.address,
              await Promise.all(
                vault.state?.allocation?.map(
                  async ({ market }) =>
                    [
                      market.uniqueKey,
                      {
                        position: await fetchPosition(
                          vault.address,
                          market.uniqueKey,
                          client,
                          parameters,
                        ),
                        vaultMarketConfig: await fetchVaultMarketConfig(
                          vault.address,
                          market.uniqueKey,
                          client,
                          parameters,
                        ),
                      },
                    ] as const,
                ) ?? [],
              ),
            ] as const,
        ) ?? [],
      ),
    ]);

  return new SimulationState({
    chainId,
    block,
    markets: fromEntries(markets.map((market) => [market.id, market])),
    vaults: fromEntries(vaults.map((vault) => [vault.address, vault])),
    holdings: fromEntries(
      vaultsTokens.map(([vault, vaultTokens]) => [
        vault,
        fromEntries(
          vaultTokens.map(([token, { holding }]) => [token, holding]),
        ),
      ]),
    ),
    positions: fromEntries(
      vaultsMarkets.map(([vault, vaultMarkets]) => [
        vault,
        fromEntries(
          vaultMarkets.map(([marketId, { position }]) => [marketId, position]),
        ),
      ]),
    ),
    vaultMarketConfigs: fromEntries(
      vaultsMarkets.map(([vault, vaultMarkets]) => [
        vault,
        fromEntries(
          vaultMarkets.map(([marketId, { vaultMarketConfig }]) => [
            marketId,
            vaultMarketConfig,
          ]),
        ),
      ]),
    ),
  }).getMarketPublicReallocations(marketId, {
    enabled: true,
    maxWithdrawalUtilization: fromEntries(
      supplyingVaults?.flatMap(
        (vault) =>
          vault.state?.allocation?.map((allocation) => [
            allocation.market.uniqueKey,
            allocation.market.targetWithdrawUtilization,
          ]) ?? [],
      ) ?? [],
    ),
  }).withdrawals;
}
