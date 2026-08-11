import {
  AccrualVaultV2,
  AccrualVaultV2MorphoMarketV1AdapterV2,
  getChainAddresses,
  Market,
  type MarketId,
  MarketParams,
} from "@morpho-org/blue-sdk";
import {
  fetchAccrualVaultV2,
  fetchVaultV2PublicAllocatorData,
} from "@morpho-org/blue-sdk-viem";
import {
  DEFAULT_SUPPLY_TARGET_UTILIZATION,
  type VaultV2BlueReallocation,
} from "@morpho-org/morpho-sdk";
import { VaultV2ReallocationData } from "@morpho-org/morpho-sdk/entities";
import { fromEntries } from "@morpho-org/morpho-ts";
import DataLoader from "dataloader";
import {
  type Address,
  type Chain,
  type Client,
  isAddressEqual,
  type Transport,
  zeroAddress,
} from "viem";
import { getBlock } from "viem/actions";
import {
  fetchRestMarket,
  fetchRestMarketIrm,
  fetchRestMarketPosition,
  fetchRestMarketState,
  fetchRestOracleState,
  fetchRestVaultV2,
  fetchRestVaultV2Allocations,
  fetchRestVaultV2State,
  fetchRestVaultV2WithdrawalOptions,
} from "./api/rest.js";
import { MissingVaultV2LiquidityApiDataError } from "./errors.js";

const REALLOCATION_SIMULATION_DELAY = 3_600n;

/** Represents the configuration for fetching and simulating Vault V2 shared liquidity. */
export interface VaultV2LiquidityParameters {
  /** Explicit BluePublicAllocator contract used for every generated reallocation. */
  readonly allocator: Address;

  /** Vault V2 addresses whose reallocatable liquidity should be considered. */
  readonly vaults: readonly Address[];

  /** Maximum native-token penalty accepted per BluePublicAllocator call. */
  readonly maxNativePenalty?: bigint;

  /** Deployless read mode forwarded to allocator reads and RPC fallbacks. Defaults to `true` with direct-read fallback. */
  readonly deployless?: boolean | "force";
}

/** Represents a Vault V2 shared-liquidity plan built from the latest indexed API state. */
export interface VaultV2LiquidityResult {
  /** Vault V2 state before applying the computed reallocations. */
  readonly startState: VaultV2ReallocationData;

  /** Vault V2 state after applying the computed reallocations. */
  readonly endState: VaultV2ReallocationData;

  /** Flat action-ready BluePublicAllocator calls, in execution order. */
  readonly reallocations: readonly VaultV2BlueReallocation[];

  /** Fixed target utilization used by the Vault V2 planner, scaled by WAD. */
  readonly targetBorrowUtilization: bigint;
}

/**
 * Represents a loader that fetches and simulates Vault V2 BluePublicAllocator shared liquidity.
 *
 * This class is independent from the Vault V1 `LiquidityLoader`. It consumes
 * explicit allocator and vault addresses, loads Vault V2 and market state from
 * the Morpho REST API, and reads BluePublicAllocator-only configuration through
 * the viem client.
 *
 * @example
 * ```ts
 * import type { MarketId } from "@morpho-org/blue-sdk";
 * import {
 *   type VaultV2LiquidityResult,
 *   VaultV2LiquidityLoader,
 * } from "@morpho-org/liquidity-sdk-viem";
 * import { type Address, createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * export async function loadVaultV2Liquidity(
 *   allocator: Address,
 *   vault: Address,
 *   marketId: MarketId,
 * ): Promise<VaultV2LiquidityResult> {
 *   const client = createPublicClient({ chain: mainnet, transport: http() });
 *   const loader = new VaultV2LiquidityLoader(client, {
 *     allocator,
 *     vaults: [vault],
 *     maxNativePenalty: 1_000_000_000_000_000n,
 *   });
 *   return loader.fetch(marketId);
 * }
 * ```
 */
export class VaultV2LiquidityLoader<chain extends Chain = Chain> {
  protected readonly dataLoader: DataLoader<MarketId, VaultV2LiquidityResult>;

