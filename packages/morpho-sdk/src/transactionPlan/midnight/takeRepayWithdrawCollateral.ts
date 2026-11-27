import type { AccrualPosition, Market } from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress, Time } from "@morpho-org/morpho-ts";
import type { Client } from "viem";
import {
  type MidnightTakeRepayWithdrawCollateralParams,
  midnightTakeRepayWithdrawCollateral,
  parseMidnightTakeRepayWithdrawCollateral,
} from "../../actions/midnight/takeRepayWithdrawCollateral.js";
import { createChainCheck } from "../../actions/requirements/chainCheck.js";
import { assertRegistryTargetsHaveCode } from "../../entities/requirements/assertContractCode.js";
import { computeMidnightPostWithdrawalCollateral } from "../../helpers/computeMidnightPostWithdrawalCollateral.js";
import { MIDNIGHT_TAKE_MAX_DEADLINE_SECONDS } from "../../helpers/constant.js";
import { validateMidnightPositionBinding } from "../../helpers/parseMidnight.js";
import {
  validateMidnightWithdrawHealth,
  validateReferenceTime,
} from "../../helpers/validate.js";
import { validateMidnightTakeableOfferFields } from "../../helpers/validateMidnightTakeableOfferFields.js";
import { validateMidnightTakeFeasibility } from "../../helpers/validateMidnightTakeFeasibility.js";
import {
  InvalidBigIntInputError,
  MidnightTakeDeadlineTooFarError,
} from "../../types/error.js";
import type {
  MidnightBuyTarget,
  MidnightCollateralTransfer,
} from "../../types/index.js";
import { InvalidTransactionPlanError } from "../error.js";
import { type IntentParams, resolveIntent } from "../intent.js";
import { getTokenRequirements } from "../requirements.js";
import type { Action, TransactionPlan } from "../types.js";
import {
  getPlanObject,
  validatePlanField,
  validatePlanFields,
} from "../validation.js";
import {
  prepareMidnightBundleAuthorization,
  validateSignaturelessMidnightAction,
} from "./authorization.js";
import {
  storedFills,
  storedMarketTuple,
  validateCollateralIndexTypes,
  validateStoredCollateralOrder,
} from "./market.js";
import {
  validateMidnightTargetAmountTypes,
  validateStoredMidnightFills,
  validateStoredMidnightMarket,
} from "./validation.js";

const actionId = "midnightTakeRepayWithdrawCollateral";
type RepayAction = Extract<Action, { type: typeof actionId }>;
type RawParams = MidnightTakeRepayWithdrawCollateralParams;

/**
 * Checks a Midnight repayment through borrow offers and its collateral withdrawals
 * against the position snapshot: each withdrawal against the remaining collateral, then, when
 * collateral is withdrawn, the debt left after the target's guaranteed reduction (`units`, or
 * `minUnits` for an assets target) against the remaining collateral's buffered capacity. Runs the
 * same checks as the entity's inline ones; callers parse the withdrawals first.
 * @throws {WithdrawExceedsCollateralError} If a withdrawal exceeds the remaining collateral.
 * @throws {MissingMarketPriceError} If remaining collateral has no price for the health check.
 * @throws {WithdrawMakesPositionUnhealthyError} If the remaining debt exceeds buffered capacity.
 */
const validateTakeRepayWithdrawCollateralPosition = (params: {
  readonly marketData: Market;
  readonly positionData: {
    readonly collateral: readonly bigint[];
    readonly debt: bigint;
  };
  readonly collateralPrices: readonly bigint[];
  readonly target: MidnightBuyTarget;
  readonly collateralWithdrawals: readonly MidnightCollateralTransfer[];
}): void => {
  const { marketData, positionData, target, collateralWithdrawals } = params;
  const { postCollateral, withdrawAmount } =
    computeMidnightPostWithdrawalCollateral({
      market: marketData.params,
      marketId: marketData.id,
      collateral: positionData.collateral,
      withdrawals: collateralWithdrawals,
    });
  if (collateralWithdrawals.length === 0) {
    return;
  }
  const debtReduction =
    target.type === "units" ? target.units : target.minUnits;
  validateMidnightWithdrawHealth({
    market: marketData,
    collateral: postCollateral,
    collateralPrices: params.collateralPrices,
    debt:
      debtReduction >= positionData.debt
        ? 0n
        : positionData.debt - debtReduction,
    withdrawAmount,
  });
};

