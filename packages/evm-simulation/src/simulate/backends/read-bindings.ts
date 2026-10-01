import {
  type AccrualVault,
  type AccrualVaultV2,
  type MarketId,
  MarketUtils,
  UnsupportedChainIdError,
} from "@morpho-org/blue-sdk";
import {
  blueAbi,
  bluePreLiquidationAbi,
  bluePreLiquidationFactoryAbi,
  metaMorphoAbi,
  metaMorphoFactoryAbi,
  vaultV2Abi,
  vaultV2FactoryAbi,
} from "@morpho-org/morpho-sdk/abis";
import { getChainAddresses } from "@morpho-org/morpho-sdk/addresses";
import {
  fetchAccrualVault,
  fetchAccrualVaultV2,
} from "@morpho-org/morpho-sdk/blue/fetch";
import { _try } from "@morpho-org/morpho-ts";
import type { Address, Client } from "viem";
import { readContract } from "viem/actions";
import {
  ExternalServiceError,
  SimulationPackageError,
  UnsupportedChainError,
} from "../../errors.js";
import type { OperationLimit } from "../../limits.js";

/** On-chain read of a market's params (the `idToMarketParams` result). @internal */
export interface MarketBinding {
  readonly marketId: MarketId;
  readonly params: {
    readonly loanToken: Address;
    readonly collateralToken: Address;
    readonly oracle: Address;
    readonly irm: Address;
    readonly lltv: bigint;
  };
}

/** A declared vault address resolved to its generation and underlying asset. @internal */
export interface VaultBinding {
  readonly address: Address;
  readonly kind: "vaultV1" | "vaultV2";
  readonly asset: Address;
}

/** A pre-liquidation contract resolved to its market. @internal */
export interface PreLiquidationBinding {
  readonly address: Address;
  readonly market: MarketBinding;
}

/**
 * MetaMorpho V1.0 factory, only ever registered on Ethereum and Base — the
 * registry's `metaMorphoFactory` key holds the V1.1 factory, mirroring
 * blue-sdk-viem's `fetchVault` two-factory check.
 */
const META_MORPHO_V1_0_FACTORY: Partial<Record<number, Address>> = {
  1: "0xA9c3D3a366466Fa809d1Ae982Fb2c46E5fC41101",
  8453: "0xA9c3D3a366466Fa809d1Ae982Fb2c46E5fC41101",
};

/** Every market id referenced by the declared operation limits. @internal */
const limitMarketIds = (operations: readonly OperationLimit[]): MarketId[] => {
  const ids = new Set<MarketId>();
  for (const op of operations) {
    if ("marketId" in op && op.marketId != null) ids.add(op.marketId);
    if ("sourceMarketId" in op) ids.add(op.sourceMarketId);
    if ("targetMarketId" in op) ids.add(op.targetMarketId);
    if ("expectedDeallocations" in op)
      for (const leg of op.expectedDeallocations ?? [])
        if (leg.marketId != null) ids.add(leg.marketId);
    if ("expectedMarketIds" in op)
      for (const leg of op.expectedMarketIds ?? []) ids.add(leg);
    if ("minSupplyAssetsByMarket" in op)
      for (const entry of op.minSupplyAssetsByMarket ?? [])
        ids.add(entry.marketId);
  }
  return [...ids];
};

/** Every vault address referenced by the declared operation limits. @internal */
const limitVaults = (operations: readonly OperationLimit[]): Address[] => {
  const vaults = new Set<Address>();
  for (const op of operations) {
    if ("vault" in op && op.vault != null) vaults.add(op.vault);
    if ("sourceVault" in op) vaults.add(op.sourceVault);
    if ("targetVault" in op) vaults.add(op.targetVault);
  }
  return [...vaults];
};

/** Every `authorized` address a `blueAuthorization` limit names (pre-liquidation candidates). @internal */
const limitPreLiquidationCandidates = (
  operations: readonly OperationLimit[],
): Address[] => {
  const candidates = new Set<Address>();
  for (const op of operations)
    if (op.type === "blueAuthorization") candidates.add(op.authorized);
  return [...candidates];
};

/**
 * Resolve the market params, vault kinds and pre-liquidation markets the
 * declared operation limits name.
 *
 * Vault addresses are checked against the MetaMorpho factories (V1.1 from the
 * registry plus the V1.0 fallback on chains 1 and 8453) and the VaultV2
 * factory; a bound vault then reads `asset()`. Pre-liquidation candidates are
 * checked against the pre-liquidation factory, then bound to their market via
 * `preLiquidation.ID()` → `morpho.idToMarketParams`.
 *
 * Candidates matching no factory are simply unbound — a pinned limit whose
 * subject never resolved fails its check in `checkOperations`.
 *
 * @param params - Read parameters.
 * @param params.client - Shared simulation client.
 * @param params.chainId - Chain to resolve registry addresses on.
 * @param params.operations - Declared operation limits naming the subjects.
 * @param params.blockNumber - Pinned state block for every read.
 * @returns The market, vault and pre-liquidation bindings.
 * @throws {UnsupportedChainError} when `chainId` is absent from the registry.
 * @throws {ExternalServiceError} when a factory or contract read fails.
 * @internal
 */
