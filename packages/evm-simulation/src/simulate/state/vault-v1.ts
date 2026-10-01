import type { MarketId } from "@morpho-org/blue-sdk";
import { blueAbi, metaMorphoAbi } from "@morpho-org/morpho-sdk/abis";
import {
  type Address,
  decodeAbiParameters,
  decodeFunctionResult,
  encodeFunctionData,
  type Hex,
} from "viem";
import { InvalidSimulationResponseError } from "../../errors.js";
import type { StateRead } from "./contract.js";
import { badRead } from "./erc20.js";

/** Vault V1 subjects: the vault plus the markets its allocations point at. @internal */
export interface VaultV1Subjects {
  readonly vault: Address;
  readonly owner: Address;
  readonly morpho: Address;
  /** Allocation markets (from the vault entity's withdraw queue). */
  readonly allocationMarketIds: readonly MarketId[];
}

/**
 * Encode Vault V1 (MetaMorpho) reads: `totalAssets`, `totalSupply`,
 * `balanceOf(owner)` and `position(marketId, vault)` per allocation market.
 * The matching `market(marketId)` reads are emitted by `morphoReads` so the
 * position's `supplyShares` can be converted to assets.
 * @internal
 */
export function vaultV1Reads(subjects: VaultV1Subjects): StateRead[] {
  const { vault, owner, morpho } = subjects;
  const reads: StateRead[] = [
    {
      kind: "vault.totalAssets",
      id: `vault.totalAssets:${vault}`,
      to: vault,
      data: encodeFunctionData({
        abi: metaMorphoAbi,
        functionName: "totalAssets",
      }),
      vault,
    },
    {
      kind: "vault.totalSupply",
      id: `vault.totalSupply:${vault}`,
      to: vault,
      data: encodeFunctionData({
        abi: metaMorphoAbi,
        functionName: "totalSupply",
      }),
      vault,
    },
    {
      kind: "vault.balanceOf",
      id: `vault.balanceOf:${vault}:${owner}`,
      to: vault,
      data: encodeFunctionData({
        abi: metaMorphoAbi,
        functionName: "balanceOf",
        args: [owner],
      }),
      vault,
      account: owner,
    },
  ];
  for (const marketId of subjects.allocationMarketIds) {
    reads.push({
      kind: "morpho.position",
      id: `morpho.position:${marketId}:${vault}`,
      to: morpho,
      data: encodeFunctionData({
        abi: blueAbi,
        functionName: "position",
        args: [marketId, vault],
      }),
      morpho,
      marketId,
      owner: vault,
    });
  }
  return reads;
}

/**
 * Decode a vault totals/idle/allocation read's return data (`uint256` for
 * every vault kind emitted here).
 * @internal
 */
export function decodeVaultValue(read: StateRead, data: Hex): bigint {
  try {
    switch (read.kind) {
      case "vault.totalAssets":
        return decodeFunctionResult({
          abi: metaMorphoAbi,
          functionName: "totalAssets",
          data,
        });
      case "vault.totalSupply":
        return decodeFunctionResult({
          abi: metaMorphoAbi,
          functionName: "totalSupply",
          data,
        });
      case "vault.balanceOf":
        return decodeFunctionResult({
          abi: metaMorphoAbi,
          functionName: "balanceOf",
          data,
        });
      case "vault.idleAssets":
        // ERC-20 `balanceOf(liquidityAdapter)` — encoded by `vault-v2.ts`.
        return decodeAbiParameters([{ type: "uint256" }], data)[0];
      case "vault.allocation":
        // VaultV2 `allocation(bytes32)` — returns a flat uint256.
        return decodeAbiParameters([{ type: "uint256" }], data)[0];
      default:
        throw new InvalidSimulationResponseError(
          `State read "${read.id}" is not a vault read`,
        );
    }
  } catch (error) {
    if (error instanceof InvalidSimulationResponseError) throw error;
    return badRead(read.id, error);
  }
}
