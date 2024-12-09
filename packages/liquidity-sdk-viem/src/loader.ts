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

export type LiquidityRequest = {
  marketId: MarketId;
  from: "api" | "rpc";
};

export type DefinedBlockParameters = UnionPick<
  GetBlockParameters<false, Exclude<BlockTag, "pending">>,
  "blockNumber" | "blockTag"
>;

export class LiquidityLoader<
  chain extends Chain = Chain,
  account extends Account | undefined = Account | undefined,
> {
  public client?: Client<Transport, chain, account>;
  public readonly parameters: { chainId?: ChainId } & DefinedBlockParameters;

  protected readonly dataLoader: DataLoader<
    LiquidityRequest,
    PublicReallocation[]
  >;

  constructor(
    client: Client<Transport, chain, account>,
    parameters?: DefinedBlockParameters,
  );
  constructor(parameters: { chainId: ChainId } & DefinedBlockParameters);
  constructor(
    clientOrParameters:
      | Client<Transport, chain, account>
      | ({ chainId?: ChainId } & DefinedBlockParameters),
    parameters: DefinedBlockParameters = {},
  ) {
    if ("chainId" in clientOrParameters) {
      this.parameters = clientOrParameters;
    } else {
      this.client = clientOrParameters as Client<Transport, chain, account>;
      this.parameters = parameters;
    }

    this.dataLoader = new DataLoader(
      async (reqs) => {
        const { client } = this;
        const chainId = this.parameters.chainId ?? client!.chain.id;

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
              getBlock<chain, account, false, Exclude<BlockTag, "pending">>(
                client,
                this.parameters,
              ),
              Promise.all(
                [...allMarketIds].map((marketId) =>
                  fetchMarket(marketId, client, this.parameters),
                ),
              ),
              Promise.all(
                [...allVaults].map((vault) =>
                  fetchVault(vault, client, this.parameters),
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
                                  this.parameters,
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
                                  this.parameters,
                                ),
                                vaultMarketConfig: await fetchVaultMarketConfig(
                                  vault,
                                  market.uniqueKey,
                                  client,
                                  this.parameters,
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
                },
              ).withdrawals;
            } catch (error) {
              rpcWithdrawals[marketId] = error as Error;
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
        cache: !this.parameters.blockTag,
        cacheKeyFn: ({ marketId, from }) => `${from}:${marketId}`,
      },
    );
  }

  public fetch(marketId: MarketId, from: "api" | "rpc" = "api") {
    return this.dataLoader.load({ marketId, from });
  }
}