  /**
   * Creates a Vault V2 shared-liquidity loader.
   *
   * @param client - Viem client used for the current block and BluePublicAllocator-only state.
   * @param parameters - Explicit allocator, participating vaults, and optional fetch/planning limits.
   */
  public constructor(
    public readonly client: Client<Transport, chain>,
    public readonly parameters: VaultV2LiquidityParameters,
  ) {
    this.dataLoader = new DataLoader(
      async (marketIds) => {
        const { client: loaderClient, parameters: loaderParameters } = this;
        const chainId = loaderClient.chain.id;
        const [block, restVaults] = await Promise.all([
          getBlock(loaderClient),
          Promise.all(
            loaderParameters.vaults.map(async (vault) => {
              const [config, state, allocations] = await Promise.all([
                fetchRestVaultV2(chainId, vault),
                fetchRestVaultV2State(chainId, vault),
                fetchRestVaultV2Allocations(chainId, vault),
              ]);
              return { config, state, allocations };
            }),
          ),
        ]);
        const fetchParameters = {
          blockNumber: block.number,
          deployless: loaderParameters.deployless,
        } as const;

        const restHydratedVaults = restVaults.filter(
          ({ config, allocations }) =>
            allocations.allocations.every(
              ({ adapter_kind }) => adapter_kind === "morpho_market_v1_v2",
            ) &&
            !(
              config.gates.receive_shares != null &&
              (BigInt(config.management_fee_wad ?? 0) > 0n ||
                BigInt(config.performance_fee_wad ?? 0) > 0n)
            ),
        );
        const rpcHydratedVaults = restVaults.filter(
          (vault) => !restHydratedVaults.includes(vault),
        );

        const rpcVaults = await Promise.all(
          rpcHydratedVaults.map(({ config }) =>
            fetchAccrualVaultV2(config.address, loaderClient, {
              ...fetchParameters,
              chainId,
            }),
          ),
        );

        const restMarketIds = new Set<MarketId>(marketIds);
        for (const { allocations } of restHydratedVaults) {
          for (const adapter of allocations.allocations) {
            for (const cap of adapter.caps) {
              if (cap.market_id != null) restMarketIds.add(cap.market_id);
            }
          }
        }

        const adapterMarketPairs = new Map<
          string,
          { readonly adapterAddress: Address; readonly marketId: MarketId }
        >();
        for (const { allocations } of restHydratedVaults) {
          for (const allocation of allocations.allocations) {
            for (const { market_id } of allocation.caps) {
              if (market_id == null) continue;
              adapterMarketPairs.set(
                `${allocation.adapter_address.toLowerCase()}:${market_id.toLowerCase()}`,
                {
                  adapterAddress: allocation.adapter_address,
                  marketId: market_id,
                },
              );
            }
          }
        }
        const allRestMarketIds = [...restMarketIds];
        const { adaptiveCurveIrm } = getChainAddresses(chainId);

        const [restMarkets, withdrawalOptions, marketPositions] =
          await Promise.all([
            Promise.all(
              allRestMarketIds.map(async (marketId) => {
                const config = await fetchRestMarket(chainId, marketId);
                const [state, oracleState, marketIrm] = await Promise.all([
                  fetchRestMarketState(chainId, marketId),
                  isAddressEqual(config.oracle_address, zeroAddress)
                    ? undefined
                    : fetchRestOracleState(chainId, config.oracle_address),
                  isAddressEqual(config.irm_address, adaptiveCurveIrm)
                    ? fetchRestMarketIrm(chainId, marketId)
                    : undefined,
                ]);
                if (
                  isAddressEqual(config.irm_address, adaptiveCurveIrm) &&
                  marketIrm?.rateAtTarget == null
                )
                  throw new MissingVaultV2LiquidityApiDataError(
                    `market ${config.market_id} rateAtTarget`,
                  );

                return {
                  config,
                  state,
                  price:
                    oracleState?.price == null
                      ? undefined
                      : BigInt(oracleState.price),
                  rateAtTarget:
                    marketIrm?.rateAtTarget == null
                      ? undefined
                      : BigInt(marketIrm.rateAtTarget),
                };
              }),
            ),
            Promise.all(
              restHydratedVaults.map(async ({ config }) => ({
                vaultAddress: config.address,
                data: await fetchRestVaultV2WithdrawalOptions(
                  chainId,
                  config.address,
                ),
              })),
            ),
            Promise.all(
              [...adapterMarketPairs.values()].map(
                ({ adapterAddress, marketId }) =>
                  fetchRestMarketPosition({
                    chainId,
                    marketId,
                    user: adapterAddress,
                  }),
              ),
            ),
          ]);

        const forceDeallocatePenalties = new Map(
          withdrawalOptions.flatMap(({ vaultAddress, data }) =>
            data.adapter_penalties.map(
              ({ adapter_address, penalty_rate_wad }) =>
                [
                  `${vaultAddress.toLowerCase()}:${adapter_address.toLowerCase()}`,
                  BigInt(penalty_rate_wad),
                ] as const,
            ),
          ),
        );
        const positionSupplyShares = new Map(
          marketPositions.map(
            ({ user_address, market_id, supply_shares }) =>
              [
                `${user_address.toLowerCase()}:${market_id.toLowerCase()}`,
                BigInt(supply_shares),
              ] as const,
          ),
        );

        const markets = restMarkets.map(
          ({ config, state, price, rateAtTarget }) =>
            new Market({
              params: new MarketParams({
                loanToken: config.loan_token,
                collateralToken: config.collateral_token,
                oracle: config.oracle_address,
                irm: config.irm_address,
                lltv: BigInt(config.lltv_wad),
              }),
              totalSupplyAssets: BigInt(state.total_supply_assets),
              totalSupplyShares: BigInt(state.total_supply_shares),
              totalBorrowAssets: BigInt(state.total_borrow_assets),
              totalBorrowShares: BigInt(state.total_borrow_shares),
              lastUpdate: BigInt(state.last_accrual_timestamp),
              fee: BigInt(state.fee_wad),
              price,
              rateAtTarget,
            }),
        );
        const marketById = new Map(
          markets.map((market) => [market.id.toLowerCase(), market] as const),
        );

        const apiVaults = restHydratedVaults.map(
          ({ config, state, allocations }) => {
            const adapters = allocations.allocations.map((allocation) => {
              const adapterMarkets = allocation.caps
                .map(({ market_id }) => market_id)
                .filter((marketId): marketId is MarketId => marketId != null)
                .map((marketId) => {
                  const market = marketById.get(marketId.toLowerCase());
                  if (market == null)
                    throw new MissingVaultV2LiquidityApiDataError(
                      `market ${marketId}`,
                    );
                  return market;
                });
              const penalty = forceDeallocatePenalties.get(
                `${config.address.toLowerCase()}:${allocation.adapter_address.toLowerCase()}`,
              );
              if (penalty == null)
                throw new MissingVaultV2LiquidityApiDataError(
                  `vault ${config.address} adapter ${allocation.adapter_address} forceDeallocatePenalty`,
                );

              return {
                adapter: new AccrualVaultV2MorphoMarketV1AdapterV2(
                  {
                    address: allocation.adapter_address,
                    parentVault: config.address,
                    skimRecipient: zeroAddress,
                    marketIds: adapterMarkets.map(({ id }) => id),
                    adaptiveCurveIrm,
                    supplyShares: fromEntries(
                      adapterMarkets.map((market) => [
                        market.id,
                        positionSupplyShares.get(
                          `${allocation.adapter_address.toLowerCase()}:${market.id.toLowerCase()}`,
                        ) ?? 0n,
                      ]),
                    ),
                  },
                  adapterMarkets,
                ),
                penalty,
              };
            });
            const liquidityAdapter = adapters.find(({ adapter }) =>
              isAddressEqual(adapter.address, config.liquidity_adapter),
            )?.adapter;

            return new AccrualVaultV2(
              {
                address: config.address,
                name: config.name,
                symbol: config.symbol,
                decimals: config.asset.decimals + config.decimals_offset,
                asset: config.asset.address,
                _totalAssets: BigInt(state.total_assets),
                totalSupply: BigInt(state.total_supply),
                virtualShares: 10n ** BigInt(config.decimals_offset),
                maxRate: BigInt(config.max_rate_per_second_wad),
                lastUpdate: BigInt(state.last_accrual_timestamp),
                liquidityAdapter: config.liquidity_adapter,
                liquidityData: config.liquidity_data,
                liquidityAllocations: undefined,
                performanceFee: BigInt(config.performance_fee_wad ?? 0),
                managementFee: BigInt(config.management_fee_wad ?? 0),
                performanceFeeRecipient:
                  config.performance_fee_recipient ?? zeroAddress,
                managementFeeRecipient:
                  config.management_fee_recipient ?? zeroAddress,
              },
              liquidityAdapter,
              adapters.map(({ adapter }) => adapter),
              BigInt(state.idle_assets),
              fromEntries(
                adapters.map(({ adapter, penalty }) => [
                  adapter.address,
                  penalty,
                ]),
              ),
            );
          },
        );
        const vaults = [...apiVaults, ...rpcVaults];

        const publicAllocatorData = await Promise.all(
          vaults.map((vault) =>
            fetchVaultV2PublicAllocatorData(
              loaderParameters.allocator,
              vault,
              loaderClient,
              fetchParameters,
            ),
          ),
        );
        const startState = new VaultV2ReallocationData({
          chainId,
          allocator: loaderParameters.allocator,
          markets: fromEntries(
            markets.map((market) => [market.id, market] as const),
          ),
          vaults: fromEntries(
            vaults.map((vault) => [vault.address, vault] as const),
          ),
          allocations: fromEntries(
            publicAllocatorData.map(
              ({ publicAllocatorConfig, allocations }) => [
                publicAllocatorConfig.vault,
                allocations,
              ],
            ),
          ),
          publicAllocatorConfigs: fromEntries(
            publicAllocatorData.map(({ publicAllocatorConfig }) => [
              publicAllocatorConfig.vault,
              publicAllocatorConfig,
            ]),
          ),
          marketPublicAllocatorConfigs: fromEntries(
            publicAllocatorData.map(
              ({ publicAllocatorConfig, marketPublicAllocatorConfigs }) => [
                publicAllocatorConfig.vault,
                marketPublicAllocatorConfigs,
              ],
            ),
          ),
        });

        return marketIds.map((marketId) => {
          const market = marketById.get(marketId.toLowerCase());
          if (market == null)
            throw new MissingVaultV2LiquidityApiDataError(
              `target market ${marketId}`,
            );
          const { data: endState, reallocations } =
            startState.computeVaultV2Reallocations(market.id, {
              timestamp: block.timestamp + REALLOCATION_SIMULATION_DELAY,
              reallocatableVaults: loaderParameters.vaults,
              maxNativePenalty: loaderParameters.maxNativePenalty,
            });

          return {
            startState,
            endState,
            reallocations,
            targetBorrowUtilization: DEFAULT_SUPPLY_TARGET_UTILIZATION,
          };
        });
      },
      { cache: false },
    );
  }

