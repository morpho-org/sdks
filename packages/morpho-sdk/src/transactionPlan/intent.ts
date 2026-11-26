import { MathLib, Time } from "@morpho-org/morpho-ts";
import { type Address, type Hex, isHex, zeroAddress } from "viem";
import { MIDNIGHT_MAX_REFERRAL_FEE_PCT } from "../helpers/constant.js";
import {
  ExpiredDeadlineError,
  InputExceedsMaxError,
  NegativeInputError,
  NonPositiveInputError,
} from "../types/index.js";
import {
  InvalidCalldataOriginError,
  NonIntegerInputError,
  ZeroAccountError,
} from "./error.js";
import {
  validateCalldataOriginLength,
  validatePlanField,
} from "./validation.js";

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * Which balance funds an operation: the ERC-20 token, or native currency the bundle wraps.
 */
export type Funding = { readonly type: "erc20" } | { readonly type: "native" };

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * Referral fee in basis points of the gross amount, paid to `recipient`. At most 1,000 bps (10%).
 */
export interface ReferralFee {
  readonly bps: number;
  readonly recipient: Address;
}

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * Intent fields shared by every prepare function, mirroring the Actions API intent inputs.
 */
export interface IntentParams {
  readonly chainId: number;
  /** Non-zero account that funds, signs and sends the operation. */
  readonly account: Address;
  readonly referralFee?: ReferralFee;
  /** Prefer an ERC-2612 permit when available, otherwise approve directly. Defaults to `false`. */
  readonly supportSignature?: boolean;
  /** Unix seconds. Defaults to two hours from now. */
  readonly expiresAt?: number;
  /** Optional attribution bytes (at most 1 MiB) appended verbatim to every built transaction's calldata. */
  readonly calldataOrigin?: Hex;
  /** Whether token metadata reads for permits may use deployless aggregation. */
  readonly deployless?: boolean;
}

const BASIS_POINTS = 10_000n;
const WAD_PER_BASIS_POINT = MathLib.WAD / BASIS_POINTS;
const MAX_REFERRAL_FEE_BPS =
  MIDNIGHT_MAX_REFERRAL_FEE_PCT / WAD_PER_BASIS_POINT;

/** @internal Validated intent in the bigint units the encoders and requirement helpers take. */
export interface Intent {
  readonly expiresAt: number;
  readonly deadline: bigint;
  readonly referralFeePct: bigint;
  readonly referralFeeRecipient: Address | undefined;
  readonly supportSignature: boolean;
  readonly calldataOrigin: Hex | undefined;
  readonly deployless: boolean | undefined;
}

function toSafeInteger(field: string, value: number): bigint {
  if (!Number.isSafeInteger(value)) {
    throw new NonIntegerInputError(field, value);
  }
  return BigInt(value);
}

/**
 * @internal Normalizes caller intent before any RPC read: account, expiry, referral fee,
 * signature support and calldata origin. Throws on invalid values so a plan never carries them.
 */
export function resolveIntent(params: IntentParams, now: bigint): Intent {
  if (params.account === zeroAddress) {
    throw new ZeroAccountError(params.account);
  }
  validatePlanField(params.account, { path: "$.account", type: "address" });
  const expiresAt = params.expiresAt ?? Number(now + Time.s.from.h(2n));
  const deadline = toSafeInteger("expiresAt", expiresAt);
  if (deadline <= 0n) {
    throw new NonPositiveInputError("expiresAt", deadline);
  }
  if (deadline <= now) {
    throw new ExpiredDeadlineError(deadline, now);
  }

  const bps =
    params.referralFee === undefined
      ? 0n
      : toSafeInteger("referralFee.bps", params.referralFee.bps);
  if (bps < 0n) {
    throw new NegativeInputError("referralFee.bps", bps);
  }
  if (bps > MAX_REFERRAL_FEE_BPS) {
    throw new InputExceedsMaxError({
      field: "referralFee.bps",
      value: bps,
      max: MAX_REFERRAL_FEE_BPS,
    });
  }

  const { calldataOrigin } = params;
  if (calldataOrigin !== undefined) {
    if (
      !isHex(calldataOrigin, { strict: true }) ||
      calldataOrigin.length <= 2 ||
      calldataOrigin.length % 2 !== 0
    ) {
      throw new InvalidCalldataOriginError(calldataOrigin);
    }
    validateCalldataOriginLength(calldataOrigin);
  }

  return {
    expiresAt: Number(deadline),
    deadline,
    referralFeePct: bps * WAD_PER_BASIS_POINT,
    referralFeeRecipient: params.referralFee?.recipient,
    supportSignature: params.supportSignature ?? false,
    calldataOrigin,
    deployless: params.deployless,
  };
}
