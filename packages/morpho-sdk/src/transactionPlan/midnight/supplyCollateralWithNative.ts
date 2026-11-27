import type { IMarketParams } from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress, Time } from "@morpho-org/morpho-ts";
import type { Client } from "viem";
import {
  midnightSupplyCollateralWithNative,
  parseMidnightSupplyCollateralWithNative,
} from "../../actions/midnight/supplyCollateralWithNative.js";
import { createChainCheck } from "../../actions/requirements/chainCheck.js";
import { assertRegistryTargetsHaveCode } from "../../entities/requirements/assertContractCode.js";
import { validateReferenceTime } from "../../helpers/validate.js";
import {
  InvalidBigIntInputError,
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
import { storedMarketTuple, validateStoredCollateralOrder } from "./market.js";
import { validateStoredMidnightMarket } from "./validation.js";

type SupplyCollateralWithNativeAction = Extract<
  Action,
  { type: "midnightSupplyCollateralWithNative" }
>;
const actionId = "midnightSupplyCollateralWithNative";

/**
 * Represents an intent to wrap native currency and supply it as wNative collateral to the
 * submitting account's Midnight position through MidnightBundlesV2.
 * @example
 * ```ts
 * import type { MidnightSupplyCollateralWithNativePlanParams } from "@morpho-org/morpho-sdk";
 * const fullyNative = (params: MidnightSupplyCollateralWithNativePlanParams) =>
 *   ({ ...params, nativeAmount: params.collateralAssets });
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export interface MidnightSupplyCollateralWithNativePlanParams
  extends Pick<
      IntentParams,
      "chainId" | "account" | "expiresAt" | "calldataOrigin"
    >,
    ReferenceTimestampParams {
  /** Market configuration on the target chain. */
  readonly market: IMarketParams;
  /** Index of the registered wNative collateral in Midnight's token-address order; defaults to `0n`. */
  readonly collateralIndex?: bigint;
  /** Positive total collateral to supply, in wNative base units. */
  readonly collateralAssets: bigint;
  /** Positive native amount in wei sent as transaction value and wrapped, at most `collateralAssets`. */
  readonly nativeAmount: bigint;
}

