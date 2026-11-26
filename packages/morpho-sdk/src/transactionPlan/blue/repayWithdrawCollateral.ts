import {
  AccrualPosition,
  type Market,
  type MarketId,
  MarketParams,
  MathLib,
} from "@morpho-org/blue-sdk";
import { deepFreeze, Time } from "@morpho-org/morpho-ts";
import { type Client, maxUint256 } from "viem";
import {
  getBlueBundlesV1ReferralFeeAssets,
  parseBlueBundlesV1Common,
} from "../../actions/blue/common.js";
import { blueRepayWithdrawCollateral } from "../../actions/blue/repayWithdrawCollateral.js";
import { validateClientChainId } from "../../actions/requirements/validateClientChainId.js";
import { getBlueBundlesV1QuoteTimestamp } from "../../helpers/getBlueBundlesV1QuoteTimestamp.js";
import {
  DEFAULT_LLTV_BUFFER,
  validateChainId,
  validatePositionHealthAfterWithdraw,
} from "../../helpers/index.js";
import { parseNativeFunding } from "../../helpers/parse.js";
import {
  quoteBlueRepay,
  quoteBlueRepayFunding,
} from "../../helpers/quoteBlueRepay.js";
import {
  type AuthorizationRequirementSignature,
  MutuallyExclusiveRepayAmountsError,
  NegativeInputError,
  NonPositiveInputError,
} from "../../types/index.js";
import {
  BlueSnapshotStateMismatchError,
  IncompleteTransactionPlanError,
  InvalidTransactionPlanError,
  TransactionPlanSignatureMismatchError,
} from "../error.js";
import type { Funding, IntentParams } from "../intent.js";
import { getVaultPermit, validateTokenPermitRequest } from "../permit.js";
import type { Action, SignatureRequest, TransactionPlan } from "../types.js";
import { getPlanObject, validatePlanFields } from "../validation.js";
import { validateMorphoAuthorizationRequest } from "./authorization.js";
import {
  type BlueMarketSnapshot,
  type BluePositionSnapshot,
  prepareBlue,
} from "./prepare.js";

/**
 * Repayment and collateral withdrawal intent. Set `repayShares` to `maxUint256` for full repayment.
 * Native funding wraps the computed repayment cap; omitted funding uses the loan-token balance.
 * @example
 * ```ts
 * import type { BlueRepayWithdrawCollateralPlanParams } from "@morpho-org/morpho-sdk";
 * const native = (params: BlueRepayWithdrawCollateralPlanParams) =>
 *   ({ ...params, funding: { type: "native" as const } });
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export type BlueRepayWithdrawCollateralPlanParams = IntentParams & {
  readonly marketId: MarketId;
  readonly marketData: BlueMarketSnapshot;
  readonly positionData: BluePositionSnapshot;
  readonly collateralAssets: bigint;
  /** Defaults to ERC-20; native funding is available only for wNative loan tokens. */
  readonly funding?: Funding;
  readonly now?: bigint;
} & (
    | { readonly repayAssets: bigint; readonly repayShares?: never }
    | { readonly repayShares: bigint; readonly repayAssets?: never }
  );