export async function readBindings(params: {
  readonly client: Client;
  readonly chainId: number;
  readonly operations: readonly OperationLimit[];
  readonly blockNumber: bigint;
}): Promise<{
  readonly markets: readonly MarketBinding[];
  readonly vaults: readonly VaultBinding[];
  readonly preLiquidations: readonly PreLiquidationBinding[];
}> {
  const { client, chainId, operations, blockNumber } = params;

  const addresses = _try(
    () => getChainAddresses(chainId),
    UnsupportedChainIdError,
  );
  if (addresses == null) {
    throw new UnsupportedChainError(chainId);
  }

  try {
    const readParams = async (marketId: `0x${string}`) => {
      const [loanToken, collateralToken, oracle, irm, lltv] =
        await readContract(client, {
          address: addresses.blue,
          abi: blueAbi,
          functionName: "idToMarketParams",
          args: [marketId],
          blockNumber,
        });
      const params_ = { loanToken, collateralToken, oracle, irm, lltv };
      return {
        marketId: MarketUtils.getMarketId(params_),
        params: params_,
      } satisfies MarketBinding;
    };

    const markets = await Promise.all(
      limitMarketIds(operations).map(readParams),
    );

    const vaults = (
      await Promise.all(
        limitVaults(operations).map(
          async (address): Promise<VaultBinding[]> => {
            let kind: VaultBinding["kind"] | undefined;
            if (addresses.metaMorphoFactory != null) {
              const isMetaMorpho = await readContract(client, {
                address: addresses.metaMorphoFactory,
                abi: metaMorphoFactoryAbi,
                functionName: "isMetaMorpho",
                args: [address],
                blockNumber,
              });
              if (isMetaMorpho) kind = "vaultV1";
            }
            const v1_0Factory = META_MORPHO_V1_0_FACTORY[chainId];
            if (kind === undefined && v1_0Factory != null) {
              const isMetaMorpho = await readContract(client, {
                address: v1_0Factory,
                abi: metaMorphoFactoryAbi,
                functionName: "isMetaMorpho",
                args: [address],
                blockNumber,
              });
              if (isMetaMorpho) kind = "vaultV1";
            }
            if (kind === undefined && addresses.vaultV2Factory != null) {
              const isVaultV2 = await readContract(client, {
                address: addresses.vaultV2Factory,
                abi: vaultV2FactoryAbi,
                functionName: "isVaultV2",
                args: [address],
                blockNumber,
              });
              if (isVaultV2) kind = "vaultV2";
            }
            if (kind === undefined) return [];
            const asset =
              kind === "vaultV1"
                ? await readContract(client, {
                    address,
                    abi: metaMorphoAbi,
                    functionName: "asset",
                    blockNumber,
                  })
                : await readContract(client, {
                    address,
                    abi: vaultV2Abi,
                    functionName: "asset",
                    blockNumber,
                  });
            return [{ address, kind, asset }];
          },
        ),
      )
    ).flat();

    const preLiquidations = (
      await Promise.all(
        limitPreLiquidationCandidates(operations).map(
          async (address): Promise<PreLiquidationBinding[]> => {
            if (addresses.preLiquidationFactory == null) return [];
            const isPreLiquidation = await readContract(client, {
              address: addresses.preLiquidationFactory,
              abi: bluePreLiquidationFactoryAbi,
              functionName: "isPreLiquidation",
              args: [address],
              blockNumber,
            });
            if (!isPreLiquidation) return [];
            const marketId = await readContract(client, {
              address,
              abi: bluePreLiquidationAbi,
              functionName: "ID",
              blockNumber,
            });
            return [{ address, market: await readParams(marketId) }];
          },
        ),
      )
    ).flat();

    return { markets, vaults, preLiquidations };
  } catch (error) {
    if (error instanceof SimulationPackageError) throw error;
    throw new ExternalServiceError(
      `Pinned binding read error: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

/**
 * Fetch the `AccrualVault`/`AccrualVaultV2` entity handles for every bound
 * vault at the pinned block. The entities carry accrual state, cap tables
 * and `forceDeallocatePenalties` that no single view call exposes; in-block
 * reads still verify every public field they underpin.
 *
 * @internal
 */
export async function readVaultEntities(params: {
  readonly client: Client;
  readonly vaults: readonly VaultBinding[];
  readonly blockNumber: bigint;
}): Promise<ReadonlyMap<Address, AccrualVault | AccrualVaultV2>> {
  const { client, vaults, blockNumber } = params;
  try {
    const entities = new Map<Address, AccrualVault | AccrualVaultV2>();
    await Promise.all(
      vaults.map(async (binding) => {
        const vault =
          binding.kind === "vaultV1"
            ? await fetchAccrualVault(binding.address, client, {
                blockNumber,
              })
            : await fetchAccrualVaultV2(binding.address, client, {
                blockNumber,
              });
        entities.set(binding.address, vault);
      }),
    );
    return entities;
  } catch (error) {
    if (error instanceof SimulationPackageError) throw error;
    throw new ExternalServiceError(
      `Pinned vault entity read error: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}