/**
 * Prepares a payable MidnightBundlesV2 collateral supply that wraps native currency, with no
 * borrow or offer. Inputs go through `parseMidnightSupplyCollateralWithNative`, which applies
 * the checks of the `midnightSupplyCollateralWithNative` builder the entity uses, in the same
 * order, without encoding the call. The bundle wraps `nativeAmount` into wNative for the sender
 * and pulls `collateralAssets` from the sender, so the plan adds an ERC-20 approval to
 * MidnightBundlesV2 for the full collateral amount when the allowance is insufficient, even with
 * full native funding, as the entity does. It adds the standalone bundle authorization only when
 * missing and never requests signatures. The bundle enforces the plan expiry as its deadline.
 * The plan reads no balances: the wallet needs `collateralAssets - nativeAmount` wNative plus the
 * native value and gas, so simulate every step together before asking for the first approval.
 * Unlike the entity, the allowance check keeps no `reservedCollateralAssets` reserve, so the
 * supply can consume an allowance another operation relies on.
 * @param client - Viem client used to check the network and deployments and read prerequisites.
 * @param params - Market, wNative collateral selection, total amount, native funding and sending account.
 * @param params.chainId - Chain containing the market, Midnight core and MidnightBundlesV2.
 * @param params.account - Non-zero account that sends the value and receives the collateral position.
 * @param params.market - Market configuration on the target chain.
 * @param params.collateralIndex - Index of the registered wNative collateral in token-address order. Defaults to `0n`.
 * @param params.collateralAssets - Positive total collateral in wNative base units.
 * @param params.nativeAmount - Positive native funding in wei, at most `collateralAssets`; any rest is pulled as wNative.
 * @param params.now - Reference Unix timestamp in seconds; omitting it uses the device clock (an untyped JavaScript `null` does too).
 * @param params.expiresAt - Bundle execution deadline in Unix seconds; defaults to two hours after `now`.
 * @param params.calldataOrigin - Optional attribution bytes appended to each built transaction.
 * @returns A frozen plan whose steps must be submitted in order from `params.account`.
 * @throws {InvalidBigIntInputError} If a supplied non-null `now`, the collateral amount or the index is not a bigint; checked before any request.
 * @throws {ZeroAccountError} If the account is the zero address.
 * @throws {NonIntegerInputError} If expiry is not a safe integer.
 * @throws {ExpiredDeadlineError} If expiry is at or before the reference time.
 * @throws {InvalidCalldataOriginError} If attribution bytes are empty or malformed.
 * @throws {InvalidTransactionPlanError} If the account is malformed or attribution exceeds 1 MiB.
 * @throws {NonPositiveInputError} If the collateral amount, native amount or expiry is not positive.
 * @throws {InputExceedsMaxError} If the collateral amount exceeds uint128 or the native amount exceeds the collateral amount.
 * @throws {ChainIdMismatchError} If the market, client or RPC targets another chain.
 * @throws {MidnightMarketAddressMismatchError} If the market targets another Midnight deployment.
 * @throws {InvalidMarketParameterError} If the market's chain ID or collateral configuration is invalid.
 * @throws {MidnightCalldataEncodingError} If market fields cannot be ABI-encoded.
 * @throws {UnknownCollateralIndexError} If the index is not configured on the market.
 * @throws {InvalidMidnightNativeAmountTypeError} If `nativeAmount` is not a bigint.
 * @throws {NegativeInputError} If `nativeAmount` is negative.
 * @throws {ChainWNativeMissingError} If the chain has no wrapped-native asset.
 * @throws {NativeAmountOnNonWNativeAssetError} If the selected collateral is not wNative.
 * @throws {UnsupportedChainIdError} If the chain is absent from the address registry.
 * @throws {UnknownAddressError} If Midnight core or MidnightBundlesV2 is not registered on the chain.
 * @throws {MissingContractCodeError} If the registered bundle or Midnight core has no deployed code.
 * @throws {viem.BaseError} If the chain ID, bytecode, allowance or authorization read fails.
 * @example
 * ```ts
 * import {
 *   buildTransactions,
 *   prepareMidnightSupplyCollateralWithNative,
 *   type TransactionPlan,
 * } from "@morpho-org/morpho-sdk";
 * import { fetchMidnightMarketParams } from "@morpho-org/morpho-sdk/fetch";
 * import { type Address, type Hash, createPublicClient, http } from "viem";
 * import { base } from "viem/chains";
 *
 * // `collateralIndex` is the position of the chain's wNative in the market's collaterals.
 * async function prepareNativeCollateralSupply(
 *   account: Address,
 *   marketId: Hash,
 *   collateralIndex: bigint,
 * ) {
 *   const client = createPublicClient({ chain: base, transport: http() });
 *   const market = await fetchMidnightMarketParams(client, { marketId });
 *   const plan: TransactionPlan = await prepareMidnightSupplyCollateralWithNative(client, {
 *     chainId: base.id,
 *     account,
 *     market,
 *     collateralIndex,
 *     collateralAssets: 1_000_000_000_000_000n,
 *     nativeAmount: 1_000_000_000_000_000n,
 *   });
 *   // plan.steps: any wNative approval to MidnightBundlesV2, any bundle authorization, then
 *   // "midnightSupplyCollateralWithNative". Send them in order from plan.account on plan.chainId.
 *   return buildTransactions(plan);
 * }
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export async function prepareMidnightSupplyCollateralWithNative(
  client: Client,
  params: MidnightSupplyCollateralWithNativePlanParams,
): Promise<TransactionPlan> {
  const { account, chainId } = params;
  const now = params.now ?? Time.timestamp();
  validateReferenceTime(now);
  const intent = resolveIntent(
    {
      account,
      chainId,
      expiresAt: params.expiresAt,
      calldataOrigin: params.calldataOrigin,
    },
    now,
  );
  if (typeof params.collateralAssets !== "bigint") {
    throw new InvalidBigIntInputError(
      "collateralAssets",
      params.collateralAssets,
    );
  }
  if (
    params.collateralIndex !== undefined &&
    typeof params.collateralIndex !== "bigint"
  ) {
    throw new InvalidBigIntInputError(
      "collateralIndex",
      params.collateralIndex,
    );
  }
  const parsed = parseMidnightSupplyCollateralWithNative(
    {
      chainId,
      market: params.market,
      collateralIndex: params.collateralIndex,
      assets: params.collateralAssets,
      accountAddress: account,
      nativeAmount: params.nativeAmount,
      deadline: intent.deadline,
    },
    "collateralAssets",
  );
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
  const [{ approvals }, authorization] = await Promise.all([
    getTokenRequirements(client, {
      chainId,
      token: parsed.token,
      owner: account,
      spender,
      amount: parsed.assets,
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
        label: "Supply Midnight collateral with native currency",
        action: {
          type: actionId,
          inputs: {
            account,
            chainId,
            market: parsed.market,
            collateralIndex: parsed.collateralIndex,
            collateralAssets: parsed.assets,
            nativeAssets: parsed.value,
            deadline: parsed.deadline,
          },
        },
      },
    ],
    signatureRequests: [],
  });
}

/** @internal Encodes only the persisted inputs; no client or clock is needed. */
export function buildMidnightSupplyCollateralWithNative({
  inputs,
}: SupplyCollateralWithNativeAction) {
  const {
    account,
    chainId,
    market,
    collateralIndex,
    collateralAssets,
    nativeAssets,
    deadline,
  } = inputs;
  // The action builder defaults a missing index to 0n, which would switch the supplied token.
  if (typeof collateralIndex !== "bigint") {
    throw new InvalidTransactionPlanError({
      path: "$.inputs.collateralIndex",
      reason: "expected a bigint",
    });
  }
  validateStoredCollateralOrder(
    market.collateralParams,
    "$.inputs.market.collateralParams",
  );
  return midnightSupplyCollateralWithNative({
    chainId,
    market: storedMarketTuple(market),
    collateralIndex,
    assets: collateralAssets,
    accountAddress: account,
    nativeAmount: nativeAssets,
    deadline,
  });
}

