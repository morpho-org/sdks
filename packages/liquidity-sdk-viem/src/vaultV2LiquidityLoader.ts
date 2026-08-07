import type { MarketId } from "@morpho-org/blue-sdk";
import {
  fetchAccrualVaultV2,
  fetchMarket,
  fetchVaultV2PublicAllocatorData,
} from "@morpho-org/blue-sdk-viem";
import {
  DEFAULT_SUPPLY_TARGET_UTILIZATION,
  type VaultV2BlueReallocation,
} from "@morpho-org/morpho-sdk";
import { VaultV2ReallocationData } from "@morpho-org/morpho-sdk/entities";
import { fromEntries } from "@morpho-org/morpho-ts";
import DataLoader from "dataloader";
import type { Address, Chain, Client, Transport } from "viem";
import { getBlock } from "viem/actions";

const REALLOCATION_SIMULATION_DELAY = 3_600n;

/** Represents the configuration for fetching and simulating Vault V2 shared liquidity. */
export interface VaultV2LiquidityParameters {
  /** Explicit BluePublicAllocator contract used for every generated reallocation. */
  readonly allocator: Address;

  /** Vault V2 addresses whose reallocatable liquidity should be considered. */
  readonly vaults: readonly Address[];

  /** Maximum native-token penalty accepted per BluePublicAllocator call. */
  readonly maxNativePenalty?: bigint;

  /** Deployless read mode forwarded to Vault V2 fetchers. Defaults to `true` with direct-read fallback. */
  readonly deployless?: boolean | "force";
}

/** Represents a Vault V2 shared-liquidity plan built from one consistent block snapshot. */
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
 * This class is independent from the Vault V1 `LiquidityLoader`: it
 * discovers no allocator or vault addresses through the API and only consumes
 * the explicit Vault V2 configuration supplied by the caller.
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
   * @param client - Viem client used to snapshot onchain state.
   * @param parameters - Explicit allocator, participating vaults, and optional fetch/planning limits.
   */
  public constructor(
    public readonly client: Client<Transport, chain>,
    public readonly parameters: VaultV2LiquidityParameters,
  ) {
    this.dataLoader = new DataLoader(
      async (marketIds) => {
        const { client: loaderClient, parameters: loaderParameters } = this;
        const block = await getBlock(loaderClient);
        const fetchParameters = {
          blockNumber: block.number,
          deployless: loaderParameters.deployless,
        } as const;

        const [markets, vaults] = await Promise.all([
          Promise.all(
            marketIds.map((marketId) =>
              fetchMarket(marketId, loaderClient, {
                blockNumber: block.number,
                chainId: loaderClient.chain.id,
              }),
            ),
          ),
          Promise.all(
            loaderParameters.vaults.map((vault) =>
              fetchAccrualVaultV2(vault, loaderClient, {
                ...fetchParameters,
                chainId: loaderClient.chain.id,
              }),
            ),
          ),
        ]);
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
          chainId: loaderClient.chain.id,
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

        return markets.map((market) => {
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
   * @throws {UnknownFactory} when the configured chain has no Vault V2 factory.
   * @throws {UnknownOfFactory} when a configured vault address is not a Vault V2 from the chain's factory.
   * @throws {UnsupportedVaultV2AdapterError} when a configured vault contains an unsupported adapter.
   * @throws {viem.BaseError} when a viem RPC read fails.
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
