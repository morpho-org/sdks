import type { Address } from "viem";
import { MissingVerificationEvidenceError } from "../../errors.js";
import type {
  VaultDepositLimit,
  VaultInKindRedeemLimit,
  VaultRedeemLimit,
  VaultV1MigrateToV2Limit,
  VaultV2ForceRedeemLimit,
  VaultV2ForceWithdrawLimit,
  VaultWithdrawLimit,
} from "../../limits.js";
import type { SimulationStateChange, VaultState } from "../../result.js";
import type { ParsedState, VaultInternals } from "../state/types.js";
import { checkExitOperation } from "./exits.js";
import {
  type CheckContext,
  type CheckedOperation,
  fail,
  findVault,
  limitViolation,
  opContext,
  receiverCredit,
} from "./helpers.js";

/**
 * Convert vault shares↔assets on the accrued vault state using the SDK
 * formula of the vault's generation — V1 via `decimalsOffset`, V2 via
 * `virtualShares` — so the verifier never reimplements the rounding.
 * @internal
 */
// biome-ignore lint/complexity/useMaxParams: converters read clearest with positional arguments
export const vaultToShares = (
  state: VaultState,
  internals: VaultInternals,
  assets: bigint,
): bigint => {
  if (internals.version === "v2") {
    const supply = state.totalShares + (internals.virtualShares ?? 0n);
    if (state.totalAssets + 1n === 0n || supply === 0n) return assets;
    return (assets * supply) / (state.totalAssets + 1n);
  }
  const supply = state.totalShares + 10n ** (internals.decimalsOffset ?? 0n);
  if (state.totalAssets + 1n === 0n || supply === 0n) return assets;
  return (assets * supply) / (state.totalAssets + 1n);
};

/** Convert shares to assets on the accrued vault state (round down). @internal */
// biome-ignore lint/complexity/useMaxParams: converters read clearest with positional arguments
export const vaultToAssets = (
  state: VaultState,
  internals: VaultInternals,
  shares: bigint,
): bigint => {
  const supply =
    internals.version === "v2"
      ? state.totalShares + (internals.virtualShares ?? 0n)
      : state.totalShares + 10n ** (internals.decimalsOffset ?? 0n);
  if (supply === 0n) return 0n;
  return (shares * (state.totalAssets + 1n)) / supply;
};

/** Vault internals lookup, failing when the vault was never read. @internal */
// biome-ignore lint/complexity/useMaxParams: lookup helpers read clearest with positional arguments
export const vaultInternals = (
  state: ParsedState,
  vault: Address,
  ctx: CheckContext,
  op: Parameters<typeof opContext>[1],
): VaultInternals =>
  state.internals.vaults.get(vault) ??
  fail(ctx, op, `Vault ${vault} internals missing`);

/**
 * Verify one declared vault operation limit.
 *
 * Deposit: owner share mint == `toShares(totalAssets delta)` ±1 rounding.
 * Withdraw: burned shares == `toShares(assets received,"Up")`-equivalent ±1.
 * Redeem: assets received == `toAssets(burned,"Down")` ±1. Exit and
 * migration variants delegate to `exits.ts`.
 * @internal
 */
