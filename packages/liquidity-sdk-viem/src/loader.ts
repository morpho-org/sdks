import type { MarketId } from "@morpho-org/blue-sdk";
import {
  fetchMarket,
  fetchPosition,
  fetchVault,
  fetchVaultMarketConfig,
} from "@morpho-org/blue-sdk-viem";
import {
  type PublicReallocation,
  ReallocationData,
} from "@morpho-org/morpho-sdk";
import { entries, fromEntries, isDefined } from "@morpho-org/morpho-ts";
import DataLoader from "dataloader";
import type { Chain, Client, Transport } from "viem";
import { getBlock } from "viem/actions";
import { apiSdk } from "./api/index.js";

const REALLOCATION_SIMULATION_DELAY = 3_600n;

export interface LiquidityParameters {
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
      startState: ReallocationData;
      endState: ReallocationData;
      withdrawals: readonly PublicReallocation[];
      targetBorrowUtilization: bigint;
    }
  >;

  constructor(
    public client: Client<Transport, chain>,
    public readonly parameters: LiquidityParameters = {},
  ) {
    this.dataLoader = new DataLoader(
      async (marketIds) => {
        // biome-ignore lint/nursery/noShadow: TODO rename to avoid shadowing
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
                  // biome-ignore lint/nursery/noShadow: TODO rename to avoid shadowing
                  vault.state?.allocation?.map(({ market }) => market) ?? [],
                ]) ?? [],
            ),
          ),
        );

        const [markets, vaults, vaultsMarkets] = await Promise.all([
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
              // biome-ignore lint/nursery/noShadow: TODO rename to avoid shadowing
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

        const startState = new ReallocationData({
          chainId,
          markets: fromEntries(markets.map((market) => [market.id, market])),
          vaults: fromEntries(vaults.map((vault) => [vault.address, vault])),
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
            // biome-ignore lint/nursery/noShadow: TODO rename to avoid shadowing
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
                timestamp: block.timestamp + REALLOCATION_SIMULATION_DELAY,
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

  /**
   * Fetches the shared-liquidity plan for a target market from the Morpho API and onchain state.
   *
   * @param marketId - Target market id to plan withdrawals for.
   * @returns The start state, simulated end state, computed withdrawals, and target borrow utilization.
   *
   * @remarks The returned `endState` is produced by `ReallocationData.getMarketPublicReallocations`.
   * Its `vault.publicAllocatorConfig.accruedFee` may over-estimate onchain accrued fees because the
   * simulation accrues the public allocator fee once per computed withdrawal, while the onchain
   * `reallocateTo` call charges once per vault reallocation group.
   *
   * @example
   * ```ts
   * import type { MarketId } from "@morpho-org/blue-sdk";
   * import { LiquidityLoader } from "@morpho-org/liquidity-sdk-viem";
   * import { createPublicClient, http } from "viem";
   * import { mainnet } from "viem/chains";
   *
   * const client = createPublicClient({
   *   chain: mainnet,
   *   transport: http("https://rpc.example"),
   * });
   * const loader = new LiquidityLoader(client);
   *
   * const marketId =
   *   "0x7bbbb127f5d2886295f50f3cdf86231d9ff45f248639ee1fd3f2bd5d8b129dcf" as MarketId;
   * const { withdrawals, endState } = await loader.fetch(marketId);
   *
   * // withdrawals: readonly PublicReallocation[]
   * // endState: ReallocationData
   * ```
   */
  public fetch(marketId: MarketId) {
    return this.dataLoader.load(marketId);
  }
}