  /**
   * Fetches a Vault V2 shared-liquidity plan for a target Morpho Blue market.
   *
   * @param marketId - Target market id to plan reallocations for.
   * @returns The start state, simulated end state, action-ready reallocations, and target utilization.
   * @throws {VaultV2LiquidityApiError} when a REST API request fails.
   * @throws {MissingVaultV2LiquidityApiDataError} when indexed REST data is incomplete.
   * @throws {viem.BaseError} when a BluePublicAllocator read or RPC compatibility fallback fails.
   * @example
   * ```ts
   * import type { MarketId } from "@morpho-org/blue-sdk";
   * import { VaultV2LiquidityLoader } from "@morpho-org/liquidity-sdk-viem";
   * import { type Address, createPublicClient, http } from "viem";
   * import { mainnet } from "viem/chains";
   *
   * async function fetchPlan(
   *   allocator: Address,
   *   vault: Address,
   *   marketId: MarketId,
   * ) {
   *   const client = createPublicClient({ chain: mainnet, transport: http() });
   *   const loader = new VaultV2LiquidityLoader(client, {
   *     allocator,
   *     vaults: [vault],
   *   });
   *   const result = await loader.fetch(marketId);
   *   // result satisfies VaultV2LiquidityResult
   *   return result;
   * }
   * ```
   */
  public fetch(marketId: MarketId) {
    return this.dataLoader.load(marketId);
  }
}
