import type { AccrualPosition, Market } from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress, Time } from "@morpho-org/morpho-ts";
import type { Address, Client } from "viem";
import {
  midnightWithdrawCollateral,
  parseMidnightWithdrawCollateralPreparation,
} from "../../actions/midnight/withdrawCollateral.js";
import { createChainCheck } from "../../actions/requirements/chainCheck.js";
import { assertRegistryTargetsHaveCode } from "../../entities/requirements/assertContractCode.js";
import { computeMidnightPostWithdrawalCollateral } from "../../helpers/computeMidnightPostWithdrawalCollateral.js";
import {
  validateMidnightWithdrawHealth,
  validateReferenceTime,
} from "../../helpers/validate.js";
import {
  InvalidBigIntInputError,
  type ReferenceTimestampParams,
} from "../../types/index.js";
import { InvalidTransactionPlanError } from "../error.js";
import { type IntentParams, resolveIntent } from "../intent.js";
import type { Action, TransactionPlan } from "../types.js";
import { getPlanObject, validatePlanFields } from "../validation.js";
import { validateSignaturelessMidnightAction } from "./authorization.js";
import {
  storedMarketTuple,
  validateCollateralPriceTypes,
  validateStoredCollateralOrder,
} from "./market.js";
import { validateStoredMidnightMarket } from "./validation.js";

type WithdrawCollateralAction = Extract<
  Action,
  { type: "midnightWithdrawCollateral" }
>;
const actionId = "midnightWithdrawCollateral";

/**
 * Represents an intent to withdraw one collateral directly from the submitting account's Midnight position.
 * @example
 * ```ts
 * import type { MidnightWithdrawCollateralPlanParams } from "@morpho-org/morpho-sdk";
 * import { maxUint256 } from "viem";
 * const withdrawAll = (params: MidnightWithdrawCollateralPlanParams) =>
 *   ({ ...params, assets: maxUint256 });
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export interface MidnightWithdrawCollateralPlanParams
  extends Pick<
      IntentParams,
      "chainId" | "account" | "expiresAt" | "calldataOrigin"
    >,
    ReferenceTimestampParams {
  /** Hydrated market snapshot from the same block as `positionData`. */
  readonly marketData: Market;
  /** Position snapshot for the same market, owned by the submitting account. */
  readonly positionData: AccrualPosition;
  /**
   * Raw values from `price()` on each `marketData.params.collateralParams[i].oracle`,
   * indexed like `positionData.collateral` and scaled by `ORACLE_PRICE_SCALE` (1e36).
   * Use prices from the snapshot block. No prices are needed when the snapshot has no debt.
   */
  readonly collateralPrices: readonly bigint[];
  /** Collateral index in Midnight's token-address order; defaults to `0n`. */
  readonly collateralIndex?: bigint;
  /** Collateral amount in token base units; `maxUint256` withdraws the snapshot balance at that index. */
  readonly assets: bigint;
  /** Recipient of the withdrawn collateral; defaults to `account`. */
  readonly receiver?: Address;
}

