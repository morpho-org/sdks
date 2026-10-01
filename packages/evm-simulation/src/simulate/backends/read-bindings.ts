import {
  type AccrualVault,
  type AccrualVaultV2,
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
import { collectBindingCandidates } from "../../decode/bindings.js";
import type {
  PreLiquidationBinding,
  VaultBinding,
} from "../../decode/index.js";
import type { MarketBinding } from "../../decode/operation.js";
import {
  ExternalServiceError,
  SimulationPackageError,
  UnsupportedChainError,
} from "../../errors.js";
import type { SimulationTransaction } from "../../types.js";

/**
 * MetaMorpho V1.0 factory, only ever registered on Ethereum and Base — the
 * registry's `metaMorphoFactory` key holds the V1.1 factory, mirroring
 * blue-sdk-viem's `fetchVault` two-factory check.
 */
const META_MORPHO_V1_0_FACTORY: Partial<Record<number, Address>> = {
  1: "0xA9c3D3a366466Fa809d1Ae982Fb2c46E5fC41101",
  8453: "0xA9c3D3a366466Fa809d1Ae982Fb2c46E5fC41101",
};

/**
 * Resolve on-chain vault kinds and pre-liquidation markets for the calldata
 * candidates found by {@link collectBindingCandidates}.
 *
 * Vault candidates are checked against the MetaMorpho factories (V1.1 from the
 * registry plus the V1.0 fallback on chains 1 and 8453) and the VaultV2
 * factory; a bound vault then reads `asset()`. Pre-liquidation candidates are
 * checked against the pre-liquidation factory, then bound to their market via
 * `preLiquidation.ID()` → `morpho.idToMarketParams`.
 *
 * Candidates matching no factory are simply unbound — {@link decodeOperations}
 * reports the unsupported route itself.
 *
 * @param params - Read parameters.
 * @param params.client - Shared simulation client.
 * @param params.chainId - Chain to resolve registry addresses on.
 * @param params.transactions - User transactions to scan for candidates.
 * @param params.blockNumber - Pinned state block for every read.
 * @returns The vault and pre-liquidation bindings for `decodeOperations`.
 * @throws {UnsupportedChainError} when `chainId` is absent from the registry.
 * @throws {ExternalServiceError} when a factory or contract read fails.
 * @internal
 */
export async function readBindings(params: {
  readonly client: Client;
  readonly chainId: number;
  readonly transactions: readonly Readonly<SimulationTransaction>[];
  readonly blockNumber: bigint;
}): Promise<{
  readonly vaults: readonly VaultBinding[];
  readonly preLiquidations: readonly PreLiquidationBinding[];
}> {
  const { client, chainId, transactions, blockNumber } = params;

  const addresses = _try(
    () => getChainAddresses(chainId),
    UnsupportedChainIdError,
  );
  if (addresses == null) {
    throw new UnsupportedChainError(chainId);
  }

  try {
    const candidates = collectBindingCandidates({ chainId, transactions });

    const vaults = (
      await Promise.all(
        candidates.vaults.map(async (address): Promise<VaultBinding[]> => {
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
        }),
      )
    ).flat();

    const preLiquidations = (
      await Promise.all(
        candidates.preLiquidations.map(
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
            const [loanToken, collateralToken, oracle, irm, lltv] =
              await readContract(client, {
                address: addresses.blue,
                abi: blueAbi,
                functionName: "idToMarketParams",
                args: [marketId],
                blockNumber,
              });
            const params_ = { loanToken, collateralToken, oracle, irm, lltv };
            const market: MarketBinding = {
              marketId: MarketUtils.getMarketId(params_),
              params: params_,
            };
            return [{ address, market }];
          },
        ),
      )
    ).flat();

    return { vaults, preLiquidations };
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
