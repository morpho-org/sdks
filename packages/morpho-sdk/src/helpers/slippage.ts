import {
  type AccrualVault,
  AccrualVaultV2,
  MathLib,
} from "@morpho-org/blue-sdk";
import {
  NonPositiveInputError,
  VaultV2ForceWithdrawZeroSharePriceError,
} from "../types/index.js";
import { MAX_ABSOLUTE_SHARE_PRICE } from "./constant.js";
import { validateSlippageTolerance } from "./validate.js";

/**
 * Computes the minimum Vault V2 force-withdraw share price (in RAY, 1e27) for slippage protection.
 *
 * Mirrors the on-chain check in `VaultExitBundlesV1.vaultExitBundlesV1ForceWithdrawVaultV2`:
 * ```solidity
 * require(totalSharesBurnt == 0 || withdrawn.mulDivDown(1e27, totalSharesBurnt) >= minSharePriceE27)
 * ```
 *
 * The realized price sits structurally *below* the vault's share price because the
 * force-deallocation penalty is debited from the position but never withdrawn, so a bound derived
 * from the raw share price would reject every penalised exit. Both inputs are therefore taken from
 * the same plan: `withdrawnAssets` (a lower bound of what the contract pays out) over
 * `sharesBurnt` (an upper bound of what it burns). The result is conservative on both sides, so a
 * faithful snapshot never trips the check while a real price drop, a penalty increase, or liquidity
 * shifting from the penalty-free leg to the penalised leg all do.
 *
 * The referral fee is deducted *after* this check, so it is outside the bound's protection.
 *
 * @param params - Computation parameters.
 * @param params.withdrawnAssets - Assets the contract withdraws in total, before the referral fee.
 * @param params.sharesBurnt - Upper bound of the vault shares the exit burns.
 * @param params.slippageTolerance - Slippage tolerance in WAD (e.g. `0.003e18` = 0.3%).
 * @returns `minSharePriceE27` in RAY scale (1e27).
 * @throws {NegativeInputError} when `slippageTolerance` is negative.
 * @throws {ExcessiveSlippageToleranceError} when `slippageTolerance` is above
 *   `MAX_SLIPPAGE_TOLERANCE`.
 * @throws {NonPositiveInputError} when `sharesBurnt` or `withdrawnAssets` is not positive, which
 *   would silently nullify the on-chain bound.
 * @throws {VaultV2ForceWithdrawZeroSharePriceError} when the ratio itself rounds down to zero, which
 *   would nullify the bound just as a non-positive input would.
 * @example
 * ```ts
 * import { computeMinForceWithdrawSharePrice } from "@morpho-org/morpho-sdk";
 *
 * const minSharePriceE27 = computeMinForceWithdrawSharePrice({
 *   withdrawnAssets: plan.withdrawnAssets,
 *   sharesBurnt,
 *   slippageTolerance: DEFAULT_SLIPPAGE_TOLERANCE,
 * });
 * ```
 */
export function computeMinForceWithdrawSharePrice(params: {
  readonly withdrawnAssets: bigint;
  readonly sharesBurnt: bigint;
  readonly slippageTolerance: bigint;
}): bigint {
  const { withdrawnAssets, sharesBurnt, slippageTolerance } = params;

  validateSlippageTolerance(slippageTolerance);
  // A zero on either side would yield `minSharePriceE27 = 0`, i.e. no bound at all.
  if (withdrawnAssets <= 0n) {
    throw new NonPositiveInputError("withdrawnAssets", withdrawnAssets);
  }
  if (sharesBurnt <= 0n) {
    throw new NonPositiveInputError("sharesBurnt", sharesBurnt);
  }

  const minSharePriceE27 = MathLib.mulDivDown(
    withdrawnAssets,
    MathLib.wToRay(MathLib.WAD - slippageTolerance),
    sharesBurnt,
  );
  // Positive inputs are not enough: the ratio itself can round down to zero once the burn exceeds
  // what the withdrawn assets can price at RAY scale, which would reintroduce the very opt-out the
  // guards above exist to prevent.
  if (minSharePriceE27 === 0n) {
    throw new VaultV2ForceWithdrawZeroSharePriceError({
      withdrawnAssets,
      sharesBurnt,
      slippageTolerance,
    });
  }

  return minSharePriceE27;
}

/**
 * Computes the RAY-scaled maximum share price for a VaultBundlesV1 deposit leg.
 *
 * Previews shares on both the supplied Vault V1 or Vault V2 snapshot and its deadline-accrued
 * counterpart, dividing by the smaller of the two so the bound covers the highest price the
 * bundle may execute at. Shares are previewed rounding down, mirroring the ERC-4626 `deposit()`
 * shares the on-chain `maxSharePrice` check divides by.
 *
 * @param params - Vault snapshot, bundles execution deadline, net assets, and slippage.
 * @param params.vaultData - Hydrated Vault V1 `AccrualVault` or Vault V2 `AccrualVaultV2` snapshot.
 * @param params.deadline - Bundle execution deadline as a Unix timestamp in seconds, used for accrual.
 * @param params.assets - Net assets deposited after referral fees, in the underlying token's smallest unit.
 * @param params.slippageTolerance - Accepted share-price increase as a WAD-scaled fraction (`1e18` = 100%).
 * @returns The capped maximum share price enforced by VaultBundlesV1.
 * @throws {NonPositiveInputError} when `assets` or the previewed shares are not positive.
 * @throws {NegativeInputError} when `slippageTolerance` is negative.
 * @throws {ExcessiveSlippageToleranceError} when `slippageTolerance` exceeds the SDK maximum.
 * @example
 * ```ts
 * import { fetchAccrualVault } from "@morpho-org/blue-sdk-viem";
 * import { computeVaultMaxSharePrice } from "@morpho-org/morpho-sdk";
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const vaultData = await fetchAccrualVault(
 *   "0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB",
 *   client,
 * );
 * const { timestamp } = await client.getBlock();
 * const maxSharePrice = computeVaultMaxSharePrice({
 *   vaultData,
 *   deadline: timestamp + 7_200n,
 *   assets: 1_000_000n,
 *   slippageTolerance: 500_000_000_000_000n,
 * });
 * // maxSharePrice satisfies bigint
 * ```
 */
