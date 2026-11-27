import {
  type IMarketParams,
  MAX_COLLATERALS_PER_BORROWER,
  MarketUtils,
} from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress, Time } from "@morpho-org/morpho-ts";
import type { Client } from "viem";
import { parseMidnightSupplyCollateralBatchPreparation } from "../../actions/midnight/parseCollateralBatch.js";
import { midnightSupplyCollateralBatch } from "../../actions/midnight/supplyCollateralBatch.js";
import { createChainCheck } from "../../actions/requirements/chainCheck.js";
import { assertRegistryTargetsHaveCode } from "../../entities/requirements/assertContractCode.js";
import { validateReferenceTime } from "../../helpers/validate.js";
import {
  InputExceedsMaxError,
  type MidnightCollateralTransfer,
  type ReferenceTimestampParams,
} from "../../types/index.js";
import { InvalidTransactionPlanError } from "../error.js";
import { type IntentParams, resolveIntent } from "../intent.js";
import { getTokenRequirements } from "../requirements.js";
import type { Action, TransactionPlan } from "../types.js";
import { getPlanObject, validatePlanFields } from "../validation.js";
import { validateSignaturelessMidnightAction } from "./authorization.js";
import {
  storedMarketTuple,
  validateCollateralTransferInputs,
  validateStoredCollateralOrder,
} from "./market.js";
import { validateStoredMidnightMarket } from "./validation.js";

type SupplyCollateralBatchAction = Extract<
  Action,
  { type: "midnightSupplyCollateralBatch" }
>;
const actionId = "midnightSupplyCollateralBatch";

/**
 * Represents an intent to supply several collaterals atomically to the submitting account's
 * Midnight position.
 * @example
 * ```ts
 * import type { MidnightSupplyCollateralBatchPlanParams } from "@morpho-org/morpho-sdk";
 * const supplyBoth = (params: MidnightSupplyCollateralBatchPlanParams) => ({
 *   ...params,
 *   collateralSupplies: [
 *     { collateralIndex: 0n, assets: 1_000_000n },
 *     { collateralIndex: 1n, assets: 2_000_000n },
 *   ],
 * });
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export interface MidnightSupplyCollateralBatchPlanParams
  extends Pick<
      IntentParams,
      "chainId" | "account" | "expiresAt" | "calldataOrigin"
    >,
    ReferenceTimestampParams {
  /** Market configuration on the target chain. */
  readonly market: IMarketParams;
  /**
   * Nonempty ordered supplies with unique `collateralIndex` values in Midnight's token-address
   * order. Amounts are positive, in that token's base units.
   */
  readonly collateralSupplies: readonly MidnightCollateralTransfer[];
}

