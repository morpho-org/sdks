import type { ChainId, MarketId } from "@morpho-org/blue-sdk";
import {
  fetchHolding,
  fetchMarket,
  fetchPosition,
  fetchVault,
  fetchVaultMarketConfig,
} from "@morpho-org/blue-sdk-ethers";
import { entries, fromEntries, isDefined } from "@morpho-org/morpho-ts";
import {
  type MaybeDraft,
  type PublicReallocation,
  SimulationState,
} from "@morpho-org/simulation-sdk";
import DataLoader from "dataloader";
import type { Provider } from "ethers";
import { apiSdk } from "./api";

export interface LiquidityParameters {
  /* The delay to consider between the moment reallocations are calculated and the moment they are committed onchain. Defaults to 1h. */
  delay?: bigint;
}

export class LiquidityLoader {
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
    public provider: Provider,
    public readonly parameters: {
      chainId?: ChainId;
    } & LiquidityParameters = {},
  ) {
    this.dataLoader = new DataLoader(async (marketIds) => {
      const { provider, parameters } = this;
      const chainId =
        parameters.chainId ?? Number((await provider!.getNetwork()).chainId);

      const [block, data] = await Promise.all([
        provider.getBlock("latest", false),
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

      const [markets, vaults, vaultsTokens, vaultsMarkets] = await Promise.all([
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

      const startState = new SimulationState({
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

      return apiMarkets.map(({ uniqueKey, targetBorrowUtilization }) => {
        try {
          const { data: endState, withdrawals } =
            startState.getMarketPublicReallocations(uniqueKey, {
              enabled: true,
              maxWithdrawalUtilization,
              delay: parameters.delay,
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
    });
  }

  public fetch(marketId: MarketId) {
    return this.dataLoader.load(marketId);
  }
}
