import type { MarketId } from "@morpho-org/blue-sdk";
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

export class LiquidityLoader<
  chain extends Chain = Chain,
  account extends Account | undefined = Account | undefined,
> {
  protected readonly dataLoader: DataLoader<MarketId, PublicReallocation[]>;

  constructor(
    public readonly client: Client<Transport, chain, account>,
    public readonly parameters: UnionPick<
      GetBlockParameters<false, Exclude<BlockTag, "pending">>,
      "blockNumber" | "blockTag"
    >,
  ) {
    this.dataLoader = new DataLoader(
      async (marketIds) => {
        const data = await apiSdk.getMarkets({
          chainId: client.chain.id,
          marketIds: [...marketIds],
        });

        const apiMarkets = data.markets.items ?? [];

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

        const [block, markets, vaults, vaultsTokens, vaultsMarkets] =
          await Promise.all([
            getBlock<chain, account, false, Exclude<BlockTag, "pending">>(
              client,
              parameters,
            ),
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

        const maxWithdrawalUtilization = fromEntries(
          allVaultsMarkets.flatMap(([, markets]) =>
            markets.map((market) => [
              market.uniqueKey,
              market.targetWithdrawUtilization,
            ]),
          ),
        );

        const state = new SimulationState({
          chainId: client.chain.id,
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

        return marketIds.map(
          (marketId) =>
            state.getMarketPublicReallocations(marketId, {
              enabled: true,
              maxWithdrawalUtilization,
            }).withdrawals,
        );
      },
      { cache: !parameters.blockTag },
    );
  }

  public fetch(marketId: MarketId) {
    return this.dataLoader.load(marketId);
  }
}
