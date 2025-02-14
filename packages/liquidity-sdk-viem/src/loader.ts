import type { MarketId } from "@morpho-org/blue-sdk";
import {
  fetchHolding,
  fetchMarket,
  fetchPosition,
  fetchVault,
  fetchVaultMarketConfig,
} from "@morpho-org/blue-sdk-viem";
import { entries, fromEntries, isDefined } from "@morpho-org/morpho-ts";
import {
  type MaybeDraft,
  type PublicReallocation,
  SimulationState,
} from "@morpho-org/simulation-sdk";
import DataLoader from "dataloader";
import type { Chain, Client, Transport } from "viem";
import { getBlock } from "viem/actions";
import { apiSdk } from "./api";

export interface LiquidityParameters {
  /**
   * The delay to consider between the moment reallocations are calculated and the moment they are committed onchain.
   * Defaults to 1h.
   */
  delay?: bigint;

  /**
   * The default maximum utilization allowed to reach to find shared liquidity (scaled by WAD).
   */
  defaultMaxWithdrawalUtilization?: bigint;

  /**
   * If provided, defines the maximum utilization allowed to reach for each market, defaulting to `defaultMaxWithdrawalUtilization`.
   * If not, these values are fetched from Morpho API.
   */
  maxWithdrawalUtilization?: Record<MarketId, bigint>;
}

export class LiquidityLoader<chain extends Chain = Chain> {
  protected readonly dataLoader: DataLoader<
    MarketId,
    {
      startState: SimulationState;
      endState: MaybeDraft<SimulationState>;
      withdrawals: PublicReallocation[];
      targetBorrowUtilization: bigint;
    }
  >;

  constructor(
    public client: Client<Transport, chain>,
    public readonly parameters: LiquidityParameters = {},
  ) {
    this.dataLoader = new DataLoader(
      async (marketIds) => {
        const { client, parameters } = this;
        const chainId = client.chain.id;

        const [block, data] = await Promise.all([
          getBlock(client),
          apiSdk.getMarkets({
            chainId,
            marketIds: [...marketIds],
          }),
        ]);

        const marketsById = fromEntries(
          data.markets.items?.map((market) => [
            market.uniqueKey as string,
            market,
          ]) ?? [],
        );

        const apiMarkets = marketIds
          .map((marketId) => marketsById[marketId.toLowerCase()])
          .filter(isDefined);

        const allMarketIds = new Set(
          apiMarkets.flatMap(
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
          apiMarkets.flatMap(
            ({ supplyingVaults }) =>
              supplyingVaults?.map(({ address }) => address) ?? [],
          ),
        );

        const allVaultsMarkets = entries(
          fromEntries(
            apiMarkets.flatMap(
              (market) =>
                market.supplyingVaults?.map((vault) => [
                  vault.address,
                  vault.state?.allocation?.map(({ market }) => market) ?? [],
                ]) ?? [],
            ),
          ),
        );

        const [markets, vaults, vaultsTokens, vaultsMarkets] =
          await Promise.all([
            Promise.all(
              [...allMarketIds].map((marketId) =>
                fetchMarket(marketId, client, { blockNumber: block.number }),
              ),
            ),
            Promise.all(
              [...allVaults].map((vault) =>
                fetchVault(vault, client, { blockNumber: block.number }),
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
                                { blockNumber: block.number },
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
                                { blockNumber: block.number },
                              ),
                              vaultMarketConfig: await fetchVaultMarketConfig(
                                vault,
                                market.uniqueKey,
                                client,
                                { blockNumber: block.number },
                              ),
                            },
                          ] as const,
                      ),
                    ),
                  ] as const,
              ),
            ),
          ]);

        const startState = new SimulationState({
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

        const maxWithdrawalUtilization =
          parameters.maxWithdrawalUtilization ??
          fromEntries(
            allVaultsMarkets.flatMap(([, markets]) =>
              markets.map((market) => [
                market.uniqueKey,
                market.targetWithdrawUtilization,
              ]),
            ),
          );

        return apiMarkets.map(({ uniqueKey, targetBorrowUtilization }) => {
          try {
            const { data: endState, withdrawals } =
              startState.getMarketPublicReallocations(uniqueKey, {
                ...parameters,
                maxWithdrawalUtilization,
                enabled: true,
              });

            return {
              startState,
              endState,
              withdrawals,
              targetBorrowUtilization,
            };
          } catch (error) {
            return Error(
              `An error occurred while simulating reallocations: ${error}`,
            );
          }
        });
      },
      { cache: false },
    );
  }

  public fetch(marketId: MarketId) {
    return this.dataLoader.load(marketId);
  }
}
