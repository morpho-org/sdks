import type { ChainId, MarketId } from "@morpho-org/blue-sdk";
import {
  fetchHolding,
  fetchMarket,
  fetchPosition,
  fetchVault,
  fetchVaultMarketConfig,
} from "@morpho-org/blue-sdk-ethers";
import { entries, fromEntries } from "@morpho-org/morpho-ts";
import {
  type PublicReallocation,
  SimulationState,
} from "@morpho-org/simulation-sdk";
import DataLoader from "dataloader";
import type { Provider } from "ethers";
import { apiSdk } from "./api";

export interface LiquidityRequest {
  marketId: MarketId;
  from: "api" | "rpc";
}

export interface LiquidityParameters {
  chainId?: ChainId;
  /* The delay to consider between the moment reallocations are calculated and the moment they are committed onchain. Defaults to 1h. */
  delay?: bigint;
}

export class LiquidityLoader {
  public provider?: Provider;
  public readonly parameters: LiquidityParameters = {};

  protected readonly dataLoader: DataLoader<
    LiquidityRequest,
    PublicReallocation[]
  >;

  constructor(provider: Provider);
  constructor(
    parameters: { chainId: ChainId } & Omit<LiquidityParameters, "chainId">,
  );
  constructor(providerOrParameters: Provider | LiquidityParameters) {
    if ("chainId" in providerOrParameters) {
      this.parameters = providerOrParameters;
    } else {
      this.provider = providerOrParameters as Provider;
    }

    this.dataLoader = new DataLoader(
      async (reqs) => {
        const { provider, parameters } = this;
        const chainId =
          parameters.chainId ?? Number((await provider!.getNetwork()).chainId);

        const data = await apiSdk.getMarkets({
          chainId,
          marketIds: reqs.map(({ marketId }) => marketId),
        });

        const apiMarkets = fromEntries(
          data.markets.items?.map((market) => [
            market.uniqueKey as string,
            market,
          ]) ?? [],
        );

        const rpcWithdrawals = {} as Record<
          MarketId,
          PublicReallocation[] | Error
        >;
        if (provider) {
          const rpcMarketIds = new Set(
            reqs
              .filter(({ from }) => from === "rpc")
              .map(({ marketId }) => marketId),
          );

          const rpcMarkets = [...rpcMarketIds].map(
            (marketId) => apiMarkets[marketId.toLowerCase()]!,
          );

          const allMarketIds = new Set(
            rpcMarkets.flatMap(
              ({ supplyingVaults }) =>
                supplyingVaults?.flatMap(
                  (vault) =>
                    vault.state?.allocation?.map(
                      (allocation) => allocation.market.uniqueKey,
                    ) ?? [],
                ) ?? [],
            ),
          );
          const allVaults = new Set(
            rpcMarkets.flatMap(
              ({ supplyingVaults }) =>
                supplyingVaults?.map(({ address }) => address) ?? [],
            ),
          );

          const allVaultsMarkets = entries(
            fromEntries(
              rpcMarkets.flatMap(
                (market) =>
                  market.supplyingVaults?.map((vault) => [
                    vault.address,
                    vault.state?.allocation?.map(({ market }) => market) ?? [],
                  ]) ?? [],
              ),
            ),
          );

          const [block, markets, vaults, vaultsTokens, vaultsMarkets] =
            await Promise.all([
              provider.getBlock("latest", false),
              Promise.all(
                [...allMarketIds].map((marketId) =>
                  fetchMarket(marketId, provider, parameters),
                ),
              ),
              Promise.all(
                [...allVaults].map((vault) =>
                  fetchVault(vault, provider, parameters),
                ),
              ),
              Promise.all(
                allVaultsMarkets.map(
                  async ([vault, markets]) =>
                    [
                      vault,
                      await Promise.all(
                        markets.map(
                          async ({ loanAsset }) =>
                            [
                              loanAsset.address,
                              {
                                holding: await fetchHolding(
                                  vault,
                                  loanAsset.address,
                                  provider,
                                  parameters,
                                ),
                              },
                            ] as const,
                        ),
                      ),
                    ] as const,
                ),
              ),
              Promise.all(
                allVaultsMarkets.map(
                  async ([vault, markets]) =>
                    [
                      vault,
                      await Promise.all(
                        markets.map(
                          async (market) =>
                            [
                              market.uniqueKey,
                              {
                                position: await fetchPosition(
                                  vault,
                                  market.uniqueKey,
                                  provider,
                                  parameters,
                                ),
                                vaultMarketConfig: await fetchVaultMarketConfig(
                                  vault,
                                  market.uniqueKey,
                                  provider,
                                  parameters,
                                ),
                              },
                            ] as const,
                        ),
                      ),
                    ] as const,
                ),
              ),
            ]);

          const state = new SimulationState({
            chainId,
            block: {
              number: BigInt(block!.number),
              timestamp: BigInt(block!.timestamp),
            },
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
                  vaultMarkets.map(([marketId, { position }]) => [
                    marketId,
                    position,
                  ]),
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
          });

          const maxWithdrawalUtilization = fromEntries(
            allVaultsMarkets.flatMap(([, markets]) =>
              markets.map((market) => [
                market.uniqueKey,
                market.targetWithdrawUtilization,
              ]),
            ),
          );

          for (const marketId of rpcMarketIds) {
            try {
              rpcWithdrawals[marketId] = state.getMarketPublicReallocations(
                marketId,
                {
                  enabled: true,
                  maxWithdrawalUtilization,
                  delay: parameters.delay,
                },
              ).withdrawals;
            } catch (error) {
              rpcWithdrawals[marketId] = Error(
                `An error occurred while simulating reallocations: ${error}`,
              );
            }
          }
        }

        return reqs.map(
          ({ marketId, from }) =>
            (from === "api"
              ? apiMarkets[
                  marketId.toLowerCase()
                ]?.publicAllocatorSharedLiquidity?.map(
                  ({ vault, allocationMarket, assets }) => ({
                    id: allocationMarket.uniqueKey,
                    vault: vault.address,
                    assets: BigInt(assets),
                  }),
                )
              : rpcWithdrawals[marketId]) ??
            Error(
              `Unknown shared liquidity for market "${marketId}" (from ${from}).`,
            ),
        );
      },
      {
        cache: false,
        cacheKeyFn: ({ marketId, from }) => `${from}:${marketId}`,
      },
    );
  }

  public fetch(marketId: MarketId, from: "api" | "rpc" = "api") {
    return this.dataLoader.load({ marketId, from });
  }
}
