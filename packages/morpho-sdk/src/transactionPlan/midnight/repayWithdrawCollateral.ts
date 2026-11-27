import type { AccrualPosition, Market } from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress, Time } from "@morpho-org/morpho-ts";
import type { Client } from "viem";
import {
  type MidnightRepayWithdrawCollateralParams,
  midnightRepayWithdrawCollateral,
  parseMidnightRepayWithdrawCollateral,
} from "../../actions/midnight/repayWithdrawCollateral.js";
import { createChainCheck } from "../../actions/requirements/chainCheck.js";
import { assertRegistryTargetsHaveCode } from "../../entities/requirements/assertContractCode.js";
import { validateMidnightPositionBinding } from "../../helpers/parseMidnight.js";
import {
  validateMidnightRepayWithdrawCollateralPosition,
  validateReferenceTime,
} from "../../helpers/validate.js";
import {
  InvalidBigIntInputError,
  type MidnightRepay,
  type ReferenceTimestampParams,
} from "../../types/index.js";
import { InvalidTransactionPlanError } from "../error.js";
import { type IntentParams, resolveIntent } from "../intent.js";
import { getTokenRequirements } from "../requirements.js";
import type { Action, TransactionPlan } from "../types.js";
import { getPlanObject, validatePlanFields } from "../validation.js";
import {
  prepareMidnightBundleAuthorization,
  validateSignaturelessMidnightAction,
} from "./authorization.js";
import {
  storedMarketTuple,
  validateCollateralIndexTypes,
  validateStoredCollateralOrder,
} from "./market.js";
import { validateStoredMidnightMarket } from "./validation.js";

type RepayAction = Extract<Action, { type: "midnightRepayWithdrawCollateral" }>;
const actionId = "midnightRepayWithdrawCollateral";

/**
 * Inputs for directly repaying a Midnight position and optionally withdrawing collateral.
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export interface MidnightRepayWithdrawCollateralPlanParams
  extends Pick<
      IntentParams,
      "chainId" | "account" | "expiresAt" | "calldataOrigin"
    >,
    ReferenceTimestampParams,
    Pick<MidnightRepayWithdrawCollateralParams, "repay" | "nativeAmount"> {
  /** Hydrated market snapshot from the same block as `positionData`. */
  readonly marketData: Market;
  /** Position snapshot for the same market, owned by the submitting account. */
  readonly positionData: AccrualPosition;
  /**
   * Raw values from `price()` on each `marketData.params.collateralParams[i].oracle`,
   * indexed like `positionData.collateral` and scaled by `ORACLE_PRICE_SCALE` (1e36).
   * Use prices from the snapshot block. No prices are needed when there are no withdrawals
   * or the repayment leaves no debt in the snapshot.
   */
  readonly collateralPrices: readonly bigint[];
  /**
   * Defaults to no withdrawals. Each `collateralIndex` is a zero-based index into
   * `marketData.params.collateralParams` and `positionData.collateral`. Amounts are in
   * that collateral token's smallest units; `assets: maxUint256` withdraws the remaining
   * balance at that index at execution.
   */
  readonly collateralWithdrawals?: MidnightRepayWithdrawCollateralParams["collateralWithdrawals"];
  /**
   * Defaults to `account`. With withdrawals, the receiver must be nonzero and not a
   * blocked Midnight protocol or market token contract. Unused without withdrawals.
   */
  readonly collateralReceiver?: MidnightRepayWithdrawCollateralParams["collateralReceiver"];
}