// biome-ignore lint/complexity/useMaxParams: checks read clearest with positional arguments
export function checkVaultOperation(
  ctx: CheckContext,
  limit:
    | VaultDepositLimit
    | VaultWithdrawLimit
    | VaultRedeemLimit
    | VaultV1MigrateToV2Limit
    | VaultV2ForceWithdrawLimit
    | VaultV2ForceRedeemLimit
    | VaultInKindRedeemLimit,
  accruedBefore: ParsedState,
  after: ParsedState,
  actionDiff: SimulationStateChange,
): CheckedOperation {
  switch (limit.type) {
    case "vaultV1Deposit":
    case "vaultV2Deposit": {
      const before = findVault(accruedBefore, limit.vault, ctx, limit);
      const next = findVault(after, limit.vault, ctx, limit);
      const internals = vaultInternals(accruedBefore, limit.vault, ctx, limit);
      const assetsDeposited = next.totalAssets - before.totalAssets;
      const minted = next.userShares - before.userShares;
      const expectedShares = vaultToShares(before, internals, assetsDeposited);
      if (minted !== expectedShares && minted !== expectedShares + 1n)
        fail(
          ctx,
          limit,
          `Deposited shares "${minted}", expected "${expectedShares}" (±1 rounding) for "${assetsDeposited}" assets`,
        );
      if (
        limit.expectedAssets !== undefined &&
        limit.expectedAssets !== assetsDeposited
      )
        limitViolation(
          ctx,
          limit,
          "expectedAssets",
          `${limit.expectedAssets}`,
          `${assetsDeposited}`,
          "The bundle does not match the declared constraint.",
        );
      if (
        limit.expectedReceiver !== undefined &&
        receiverCredit(actionDiff, limit.expectedReceiver, limit.vault) !==
          minted
      )
        limitViolation(
          ctx,
          limit,
          "expectedReceiver",
          limit.expectedReceiver,
          `${limit.expectedReceiver}`,
          "Vault shares were not credited to the declared receiver.",
        );
      if (limit.minSharesMinted !== undefined && minted < limit.minSharesMinted)
        limitViolation(
          ctx,
          limit,
          "minSharesMinted",
          `${limit.minSharesMinted}`,
          `${minted}`,
          "Decrease the bound or adjust the operation.",
        );
      return { operation: limit, outcome: { sharesMinted: minted } };
    }

    case "vaultV1Withdraw":
    case "vaultV2Withdraw": {
      const before = findVault(accruedBefore, limit.vault, ctx, limit);
      const next = findVault(after, limit.vault, ctx, limit);
      const burned = before.userShares - next.userShares;
      const credit = receiverCredit(
        actionDiff,
        limit.expectedReceiver ?? ctx.owner,
        before.asset,
      );
      if (next.totalAssets !== before.totalAssets - credit)
        fail(
          ctx,
          limit,
          `Vault totalAssets "${next.totalAssets}", expected "${before.totalAssets - credit}"`,
        );
      if (limit.expectedAssets !== undefined && limit.expectedAssets !== credit)
        limitViolation(
          ctx,
          limit,
          "expectedAssets",
          `${limit.expectedAssets}`,
          `${credit}`,
          "The bundle does not match the declared constraint.",
        );
      if (limit.maxSharesBurned !== undefined && burned > limit.maxSharesBurned)
        limitViolation(
          ctx,
          limit,
          "maxSharesBurned",
          `${limit.maxSharesBurned}`,
          `${burned}`,
          "Increase the bound or reduce the operation.",
        );
      return { operation: limit, outcome: { sharesBurned: burned } };
    }

    case "vaultV1Redeem":
    case "vaultV2Redeem": {
      const before = findVault(accruedBefore, limit.vault, ctx, limit);
      const next = findVault(after, limit.vault, ctx, limit);
      const internals = vaultInternals(accruedBefore, limit.vault, ctx, limit);
      const burned = before.userShares - next.userShares;
      const credit = receiverCredit(
        actionDiff,
        limit.expectedReceiver ?? ctx.owner,
        before.asset,
      );
      const expectedAssets = vaultToAssets(before, internals, burned);
      if (credit !== expectedAssets && credit !== expectedAssets - 1n)
        fail(
          ctx,
          limit,
          `Receiver credit "${credit}", expected "${expectedAssets}" (±1 rounding)`,
        );
      if (limit.expectedShares !== undefined && limit.expectedShares !== burned)
        limitViolation(
          ctx,
          limit,
          "expectedShares",
          `${limit.expectedShares}`,
          `${burned}`,
          "The bundle does not match the declared constraint.",
        );
      if (
        limit.minAssetsReceived !== undefined &&
        credit < limit.minAssetsReceived
      )
        limitViolation(
          ctx,
          limit,
          "minAssetsReceived",
          `${limit.minAssetsReceived}`,
          `${credit}`,
          "Decrease the bound or adjust the operation.",
        );
      return { operation: limit, outcome: { assetsReceived: credit } };
    }

    case "vaultV1MigrateToV2":
    case "vaultV2ForceWithdraw":
    case "vaultV2ForceRedeem":
    case "vaultV1InKindRedeem":
    case "vaultV2InKindRedeem":
      return checkExitOperation(ctx, limit, accruedBefore, after, actionDiff);

    default: {
      const _exhaustive: never = limit;
      throw new MissingVerificationEvidenceError(
        `checkVaultOperation received ${JSON.stringify(_exhaustive)}`,
        { context: opContext(ctx, limit as never) },
      );
    }
  }
}
