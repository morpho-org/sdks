import { MathLib } from "@morpho-org/blue-sdk";
import type { Address } from "viem";
import type { DecodedOperation } from "../../decode/operation.js";
import { FeeMismatchError } from "../../errors.js";
import type { Fee, SimulationStateChange } from "../../result.js";
import { type CheckContext, eq, opContext } from "./helpers.js";

/**
 * Reconcile the referral fee decoded from calldata against the wallet diff.
 *
 * The fixed bundles deduct `fee = gross * rateWad / WAD` from the moved
 * assets and pay it to `referralFee.recipient`. A zero-rate fee expects no
 * recipient credit; a positive fee expects the recipient to gain exactly the
 * computed amount in the operation's asset.
 *
 * @returns The {@link Fee} evidence for the operation's referral leg, or
 *   `null` for a zero fee.
 * @throws {FeeMismatchError} When the recipient's observed credit differs
 *   from the decoded fee.
 * @internal
 */
export function checkReferralFee(params: {
  readonly ctx: CheckContext;
  readonly op: DecodedOperation;
  readonly asset: Address;
  readonly grossAssets: bigint;
  readonly actionDiff: SimulationStateChange;
}): Fee | null {
  const { ctx, op, asset, grossAssets, actionDiff } = params;
  const referralFee =
    "referralFee" in op
      ? op.referralFee
      : { rateWad: 0n, recipient: ctx.owner };

  const expectedAmount = MathLib.wMulDown(grossAssets, referralFee.rateWad);
  const observed = actionDiff.balances
    .filter(
      (change) =>
        eq(change.account, referralFee.recipient) && eq(change.token, asset),
    )
    .reduce((total, change) => total + change.assets, 0n);

  if (observed !== expectedAmount) {
    throw new FeeMismatchError(
      `Referral fee credit for ${referralFee.recipient} was "${observed}", expected "${expectedAmount}" (${referralFee.rateWad} WAD of "${grossAssets}"). Check the decoded fee recipient and rate.`,
      { context: opContext(ctx, op) },
    );
  }
  if (expectedAmount === 0n) return null;
  return {
    transactionIndex: op.transactionIndex,
    type: "referral",
    token: asset,
    recipient: referralFee.recipient,
    expectedAmount,
    observedAmount: observed,
  };
}
