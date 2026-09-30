import { MathLib } from "@morpho-org/blue-sdk";
import { type Address, isAddressEqual } from "viem";
import type {
  DecodedOperation,
  OperationIdentity,
} from "../../decode/operation.js";
import { FeeMismatchError } from "../../errors.js";
import { type At, operationContext } from "../internal/error-context.js";
import type { FeeEvidence, VerificationDiff } from "../internal/evidence.js";

const eq = (a: Address, b: Address) => isAddressEqual(a, b);

/**
 * Reconcile the referral fee decoded from calldata against the wallet diff
 * (design §13).
 *
 * The fixed bundles deduct `fee = gross * rateWad / WAD` from the moved
 * assets and pay it to `referralFee.recipient`. A zero-rate fee expects no
 * recipient credit; a positive fee expects the recipient to gain exactly the
 * computed amount in the operation's asset (or the wrapped token / native
 * leg for native funding — the diff reports both, and either counts).
 *
 * @param params - The decoded operation, the action diff, and error context.
 * @returns The {@link FeeEvidence} for the operation's referral leg.
 * @throws {FeeMismatchError} When the recipient's observed credit differs
 *   from the decoded fee.
 * @internal
 */
export function verifyReferralFee(params: {
  readonly operation: DecodedOperation;
  readonly asset: Address;
  readonly grossAssets: bigint;
  readonly actionDiff: VerificationDiff;
  readonly at: At;
}): FeeEvidence | null {
  const { operation, asset, grossAssets, actionDiff, at } = params;
  const referralFee =
    "referralFee" in operation
      ? operation.referralFee
      : { rateWad: 0n, recipient: operation.owner };
  const identity: OperationIdentity = {
    transactionIndex: operation.transactionIndex,
    callPath: operation.callPath,
  };

  const expectedAmount = MathLib.wMulDown(grossAssets, referralFee.rateWad);
  const observed = actionDiff.wallet
    .filter(
      (change) =>
        eq(change.account, referralFee.recipient) && eq(change.token, asset),
    )
    .reduce((total, change) => total + change.assets, 0n);

  if (observed !== expectedAmount) {
    throw new FeeMismatchError(
      `Referral fee credit for ${referralFee.recipient} was "${observed}", expected "${expectedAmount}" (${referralFee.rateWad} WAD of "${grossAssets}"). Check the decoded fee recipient and rate.`,
      { context: operationContext(at.context, at.mode, operation) },
    );
  }
  if (expectedAmount === 0n) return null;
  return {
    ...identity,
    type: "referral",
    token: asset,
    recipient: referralFee.recipient,
    rateWad: referralFee.rateWad,
    expectedAmount,
    observedAmount: observed,
    unit: "assets",
  };
}
