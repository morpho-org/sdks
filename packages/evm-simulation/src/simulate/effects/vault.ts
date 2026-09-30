import { type Address, isAddressEqual } from "viem";
import type { SimulationErrorContext } from "../../domain/diagnostics.js";
import type {
  VaultState,
  VerificationDiff,
  VerificationSnapshot,
} from "../../domain/evidence.js";
import type { EffectiveSimulationLimits } from "../../domain/limits.js";
import type {
  DecodedOperation,
  OperationIdentity,
} from "../../domain/operations.js";
import type { VerifiedOperation } from "../../domain/result.js";
import type { DecodedBundle, PinnedInputs } from "../../domain/stages.js";
import {
  MissingVerificationEvidenceError,
  StateChangeMismatchError,
} from "../../errors.js";
import { verifyExitOperation } from "./exits.js";
import { verifyReferralFee } from "./fees.js";

const eq = (a: Address, b: Address) => isAddressEqual(a, b);

interface Ctx {
  readonly context: SimulationErrorContext;
  readonly identity: OperationIdentity;
}

const locationOf = (identity: OperationIdentity) => ({
  type: "transaction" as const,
  txIdx: identity.transactionIndex,
  callPath: identity.callPath,
});

const fail = (message: string, { context, identity }: Ctx): never => {
  throw new StateChangeMismatchError(message, {
    ...context,
    location: locationOf(identity),
  });
};

// biome-ignore lint/complexity/useMaxParams: lookup helpers read clearest with positional arguments
const findVault = (
  snapshot: VerificationSnapshot,
  vault: Address,
  ctx: Ctx,
): VaultState =>
  snapshot.vaults.find((v) => eq(v.vault, vault)) ??
  fail(`Vault ${vault} missing from snapshot`, ctx);

/**
 * Convert vault shares↔assets on the accrued vault state using the SDK
 * formula of the vault's generation — V1 via `decimalsOffset`, V2 via
 * `virtualShares` — so the verifier never reimplements the rounding.
 * @internal
 */
const vaultToShares = (state: VaultState, assets: bigint): bigint => {
  if (state.type === "vaultV2") {
    // V2: shares = assets * (totalSupply + virtualShares) / (_totalAssets + 1), down.
    const supply = state.totalShares + state.virtualShares;
    if (state.totalAssets + 1n === 0n) return 0n;
    return (assets * supply) / (state.totalAssets + 1n);
  }
  const offset = state.decimalsOffset;
  const supply = state.totalShares + 10n ** offset;
  if (state.totalAssets + 1n === 0n) return 0n;
  return (assets * supply) / (state.totalAssets + 1n);
};

const vaultToAssets = (state: VaultState, shares: bigint): bigint => {
  if (state.type === "vaultV2") {
    const supply = state.totalShares + state.virtualShares;
    if (supply === 0n) return 0n;
    return (shares * (state.totalAssets + 1n)) / supply;
  }
  const supply = state.totalShares + 10n ** state.decimalsOffset;
  if (supply === 0n) return 0n;
  return (shares * (state.totalAssets + 1n)) / supply;
};

/**
 * Verify one vault-bundle operation (design §14).
 *
 * Deposit: owner share credit == previewDeposit (accrued `toShares`) ± 1
 * rounding share; vault totalAssets +assets, totalSupply +shares. Withdraw:
 * burned == `toShares(assets,"Up")`-equivalent on the accrued entity;
 * receiver credit == assets exactly. Redeem: burned == shares exactly;
 * receiver credit == `toAssets(shares,"Down")`-equivalent.
 *
 * Migration, force exits and in-kind redemptions delegate to exits.ts.
 *
 * @internal
 */