/**
 * Prepares a direct Midnight repayment with no offer fills or referral fee. Use an assets
 * target for an exact repayment (`0n` for collateral-only), or full repayment with a finite
 * asset cap. Inputs go through the same parse-once constructor and position checks as the
 * entity `repayWithdrawCollateral`, in the same order: the position is bound to the sender and
 * market, then withdrawals, debt and buffered health are checked against the snapshot.
 * Restoring and building offline does not refresh those checks; simulate against current
 * state before sending.
 *
 * If allowance is below the full pull bound, the plan requests a standalone ERC-20 approval
 * to MidnightBundlesV2 for `maxUint256`, subject to `MAX_TOKEN_APPROVALS`, even with native
 * funding. The approval does not expire with the plan. Withdrawal-only plans do not read
 * allowance. In a full repayment, any native funding above the debt paid stays in the
 * sender's wallet as wrapped native, not as an ETH refund.
 * The plan adds a standalone bundle authorization if needed and never requests signatures.
 * The bundle enforces the plan expiry, which defaults to two hours after the reference time.
 * @param client - Viem client used to check the network and deployments and read prerequisites.
 * @param params - Repayment, market and position snapshots, and optional withdrawals and funding.
 * @param params.chainId - EIP-155 chain ID of the market and submitting client.
 * @param params.account - Nonzero position owner who funds and sends the transactions.
 * @param params.repay - Use `{ type: "assets", assets }` for an exact amount (`0n` only withdraws)
 *   or `{ type: "full", maxBuyerAssets }` for full repayment. Both amounts are in the loan
 *   token's smallest units and must be below `maxUint256`. The full cap must be positive
 *   and cover all debt at execution, or the bundle reverts.
 * @param params.nativeAmount - ETH in wei sent as transaction value for a wrapped-native loan,
 *   up to the exact repayment amount or full repayment cap. Omit it or set it to `0n` for no ETH funding.
 * @param params.marketData - Hydrated market snapshot from the same block as `positionData`.
 * @param params.positionData - Position snapshot for the same market, owned by `account`.
 * @param params.collateralPrices - Raw `price()` values from each collateral oracle at the snapshot
 *   block, indexed like `positionData.collateral` and scaled by `ORACLE_PRICE_SCALE` (1e36). Not
 *   needed without withdrawals or when the repayment leaves no snapshot debt.
 * @param params.collateralWithdrawals - Optional withdrawals; defaults to none. Each
 *   `collateralIndex` indexes `marketData.params.collateralParams`, and `assets` is in that
 *   token's smallest units, with `maxUint256` withdrawing the remaining balance at execution.
 * @param params.collateralReceiver - Optional recipient of withdrawn collateral; defaults to
 *   `account`. With withdrawals it must be nonzero and not a blocked Midnight protocol or market
 *   token contract.
 * @param params.now - Reference time in Unix seconds, normally the latest block's timestamp.
 *   omitting it uses the device clock (an untyped JavaScript `null` does too); that fallback is deprecated.
 * @param params.expiresAt - Bundle execution deadline in Unix seconds. Defaults to two hours after `now`.
 * @param params.calldataOrigin - Optional attribution bytes (at most 1 MiB) appended to each transaction's calldata.
 * @returns A frozen plan with prerequisite calls first and no signature requests.
 * @throws {InvalidBigIntInputError} If a supplied non-null `now`, the active repayment amount or a withdrawal's `collateralIndex` or `assets` is not a bigint; checked before any request.
 * @throws {MarketIdMismatchError} If the position belongs to another market.
 * @throws {AccrualPositionUserMismatchError} If the position is owned by another account.
 * @throws {MidnightRepayExceedsDebtError} If an exact repayment exceeds the snapshot debt.
 * @throws {MidnightTakeTargetUnreachableError} If the full repayment cap is below the snapshot debt.
 * @throws {WithdrawExceedsCollateralError} If a withdrawal exceeds the supplied collateral balance.
 * @throws {WithdrawMakesPositionUnhealthyError} If remaining debt exceeds buffered collateral capacity.
 * @throws {MissingMarketPriceError} If remaining collateral has no price for the health check.
 * @throws {UnknownCollateralIndexError} If a withdrawal targets an unconfigured index.
 * @throws {MidnightZeroReceiverError} If withdrawn collateral is sent to the zero address.
 * @throws {MidnightContractReceiverError} If withdrawn collateral is sent to a blocked contract.
 * @throws {ChainIdMismatchError} If the market, configured client or transport is on another chain.
 * @throws {MidnightMarketAddressMismatchError} If the market targets another Midnight deployment.
 * @throws {InvalidMarketParameterError} If the market configuration is invalid.
 * @throws {MissingContractCodeError} If the registered bundle or Midnight core has no code.
 * @throws {viem.BaseError} If a chain, bytecode, allowance or authorization read fails.
 * @throws {UnsupportedChainIdError} If the chain is not registered.
 * @throws {UnknownAddressError} If a Midnight deployment is not registered on that chain.
 * @throws {ChainWNativeMissingError} If native funding is requested without a registered wrapped-native token.
 * @throws {NativeAmountOnNonWNativeAssetError} If native funding is requested for a different loan token.
 * @throws {InputExceedsMaxError} If an amount exceeds its encoding bound or native funding exceeds the pull.
 * @throws {NegativeInputError} If the exact repayment amount or native funding is negative.
 * @throws {InvalidMidnightNativeAmountTypeError} If `nativeAmount` is not a bigint.
 * @throws {NonPositiveInputError} If there is neither repayment nor withdrawal, the cap or a withdrawal is nonpositive, or expiry is nonpositive.
 * @throws {ZeroAccountError} If the sender is the zero address.
 * @throws {NonIntegerInputError} If expiry is not a safe integer.
 * @throws {ExpiredDeadlineError} If expiry is at or before the reference time.
 * @throws {InvalidCalldataOriginError} If attribution bytes are empty or malformed.
 * @throws {InvalidTransactionPlanError} If the sender address or attribution length is invalid, `repay` is not an object, or its type is unsupported.
 * @throws {MidnightCalldataEncodingError} If a market, position owner or receiver address is malformed, or calldata cannot be encoded.
 * @example
 * ```ts
 * import { buildTransactions, prepareMidnightRepayWithdrawCollateral } from "@morpho-org/morpho-sdk";
 * import { fetchMidnightAccrualPosition } from "@morpho-org/morpho-sdk/fetch";
 * import { type Address, type Hash, createPublicClient, http, maxUint256 } from "viem";
 * import { base } from "viem/chains";
 *
 * async function prepareClose(account: Address, marketId: Hash, maxBuyerAssets: bigint) {
 *   const client = createPublicClient({ chain: base, transport: http() });
 *   const block = await client.getBlock();
 *   const positionData = await fetchMidnightAccrualPosition(client, {
 *     marketId, user: account, blockNumber: block.number,
 *   });
 *   const plan = await prepareMidnightRepayWithdrawCollateral(client, {
 *     chainId: base.id, account, marketData: positionData.market, positionData,
 *     collateralPrices: [], // No price check is needed for full repayment.
 *     now: block.timestamp,
 *     repay: { type: "full", maxBuyerAssets },
 *     collateralWithdrawals: [{ collateralIndex: 0n, assets: maxUint256 }],
 *   });
 *   // Simulate, then send in order from plan.account on plan.chainId.
 *   return buildTransactions(plan);
 * }
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export async function prepareMidnightRepayWithdrawCollateral(
  client: Client,
  params: MidnightRepayWithdrawCollateralPlanParams,
): Promise<TransactionPlan> {
  const { chainId, account, marketData, positionData, nativeAmount } = params;
  const now = params.now ?? Time.timestamp();
  // Reject a non-bigint clock before the default expiry sum can concatenate strings.
  validateReferenceTime(now);
  const intent = resolveIntent(
    {
      chainId,
      account,
      expiresAt: params.expiresAt,
      calldataOrigin: params.calldataOrigin,
    },
    now,
  );
  // Throws before reading repay.type when a JS caller omits repay or passes a non-object.
  getPlanObject(params.repay, "$.repay");
  if (params.repay.type !== "assets" && params.repay.type !== "full") {
    throw invalidRepayType("$.repay");
  }
  const [repayField, repayAmount] =
    params.repay.type === "assets"
      ? ["assets", params.repay.assets]
      : ["maxBuyerAssets", params.repay.maxBuyerAssets];
  if (typeof repayAmount !== "bigint") {
    throw new InvalidBigIntInputError(`repay.${repayField}`, repayAmount);
  }
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
  const parsed = parseMidnightRepayWithdrawCollateral({
    chainId,
    market: marketData.params,
    repay: params.repay,
    nativeAmount,
    collateralWithdrawals,
    collateralReceiver: params.collateralReceiver ?? account,
    deadline: intent.deadline,
  });
  validateMidnightPositionBinding({
    positionData,
    accountAddress: account,
    marketData,
  });
  validateMidnightRepayWithdrawCollateralPosition({
    marketData,
    positionData,
    collateralPrices: params.collateralPrices,
    repay: parsed.repay,
    collateralWithdrawals: parsed.collateralWithdrawals,
  });

  const chainCheck = createChainCheck(client, chainId);
  await chainCheck();
  const spender = getChainAddress(chainId, "midnightBundlesV2");
  // Check deployments before an allowance or authorization read can fail decoding empty data.
  await assertRegistryTargetsHaveCode(
    client,
    chainId,
    [
      { role: "midnightBundlesV2", address: spender },
      { role: "midnight", address: getChainAddress(chainId, "midnight") },
    ],
    chainCheck,
  );
  const { repay, market } = parsed;
  const amount = repay.type === "assets" ? repay.assets : repay.maxBuyerAssets;
  const [{ approvals }, authorization] = await Promise.all([
    amount === 0n
      ? { approvals: [] }
      : getTokenRequirements(client, {
          chainId,
          token: market.struct.loanToken,
          owner: account,
          spender,
          amount,
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
        label: "Repay Midnight debt or withdraw collateral",
        action: {
          type: actionId,
          inputs: {
            chainId,
            account,
            market: market.struct,
            repay,
            ...(nativeAmount !== undefined && {
              nativeAssets: parsed.nativeFunding.value,
            }),
            collateralWithdrawals: parsed.collateralWithdrawals,
            collateralReceiver: parsed.collateralReceiver,
            deadline: parsed.deadline,
          },
        },
      },
    ],
    signatureRequests: [],
  });
}

function invalidRepayType(path: string) {
  return new InvalidTransactionPlanError({
    path: `${path}.type`,
    reason: "expected assets or full",
  });
}

function storedRepay(repay: MidnightRepay): MidnightRepay {
  // Throws before reading repay.type when a directly built step omits repay.
  getPlanObject(repay, "$.repay");
  switch (repay.type) {
    case "assets":
      return { type: "assets", assets: repay.assets };
    case "full":
      return { type: "full", maxBuyerAssets: repay.maxBuyerAssets };
    default:
      throw invalidRepayType("$.repay");
  }
}

/**
 * @internal Encodes only the persisted inputs; no position, client or clock is needed.
 * @throws {InvalidTransactionPlanError} If `repay` is not an object or its type is unsupported.
 * @throws {NegativeInputError} If the exact asset amount or native funding is negative.
 * @throws {NonPositiveInputError} If the full repayment cap, a withdrawal amount or the deadline is nonpositive, or the step neither repays nor withdraws.
 * @throws {InputExceedsMaxError} If `repay.assets` or `repay.maxBuyerAssets` is at least `maxUint256`, a withdrawal amount or deadline exceeds uint256, or native funding exceeds the repayment pull.
 * @throws {ChainIdMismatchError} If the market targets another chain.
 * @throws {MidnightMarketAddressMismatchError} If the market targets another Midnight deployment.
 * @throws {InvalidMarketParameterError} If the market configuration is invalid.
 * @throws {UnknownCollateralIndexError} If a withdrawal targets an index not configured on the market.
 * @throws {MidnightZeroReceiverError} If a collateral withdrawal names the zero address as its receiver.
 * @throws {MidnightContractReceiverError} If a collateral withdrawal names a blocked protocol or token contract as its receiver.
 * @throws {MidnightCalldataEncodingError} If an address is malformed or an input cannot be ABI-encoded.
 * @throws {ChainWNativeMissingError} If native funding targets a chain without wNative.
 * @throws {NativeAmountOnNonWNativeAssetError} If native funding targets a loan token other than wNative.
 * @throws {UnsupportedChainIdError} If the chain is absent from the address registry.
 * @throws {UnknownAddressError} If Midnight or MidnightBundlesV2 is not registered on the chain.
 */