/**
 * Prepares one BlueBundlesV1 repayment and collateral withdrawal from caller-fetched snapshots.
 * Withdrawal health uses the expiry floored at max(now, lastUpdate); expiries more than
 * 365 days out retain the legacy +2h projection. Repay-only funding is independent.
 * Full repayment uses `repayShares: maxUint256`; `funding: { type: "native" }` funds the computed cap.
 * Signatures are embedded in the operation; direct approvals and authorization precede it.
 * @param client - Viem client used only for prerequisite reads.
 * @param params - Intent, position and market snapshots from the same chain and account. Read
 *   both snapshots at one block, or use the market embedded in the position snapshot as below.
 * @returns A static plan; collect its pending signatures before building transactions.
 * @throws {BlueSnapshotChainMismatchError} when a market or position snapshot names another chain.
 * @throws {MarketIdMismatchError} when a snapshot's market ID differs from `marketId` or its tuple.
 * @throws {AccrualPositionUserMismatchError} when the position belongs to another account.
 * @throws {BlueSnapshotStateMismatchError} when the market snapshot's state differs from the
 *   market embedded in the position snapshot.
 * @throws {ZeroAccountError} when `account` is the zero address.
 * @throws {NonIntegerInputError} when `expiresAt` or `referralFee.bps` is not a safe integer.
 * @throws {InvalidCalldataOriginError} when `calldataOrigin` is empty or malformed hex bytes.
 * @throws {ExpiredDeadlineError} when `expiresAt` is at or before the reference timestamp.
 * @throws {NegativeInputError} when an amount or referral fee is negative.
 * @throws {NonPositiveInputError} when the expiry is not positive, both operation legs are zero,
 *   a repay leg has no positive funding cap, or native funding is set without a repay leg.
 * @throws {InputExceedsMaxError} when a value exceeds uint256, `referralFee.bps` exceeds 1,000,
 *   or a share-mode expiry exceeds the two-hour funding quote horizon.
 * @throws {ReferralFeeRecipientMissingError} when a positive fee has no non-zero recipient.
 * @throws {ChainIdMismatchError} when the client declares, or its RPC reports, another chain.
 * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
 * @throws {UnknownAddressError} when a required contract is not registered on the chain.
 * @throws {UnsupportedBlueMarketIrmError} when debt projection requires an unsupported IRM.
 * @throws {MutuallyExclusiveRepayAmountsError} when both repayment amounts are non-zero at runtime.
 * @throws {RepayExceedsDebtError} when exact repayment assets exceed the position's debt.
 * @throws {RepaySharesExceedDebtError} when non-saturated repayment shares exceed borrow shares.
 * @throws {WithdrawExceedsCollateralError} when the requested withdrawal exceeds collateral.
 * @throws {MissingMarketPriceError} when withdrawal health cannot be checked without a price.
 * @throws {WithdrawMakesPositionUnhealthyError} when the post-repay withdrawal exceeds buffered LLTV.
 * @throws {ChainWNativeMissingError} when native funding is requested on a chain without wNative.
 * @throws {NativeAmountOnNonWNativeAssetError} when native funding targets a loan token other than wNative.
 * @throws {UnknownTokenError} when permit metadata has no usable token decimals.
 * @throws {MalformedTokenMetadataError} when token metadata returns malformed non-empty data.
 * @throws {UnexpectedRequirementSignatureError} when a signable prerequisite has no bigint nonce.
 * @throws {TransactionPlanSignatureMismatchError} when a permit request disagrees with the exact token pull.
 * @throws {MissingContractCodeError} when BlueBundlesV1 or Morpho Blue has no deployed code.
 * @throws {IncompleteTransactionPlanError} when no operation inputs were resolved during preparation.
 * @throws {viem.BaseError} when an allowance, nonce, metadata, authorization, chain ID or bytecode read fails.
 * @example
 * ```ts
 * import { prepareBlueRepayWithdrawCollateral, type BlueRepayWithdrawCollateralPlanParams } from "@morpho-org/morpho-sdk";
 * import type { Client } from "viem";
 * type AssetsParams = Extract<BlueRepayWithdrawCollateralPlanParams, { readonly repayAssets: bigint }>;
 * const prepare = (client: Client, params: Omit<AssetsParams, "marketData">) =>
 *   prepareBlueRepayWithdrawCollateral(client, {
 *     ...params,
 *     marketData: { chainId: params.chainId, market: params.positionData.position.market },
 *   });
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export async function prepareBlueRepayWithdrawCollateral(
  client: Client,
  params: BlueRepayWithdrawCollateralPlanParams,
): Promise<TransactionPlan> {
  const id = "blueRepayWithdrawCollateral";
  const now = params.now ?? Time.timestamp();
  let inputs: Extract<Action, { type: typeof id }>["inputs"] | undefined;
  const prepared = await prepareBlue(
    { client, params: { ...params, now } },
    (intent) => {
      const marketParams = params.marketData.market.params;
      // Reject chain and referral mismatches before deriving a repayment quote.
      validateChainId(client.chain?.id, params.chainId);
      const common = parseBlueBundlesV1Common({
        chainId: params.chainId,
        userAddress: params.account,
        deadline: intent.deadline,
        referralFeePct: intent.referralFeePct,
        referralFeeRecipient: intent.referralFeeRecipient,
      });
      const { repayAssets, repayShares, collateralAssets, hasRepay } =
        getRepayWithdrawAmounts(params);
      const quoteParams = {
        positionData: getMatchingPosition(params),
        marketId: params.marketId,
        repayAssets,
        repayShares,
        deadline: intent.deadline,
        now,
      };
      const healthQuote = quoteWithdrawal(quoteParams, collateralAssets);
      const expectedRepayAssets =
        healthQuote?.expectedRepayAssets ?? quoteBlueRepayFunding(quoteParams);
      const maxRepayAssets =
        expectedRepayAssets +
        getBlueBundlesV1ReferralFeeAssets(
          expectedRepayAssets,
          common.referralFeePct,
        );
      const nativeValue = parseNativeFunding({
        chainId: params.chainId,
        token: marketParams.loanToken,
        fundedAmount: maxRepayAssets,
        nativeAmount:
          params.funding?.type === "native" ? maxRepayAssets : undefined,
      });
      if (healthQuote !== undefined) {
        const { accruedPosition, simulatedRepayShares } = healthQuote;
        const postRepayPosition = hasRepay
          ? accruedPosition.repay(repayAssets, simulatedRepayShares).position
          : accruedPosition;
        // Reject withdrawals that leave debt above the buffered LLTV.
        validatePositionHealthAfterWithdraw({
          positionData: postRepayPosition,
          withdrawAmount: collateralAssets,
          lltv: marketParams.lltv,
          marketId: params.marketData.market.id,
        });
      }
      const tx = blueRepayWithdrawCollateral({
        market: { chainId: params.chainId, marketParams },
        args: {
          userAddress: params.account,
          repayAssets,
          repayShares,
          maxRepayAssets,
          collateralAssets,
          maxLtv:
            collateralAssets > 0n
              ? MathLib.zeroFloorSub(marketParams.lltv, DEFAULT_LLTV_BUFFER)
              : maxUint256,
          nativeAmount: nativeValue > 0n ? nativeValue : undefined,
          ...common,
        },
      });
      const {
        market: _market,
        onBehalf: _onBehalf,
        referralFeeAssets: _fee,
        nativeAmount,
        ...args
      } = tx.action.args;
      inputs = {
        ...args,
        ...(nativeAmount !== undefined && { nativeAssets: nativeAmount }),
        chainId: params.chainId,
        account: params.account,
        marketParams: {
          loanToken: marketParams.loanToken,
          collateralToken: marketParams.collateralToken,
          oracle: marketParams.oracle,
          irm: marketParams.irm,
          lltv: marketParams.lltv,
        },
      };
      return {
        id,
        tokenPull:
          args.maxRepayAssets > 0n && !nativeAmount
            ? { token: marketParams.loanToken, amount: args.maxRepayAssets }
            : undefined,
        needsAuthorization: args.collateralAssets > 0n,
      };
    },
  );
  await validateClientChainId(client, params.chainId);
  if (inputs === undefined) {
    throw new IncompleteTransactionPlanError(id);
  }
  const signatureRequestIds = Object.fromEntries(
    prepared.signatureRequests
      .filter((request) => request.kind === "permit")
      .map((request) => ["tokenPermit", request.id]),
  );
  if (prepared.morphoAuthorizationRequestId !== undefined) {
    signatureRequestIds.morphoAuthorization =
      prepared.morphoAuthorizationRequestId;
  }
  const authorization = prepared.signatureRequests.find(
    (request) => request.kind === "morphoAuthorization",
  );
  if (authorization !== undefined) {
    inputs = { ...inputs, authorizationNonce: authorization.args.nonce };
  }
  return deepFreeze(
    structuredClone({
      version: 2,
      chainId: params.chainId,
      account: params.account,
      expiresAt: prepared.intent.expiresAt,
      calldataOrigin: prepared.intent.calldataOrigin,
      steps: [
        ...prepared.steps,
        {
          id,
          label: getRepayWithdrawLabel(inputs),
          action: { type: id, inputs, signatureRequestIds },
        },
      ],
      signatureRequests: prepared.signatureRequests,
    } as TransactionPlan),
  );
}

function getRepayWithdrawLabel(inputs: {
  collateralAssets: bigint;
  repayAssets: bigint;
  repayShares: bigint;
}): string {
  if (inputs.collateralAssets === 0n) {
    return "Repay Blue debt";
  }
  if (inputs.repayAssets === 0n && inputs.repayShares === 0n) {
    return "Withdraw Blue collateral";
  }
  return "Repay and withdraw collateral";
}

const MARKET_STATE_FIELDS = [
  "totalSupplyAssets",
  "totalSupplyShares",
  "totalBorrowAssets",
  "totalBorrowShares",
  "lastUpdate",
  "fee",
  "price",
  "rateAtTarget",
] as const satisfies readonly (keyof Market)[];

function getMatchingPosition(params: BlueRepayWithdrawCollateralPlanParams) {
  const { position } = params.positionData;
  const positionMarket = position.market;
  const { market } = params.marketData;
  for (const field of MARKET_STATE_FIELDS) {
    if (positionMarket[field] !== market[field]) {
      throw new BlueSnapshotStateMismatchError({
        field,
        positionValue: positionMarket[field],
        marketValue: market[field],
      });
    }
  }
  return new AccrualPosition(position, positionMarket);
}

function quoteWithdrawal(
  quoteParams: Parameters<typeof quoteBlueRepay>[0],
  collateralAssets: bigint,
) {
  const { positionData, repayAssets, repayShares } = quoteParams;
  if (repayShares === maxUint256 && positionData.borrowShares === 0n) {
    throw new NonPositiveInputError("maxRepayAssets", 0n);
  }
  if (collateralAssets === 0n) {
    return undefined;
  }
  if (
    positionData.borrowShares === 0n &&
    repayAssets === 0n &&
    repayShares === 0n
  ) {
    return {
      accruedPosition: positionData,
      simulatedRepayShares: 0n,
      expectedRepayAssets: 0n,
    };
  }
  return quoteBlueRepay({
    ...quoteParams,
    healthTimestamp: getBlueBundlesV1QuoteTimestamp({
      lastUpdate: positionData.market.lastUpdate,
      now: quoteParams.now,
      deadline: quoteParams.deadline,
    }),
  });
}

function getRepayWithdrawAmounts(
  params: BlueRepayWithdrawCollateralPlanParams,
) {
  const { collateralAssets, marketId } = params;
  const repayAssets = params.repayAssets ?? 0n;
  const repayShares = params.repayShares ?? 0n;
  if (repayAssets < 0n) {
    throw new NegativeInputError("repayAssets", repayAssets);
  }
  if (repayShares < 0n) {
    throw new NegativeInputError("repayShares", repayShares);
  }
  if (collateralAssets < 0n) {
    throw new NegativeInputError("collateralAssets", collateralAssets);
  }
  if (repayAssets > 0n && repayShares > 0n) {
    throw new MutuallyExclusiveRepayAmountsError(marketId);
  }
  const hasRepay = repayAssets > 0n || repayShares > 0n;
  if (!hasRepay && params.funding?.type === "native") {
    throw new NonPositiveInputError("repayAssets or repayShares", 0n);
  }
  if (!hasRepay && collateralAssets === 0n) {
    throw new NonPositiveInputError(
      "repayAssets, repayShares, or collateralAssets",
      0n,
    );
  }
  return { repayAssets, repayShares, collateralAssets, hasRepay };
}

/** @internal Checks signature bindings for the combined operation. */
export function validateRepayWithdrawCollateralRequest(
  request: SignatureRequest,
  action: Extract<Action, { type: "blueRepayWithdrawCollateral" }>,
): void {
  const { chainId, account, deadline, marketParams, maxRepayAssets } =
    action.inputs;
  if (
    request.kind === "permit" &&
    action.signatureRequestIds.tokenPermit === request.id
  ) {
    if (
      (action.inputs.nativeAssets ?? 0n) > 0n ||
      (action.inputs.repayAssets === 0n && action.inputs.repayShares === 0n) ||
      maxRepayAssets === 0n
    ) {
      throw new TransactionPlanSignatureMismatchError(request.id, "reference");
    }
    // Reject a permit that does not authorize this exact token pull.
    validateTokenPermitRequest(request, {
      chainId,
      account,
      deadline,
      bundler: "bundles.blueBundlesV1",
      asset: marketParams.loanToken,
      amount: maxRepayAssets,
      exact: true,
    });
    return;
  }
  if (
    request.kind === "morphoAuthorization" &&
    action.signatureRequestIds.morphoAuthorization === request.id &&
    action.inputs.collateralAssets > 0n &&
    action.inputs.authorizationNonce !== undefined
  ) {
    // Reject an authorization that does not grant this account's bundle access.
    validateMorphoAuthorizationRequest(request, {
      chainId,
      account,
      deadline,
      nonce: action.inputs.authorizationNonce,
    });
    return;
  }
  throw new TransactionPlanSignatureMismatchError(request.id, "reference");
}