export const computeVaultMaxSharePrice = (params: {
  readonly vaultData: AccrualVault | AccrualVaultV2;
  readonly deadline: bigint;
  readonly assets: bigint;
  readonly slippageTolerance: bigint;
}): bigint => {
  if (params.assets <= 0n) {
    throw new NonPositiveInputError("assets", params.assets);
  }
  validateSlippageTolerance(params.slippageTolerance);
  const accrualTimestamp =
    params.vaultData instanceof AccrualVaultV2
      ? MathLib.max(params.deadline, params.vaultData.lastUpdate)
      : params.deadline;
  const accruedVault =
    params.vaultData instanceof AccrualVaultV2
      ? params.vaultData.accrueInterest(accrualTimestamp).vault
      : params.vaultData.accrueInterest(accrualTimestamp);
  // The deadline snapshot is not necessarily the highest price over `[now, deadline]`: Vault V2
  // charges its management fee regardless of yield, minting shares against an unchanged
  // `_totalAssets`, so an idle vault's price *declines*. Bound at the maximum price across both
  // endpoints — the minimum previewed shares — mirroring the `max(current, accrued)` shares the
  // sibling `computeVaultMaxShareAllowance` authorizes.
  const shares = MathLib.min(
    params.vaultData.toShares(params.assets, "Down"),
    accruedVault.toShares(params.assets, "Down"),
  );
  if (shares <= 0n) {
    throw new NonPositiveInputError("shares", shares);
  }
  return MathLib.min(
    MathLib.mulDivUp(
      params.assets,
      MathLib.wToRay(MathLib.WAD + params.slippageTolerance),
      shares,
    ),
    MAX_ABSOLUTE_SHARE_PRICE,
  );
};

/**
 * Computes the exact vault-share authorization cap for an asset-denominated exit.
 *
 * The cap covers both the current and deadline-accrued preview. Vault V2 and MetaMorpho 1.0 divide
 * by `1 - slippageTolerance`, rounding up, to cover a share-price decline before inclusion;
 * MetaMorpho 1.1's `lostAssets` clamp keeps that preview upper-bounded without widening it.
 *
 * @param params - Vault snapshot, execution deadline, asset amount, and WAD-scaled slippage.
 * @param params.vaultData - Hydrated Vault V1 `AccrualVault` or Vault V2 `AccrualVaultV2` snapshot.
 * @param params.deadline - Bundle execution deadline as a Unix timestamp in seconds, used for accrual.
 * @param params.assets - Assets withdrawn from the vault, in the underlying token's smallest unit.
 * @param params.slippageTolerance - Accepted share-price decline as a WAD-scaled fraction (`1e18` = 100%).
 * @returns The maximum shares the prepared operation may burn.
 * @throws {NonPositiveInputError} when `assets` or the computed share cap is not positive.
 * @throws {NegativeInputError} when `slippageTolerance` is negative.
 * @throws {ExcessiveSlippageToleranceError} when `slippageTolerance` exceeds the SDK maximum.
 * @example
 * ```ts
 * import { fetchAccrualVault } from "@morpho-org/blue-sdk-viem";
 * import { computeVaultMaxShareAllowance } from "@morpho-org/morpho-sdk";
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const vaultData = await fetchAccrualVault(
 *   "0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB",
 *   client,
 * );
 * const { timestamp } = await client.getBlock();
 * const shares = computeVaultMaxShareAllowance({
 *   vaultData,
 *   deadline: timestamp + 7_200n,
 *   assets: 1_000_000n,
 *   slippageTolerance: 500_000_000_000_000n,
 * });
 * // shares is the exact allowance or permit value for the prepared exit.
 * ```
 */
export const computeVaultMaxShareAllowance = (params: {
  readonly vaultData: AccrualVault | AccrualVaultV2;
  readonly deadline: bigint;
  readonly assets: bigint;
  readonly slippageTolerance: bigint;
}): bigint => {
  if (params.assets <= 0n) {
    throw new NonPositiveInputError("assets", params.assets);
  }
  validateSlippageTolerance(params.slippageTolerance);
  const isVaultV2 = params.vaultData instanceof AccrualVaultV2;
  const accruedVault = isVaultV2
    ? params.vaultData.accrueInterest(
        MathLib.max(params.deadline, params.vaultData.lastUpdate),
      ).vault
    : params.vaultData.accrueInterest(params.deadline);
  const previewedShares = MathLib.max(
    params.vaultData.toShares(params.assets, "Up"),
    accruedVault.toShares(params.assets, "Up"),
  );
  if (previewedShares <= 0n) {
    throw new NonPositiveInputError("shares", previewedShares);
  }
  const needsLossBuffer =
    isVaultV2 ||
    !("lostAssets" in params.vaultData) ||
    params.vaultData.lostAssets == null;
  return needsLossBuffer
    ? MathLib.wDivUp(previewedShares, MathLib.WAD - params.slippageTolerance)
    : previewedShares;
};