/**
 * Prepares one direct Midnight core collateral withdrawal. Inputs go through
 * `parseMidnightWithdrawCollateralPreparation`, which applies the entity `withdrawCollateral`
 * checks in the same order: the position is bound to the sender and market, the index is
 * resolved, and `maxUint256` becomes the snapshot balance before the amount, receiver and
 * encoding checks. The withdrawal is then checked against the snapshot balance and, when the
 * snapshot has debt, against the remaining collateral's capacity at LLTV minus
 * `DEFAULT_LLTV_BUFFER`. Restoring and building offline does not refresh those checks;
 * simulate against current state before sending.
 *
 * The account sends the withdrawal itself, so the plan has no approvals, authorizations or
 * signature requests. Expiry is checked during preparation only; it is not an onchain deadline.
 * @param client - Viem client used to check the network and the Midnight core deployment.
 * @param params - Market and position snapshots, collateral selection, amount and optional receiver.
 * @param params.chainId - EIP-155 chain ID of the market and submitting client.
 * @param params.account - Nonzero position owner who sends the withdrawal.
 * @param params.marketData - Hydrated market snapshot from the same block as `positionData`.
 * @param params.positionData - Position snapshot for the same market, owned by `account`.
 * @param params.collateralPrices - Raw `price()` values from each collateral oracle at the snapshot
 *   block, indexed like `positionData.collateral` and scaled by `ORACLE_PRICE_SCALE` (1e36). Not
 *   needed when the snapshot has no debt.
 * @param params.collateralIndex - Collateral index in token-address order. Defaults to `0n`.
 * @param params.assets - Positive collateral amount in token base units; `maxUint256` withdraws
 *   the snapshot balance at that index.
 * @param params.receiver - Optional recipient of the collateral; defaults to `account`. Midnight
 *   and market token contracts are rejected.
 * @param params.now - Reference Unix timestamp in seconds, normally the snapshot block's timestamp;
 *   omitting it uses the device clock (an untyped JavaScript `null` does too).
 * @param params.expiresAt - Plan expiry in Unix seconds; defaults to two hours after `now`. Midnight does not enforce it onchain.
 * @param params.calldataOrigin - Optional attribution bytes appended to the built transaction.
 * @returns A frozen plan with one withdrawal step and no approvals, authorizations or signature requests.
 * @throws {InvalidBigIntInputError} If a supplied non-null `now`, the amount, the index or a supplied collateral price is not a bigint; checked before any request.
 * @throws {ZeroAccountError} If the account is the zero address.
 * @throws {NonIntegerInputError} If expiry is not a safe integer.
 * @throws {ExpiredDeadlineError} If expiry is at or before the reference time.
 * @throws {InvalidCalldataOriginError} If attribution bytes are empty or malformed.
 * @throws {InvalidTransactionPlanError} If the account is malformed, `collateralPrices` is not an array, or attribution exceeds 1 MiB.
 * @throws {ChainIdMismatchError} If the market, client or RPC targets another chain.
 * @throws {MidnightMarketAddressMismatchError} If the market targets another Midnight deployment.
 * @throws {InvalidMarketParameterError} If the market configuration is invalid.
 * @throws {MarketIdMismatchError} If the position belongs to another market.
 * @throws {AccrualPositionUserMismatchError} If the position is owned by another account.
 * @throws {UnknownCollateralIndexError} If the index is not configured on the market.
 * @throws {NonPositiveInputError} If expiry or the resolved amount is not positive.
 * @throws {InputExceedsMaxError} If the resolved amount exceeds uint128.
 * @throws {MidnightZeroReceiverError} If the receiver is the zero address.
 * @throws {MidnightContractReceiverError} If the receiver is a blocked protocol or market token contract.
 * @throws {MidnightCalldataEncodingError} If a market, position owner or receiver address is malformed, or calldata cannot be encoded.
 * @throws {WithdrawExceedsCollateralError} If the amount exceeds the snapshot balance.
 * @throws {MissingMarketPriceError} If remaining collateral has no price for the health check.
 * @throws {WithdrawMakesPositionUnhealthyError} If the snapshot debt exceeds the remaining buffered capacity.
 * @throws {UnsupportedChainIdError} If the chain is absent from the address registry.
 * @throws {UnknownAddressError} If Midnight core is not registered on the chain.
 * @throws {MissingContractCodeError} If the registered Midnight core has no deployed code.
 * @throws {viem.BaseError} If the `eth_chainId` or bytecode request fails.
 * @example
 * ```ts
 * import {
 *   buildTransactions,
 *   prepareMidnightWithdrawCollateral,
 *   type TransactionPlan,
 * } from "@morpho-org/morpho-sdk";
 * import { fetchMidnightAccrualPosition } from "@morpho-org/morpho-sdk/fetch";
 * import { type Address, type Hash, createPublicClient, http, maxUint256 } from "viem";
 * import { base } from "viem/chains";
 *
 * // For a debt-free position only. With debt, pass each collateral oracle's `price()`
 * // from the same block as `collateralPrices`; an empty list then throws MissingMarketPriceError.
 * async function prepareCollateralExit(account: Address, marketId: Hash) {
 *   const client = createPublicClient({ chain: base, transport: http() });
 *   const block = await client.getBlock();
 *   const positionData = await fetchMidnightAccrualPosition(client, {
 *     marketId, user: account, blockNumber: block.number,
 *   });
 *   const plan: TransactionPlan = await prepareMidnightWithdrawCollateral(client, {
 *     chainId: base.id, account, marketData: positionData.market, positionData,
 *     collateralPrices: [], // No price check is needed without debt.
 *     now: block.timestamp,
 *     assets: maxUint256,
 *   });
 *   // plan.steps: a single "midnightWithdrawCollateral" step; plan.signatureRequests is empty.
 *   // Simulate, then send from plan.account on plan.chainId.
 *   return buildTransactions(plan);
 * }
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export async function prepareMidnightWithdrawCollateral(
  client: Client,
  params: MidnightWithdrawCollateralPlanParams,
): Promise<TransactionPlan> {
  const { account, chainId, marketData, positionData } = params;
  const now = params.now ?? Time.timestamp();
  validateReferenceTime(now);
  const { expiresAt, calldataOrigin } = resolveIntent(
    {
      account,
      chainId,
      expiresAt: params.expiresAt,
      calldataOrigin: params.calldataOrigin,
    },
    now,
  );
  if (typeof params.assets !== "bigint") {
    throw new InvalidBigIntInputError("assets", params.assets);
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
  validateCollateralPriceTypes(params.collateralPrices);
  const parsed = parseMidnightWithdrawCollateralPreparation({
    chainId,
    accountAddress: account,
    marketData,
    positionData,
    collateralIndex: params.collateralIndex,
    assets: params.assets,
    receiver: params.receiver,
  });
  const { postCollateral, withdrawAmount } =
    computeMidnightPostWithdrawalCollateral({
      market: marketData.params,
      marketId: marketData.id,
      collateral: positionData.collateral,
      withdrawals: [
        { collateralIndex: parsed.collateralIndex, assets: parsed.assets },
      ],
    });
  validateMidnightWithdrawHealth({
    market: marketData,
    collateral: postCollateral,
    collateralPrices: params.collateralPrices,
    debt: positionData.debt,
    withdrawAmount,
  });
  const chainCheck = createChainCheck(client, chainId);
  await chainCheck();
  // A code-less core would accept the withdrawal as a silent no-op.
  await assertRegistryTargetsHaveCode(
    client,
    chainId,
    [{ role: "midnight", address: getChainAddress(chainId, "midnight") }],
    chainCheck,
  );
  return deepFreeze({
    version: 2,
    chainId,
    account,
    expiresAt,
    ...(calldataOrigin && { calldataOrigin }),
    steps: [
      {
        id: actionId,
        label: "Withdraw Midnight collateral",
        action: {
          type: actionId,
          inputs: {
            account,
            chainId,
            market: parsed.market.struct,
            collateralIndex: parsed.collateralIndex,
            assets: parsed.assets,
            receiver: parsed.receiver,
          },
        },
      },
    ],
    signatureRequests: [],
  });
}

/** @internal Encodes the stored direct withdrawal without retaining the snapshot. */
export function buildMidnightWithdrawCollateral({
  inputs,
}: WithdrawCollateralAction) {
  const { account, chainId, market, collateralIndex, assets, receiver } =
    inputs;
  // The action builder defaults a missing index to 0n, which would switch the withdrawn token.
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
  return midnightWithdrawCollateral({
    chainId,
    market: storedMarketTuple(market),
    collateralIndex,
    assets,
    onBehalf: account,
    receiver,
  });
}

/** @internal Validates the stored Midnight collateral withdrawal without RPC. */
export function validateMidnightWithdrawCollateralPlanAction(
  action: Record<string, unknown>,
  path: string,
): void {
  const inputsPath = `${path}.inputs`;
  const inputs = getPlanObject(action.inputs, inputsPath);
  validatePlanFields(inputs, {
    path: inputsPath,
    fields: {
      assets: "uint128 bigint",
      collateralIndex: "uint256 bigint",
      receiver: "address",
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
    market.collateralParams as WithdrawCollateralAction["inputs"]["market"]["collateralParams"];
  validateStoredCollateralOrder(collaterals, `${marketPath}.collateralParams`);
  if ((inputs.collateralIndex as bigint) >= BigInt(collaterals.length)) {
    throw new InvalidTransactionPlanError({
      path: `${inputsPath}.collateralIndex`,
      reason: "expected an index configured in the market",
    });
  }
  // Midnight never consumes a signature reference.
  validateSignaturelessMidnightAction(action, path);
}
