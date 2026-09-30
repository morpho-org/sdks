import { UnsupportedChainIdError } from "@morpho-org/blue-sdk";
import {
  blueAbi,
  vaultBundlesV1Abi,
  vaultExitBundlesV1Abi,
} from "@morpho-org/morpho-sdk/abis";
import { getChainAddresses } from "@morpho-org/morpho-sdk/addresses";
import { _try } from "@morpho-org/morpho-ts";
import {
  type Address,
  decodeFunctionData,
  getAddress,
  isAddressEqual,
} from "viem";
import { UnsupportedChainError } from "../errors.js";
import type { SimulationTransaction } from "../types.js";

/** Calldata addresses whose on-chain kind can only be resolved by pinned reads. */
export interface BindingCandidates {
  /**
   * Addresses bound to be vaults: VaultBundlesV1 / VaultExitBundlesV1 vault
   * arguments plus the `to` of any transaction targeting neither a registered
   * bundle nor Morpho (a VaultV2 multicall forceRedeem candidate).
   */
  readonly vaults: readonly Address[];
  /**
   * `setAuthorization` `authorized` arguments that are not the registered
   * BlueBundlesV1 deployment — candidate pre-liquidation contracts.
   */
  readonly preLiquidations: readonly Address[];
}

const pushUnique = (list: Address[], address: Address): void => {
  const checksummed = getAddress(address);
  if (!list.some((entry) => isAddressEqual(entry, checksummed))) {
    list.push(checksummed);
  }
};

/**
 * Pre-scan calldata for the addresses whose on-chain bindings
 * (`vaults`, `preLiquidations`) {@link decodeOperations} needs.
 *
 * Pure and permissive: calldata that fails to decode contributes no candidates
 * — the decoder reports the failure itself. A transaction whose `to` is
 * neither a registered bundle nor Morpho is always a VaultV2 multicall
 * candidate, even when its calldata is undecodable.
 *
 * @param chainId - Target chain; must be present in the address registry.
 * @param transactions - Normalized user transactions to scan.
 * @returns Deduped candidate vault and pre-liquidation addresses.
 * @throws {UnsupportedChainError} when `chainId` is absent from the registry.
 * @internal
 */
export function collectBindingCandidates(params: {
  readonly chainId: number;
  readonly transactions: readonly Readonly<SimulationTransaction>[];
}): BindingCandidates {
  const { chainId, transactions } = params;

  const addresses = _try(
    () => getChainAddresses(chainId),
    UnsupportedChainIdError,
  );
  if (addresses == null) {
    throw new UnsupportedChainError(chainId);
  }
  const morpho = addresses.blue;
  const blueBundlesV1 = addresses.bundles?.blueBundlesV1;
  const vaultBundlesV1 = addresses.bundles?.vaultBundlesV1;
  const vaultExitBundlesV1 = addresses.bundles?.vaultExitBundlesV1;

  const vaults: Address[] = [];
  const preLiquidations: Address[] = [];

  for (const tx of transactions) {
    if (tx.data === "0x" || tx.data.length < 10) {
      continue;
    }
    if (vaultBundlesV1 != null && isAddressEqual(tx.to, vaultBundlesV1)) {
      try {
        const decoded = decodeFunctionData({
          abi: vaultBundlesV1Abi,
          data: tx.data,
        });
        switch (decoded.functionName) {
          case "vaultBundlesV1Deposit":
          case "vaultBundlesV1Withdraw": {
            const [vault] = decoded.args;
            pushUnique(vaults, vault);
            break;
          }
          case "vaultBundlesV1Migrate": {
            const [sourceVault, destVault] = decoded.args;
            pushUnique(vaults, sourceVault);
            pushUnique(vaults, destVault);
            break;
          }
        }
      } catch {
        // Undecodable calldata contributes no candidates; decodeOperations reports it.
      }
      continue;
    }
    if (
      vaultExitBundlesV1 != null &&
      isAddressEqual(tx.to, vaultExitBundlesV1)
    ) {
      try {
        const decoded = decodeFunctionData({
          abi: vaultExitBundlesV1Abi,
          data: tx.data,
        });
        switch (decoded.functionName) {
          case "vaultExitBundlesV1ForceWithdrawVaultV2":
          case "vaultExitBundlesV1InKindRedemptionVaultV1":
          case "vaultExitBundlesV1InKindRedemptionVaultV2": {
            const [vault] = decoded.args;
            pushUnique(vaults, vault);
            break;
          }
        }
      } catch {
        // Undecodable calldata contributes no candidates; decodeOperations reports it.
      }
      continue;
    }
    if (isAddressEqual(tx.to, morpho)) {
      try {
        const decoded = decodeFunctionData({ abi: blueAbi, data: tx.data });
        if (decoded.functionName === "setAuthorization") {
          const [authorized] = decoded.args;
          if (
            blueBundlesV1 == null ||
            !isAddressEqual(authorized, blueBundlesV1)
          ) {
            pushUnique(preLiquidations, authorized);
          }
        }
      } catch {
        // Undecodable calldata contributes no candidates; decodeOperations reports it.
      }
      continue;
    }
    // Neither a registered bundle nor Morpho: a bound-vault multicall candidate.
    pushUnique(vaults, tx.to);
  }

  return { vaults, preLiquidations };
}