export function buildMidnightRepayWithdrawCollateral({ inputs }: RepayAction) {
  validateStoredCollateralOrder(
    inputs.market.collateralParams,
    "$.inputs.market.collateralParams",
  );
  return midnightRepayWithdrawCollateral({
    chainId: inputs.chainId,
    market: storedMarketTuple(inputs.market),
    repay: storedRepay(inputs.repay),
    nativeAmount: inputs.nativeAssets,
    collateralWithdrawals: inputs.collateralWithdrawals,
    collateralReceiver: inputs.collateralReceiver,
    deadline: inputs.deadline,
  });
}

/**
 * @internal Validates the format of a stored repayment recipe without reading live state.
 * @throws {InvalidTransactionPlanError} If the recipe has invalid fields or signature references.
 */
export function validateMidnightRepayWithdrawCollateralPlanAction(
  action: Record<string, unknown>,
  path: string,
): void {
  const inputsPath = `${path}.inputs`;
  const inputs = getPlanObject(action.inputs, inputsPath);
  validatePlanFields(inputs, {
    path: inputsPath,
    fields: {
      collateralReceiver: "address",
      deadline: "uint256 bigint",
      ...(inputs.nativeAssets !== undefined && {
        nativeAssets: "uint256 bigint",
      }),
    },
  });
  const repayPath = `${inputsPath}.repay`;
  const repay = getPlanObject(inputs.repay, repayPath);
  switch (repay.type) {
    case "assets":
      validatePlanFields(repay, {
        path: repayPath,
        fields: { assets: "uint256 bigint" },
      });
      break;
    case "full":
      validatePlanFields(repay, {
        path: repayPath,
        fields: { maxBuyerAssets: "uint256 bigint" },
      });
      break;
    default:
      throw invalidRepayType(repayPath);
  }
  const withdrawalsPath = `${inputsPath}.collateralWithdrawals`;
  if (!Array.isArray(inputs.collateralWithdrawals)) {
    throw new InvalidTransactionPlanError({
      path: withdrawalsPath,
      reason: "expected an array",
    });
  }
  for (const [index, withdrawal] of inputs.collateralWithdrawals.entries()) {
    const itemPath = `${withdrawalsPath}[${index}]`;
    validatePlanFields(getPlanObject(withdrawal, itemPath), {
      path: itemPath,
      fields: { collateralIndex: "uint256 bigint", assets: "uint256 bigint" },
    });
  }
  validateStoredMidnightMarket(inputs.market, {
    path: `${inputsPath}.market`,
    chainId: inputs.chainId as number, // Checked by the parse dispatcher.
  });
  validateStoredCollateralOrder(
    (inputs.market as RepayAction["inputs"]["market"]).collateralParams,
    `${inputsPath}.market.collateralParams`,
  );
  // Reject any stored signature-reference field; this action never consumes signatures.
  validateSignaturelessMidnightAction(action, path);
}
