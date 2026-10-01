import { vaultV2Abi } from "@morpho-org/morpho-sdk/abis";
import {
  type Address,
  encodeFunctionData,
  erc20Abi,
  type Hex,
  zeroAddress,
} from "viem";
import type { StateRead } from "./contract.js";

/** Vault V2 subjects: totals, owner shares, idle liquidity, and per-id allocations. @internal */
export interface VaultV2Subjects {
  readonly vault: Address;
  readonly owner: Address;
  readonly asset: Address;
  /** Zero when the vault has no liquidity adapter; idle reads are skipped then. */
  readonly liquidityAdapter?: Address;
  /** Allocation ids (`liquidityAllocations` / deallocation targets). */
  readonly allocationIds: readonly Hex[];
}

/**
 * Encode Vault V2 reads: `totalAssets`, `totalSupply`, `balanceOf(owner)`,
 * idle (`asset.balanceOf(liquidityAdapter)` — withdrawable idle lives in the
 * adapter, not the vault's own balance), and `allocation(id)` per id.
 * @internal
 */
export function vaultV2Reads(subjects: VaultV2Subjects): StateRead[] {
  const { vault, owner, asset, liquidityAdapter } = subjects;
  const reads: StateRead[] = [
    {
      kind: "vault.totalAssets",
      id: `vault.totalAssets:${vault}`,
      to: vault,
      data: encodeFunctionData({
        abi: vaultV2Abi,
        functionName: "totalAssets",
      }),
      vault,
    },
    {
      kind: "vault.totalSupply",
      id: `vault.totalSupply:${vault}`,
      to: vault,
      data: encodeFunctionData({
        abi: vaultV2Abi,
        functionName: "totalSupply",
      }),
      vault,
    },
    {
      kind: "vault.balanceOf",
      id: `vault.balanceOf:${vault}:${owner}`,
      to: vault,
      data: encodeFunctionData({
        abi: vaultV2Abi,
        functionName: "balanceOf",
        args: [owner],
      }),
      vault,
      account: owner,
    },
  ];

  if (liquidityAdapter != null && liquidityAdapter !== zeroAddress) {
    reads.push({
      kind: "vault.idleAssets",
      id: `vault.idleAssets:${vault}`,
      to: asset,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [liquidityAdapter],
      }),
      vault,
      asset,
      liquidityAdapter,
    });
  }

  for (const allocationId of subjects.allocationIds) {
    reads.push({
      kind: "vault.allocation",
      id: `vault.allocation:${vault}:${allocationId}`,
      to: vault,
      data: encodeFunctionData({
        abi: vaultV2Abi,
        functionName: "allocation",
        args: [allocationId],
      }),
      vault,
      allocationId,
    });
  }

  return reads;
}