/** @internal Builds without a client, snapshot, or mutable preparation state. */
export function buildBlueRepayWithdrawCollateral(
  action: Extract<Action, { type: "blueRepayWithdrawCollateral" }>,
  requests: readonly SignatureRequest[],
) {
  const {
    chainId,
    account,
    marketParams,
    nativeAssets,
    authorizationNonce: _authorizationNonce,
    ...args
  } = action.inputs;
  const requirementSignature = getVaultPermit(requests, {
    id: action.signatureRequestIds.tokenPermit,
    asset: marketParams.loanToken,
    owner: account,
  });
  let authorizationSignature: AuthorizationRequirementSignature | undefined;
  const id = action.signatureRequestIds.morphoAuthorization;
  if (id !== undefined) {
    const request = requests.find((candidate) => candidate.id === id);
    if (request?.signature === undefined) {
      throw new IncompleteTransactionPlanError(id);
    }
    if (request.kind !== "morphoAuthorization") {
      throw new TransactionPlanSignatureMismatchError(id, "reference");
    }
    authorizationSignature = {
      action: {
        type: "authorization",
        args: { ...request.args, isAuthorized: true },
        typedData: request.typedData,
      },
      args: {
        ...request.args,
        isAuthorized: true,
        signature: request.signature,
      },
    };
  }
  return blueRepayWithdrawCollateral({
    market: { chainId, marketParams: new MarketParams(marketParams) },
    args: {
      ...args,
      nativeAmount: nativeAssets,
      userAddress: account,
      requirementSignature,
      authorizationSignature,
    },
  });
}

