import {
  AccrualPosition,
  type MarketId,
  MarketParams,
} from "@morpho-org/blue-sdk";
import { deepFreeze, Time } from "@morpho-org/morpho-ts";
import { type Client, maxUint256 } from "viem";
import { getBlueBundlesV1ReferralFeeAssets } from "../../actions/blue/common.js";
import { blueRepay } from "../../actions/blue/repay.js";
import { validateClientChainId } from "../../actions/requirements/validateClientChainId.js";
import { parseNativeFunding } from "../../helpers/parse.js";
import { quoteBlueRepayFunding } from "../../helpers/quoteBlueRepay.js";
import { validateReferralFee } from "../../helpers/validate.js";
import { NonPositiveInputError } from "../../types/index.js";
import {
  InvalidTransactionPlanError,
  TransactionPlanSignatureMismatchError,
} from "../error.js";
import type { Funding, IntentParams } from "../intent.js";
import { getVaultPermit, validateTokenPermitRequest } from "../permit.js";
import type { Action, SignatureRequest, TransactionPlan } from "../types.js";
import { getPlanObject, validatePlanFields } from "../validation.js";
import {
  type BlueMarketSnapshot,
  type BluePositionSnapshot,
  prepareBlue,
} from "./prepare.js";

/**
 * Intent for repaying Blue debt using caller-fetched market and position snapshots.
 * Full repayment uses saturated shares and funds the deadline-accrued debt rounded up.
 * @example
 * ```ts
 * import type { BlueRepayPlanParams } from "@morpho-org/morpho-sdk";
 * const fullRepay = (params: BlueRepayPlanParams): BlueRepayPlanParams => ({ ...params, mode: { type: "full" } });
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export interface BlueRepayPlanParams extends IntentParams {
  readonly marketId: MarketId;
  readonly marketData: BlueMarketSnapshot;
  readonly positionData: BluePositionSnapshot;
  readonly mode:
    | { readonly type: "assets"; readonly amount: bigint }
    | { readonly type: "shares"; readonly amount: bigint }
    | { readonly type: "full" };
  readonly funding?: Funding;
  readonly now?: bigint;
}

/**
 * Prepares an asset, share, or full Blue repayment through BlueBundlesV1, never Permit2.
 * Share quotes accrue the supplied position to expiry, at most two hours from the reference time.
 * @param client - Viem client used only for token allowance and permit reads.
 * @param params - Repayment intent and caller-fetched snapshots. Native funding is exclusive and requires wNative.
 * @returns A static plan containing any token prerequisite followed by repayment.
 * @throws {ZeroAccountError} If `account` is the zero address.
 * @throws {NonIntegerInputError} If `expiresAt` or `referralFee.bps` is not a safe integer.
 * @throws {NonPositiveInputError} If expiry, repayment, or derived funding is not positive.
 * @throws {ExpiredDeadlineError} If expiry is at or before `now`.
 * @throws {NegativeInputError} If `referralFee.bps` is negative.
 * @throws {InputExceedsMaxError} If a share-mode expiry exceeds the quote horizon, the referral fee exceeds 10,000 bps, or an encoded amount exceeds uint256.
 * @throws {InvalidCalldataOriginError} If attribution bytes are empty, malformed, or have an odd number of hex digits.
 * @throws {BlueSnapshotChainMismatchError} If either snapshot describes another chain.
 * @throws {MarketIdMismatchError} If either snapshot's market ID disagrees with `marketId` or its market tuple.
 * @throws {AccrualPositionUserMismatchError} If the position belongs to another account.
 * @throws {ReferralFeePctExceededError} If the referral fee equals 10,000 bps; the normalized fee must be below WAD.
 * @throws {ReferralFeeRecipientMissingError} If a positive referral fee has no recipient or a zero recipient.
 * @throws {RepayExceedsDebtError} If an asset repayment exceeds the snapshot's borrow assets.
 * @throws {RepaySharesExceedDebtError} If a non-saturated share repayment exceeds the snapshot's borrow shares.
 * @throws {UnsupportedMarketIrmError} If interest accrual requires an unsupported IRM without a supplied rate at target.
 * @throws {ChainWNativeMissingError} If native funding is requested on a chain without registered wNative.
 * @throws {NativeAmountOnNonWNativeAssetError} If native funding targets a loan token other than wNative.
 * @throws {ChainIdMismatchError} If the client's declared or served chain differs from the repayment chain.
 * @throws {MissingContractCodeError} If registered BlueBundlesV1 or Morpho has no deployed code.
 * @throws {UnsupportedChainIdError} If the chain is absent from the address registry.
 * @throws {UnknownAddressError} If a required contract address is not registered.
 * @throws {viem.BaseError} If an RPC read or ABI encoding fails.
 * @example
 * ```ts
 * import { prepareBlueRepay, type BlueRepayPlanParams } from "@morpho-org/morpho-sdk";
 * import type { Client } from "viem";
 * const prepare = (client: Client, params: BlueRepayPlanParams) => prepareBlueRepay(client, params);
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export async function prepareBlueRepay(
  client: Client,
  {
    chainId,
    account,
    marketId,
    marketData,
    positionData,
    mode,
    funding,
    expiresAt,
    referralFee,
    supportSignature,
    calldataOrigin,
    deployless,
    now = Time.timestamp(),
  }: BlueRepayPlanParams,
): Promise<TransactionPlan> {
  const params = {
    chainId,
    account,
    marketId,
    marketData,
    positionData,
    mode,
    funding,
    expiresAt,
    referralFee,
    supportSignature,
    calldataOrigin,
    deployless,
    now,
  };
  let inputs: Extract<Action, { type: "blueRepay" }>["inputs"] | undefined;
  const {
    intent: resolvedIntent,
    steps,
    signatureRequests,
  } = await prepareBlue({ client, params }, (intent) => {
    const { referralFeePct, referralFeeRecipient } =
      validateReferralFee(intent);
    const position = new AccrualPosition(
      params.positionData.position,
      params.positionData.position.market,
    );
    const repayAssets = params.mode.type === "assets" ? params.mode.amount : 0n;
    let repayShares = 0n;
    if (params.mode.type === "full") {
      repayShares = maxUint256;
    }
    if (params.mode.type === "shares") {
      repayShares = params.mode.amount;
    }
    if (params.mode.type !== "full" && params.mode.amount <= 0n) {
      throw new NonPositiveInputError("amount", params.mode.amount);
    }
    const expectedRepayAssets = quoteBlueRepayFunding({
      positionData: position,
      marketId: params.marketId,
      repayAssets,
      repayShares,
      deadline: intent.deadline,
      now,
    });
    const maxRepayAssets =
      expectedRepayAssets +
      getBlueBundlesV1ReferralFeeAssets(expectedRepayAssets, referralFeePct);
    const nativeAmount =
      params.funding?.type === "native" ? maxRepayAssets : undefined;
    const { loanToken, collateralToken, oracle, irm, lltv } =
      params.marketData.market.params;
    inputs = {
      chainId: params.chainId,
      account: params.account,
      marketParams: { loanToken, collateralToken, oracle, irm, lltv },
      repayAssets,
      repayShares,
      maxRepayAssets,
      nativeAssets: nativeAmount,
      deadline: intent.deadline,
      referralFeePct,
      referralFeeRecipient,
    };
    // Validate the derived funding and operation before any allowance read.
    blueRepay({
      market: {
        chainId: inputs.chainId,
        marketParams: new MarketParams(inputs.marketParams),
      },
      args: { ...inputs, nativeAmount, userAddress: inputs.account },
    });
    const native = parseNativeFunding({
      chainId: inputs.chainId,
      token: inputs.marketParams.loanToken,
      fundedAmount: maxRepayAssets,
      nativeAmount,
    });
    return {
      id: "blueRepay",
      ...(native === 0n && {
        tokenPull: {
          token: inputs.marketParams.loanToken,
          amount: maxRepayAssets,
        },
      }),
    };
  });
  await validateClientChainId(client, params.chainId);
  if (inputs === undefined) {
    throw new InvalidTransactionPlanError({
      path: "inputs",
      reason: "expected resolved repayment inputs",
    });
  }
  return deepFreeze(
    structuredClone({
      version: 2,
      chainId: params.chainId,
      account: params.account,
      expiresAt: resolvedIntent.expiresAt,
      calldataOrigin: resolvedIntent.calldataOrigin,
      steps: [
        ...steps,
        {
          id: "blueRepay",
          label: "Repay Blue debt",
          action: {
            type: "blueRepay",
            inputs,
            signatureRequestIds: signatureRequests.length
              ? { tokenPermit: signatureRequests[0]?.id }
              : {},
          },
        },
      ],
      signatureRequests,
    }),
  );
}

/** @internal Checks a repayment permit against the fixed token pull. */
export function validateBlueRepayPermit(
  request: Extract<SignatureRequest, { kind: "permit" }>,
  action: Extract<Action, { type: "blueRepay" }>,
): void {
  if (action.signatureRequestIds.tokenPermit !== request.id) {
    throw new TransactionPlanSignatureMismatchError(request.id, "reference");
  }
  validateTokenPermitRequest(request, {
    chainId: action.inputs.chainId,
    account: action.inputs.account,
    deadline: action.inputs.deadline,
    bundler: "bundles.blueBundlesV1",
    asset: action.inputs.marketParams.loanToken,
    amount: action.inputs.maxRepayAssets,
    exact: true,
  });
}

