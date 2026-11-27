import type { IMarketParams } from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress, Time } from "@morpho-org/morpho-ts";
import type { Client } from "viem";
import {
  midnightSupplyCollateral,
  parseMidnightSupplyCollateralPreparation,
} from "../../actions/midnight/supplyCollateral.js";
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
import { validateSignaturelessMidnightAction } from "./authorization.js";
import { storedMarketTuple, validateStoredCollateralOrder } from "./market.js";
import { validateStoredMidnightMarket } from "./validation.js";

type SupplyCollateralAction = Extract<
  Action,
  { type: "midnightSupplyCollateral" }
>;
const actionId = "midnightSupplyCollateral";

/**
 * Represents an intent to deposit collateral directly into Midnight for the submitting account.
 * @example
 * ```ts
 * import type { MidnightSupplyCollateralPlanParams } from "@morpho-org/morpho-sdk";
 * const selectCollateral = (params: MidnightSupplyCollateralPlanParams, collateralIndex: bigint) =>
 *   ({ ...params, collateralIndex });
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export interface MidnightSupplyCollateralPlanParams
  extends Pick<
      IntentParams,
      "chainId" | "account" | "expiresAt" | "calldataOrigin"
    >,
    ReferenceTimestampParams {
  /** Market configuration on the target chain. */
  readonly market: IMarketParams;
  /** Collateral index in Midnight's token-address order; defaults to `0n`. */
  readonly collateralIndex?: bigint;
  /** Positive collateral amount in token base units. */
  readonly collateralAssets: bigint;
}

