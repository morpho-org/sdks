import type { Address } from "viem";
import type { DecodedOperation } from "../../decode/operation.js";
import { UnexpectedSimulationError } from "../../errors.js";
import type { Fee, SimulationStateChange, VaultState } from "../../result.js";
import type { ParsedState, VaultInternals } from "../state/types.js";
import { checkExitOperation } from "./exits.js";
import { checkReferralFee } from "./fees.js";
import {
  type CheckContext,
  type CheckedOperation,
  expectEquals,
  expectMax,
  expectMin,
  fail,
  findVault,
  matchLimits,
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
  op: DecodedOperation,
): VaultInternals =>
  state.internals.vaults.get(vault) ??
  fail(ctx, op, `Vault ${vault} internals missing`);

/**
 * Verify one vault-bundle operation.
 *
 * Deposit: owner share credit == previewDeposit (accrued `toShares`) ± 1
 * rounding share; vault totalAssets +assets, totalSupply +shares. Withdraw:
 * burned == `toShares(assets,"Up")`-equivalent; receiver credit == assets
 * exactly. Redeem: burned == shares exactly; receiver credit ==
 * `toAssets(shares,"Down")`-equivalent. Migration, force exits and in-kind
 * redemptions delegate to `exits.ts`.
 * @internal
 */
// biome-ignore lint/complexity/useMaxParams: checks read clearest with positional arguments
export function checkVaultOperation(
  ctx: CheckContext,
  operation: Extract<
    DecodedOperation,
    {
      readonly type:
        | "vaultV1Deposit"
        | "vaultV2Deposit"
        | "vaultV1Withdraw"
        | "vaultV2Withdraw"
        | "vaultV1Redeem"
        | "vaultV2Redeem"
        | "vaultV1MigrateToV2"
        | "vaultV2ForceWithdraw"
        | "vaultV2ForceRedeem"
        | "vaultV1InKindRedeem"
        | "vaultV2InKindRedeem";
    }
  >,
  accruedBefore: ParsedState,
  after: ParsedState,
  actionDiff: SimulationStateChange,
): { readonly checked: CheckedOperation; readonly fee: Fee | null } {
  const referral =
    "referralFee" in operation
      ? checkReferralFee({
          ctx,
          op: operation,
          asset: operation.asset,
          grossAssets:
            "assets" in operation && typeof operation.assets === "bigint"
              ? operation.assets
              : "exitAssets" in operation
                ? operation.exitAssets
                : 0n,
          actionDiff,
        })
      : null;

  const internals = (vault: Address) =>
    vaultInternals(accruedBefore, vault, ctx, operation);

  switch (operation.type) {
    case "vaultV1Deposit":
    case "vaultV2Deposit": {
      const before = findVault(accruedBefore, operation.vault, ctx, operation);
      const next = findVault(after, operation.vault, ctx, operation);
      const assets = operation.funding.assets;
      const expectedShares = vaultToShares(
        before,
        internals(operation.vault),
        assets,
      );
      const minted = next.userShares - before.userShares;
      // previewDeposit tolerance: ±1 share for rounding.
      if (minted !== expectedShares && minted !== expectedShares + 1n)
        fail(
          ctx,
          operation,
          `Deposited shares "${minted}", expected "${expectedShares}" (±1 rounding) for "${assets}" assets`,
        );
      if (next.totalAssets !== before.totalAssets + assets)
        fail(
          ctx,
          operation,
          `Vault totalAssets "${next.totalAssets}", expected "${before.totalAssets + assets}"`,
        );
      if (next.totalShares !== before.totalShares + minted)
        fail(
          ctx,
          operation,
          `Vault totalSupply "${next.totalShares}", expected "${before.totalShares + minted}"`,
        );
      return {
        checked: {
          operation,
          outcome: { sharesMinted: minted },
        } as CheckedOperation,
        fee: referral,
      };
    }

    case "vaultV1Withdraw":
    case "vaultV2Withdraw": {
      const before = findVault(accruedBefore, operation.vault, ctx, operation);
      const next = findVault(after, operation.vault, ctx, operation);
      const internalsBefore = internals(operation.vault);
      // previewWithdraw rounds shares up.
      const supply =
        internalsBefore.version === "v2"
          ? before.totalShares + (internalsBefore.virtualShares ?? 0n)
          : before.totalShares + 10n ** (internalsBefore.decimalsOffset ?? 0n);
      const shares =
        before.totalAssets + 1n === 0n || supply === 0n
          ? operation.assets
          : (operation.assets * supply + before.totalAssets) /
            (before.totalAssets + 1n);
      const burned = before.userShares - next.userShares;
      if (burned !== shares && burned !== shares - 1n)
        fail(
          ctx,
          operation,
          `Withdraw burned "${burned}" shares, expected "${shares}" (round-up)`,
        );
      const credit = receiverCredit(
        actionDiff,
        operation.receiver,
        operation.asset,
      );
      if (credit !== operation.assets)
        fail(
          ctx,
          operation,
          `Receiver credit "${credit}", expected "${operation.assets}"`,
        );
      if (next.totalAssets !== before.totalAssets - operation.assets)
        fail(
          ctx,
          operation,
          `Vault totalAssets "${next.totalAssets}", expected "${before.totalAssets - operation.assets}"`,
        );
      return {
        checked: {
          operation,
          outcome: { sharesBurned: burned },
        } as CheckedOperation,
        fee: referral,
      };
    }

    case "vaultV1Redeem":
    case "vaultV2Redeem": {
      const before = findVault(accruedBefore, operation.vault, ctx, operation);
      const next = findVault(after, operation.vault, ctx, operation);
      const burned = before.userShares - next.userShares;
      if (burned !== operation.shares)
        fail(
          ctx,
          operation,
          `Redeem burned "${burned}" shares, expected "${operation.shares}"`,
        );
      const expectedAssets = vaultToAssets(
        before,
        internals(operation.vault),
        operation.shares,
      );
      const credit = receiverCredit(
        actionDiff,
        operation.receiver,
        operation.asset,
      );
      // previewRedeem rounds assets down; ±1 tolerance for rounding.
      if (credit !== expectedAssets && credit !== expectedAssets - 1n)
        fail(
          ctx,
          operation,
          `Receiver credit "${credit}", expected "${expectedAssets}" (±1 rounding)`,
        );
      return {
        checked: {
          operation,
          outcome: { assetsReceived: credit },
        } as CheckedOperation,
        fee: referral,
      };
    }

    case "vaultV1MigrateToV2":
    case "vaultV2ForceWithdraw":
    case "vaultV2ForceRedeem":
    case "vaultV1InKindRedeem":
    case "vaultV2InKindRedeem":
      return {
        checked: checkExitOperation(
          ctx,
          operation,
          accruedBefore,
          after,
          actionDiff,
        ),
        fee: referral,
      };

    default: {
      const _exhaustive: never = operation;
      throw new UnexpectedSimulationError(
        `checkVaultOperation received ${JSON.stringify(_exhaustive)}`,
        { context: opContext(ctx, operation as DecodedOperation) },
      );
    }
  }
}