export function verifyVaultOperation(params: {
  readonly bundle: DecodedBundle;
  readonly operation: Extract<
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
        | "vaultV2InKindRedeem"
        | "vaultV1MigrateToV2";
    }
  >;
  readonly inputs: PinnedInputs;
  readonly before: VerificationSnapshot;
  readonly accruedBefore: VerificationSnapshot;
  readonly after: VerificationSnapshot;
  readonly actionDiff: VerificationDiff;
  readonly limits: EffectiveSimulationLimits;
  readonly context: SimulationErrorContext;
}): {
  readonly operation: VerifiedOperation;
  readonly referralEvidence: ReturnType<typeof verifyReferralFee>;
} {
  const { operation, accruedBefore, after, actionDiff, context } = params;
  const ctx: Ctx = {
    context,
    identity: {
      transactionIndex: operation.transactionIndex,
      callPath: operation.callPath,
    },
  };

  const referral =
    "referralFee" in operation
      ? verifyReferralFee({
          operation,
          asset: operation.asset,
          grossAssets:
            "assets" in operation && typeof operation.assets === "bigint"
              ? operation.assets
              : "exitAssets" in operation
                ? operation.exitAssets
                : 0n,
          actionDiff,
          context,
        })
      : null;

  switch (operation.type) {
    case "vaultV1Deposit":
    case "vaultV2Deposit": {
      const before = findVault(accruedBefore, operation.vault, ctx);
      const next = findVault(after, operation.vault, ctx);
      const assets = operation.funding.assets;
      const expectedShares = vaultToShares(before, assets);
      const minted = next.ownerShares - before.ownerShares;
      // previewDeposit tolerance: ±1 share for rounding.
      if (minted !== expectedShares && minted !== expectedShares + 1n)
        fail(
          `Deposited shares "${minted}", expected "${expectedShares}" (±1 rounding) for "${assets}" assets`,
          ctx,
        );
      if (next.totalAssets !== before.totalAssets + assets)
        fail(
          `Vault totalAssets "${next.totalAssets}", expected "${before.totalAssets + assets}"`,
          ctx,
        );
      if (next.totalShares !== before.totalShares + minted)
        fail(
          `Vault totalSupply "${next.totalShares}", expected "${before.totalShares + minted}"`,
          ctx,
        );
      return {
        operation: {
          operation,
          outcome: { sharesMinted: minted },
        } as VerifiedOperation,
        referralEvidence: referral,
      };
    }

    case "vaultV1Withdraw":
    case "vaultV2Withdraw": {
      const before = findVault(accruedBefore, operation.vault, ctx);
      const next = findVault(after, operation.vault, ctx);
      // previewWithdraw rounds shares up.
      const shares =
        before.totalAssets + 1n === 0n
          ? operation.assets
          : (() => {
              const supply =
                before.type === "vaultV2"
                  ? before.totalShares + before.virtualShares
                  : before.totalShares + 10n ** before.decimalsOffset;
              return supply === 0n
                ? operation.assets
                : (operation.assets * supply + before.totalAssets) /
                    (before.totalAssets + 1n);
            })();
      const burned = before.ownerShares - next.ownerShares;
      if (burned !== shares && burned !== shares - 1n)
        fail(
          `Withdraw burned "${burned}" shares, expected "${shares}" (round-up)`,
          ctx,
        );
      const credit = actionDiff.wallet
        .filter(
          (c) =>
            eq(c.account, operation.receiver) && eq(c.token, operation.asset),
        )
        .reduce((total, c) => total + c.assets, 0n);
      if (credit !== operation.assets)
        fail(
          `Receiver credit "${credit}", expected "${operation.assets}"`,
          ctx,
        );
      if (next.totalAssets !== before.totalAssets - operation.assets)
        fail(
          `Vault totalAssets "${next.totalAssets}", expected "${before.totalAssets - operation.assets}"`,
          ctx,
        );
      return {
        operation: {
          operation,
          outcome: { sharesBurned: burned },
        } as VerifiedOperation,
        referralEvidence: referral,
      };
    }

    case "vaultV1Redeem":
    case "vaultV2Redeem": {
      const before = findVault(accruedBefore, operation.vault, ctx);
      const next = findVault(after, operation.vault, ctx);
      const burned = before.ownerShares - next.ownerShares;
      if (burned !== operation.shares)
        fail(
          `Redeem burned "${burned}" shares, expected "${operation.shares}"`,
          ctx,
        );
      const expectedAssets = vaultToAssets(before, operation.shares);
      const credit = actionDiff.wallet
        .filter(
          (c) =>
            eq(c.account, operation.receiver) && eq(c.token, operation.asset),
        )
        .reduce((total, c) => total + c.assets, 0n);
      // previewRedeem rounds assets down; ±1 tolerance for rounding.
      if (credit !== expectedAssets && credit !== expectedAssets - 1n)
        fail(
          `Receiver credit "${credit}", expected "${expectedAssets}" (±1 rounding)`,
          ctx,
        );
      return {
        operation: {
          operation,
          outcome: { assetsReceived: credit },
        } as VerifiedOperation,
        referralEvidence: referral,
      };
    }

    case "vaultV1MigrateToV2":
    case "vaultV2ForceWithdraw":
    case "vaultV2ForceRedeem":
    case "vaultV1InKindRedeem":
    case "vaultV2InKindRedeem":
      return {
        operation: verifyExitOperation({ ...params, operation }),
        referralEvidence: referral,
      };

    default: {
      const _exhaustive: never = operation;
      throw new MissingVerificationEvidenceError(
        `verifyVaultOperation received ${JSON.stringify(_exhaustive)}`,
        context,
      );
    }
  }
}