/**
 * Prepares a direct Midnight collateral deposit. Validates inputs with the same parse-once
 * constructor as the entity `supplyCollateral`, then adds a separate ERC-20 approval
 * to Midnight core only if its allowance is insufficient. For tokens that require an
 * allowance reset (such as USDT), a zero-amount approval precedes the new approval
 * when the existing allowance is nonzero but insufficient. No signature requests are made.
 * @param client - Viem client on the market's chain.
 * @param params - Market, collateral amount and sending account. The account also receives the collateral.
 * @param params.chainId - Chain containing the market and Midnight core.
 * @param params.account - Non-zero account that supplies and receives the collateral position.
 * @param params.market - Market configuration on the target chain.
 * @param params.collateralIndex - Collateral index in token-address order. Defaults to `0n`.
 * @param params.collateralAssets - Positive collateral quantity in token base units.
 * @param params.now - Reference Unix timestamp in seconds; omitting it uses the device clock (an untyped JavaScript `null` does too).
 * @param params.expiresAt - Plan expiry in Unix seconds; defaults to two hours after `now`. Midnight does not enforce it onchain.
 * @param params.calldataOrigin - Optional attribution bytes appended to each built transaction.
 * @returns A frozen plan whose steps must be submitted in order from `params.account`.
 * @throws {InvalidBigIntInputError} when a supplied non-null `now`, the collateral amount or the index
 * is not a bigint.
 * @throws {ChainIdMismatchError} when the market, client or RPC targets another chain.
 * @throws {MidnightMarketAddressMismatchError} when the market targets another Midnight deployment.
 * @throws {UnknownCollateralIndexError} when the index is not configured on the market.
 * @throws {InvalidMarketParameterError} when the market's chain ID or collateral configuration is invalid.
 * @throws {MidnightCalldataEncodingError} when market fields cannot be ABI-encoded.
 * @throws {ZeroAccountError} when the account is the zero address.
 * @throws {NonIntegerInputError} when the expiry is not a safe integer.
 * @throws {ExpiredDeadlineError} when the expiry is at or before the reference time.
 * @throws {NonPositiveInputError} when the collateral amount or expiry is not positive.
 * @throws {InputExceedsMaxError} when the collateral amount exceeds uint128.
 * @throws {InvalidCalldataOriginError} when the attribution bytes are empty or malformed.
 * @throws {InvalidTransactionPlanError} when the account is malformed or attribution exceeds 1 MiB.
 * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
 * @throws {UnknownAddressError} when Midnight core is not registered on the chain.
 * @throws {MissingContractCodeError} when the registered Midnight core has no deployed code.
 * @throws {viem.BaseError} when the chain ID, bytecode or allowance RPC read fails.
 * @example
 * ```ts
 * import {
 *   buildTransactions,
 *   prepareMidnightSupplyCollateral,
 *   type TransactionPlan,
 * } from "@morpho-org/morpho-sdk";
 * import { fetchMidnightMarketParams } from "@morpho-org/morpho-sdk/fetch";
 * import { type Address, type Hash, createPublicClient, http } from "viem";
 * import { base } from "viem/chains";
 *
 * async function prepareCollateralSupply(account: Address, marketId: Hash) {
 *   const client = createPublicClient({ chain: base, transport: http() });
 *   const market = await fetchMidnightMarketParams(client, { marketId });
 *   const plan: TransactionPlan = await prepareMidnightSupplyCollateral(client, {
 *     chainId: base.id,
 *     account,
 *     market,
 *     collateralIndex: 0n,
 *     collateralAssets: 1_000_000n,
 *   });
 *   // plan.steps: any approval to Midnight core, then "midnightSupplyCollateral".
 *   // Simulate the transactions together in order, so the deposit sees the approval, then send
 *   // them in order from plan.account on plan.chainId.
 *   return buildTransactions(plan);
 * }
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export async function prepareMidnightSupplyCollateral(
  client: Client,
  params: MidnightSupplyCollateralPlanParams,
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
  const parsed = parseMidnightSupplyCollateralPreparation({
    chainId,
    market: params.market,
    accountAddress: account,
    collateralAssets: params.collateralAssets,
    collateralIndex: params.collateralIndex,
  });
  if ("error" in parsed) {
    throw parsed.error;
  }
  const spender = getChainAddress(chainId, "midnight");
  const chainCheck = createChainCheck(client, chainId);
  await chainCheck();
  // A code-less core makes the deposit a no-op and leaves an allowance to it.
  await assertRegistryTargetsHaveCode(
    client,
    chainId,
    [{ role: "midnight", address: spender }],
    chainCheck,
  );
  const { approvals } = await getTokenRequirements(client, {
    token: parsed.token,
    spender,
    amount: parsed.assets,
    owner: account,
    chainId,
    approvalId: (index) => `${actionId}:approval:${index}`,
  });
  return deepFreeze({
    version: 2,
    chainId,
    account,
    expiresAt: intent.expiresAt,
    ...(intent.calldataOrigin && { calldataOrigin: intent.calldataOrigin }),
    steps: [
      ...approvals,
      {
        id: actionId,
        label: "Supply Midnight collateral",
        action: {
          type: actionId,
          inputs: {
            account,
            chainId,
            market: parsed.market.struct,
            collateralIndex: parsed.collateralIndex,
            collateralAssets: parsed.assets,
          },
        },
      },
    ],
    signatureRequests: [],
  });
}

/** @internal Encodes a stored direct Midnight collateral deposit. */
export function buildMidnightSupplyCollateral({
  inputs,
}: SupplyCollateralAction) {
  const { account, chainId, market, collateralIndex, collateralAssets } =
    inputs;
  validateStoredCollateralOrder(
    market.collateralParams,
    "$.inputs.market.collateralParams",
  );
  return midnightSupplyCollateral({
    chainId,
    market: storedMarketTuple(market),
    collateralIndex,
    assets: collateralAssets,
    onBehalf: account,
  });
}

/** @internal Validates the stored Midnight collateral recipe without RPC. */
export function validateMidnightSupplyCollateralPlanAction(
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
    market.collateralParams as SupplyCollateralAction["inputs"]["market"]["collateralParams"];
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
