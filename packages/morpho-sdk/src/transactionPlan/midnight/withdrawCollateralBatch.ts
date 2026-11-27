import {
  type AccrualPosition,
  type Market,
  MarketUtils,
} from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress, Time } from "@morpho-org/morpho-ts";
import type { Address, Client } from "viem";
import { parseMidnightWithdrawCollateralBatchPreparation } from "../../actions/midnight/parseCollateralBatch.js";
import { midnightWithdrawCollateralBatch } from "../../actions/midnight/withdrawCollateralBatch.js";
import { createChainCheck } from "../../actions/requirements/chainCheck.js";
import { assertRegistryTargetsHaveCode } from "../../entities/requirements/assertContractCode.js";
import { computeMidnightPostWithdrawalCollateral } from "../../helpers/computeMidnightPostWithdrawalCollateral.js";
import {
  validateMidnightWithdrawHealth,
  validateReferenceTime,
} from "../../helpers/validate.js";
import type {
  MidnightCollateralTransfer,
  ReferenceTimestampParams,
} from "../../types/index.js";
import { InvalidTransactionPlanError } from "../error.js";
import { type IntentParams, resolveIntent } from "../intent.js";
import type { Action, TransactionPlan } from "../types.js";
import { getPlanObject, validatePlanFields } from "../validation.js";
import { validateSignaturelessMidnightAction } from "./authorization.js";
import {
  storedMarketTuple,
  validateCollateralPriceTypes,
  validateCollateralTransferInputs,
  validateStoredCollateralOrder,
} from "./market.js";
import { validateStoredMidnightMarket } from "./validation.js";

type WithdrawCollateralBatchAction = Extract<
  Action,
  { type: "midnightWithdrawCollateralBatch" }
>;
const actionId = "midnightWithdrawCollateralBatch";

/**
 * Represents an intent to withdraw several collaterals atomically from the submitting account's
 * Midnight position.
 * @example
 * ```ts
 * import type { MidnightWithdrawCollateralBatchPlanParams } from "@morpho-org/morpho-sdk";
 * import { maxUint256 } from "viem";
 * const withdrawBoth = (params: MidnightWithdrawCollateralBatchPlanParams) => ({
 *   ...params,
 *   collateralWithdrawals: [
 *     { collateralIndex: 0n, assets: maxUint256 },
 *     { collateralIndex: 1n, assets: maxUint256 },
 *   ],
 * });
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export interface MidnightWithdrawCollateralBatchPlanParams
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
  /**
   * Nonempty ordered withdrawals with unique `collateralIndex` values in Midnight's
   * token-address order. Amounts are in that token's base units; `maxUint256` withdraws the
   * snapshot balance at that index.
   */
  readonly collateralWithdrawals: readonly MidnightCollateralTransfer[];
  /** Shared recipient of every withdrawal; defaults to `account`. */
  readonly receiver?: Address;
}