/**
 * Assert every consumer limit declared for one checked vault deposit /
 * withdraw / redeem (V1 and V2 share a limit shape). Called by
 * {@link checkOperations} right after the economic check that produced the
 * outcome.
 * @internal
 */
export function checkVaultOperationLimits(
  ctx: CheckContext,
  checked: CheckedOperation,
): void {
  const { operation: op, outcome } = checked;
  for (const limit of matchLimits(ctx, op)) {
    switch (limit.type) {
      case "vaultV1Deposit":
      case "vaultV2Deposit": {
        if (op.type !== "vaultV1Deposit" && op.type !== "vaultV2Deposit")
          continue;
        const o = outcome as { sharesMinted: bigint };
        expectEquals(ctx, op, "vault", limit.vault, op.vault);
        expectEquals(
          ctx,
          op,
          "expectedAssets",
          limit.expectedAssets,
          op.funding.assets,
        );
        expectEquals(
          ctx,
          op,
          "expectedReceiver",
          limit.expectedReceiver,
          op.receiver,
        );
        expectMin(
          ctx,
          op,
          "minSharesMinted",
          limit.minSharesMinted,
          o.sharesMinted,
        );
        break;
      }
      case "vaultV1Withdraw":
      case "vaultV2Withdraw": {
        if (op.type !== "vaultV1Withdraw" && op.type !== "vaultV2Withdraw")
          continue;
        const o = outcome as { sharesBurned: bigint };
        expectEquals(ctx, op, "vault", limit.vault, op.vault);
        expectEquals(
          ctx,
          op,
          "expectedAssets",
          limit.expectedAssets,
          op.assets,
        );
        expectEquals(
          ctx,
          op,
          "expectedReceiver",
          limit.expectedReceiver,
          op.receiver,
        );
        expectMax(
          ctx,
          op,
          "maxSharesBurned",
          limit.maxSharesBurned,
          o.sharesBurned,
        );
        break;
      }
      case "vaultV1Redeem":
      case "vaultV2Redeem": {
        if (op.type !== "vaultV1Redeem" && op.type !== "vaultV2Redeem")
          continue;
        const o = outcome as { assetsReceived: bigint };
        expectEquals(ctx, op, "vault", limit.vault, op.vault);
        expectEquals(
          ctx,
          op,
          "expectedShares",
          limit.expectedShares,
          op.shares,
        );
        expectEquals(
          ctx,
          op,
          "expectedReceiver",
          limit.expectedReceiver,
          op.receiver,
        );
        expectMin(
          ctx,
          op,
          "minAssetsReceived",
          limit.minAssetsReceived,
          o.assetsReceived,
        );
        break;
      }
      default:
        break;
    }
  }
}