/** @internal Validates stored combined-operation input shapes. */
export function validateRepayWithdrawCollateralPlanAction(
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
      collateralAssets: "uint256 bigint",
      maxLtv: "uint256 bigint",
      deadline: "uint256 bigint",
      referralFeePct: "uint256 bigint",
      referralFeeRecipient: "address",
    },
  });
  if (
    (inputs.repayAssets as bigint) > 0n &&
    (inputs.repayShares as bigint) > 0n
  ) {
    throw new InvalidTransactionPlanError({
      path: `${path}.inputs`,
      reason: "repayAssets and repayShares are mutually exclusive",
    });
  }
  if (inputs.nativeAssets !== undefined) {
    validatePlanFields(inputs, {
      path: `${path}.inputs`,
      fields: { nativeAssets: "uint256 bigint" },
    });
  }
  validatePlanFields(
    getPlanObject(inputs.marketParams, `${path}.inputs.marketParams`),
    {
      path: `${path}.inputs.marketParams`,
      fields: {
        loanToken: "address",
        collateralToken: "address",
        oracle: "address",
        irm: "address",
        lltv: "uint256 bigint",
      },
    },
  );
  const ids = getPlanObject(
    action.signatureRequestIds,
    `${path}.signatureRequestIds`,
  );
  if (
    inputs.authorizationNonce !== undefined ||
    ids.morphoAuthorization !== undefined
  ) {
    validatePlanFields(inputs, {
      path: `${path}.inputs`,
      fields: { authorizationNonce: "uint256 bigint" },
    });
  }
}
