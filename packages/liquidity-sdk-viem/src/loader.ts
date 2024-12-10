import type { ChainId, MarketId } from "@morpho-org/blue-sdk";
import {
  fetchHolding,
  fetchMarket,
  fetchPosition,
  fetchVault,
  fetchVaultMarketConfig,
} from "@morpho-org/blue-sdk-viem";
import { entries, fromEntries } from "@morpho-org/morpho-ts";
import {
  type PublicReallocation,
  SimulationState,
} from "@morpho-org/simulation-sdk";
import DataLoader from "dataloader";
import type { Chain, Client, Transport } from "viem";
import { getBlock } from "viem/actions";
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

export class LiquidityLoader<chain extends Chain = Chain> {
  public client?: Client<Transport, chain>;
  public readonly parameters: LiquidityParameters = {};

  protected readonly dataLoader: DataLoader<
    LiquidityRequest,
    PublicReallocation[]
  >;

  constructor(client: Client<Transport, chain>);
  constructor(
    parameters: { chainId: ChainId } & Omit<LiquidityParameters, "chainId">,
  );
  constructor(
    clientOrParameters: Client<Transport, chain> | LiquidityParameters,
  ) {
    if ("chainId" in clientOrParameters) {
      this.parameters = clientOrParameters;
    } else {
      this.client = clientOrParameters as Client<Transport, chain>;
    }

    this.dataLoader = new DataLoader(
      async (reqs) => {
        const { client, parameters } = this;
        const chainId = parameters.chainId ?? client!.chain.id;

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
        if (client) {
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
              getBlock(client),
              Promise.all(
                [...allMarketIds].map((marketId) =>
                  fetchMarket(marketId, client, parameters),
                ),
              ),
              Promise.all(
                [...allVaults].map((vault) =>
                  fetchVault(vault, client, parameters),
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
                                  client,
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
                                  client,
                                  parameters,
                                ),
                                vaultMarketConfig: await fetchVaultMarketConfig(
                                  vault,
                                  market.uniqueKey,
                                  client,
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