/**
 * Prepares ordered collateral withdrawals in one direct Midnight core multicall, even for one
 * entry. Inputs go through `parseMidnightWithdrawCollateralBatchPreparation`, the parse-once
 * constructor the entity `withdrawCollateralBatch` uses, in the same order: the position is bound
 * to the sender and market, every index is resolved, and each `maxUint256` becomes that index's
 * snapshot balance before the receiver, amount and encoding checks. Duplicate indexes are
 * rejected, unlike bundle flows which sum them. The withdrawals are then applied to the snapshot
 * balances in order and, when the snapshot has debt, the remaining collateral must cover it at
 * LLTV minus `DEFAULT_LLTV_BUFFER`. Restoring and building offline does not refresh those checks;
 * simulate against current state before sending.
 *
 * The account sends the multicall itself, so the plan has no approvals, authorizations or
 * signature requests. Expiry is checked during preparation only; it is not an onchain deadline.
 * @param client - Viem client used to check the network and the Midnight core deployment.
 * @param params - Market and position snapshots, ordered withdrawals and optional receiver.
 * @param params.chainId - EIP-155 chain ID of the market and submitting client.
 * @param params.account - Nonzero position owner who sends the multicall.
 * @param params.marketData - Hydrated market snapshot from the same block as `positionData`.
 * @param params.positionData - Position snapshot for the same market, owned by `account`.
 * @param params.collateralPrices - Raw `price()` values from each collateral oracle at the snapshot
 *   block, indexed like `positionData.collateral` and scaled by `ORACLE_PRICE_SCALE` (1e36). Not
 *   needed when the snapshot has no debt.
 * @param params.collateralWithdrawals - Nonempty ordered withdrawals, one per collateral index;
 *   `maxUint256` withdraws the snapshot balance at that index.
 * @param params.receiver - Optional recipient of every withdrawal; defaults to `account`. Midnight
 *   and market token contracts are rejected.
 * @param params.now - Reference Unix timestamp in seconds, normally the snapshot block's timestamp;
 *   omitting it uses the device clock (an untyped JavaScript `null` does too).
 * @param params.expiresAt - Plan expiry in Unix seconds; defaults to two hours after `now`. Midnight does not enforce it onchain.
 * @param params.calldataOrigin - Optional attribution bytes appended to the built transaction.
 * @returns A frozen plan with one multicall step and no approvals, authorizations or signature requests.
 * @throws {InvalidBigIntInputError} If a supplied non-null `now`, a withdrawal's `collateralIndex` or `assets`, or a supplied collateral price is not a bigint; checked before any request.
 * @throws {ZeroAccountError} If the account is the zero address.
 * @throws {NonIntegerInputError} If expiry is not a safe integer.
 * @throws {ExpiredDeadlineError} If expiry is at or before the reference time.
 * @throws {InvalidCalldataOriginError} If attribution bytes are empty or malformed.
 * @throws {InvalidTransactionPlanError} If the account is malformed, attribution exceeds 1 MiB, the withdrawals or `collateralPrices` are not an array, or an entry is not an object.
 * @throws {ChainIdMismatchError} If the market, client or RPC targets another chain.
 * @throws {MidnightMarketAddressMismatchError} If the market targets another Midnight deployment.
 * @throws {InvalidMarketParameterError} If the market configuration is invalid.
 * @throws {MarketIdMismatchError} If the position belongs to another market.
 * @throws {AccrualPositionUserMismatchError} If the position is owned by another account.
 * @throws {EmptyMidnightCollateralWithdrawalsError} If the list is empty.
 * @throws {DuplicateMidnightCollateralIndexError} If an index repeats.
 * @throws {UnknownCollateralIndexError} If an index is not configured on the market.
 * @throws {NonPositiveInputError} If expiry or a resolved amount is not positive.
 * @throws {InputExceedsMaxError} If a resolved amount exceeds uint128.
 * @throws {MidnightZeroReceiverError} If the receiver is the zero address.
 * @throws {MidnightContractReceiverError} If the receiver is a blocked protocol or market token contract.
 * @throws {MidnightCalldataEncodingError} If a market, position owner or receiver address is malformed, or calldata cannot be encoded.
 * @throws {WithdrawExceedsCollateralError} If a withdrawal exceeds the snapshot balance at its index.
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
 *   prepareMidnightWithdrawCollateralBatch,
 *   type TransactionPlan,
 * } from "@morpho-org/morpho-sdk";
 * import { fetchMidnightAccrualPosition } from "@morpho-org/morpho-sdk/fetch";
 * import { type Address, type Hash, createPublicClient, http, maxUint256 } from "viem";
 * import { base } from "viem/chains";
 *
 * // A full exit of a debt-free position that holds both collaterals; an empty index throws.
 * async function prepareCollateralExit(account: Address, marketId: Hash) {
 *   const client = createPublicClient({ chain: base, transport: http() });
 *   const block = await client.getBlock();
 *   const positionData = await fetchMidnightAccrualPosition(client, {
 *     marketId, user: account, blockNumber: block.number,
 *   });
 *   const plan: TransactionPlan = await prepareMidnightWithdrawCollateralBatch(client, {
 *     chainId: base.id, account, marketData: positionData.market, positionData,
 *     collateralPrices: [], // No price check is needed without debt.
 *     now: block.timestamp,
 *     collateralWithdrawals: [
 *       { collateralIndex: 0n, assets: maxUint256 },
 *       { collateralIndex: 1n, assets: maxUint256 },
 *     ],
 *   });
 *   // plan.steps: a single "midnightWithdrawCollateralBatch" step; plan.signatureRequests is empty.
 *   // Simulate, then send from plan.account on plan.chainId.
 *   return buildTransactions(plan);
 * }
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export async function prepareMidnightWithdrawCollateralBatch(
  client: Client,
  params: MidnightWithdrawCollateralBatchPlanParams,
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
  const { collateralWithdrawals } = params;
  validateCollateralTransferInputs(
    "collateralWithdrawals",
    collateralWithdrawals,
  );
  validateCollateralPriceTypes(params.collateralPrices);
  const parsed = parseMidnightWithdrawCollateralBatchPreparation({
    chainId,
    accountAddress: account,
    marketData,
    positionData,
    collateralPrices: params.collateralPrices,
    collateralWithdrawals,
    receiver: params.receiver,
  });
  const { postCollateral, withdrawAmount } =
    computeMidnightPostWithdrawalCollateral({
      market: marketData.params,
      marketId: marketData.id,
      collateral: positionData.collateral,
      withdrawals: parsed.collateralWithdrawals,
    });
  validateMidnightWithdrawHealth({
    market: marketData,
    collateral: postCollateral,
    collateralPrices: params.collateralPrices,
    debt: positionData.debt,
    withdrawAmount,
  });
  // Store the tuple the checks above used, not one read again after the awaits below.
  const market = MarketUtils.toStruct(marketData.params);
  const chainCheck = createChainCheck(client, chainId);
  await chainCheck();
  // A code-less core would accept the multicall as a silent no-op.
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
        label: "Withdraw Midnight collateral batch",
        action: {
          type: actionId,
          inputs: {
            account,
            chainId,
            market,
            collateralWithdrawals: parsed.collateralWithdrawals.map(
              ({ collateralIndex, assets }) => ({ collateralIndex, assets }),
            ),
            receiver: parsed.receiver,
          },
        },
      },
    ],
    signatureRequests: [],
  });
}

/** @internal Encodes the stored direct withdrawal batch without retaining the snapshot. */
export function buildMidnightWithdrawCollateralBatch({
  inputs,
}: WithdrawCollateralBatchAction) {
  const { account, chainId, market, collateralWithdrawals, receiver } = inputs;
  // A directly built step skips restore, so check each entry's shape and index type here.
  validateCollateralTransferInputs(
    "inputs.collateralWithdrawals",
    collateralWithdrawals,
  );
  validateStoredCollateralOrder(
    market.collateralParams,
    "$.inputs.market.collateralParams",
  );
  return midnightWithdrawCollateralBatch({
    chainId,
    market: storedMarketTuple(market),
    collateralWithdrawals,
    onBehalf: account,
    receiver,
  });
}