/** @internal Encodes a stored repayment using only fixed inputs and referenced signatures. */
export function buildBlueRepay(
  action: Extract<Action, { type: "blueRepay" }>,
  requests: readonly SignatureRequest[],
) {
  const { chainId, account, marketParams, nativeAssets, ...args } =
    action.inputs;
  return blueRepay({
    market: { chainId, marketParams: new MarketParams(marketParams) },
    args: {
      ...args,
      nativeAmount: nativeAssets,
      userAddress: account,
      requirementSignature: getVaultPermit(requests, {
        id: action.signatureRequestIds.tokenPermit,
        asset: marketParams.loanToken,
        owner: account,
      }),
    },
  });
}

/** @internal Validates the stored repayment's structural fields. */
export function validateBlueRepayPlanAction(
  action: Record<string, unknown>,
  path: string,
): void {
  const inputs = getPlanObject(action.inputs, `${path}.inputs`);
  validatePlanFields(inputs, {
    path: `${path}.inputs`,
    fields: {
      repayAssets: "uint256 bigint",
      repayShares: "uint256 bigint",
      maxRepayAssets: "uint256 bigint",
      deadline: "uint256 bigint",
      referralFeePct: "uint256 bigint",
      referralFeeRecipient: "address",
    },
  });
  if (inputs.nativeAssets !== undefined) {
    validatePlanFields(inputs, {
      path: `${path}.inputs`,
      fields: { nativeAssets: "uint256 bigint" },
    });
  }
  const market = getPlanObject(
    inputs.marketParams,
    `${path}.inputs.marketParams`,
  );
  validatePlanFields(market, {
    path: `${path}.inputs.marketParams`,
    fields: {
      loanToken: "address",
      collateralToken: "address",
      oracle: "address",
      irm: "address",
      lltv: "uint256 bigint",
    },
  });
  getPlanObject(action.signatureRequestIds, `${path}.signatureRequestIds`);
}