/** @internal Validates the stored native collateral supply recipe without RPC. */
export function validateMidnightSupplyCollateralWithNativePlanAction(
  action: Record<string, unknown>,
  path: string,
): void {
  const inputsPath = `${path}.inputs`;
  const inputs = getPlanObject(action.inputs, inputsPath);
  validatePlanFields(inputs, {
    path: inputsPath,
    fields: {
      collateralAssets: "uint128 bigint",
      collateralIndex: "uint256 bigint",
      nativeAssets: "uint128 bigint",
      deadline: "uint256 bigint",
    },
  });
  const marketPath = `${inputsPath}.market`;
  const market = getPlanObject(inputs.market, marketPath);
  // Validate the tuple before reading its collateral tokens.
  validateStoredMidnightMarket(market, {
    path: marketPath,
    chainId: inputs.chainId as number,
  });
  const collaterals =
    market.collateralParams as SupplyCollateralWithNativeAction["inputs"]["market"]["collateralParams"];
  validateStoredCollateralOrder(collaterals, `${marketPath}.collateralParams`);
  if ((inputs.collateralIndex as bigint) >= BigInt(collaterals.length)) {
    throw new InvalidTransactionPlanError({
      path: `${inputsPath}.collateralIndex`,
      reason: "expected an index configured in the market",
    });
  }
  if (inputs.collateralAssets === 0n) {
    throw new InvalidTransactionPlanError({
      path: `${inputsPath}.collateralAssets`,
      reason: "expected a positive amount",
    });
  }
  if (
    inputs.nativeAssets === 0n ||
    (inputs.nativeAssets as bigint) > (inputs.collateralAssets as bigint)
  ) {
    throw new InvalidTransactionPlanError({
      path: `${inputsPath}.nativeAssets`,
      reason: "expected a positive amount at most collateralAssets",
    });
  }
  // Rerun the builder's parse step and bundle lookup so a restored plan can always build its supply step.
  try {
    const stored = action as SupplyCollateralWithNativeAction;
    parseMidnightSupplyCollateralWithNative(
      {
        chainId: stored.inputs.chainId,
        market: storedMarketTuple(stored.inputs.market),
        collateralIndex: stored.inputs.collateralIndex,
        assets: stored.inputs.collateralAssets,
        accountAddress: stored.inputs.account,
        nativeAmount: stored.inputs.nativeAssets,
        deadline: stored.inputs.deadline,
      },
      "collateralAssets",
    );
    getChainAddress(stored.inputs.chainId, "midnightBundlesV2");
  } catch (cause) {
    throw new InvalidTransactionPlanError({
      path: inputsPath,
      reason: "expected a valid Midnight native collateral supply",
      cause,
    });
  }
  // Midnight never consumes a signature reference.
  validateSignaturelessMidnightAction(action, path);
}