/**
 * Inputs for reducing Midnight debt with a borrow-side quote.
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export interface MidnightTakeRepayWithdrawCollateralPlanParams
  extends Omit<IntentParams, "supportSignature" | "deployless">,
    Pick<
      RawParams,
      | "target"
      | "takeableOffers"
      | "repayEnabled"
      | "nativeAmount"
      | "maxContinuousFee"
    >,
    Partial<Pick<RawParams, "collateralWithdrawals" | "collateralReceiver">> {
  /** Hydrated market snapshot used to assess fill feasibility and collateral capacity. */
  readonly marketData: Market;
  /** Borrower's position snapshot for the same market. */
  readonly positionData: AccrualPosition;
  /** Oracle prices indexed by market collateral, scaled by ORACLE_PRICE_SCALE. */
  readonly collateralPrices: readonly bigint[];
  /** Reference Unix timestamp in seconds; defaults to the device clock. */
  readonly now?: bigint;
  /** Unix seconds; defaults to one hour after the reference timestamp. */
  readonly expiresAt?: number;
}

/**
 * Prepares a reduce-only buy on MidnightBundlesV2. The bundle fills borrow offers,
 * repays the unfilled remainder at par if enabled, then withdraws collateral.
 * The collateral receiver defaults to the submitting account. Validates inputs with the same
 * parse-once constructor, position binding, buffered post-withdrawal health check and fill
 * feasibility check as the entity `takeRepayWithdrawCollateral`, including its buy-budget bound:
 * a units target's `maxBuyerAssets` must cover the units at the cheapest live price, and an
 * assets target has no budget check. Offers whose price conversion fails throughout the plan
 * window are dropped from the stored fills; an offer that converts only at a later fee can still
 * revert the bundle if sent earlier. Preparation does not see live cancellations either, so
 * simulate before sending to catch these price-conversion reverts and cancelled or consumed
 * offers. Native funding still requires allowance for the full
 * wrapped-native pull.
 * @param client - Viem client used to check the chain and deployments and read prerequisites.
 * @param params - Borrower, snapshots, buy target, quote, optional withdrawals and intent.
 * @param params.chainId - Chain containing the market and MidnightBundlesV2.
 * @param params.account - Non-zero borrower whose debt is repaid; it funds the repayment and sends the plan.
 * @param params.marketData - Hydrated market snapshot used for fill feasibility and collateral capacity.
 * @param params.positionData - Borrower's position snapshot for the same market.
 * @param params.collateralPrices - Oracle prices indexed by market collateral, scaled by `ORACLE_PRICE_SCALE`.
 * @param params.takeableOffers - ABI-ready borrow offers from the caller's quote, in fill order.
 * @param params.target.type - `"assets"` to pay exact loan assets, or `"units"` to buy exact units.
 * @param params.target.assets - Loan assets paid on an assets target, referral fee included.
 * @param params.target.minUnits - Unit floor on an assets target.
 * @param params.target.units - Exact units bought on a units target; `maxUint256` targets the account's whole debt.
 * @param params.target.maxBuyerAssets - Loan-asset cap pulled on a units target, referral fee included; the unused remainder is returned.
 * @param params.repayEnabled - Whether the bundle repays the unfilled remainder directly to Midnight.
 * @param params.maxContinuousFee - Largest market continuous fee accepted when taking offers; pass `maxUint256` for no cap.
 * @param params.nativeAmount - Optional native ETH in wei for a wrapped-native loan, capped by the pull.
 * @param params.collateralWithdrawals - Optional withdrawals after the repayment; defaults to none. Each
 *   `collateralIndex` indexes `marketData.params.collateralParams`, and `assets` is in that token's base units;
 *   `maxUint256` withdraws the account's whole balance of that collateral.
 * @param params.collateralReceiver - Optional recipient of withdrawn collateral; defaults to `account`.
 * @param params.referralFee.bps - Optional referral fee in integer basis points, at most 10%.
 * @param params.referralFee.recipient - Recipient required for a positive referral fee.
 * @param params.now - Reference Unix timestamp in seconds; omitting it uses the device clock (an untyped JavaScript `null` does too).
 * @param params.expiresAt - Onchain deadline in Unix seconds; defaults to, and may not exceed, one hour after `now`.
 * @param params.calldataOrigin - Optional attribution bytes appended to each built transaction.
 * @returns A frozen plan with any needed approval and standalone authorization, without signatures.
 * @throws {InvalidBigIntInputError} when a supplied non-null `now`, `maxContinuousFee`, a target amount, or a withdrawal's collateral index or amount is not a bigint; checked before any request.
 * @throws {ZeroAccountError} when the sender is the zero address.
 * @throws {InvalidTransactionPlanError} when the sender address, attribution length, target discriminator or `repayEnabled` flag is invalid.
 * @throws {InvalidMidnightNativeAmountTypeError} when `nativeAmount` is supplied as a non-bigint.
 * @throws {NonIntegerInputError} when expiry or referral fee basis points are not safe integers.
 * @throws {NonPositiveInputError} when expiry, a target amount or bound, or a withdrawal amount is nonpositive.
 * @throws {ExpiredDeadlineError} when expiry is at or before the reference timestamp.
 * @throws {NegativeInputError} when the referral fee, offer cap, continuous fee cap or native amount is negative.
 * @throws {InputExceedsMaxError} when referral fee basis points exceed 1,000 (10%), an amount or cap exceeds its
 *   bound, or native funding exceeds the pull.
 * @throws {InvalidCalldataOriginError} when attribution bytes are empty or malformed.
 * @throws {MidnightTakeDeadlineTooFarError} when expiry is more than one hour away.
 * @throws {ChainIdMismatchError} when the market, configured client or transport is on another chain.
 * @throws {UnsupportedChainIdError} when the chain is not registered.
 * @throws {UnknownAddressError} when a required Midnight deployment is not registered on the chain.
 * @throws {MidnightMarketAddressMismatchError} when the market targets another Midnight deployment.
 * @throws {InvalidMarketParameterError} when the market configuration is invalid.
 * @throws {UnknownCollateralIndexError} when a withdrawal targets an unconfigured collateral index.
 * @throws {MidnightCalldataEncodingError} when an address is malformed or calldata cannot be encoded.
 * @throws {MidnightZeroReceiverError} when withdrawn collateral is sent to the zero address.
 * @throws {MidnightContractReceiverError} when withdrawn collateral or a positive referral fee is sent to a blocked contract.
 * @throws {EmptyMidnightTakeableOffersError} when the quote is empty.
 * @throws {MidnightOfferSideMismatchError} when an offer is not a borrow offer.
 * @throws {MidnightTakeableOfferMarketMismatchError} when an offer trades another market.
 * @throws {MidnightTakeableOfferZeroSellerReceiverError} when an offer sends seller proceeds to the zero address.
 * @throws {UnboundedMidnightTakeInputError} when the bundle deadline is `maxUint256`.
 * @throws {ReferralFeeRecipientMissingError} when a positive referral fee has no recipient.
 * @throws {ChainWNativeMissingError} when native funding is requested without a registered wrapped-native token.
 * @throws {NativeAmountOnNonWNativeAssetError} when native funding is requested for a different loan token.
 * @throws {MarketIdMismatchError} when the position belongs to another market.
 * @throws {AccrualPositionUserMismatchError} when another account owns the position.
 * @throws {WithdrawExceedsCollateralError} when withdrawals exceed the collateral balance.
 * @throws {MissingMarketPriceError} when the health check needs a missing oracle price.
 * @throws {WithdrawMakesPositionUnhealthyError} when remaining debt exceeds buffered collateral capacity.
 * @throws {MidnightContinuousFeeAboveMaxError} when the market's continuous fee exceeds the caller's cap.
 * @throws {MidnightRepayExceedsDebtError} when the target exceeds the snapshot debt.
 * @throws {MidnightTakeableOffersNotFillableError} when the supplied offers cannot be used.
 * @throws {MidnightTakeTargetUnreachableError} when the target cannot be met within its bounds.
 * @throws {viem.BaseError} when a chain, bytecode, allowance or authorization read fails.
 * @throws {MissingContractCodeError} when a registered Midnight target has no code.
 * @example
 * ```ts
 * import {
 *   buildTransactions,
 *   prepareMidnightTakeRepayWithdrawCollateral,
 *   type MidnightTakeRepayWithdrawCollateralPlanParams,
 * } from "@morpho-org/morpho-sdk";
 * import { blueOracleAbi } from "@morpho-org/morpho-sdk/abis";
 * import { fetchMidnightAccrualPosition } from "@morpho-org/morpho-sdk/fetch";
 * import { MidnightApi } from "@morpho-org/morpho-sdk/midnight-api";
 *
 * type SnapshotParams = Parameters<typeof fetchMidnightAccrualPosition>[1];
 * type PublicClient = Parameters<typeof fetchMidnightAccrualPosition>[0] & {
 *   getBlock(): Promise<{ number: bigint; timestamp: bigint }>;
 *   readContract(params: {
 *     address: SnapshotParams["user"];
 *     abi: typeof blueOracleAbi;
 *     functionName: "price";
 *     blockNumber: bigint;
 *   }): Promise<bigint>;
 * };
 *
 * async function prepareRepayment(
 *   client: PublicClient,
 *   marketId: SnapshotParams["marketId"],
 *   params: Pick<MidnightTakeRepayWithdrawCollateralPlanParams,
 *     "chainId" | "account" | "maxContinuousFee" | "collateralWithdrawals">,
 *   assets: bigint,
 *   minUnits: bigint,
 * ) {
 *   const block = await client.getBlock();
 *   const positionData = await fetchMidnightAccrualPosition(client, {
 *     marketId, user: params.account, blockNumber: block.number,
 *   });
 *   const marketData = positionData.market;
 *   const collateralPrices = await Promise.all(
 *     marketData.params.collateralParams.map(({ oracle }) =>
 *       client.readContract({
 *         address: oracle, abi: blueOracleAbi, functionName: "price", blockNumber: block.number,
 *       }),
 *     ),
 *   );
 *   const quote = await new MidnightApi().fetchBookQuote({
 *     marketId, side: "asks", assets, taker: params.account,
 *   });
 *   const plan = await prepareMidnightTakeRepayWithdrawCollateral(client, {
 *     ...params, marketData, positionData, collateralPrices, now: block.timestamp,
 *     target: { type: "assets", assets, minUnits },
 *     takeableOffers: quote.data.takeableOffers,
 *     repayEnabled: true,
 *   });
 *   // Simulate, then send in order from plan.account on plan.chainId.
 *   return buildTransactions(plan);
 * }
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export async function prepareMidnightTakeRepayWithdrawCollateral(
  client: Client,
  params: MidnightTakeRepayWithdrawCollateralPlanParams,
): Promise<TransactionPlan> {
  const { chainId, account, marketData, positionData, target, nativeAmount } =
    params;
  const now = params.now ?? Time.timestamp();
  // Reject a non-bigint clock before the bigint deadline sum can throw a generic TypeError.
  validateReferenceTime(now);
  const maxDeadline = now + MIDNIGHT_TAKE_MAX_DEADLINE_SECONDS;
  const intent = resolveIntent(
    { ...params, expiresAt: params.expiresAt ?? Number(maxDeadline) },
    now,
  );
  if (intent.deadline > maxDeadline) {
    throw new MidnightTakeDeadlineTooFarError({
      deadline: intent.deadline,
      maxDeadline,
    });
  }
  const { type } = getPlanObject(target, "$.target");
  if (type !== "assets" && type !== "units") {
    throw invalidTargetType("$.target");
  }
  validatePlanField(params.repayEnabled, {
    path: "$.repayEnabled",
    type: "boolean",
  });
  if (typeof params.maxContinuousFee !== "bigint") {
    throw new InvalidBigIntInputError(
      "maxContinuousFee",
      params.maxContinuousFee,
    );
  }
  validateMidnightTargetAmountTypes(
    target,
    target.type === "assets"
      ? ["assets", "minUnits"]
      : ["units", "maxBuyerAssets"],
  );
  const collateralWithdrawals = params.collateralWithdrawals ?? [];
  validateCollateralIndexTypes("collateralWithdrawals", collateralWithdrawals);
  for (const [index, { assets }] of collateralWithdrawals.entries()) {
    if (typeof assets !== "bigint") {
      throw new InvalidBigIntInputError(
        `collateralWithdrawals[${index}].assets`,
        assets,
      );
    }
  }

  const parsed = parseMidnightTakeRepayWithdrawCollateral({
    chainId,
    market: marketData.params,
    target,
    takeableOffers: params.takeableOffers,
    repayEnabled: params.repayEnabled,
    nativeAmount,
    collateralWithdrawals,
    collateralReceiver: params.collateralReceiver ?? account,
    maxContinuousFee: params.maxContinuousFee,
    deadline: intent.deadline,
    referralFeePct: intent.referralFeePct,
    referralFeeRecipient: intent.referralFeeRecipient,
  });
  validateMidnightTakeableOfferFields(parsed.takeableOffers);
  const bundle = getChainAddress(chainId, "midnightBundlesV2");
  validateMidnightPositionBinding({
    positionData,
    accountAddress: account,
    marketData,
  });
  validateTakeRepayWithdrawCollateralPosition({
    marketData,
    positionData,
    collateralPrices: params.collateralPrices,
    target: parsed.target,
    collateralWithdrawals: parsed.collateralWithdrawals,
  });
  const takeableOffers = validateMidnightTakeFeasibility({
    side: "buy",
    takeableOffers: parsed.takeableOffers,
    accountAddress: account,
    marketData,
    now,
    deadline: parsed.deadline,
    referralFeePct: parsed.referralFeePct,
    fallbackUnits: parsed.repayEnabled ? positionData.debt : 0n,
    target: parsed.target,
    maxContinuousFee: parsed.maxContinuousFee,
    debt: positionData.debt,
  });

  await assertDeployments(client, chainId);
  const [{ approvals }, authorization] = await Promise.all([
    getTokenRequirements(client, {
      chainId,
      token: parsed.market.loanToken,
      owner: account,
      spender: bundle,
      amount:
        parsed.target.type === "assets"
          ? parsed.target.assets
          : parsed.target.maxBuyerAssets,
      approvalId: (index) => `${actionId}:approval:${index}`,
    }),
    prepareMidnightBundleAuthorization(client, { chainId, account }),
  ]);
  return deepFreeze({
    version: 2,
    chainId,
    account,
    expiresAt: intent.expiresAt,
    ...(intent.calldataOrigin && { calldataOrigin: intent.calldataOrigin }),
    steps: [
      ...approvals,
      ...(authorization === undefined ? [] : [authorization]),
      {
        id: actionId,
        label: "Repay Midnight debt through offers",
        action: {
          type: actionId,
          inputs: {
            chainId,
            account,
            market: parsed.market,
            target: parsed.target,
            takeableOffers,
            repayEnabled: parsed.repayEnabled,
            collateralWithdrawals: parsed.collateralWithdrawals,
            collateralReceiver: parsed.collateralReceiver,
            maxContinuousFee: parsed.maxContinuousFee,
            ...(nativeAmount !== undefined && {
              nativeAssets: parsed.nativeFunding.value,
            }),
            deadline: parsed.deadline,
            referralFeePct: parsed.referralFeePct,
            referralFeeRecipient: parsed.referralFeeRecipient,
          },
        },
      },
    ],
    signatureRequests: [],
  });
}

async function assertDeployments(client: Client, chainId: number) {
  const chainCheck = createChainCheck(client, chainId);
  await chainCheck();
  // Check deployments before allowance or authorization reads can fail decoding empty data.
  await assertRegistryTargetsHaveCode(
    client,
    chainId,
    [
      {
        role: "midnightBundlesV2",
        address: getChainAddress(chainId, "midnightBundlesV2"),
      },
      { role: "midnight", address: getChainAddress(chainId, "midnight") },
    ],
    chainCheck,
  );
}

function invalidTargetType(path: string) {
  return new InvalidTransactionPlanError({
    path: `${path}.type`,
    reason: "expected assets or units",
  });
}

function storedParams(inputs: RepayAction["inputs"]): RawParams {
  return {
    chainId: inputs.chainId,
    market: storedMarketTuple(inputs.market),
    target: inputs.target,
    takeableOffers: storedFills(inputs.takeableOffers),
    repayEnabled: inputs.repayEnabled,
    collateralWithdrawals: inputs.collateralWithdrawals.map(
      ({ collateralIndex, assets }) => ({ collateralIndex, assets }),
    ),
    collateralReceiver: inputs.collateralReceiver,
    maxContinuousFee: inputs.maxContinuousFee,
    deadline: inputs.deadline,
    referralFeePct: inputs.referralFeePct,
    referralFeeRecipient: inputs.referralFeeRecipient,
    nativeAmount: inputs.nativeAssets,
  };
}

/**
 * @internal Encodes the prepared buy and withdrawals from persisted fields alone.
 * @throws {InvalidTransactionPlanError} If the market's collateral tokens are not in strictly
 *   ascending address order, or the target is not an object whose type is `assets` or `units`.
 */