/**
 * Prepares ordered collateral supplies in one direct Midnight core multicall, even for one entry.
 * Inputs go through `parseMidnightSupplyCollateralBatchPreparation`, the parse-once constructor
 * the entity `supplyCollateralBatch` uses, in the same order: account, market, a nonempty list
 * with unique indexes, then each entry's amount and index. Duplicate indexes are rejected, unlike
 * bundle flows which sum them. Midnight pulls every token from the account, so for each collateral
 * token whose allowance is below that token's total the plan adds the ERC-20 approval steps that
 * token's rules require, as the entity does: usually one unlimited approval to Midnight core, but
 * possibly a reset to zero first or a capped amount. No authorization or signature is needed, and expiry is checked
 * during preparation only; it is not an onchain deadline. Midnight keeps at most 16 collaterals per
 * borrower, so a longer list is rejected before any request. The plan reads no balances, and the
 * approvals are separate transactions that stay in place when an underfunded entry reverts the
 * multicall, so simulate every step together before asking for the first approval. Unlike the
 * entity, the allowance check keeps no `reservedCollateralAssets` reserve, so the supply can
 * consume an allowance another operation relies on.
 * @param client - Viem client used to check the network and the Midnight core deployment and read allowances.
 * @param params - Market, ordered supplies and the sending account.
 * @param params.chainId - EIP-155 chain ID of the market and submitting client.
 * @param params.account - Nonzero account that sends the multicall and receives the collateral.
 * @param params.market - Market configuration on the target chain.
 * @param params.collateralSupplies - Nonempty ordered supplies, one per collateral index.
 * @param params.now - Reference Unix timestamp in seconds; omitting it uses the device clock (an untyped JavaScript `null` does too).
 * @param params.expiresAt - Plan expiry in Unix seconds; defaults to two hours after `now`. Midnight does not enforce it onchain.
 * @param params.calldataOrigin - Optional attribution bytes appended to each built transaction.
 * @returns A frozen plan whose approval steps, if any, precede the multicall step; send them in order from `params.account`.
 * @throws {InvalidBigIntInputError} If a supplied non-null `now`, or a supply's `collateralIndex` or `assets`, is not a bigint; checked before any request.
 * @throws {ZeroAccountError} If the account is the zero address.
 * @throws {NonIntegerInputError} If expiry is not a safe integer.
 * @throws {ExpiredDeadlineError} If expiry is at or before the reference time.
 * @throws {InvalidCalldataOriginError} If attribution bytes are empty or malformed.
 * @throws {InvalidTransactionPlanError} If the account is malformed, attribution exceeds 1 MiB, the supplies are not an array, or an entry is not an object.
 * @throws {ChainIdMismatchError} If the market, client or RPC targets another chain.
 * @throws {MidnightMarketAddressMismatchError} If the market targets another Midnight deployment.
 * @throws {InvalidMarketParameterError} If the market configuration is invalid.
 * @throws {EmptyMidnightCollateralSuppliesError} If the list is empty.
 * @throws {DuplicateMidnightCollateralIndexError} If an index repeats.
 * @throws {NonPositiveInputError} If expiry or an amount is not positive.
 * @throws {InputExceedsMaxError} If an amount exceeds uint128, or the list has more than `MAX_COLLATERALS_PER_BORROWER` (16) entries.
 * @throws {UnknownCollateralIndexError} If an index is not configured on the market.
 * @throws {MidnightCalldataEncodingError} If a market field cannot be ABI-encoded.
 * @throws {UnsupportedChainIdError} If the chain is absent from the address registry.
 * @throws {UnknownAddressError} If Midnight core is not registered on the chain.
 * @throws {MissingContractCodeError} If the registered Midnight core has no deployed code.
 * @throws {viem.BaseError} If the chain ID, bytecode or allowance read fails.
 * @example
 * ```ts
 * import {
 *   buildTransactions,
 *   prepareMidnightSupplyCollateralBatch,
 *   type TransactionPlan,
 * } from "@morpho-org/morpho-sdk";
 * import { fetchMidnightMarketParams } from "@morpho-org/morpho-sdk/fetch";
 * import { type Address, type Hash, createPublicClient, http } from "viem";
 * import { base } from "viem/chains";
 *
 * async function prepareCollateralBatch(account: Address, marketId: Hash) {
 *   const client = createPublicClient({ chain: base, transport: http() });
 *   const market = await fetchMidnightMarketParams(client, { marketId });
 *   const plan: TransactionPlan = await prepareMidnightSupplyCollateralBatch(client, {
 *     chainId: base.id,
 *     account,
 *     market,
 *     collateralSupplies: [
 *       { collateralIndex: 0n, assets: 1_000_000n },
 *       { collateralIndex: 1n, assets: 2_000_000n },
 *     ],
 *   });
 *   // plan.steps: any approvals to Midnight core, then "midnightSupplyCollateralBatch".
 *   return buildTransactions(plan);
 * }
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export async function prepareMidnightSupplyCollateralBatch(
  client: Client,
  params: MidnightSupplyCollateralBatchPlanParams,
): Promise<TransactionPlan> {
  const { account, chainId, market } = params;
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
  const { collateralSupplies } = params;
  validateCollateralTransferInputs("collateralSupplies", collateralSupplies);
  // Every supplied index becomes active, and core rejects a 17th active collateral after the approvals.
  if (BigInt(collateralSupplies.length) > MAX_COLLATERALS_PER_BORROWER) {
    throw new InputExceedsMaxError({
      field: "collateralSupplies.length",
      value: BigInt(collateralSupplies.length),
      max: MAX_COLLATERALS_PER_BORROWER,
    });
  }
  const parsed = parseMidnightSupplyCollateralBatchPreparation({
    chainId,
    market,
    accountAddress: account,
    // Forward only the declared fields: an entity entry's reservedCollateralAssets would raise the approval threshold.
    collateralSupplies: collateralSupplies.map(
      ({ collateralIndex, assets }) => ({
        collateralIndex,
        assets,
      }),
    ),
  });
  // Narrows the type only: resolveIntent has already rejected the zero account.
  if ("error" in parsed) {
    throw parsed.error;
  }
  if ("error" in parsed.action) {
    throw parsed.action.error;
  }
  // Store the tuple the parse step checked, not one read again after the awaits below.
  const marketStruct = MarketUtils.toStruct(market);
  const spender = getChainAddress(chainId, "midnight");
  const chainCheck = createChainCheck(client, chainId);
  await chainCheck();
  // A code-less core would accept the multicall as a silent no-op and keep the allowances.
  await assertRegistryTargetsHaveCode(
    client,
    chainId,
    [{ role: "midnight", address: spender }],
    chainCheck,
  );
  const prerequisites = await Promise.all(
    parsed.approvals.map(({ token, amount }, tokenIndex) =>
      getTokenRequirements(client, {
        chainId,
        owner: account,
        token,
        spender,
        amount,
        approvalId: (index) => `${actionId}:approval:${tokenIndex}:${index}`,
      }),
    ),
  );
  return deepFreeze({
    version: 2,
    chainId,
    account,
    expiresAt,
    ...(calldataOrigin && { calldataOrigin }),
    steps: [
      ...prerequisites.flatMap(({ approvals }) => approvals),
      {
        id: actionId,
        label: "Supply Midnight collateral batch",
        action: {
          type: actionId,
          inputs: {
            account,
            chainId,
            market: marketStruct,
            collateralSupplies: parsed.action.collateralSupplies.map(
              ({ collateralIndex, assets }) => ({ collateralIndex, assets }),
            ),
          },
        },
      },
    ],
    signatureRequests: [],
  });
}

/** @internal Encodes the stored direct collateral supply batch. */
export function buildMidnightSupplyCollateralBatch({
  inputs,
}: SupplyCollateralBatchAction) {
  const { account, chainId, market, collateralSupplies } = inputs;
  // A directly built step skips restore, so check each entry's shape and index type here.
  validateCollateralTransferInputs(
    "inputs.collateralSupplies",
    collateralSupplies,
  );
  validateStoredCollateralOrder(
    market.collateralParams,
    "$.inputs.market.collateralParams",
  );
  return midnightSupplyCollateralBatch({
    chainId,
    market: storedMarketTuple(market),
    collateralSupplies,
    onBehalf: account,
  });
}

/** @internal Validates the stored Midnight collateral supply batch without RPC. */
export function validateMidnightSupplyCollateralBatchPlanAction(
  action: Record<string, unknown>,
  path: string,
): void {
  const inputsPath = `${path}.inputs`;
  const inputs = getPlanObject(action.inputs, inputsPath);
  const marketPath = `${inputsPath}.market`;
  const market = getPlanObject(inputs.market, marketPath);
  // Validate the tuple before reading its collateral tokens.
  validateStoredMidnightMarket(market, {
    path: marketPath,
    chainId: inputs.chainId as number,
  });
  const collaterals =
    market.collateralParams as SupplyCollateralBatchAction["inputs"]["market"]["collateralParams"];
  validateStoredCollateralOrder(collaterals, `${marketPath}.collateralParams`);
  const suppliesPath = `${inputsPath}.collateralSupplies`;
  if (!Array.isArray(inputs.collateralSupplies)) {
    throw new InvalidTransactionPlanError({
      path: suppliesPath,
      reason: "expected an array",
    });
  }
  for (const [index, supply] of inputs.collateralSupplies.entries()) {
    const itemPath = `${suppliesPath}[${index}]`;
    const item = getPlanObject(supply, itemPath);
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