/** @internal Validates the stored Midnight collateral withdrawal batch without RPC. */
export function validateMidnightWithdrawCollateralBatchPlanAction(
  action: Record<string, unknown>,
  path: string,
): void {
  const inputsPath = `${path}.inputs`;
  const inputs = getPlanObject(action.inputs, inputsPath);
  validatePlanFields(inputs, {
    path: inputsPath,
    fields: { receiver: "address" },
  });
  const marketPath = `${inputsPath}.market`;
  const market = getPlanObject(inputs.market, marketPath);
  // Validate the tuple before reading its collateral tokens.
  validateStoredMidnightMarket(market, {
    path: marketPath,
    chainId: inputs.chainId as number,
  });
  const collaterals =
    market.collateralParams as WithdrawCollateralBatchAction["inputs"]["market"]["collateralParams"];
  validateStoredCollateralOrder(collaterals, `${marketPath}.collateralParams`);
  const withdrawalsPath = `${inputsPath}.collateralWithdrawals`;
  if (!Array.isArray(inputs.collateralWithdrawals)) {
    throw new InvalidTransactionPlanError({
      path: withdrawalsPath,
      reason: "expected an array",
    });
  }
  for (const [index, withdrawal] of inputs.collateralWithdrawals.entries()) {
    const itemPath = `${withdrawalsPath}[${index}]`;
    const item = getPlanObject(withdrawal, itemPath);
    validatePlanFields(item, {
      path: itemPath,
      fields: { collateralIndex: "uint256 bigint", assets: "uint128 bigint" },
    });
    if ((item.collateralIndex as bigint) >= BigInt(collaterals.length)) {
      throw new InvalidTransactionPlanError({
        path: `${itemPath}.collateralIndex`,
        reason: "expected an index configured in the market",
      });
    }
  }
  // Midnight never consumes a signature reference.
  validateSignaturelessMidnightAction(action, path);
}