export function buildMidnightTakeRepayWithdrawCollateral({
  inputs,
}: RepayAction) {
  const { type } = getPlanObject(inputs.target, "$.inputs.target");
  if (type !== "assets" && type !== "units") {
    throw invalidTargetType("$.inputs.target");
  }
  validateStoredCollateralOrder(
    inputs.market.collateralParams,
    "$.inputs.market.collateralParams",
  );
  return midnightTakeRepayWithdrawCollateral(storedParams(inputs));
}

/**
 * @internal Validates a stored reduce-only buy recipe without fetching any state: the field
 * shapes and collateral order, then the action's clock-free parse checks on the stored inputs.
 */
export function validateMidnightTakeRepayWithdrawCollateralPlanAction(
  action: Record<string, unknown>,
  path: string,
): void {
  const inputsPath = `${path}.inputs`;
  const inputs = getPlanObject(action.inputs, inputsPath);
  validatePlanFields(inputs, {
    path: inputsPath,
    fields: {
      repayEnabled: "boolean",
      collateralReceiver: "address",
      maxContinuousFee: "uint256 bigint",
      deadline: "uint256 bigint",
      referralFeePct: "uint256 bigint",
      referralFeeRecipient: "address",
      ...(inputs.nativeAssets !== undefined && {
        nativeAssets: "uint256 bigint",
      }),
    },
  });
  const targetPath = `${inputsPath}.target`;
  const target = getPlanObject(inputs.target, targetPath);
  switch (target.type) {
    case "assets":
      validatePlanFields(target, {
        path: targetPath,
        fields: { assets: "uint256 bigint", minUnits: "uint256 bigint" },
      });
      break;
    case "units":
      validatePlanFields(target, {
        path: targetPath,
        fields: { units: "uint256 bigint", maxBuyerAssets: "uint256 bigint" },
      });
      break;
    default:
      throw invalidTargetType(targetPath);
  }
  const withdrawalsPath = `${inputsPath}.collateralWithdrawals`;
  if (!Array.isArray(inputs.collateralWithdrawals)) {
    throw new InvalidTransactionPlanError({
      path: withdrawalsPath,
      reason: "expected an array",
    });
  }
  for (const [index, item] of inputs.collateralWithdrawals.entries()) {
    const itemPath = `${withdrawalsPath}[${index}]`;
    validatePlanFields(getPlanObject(item, itemPath), {
      path: itemPath,
      fields: { collateralIndex: "uint256 bigint", assets: "uint256 bigint" },
    });
  }
  const chainId = inputs.chainId as number; // Checked by the parse dispatcher.
  validateStoredMidnightMarket(inputs.market, {
    path: `${inputsPath}.market`,
    chainId,
  });
  validateStoredCollateralOrder(
    (inputs.market as RepayAction["inputs"]["market"]).collateralParams,
    `${inputsPath}.market.collateralParams`,
  );
  validateStoredMidnightFills(inputs.takeableOffers, {
    path: `${inputsPath}.takeableOffers`,
    chainId,
  });
  validateSignaturelessMidnightAction(action, path);
  try {
    parseMidnightTakeRepayWithdrawCollateral(
      storedParams((action as RepayAction).inputs),
    );
  } catch (cause) {
    throw new InvalidTransactionPlanError({
      path: inputsPath,
      reason: "expected a valid Midnight repayment through borrow offers",
      cause,
    });
  }
}
