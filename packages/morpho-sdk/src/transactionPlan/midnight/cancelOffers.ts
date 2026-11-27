import { deepFreeze, Time } from "@morpho-org/morpho-ts";
import type { Client, Hex } from "viem";
import {
  midnightCancelOffers,
  parseMidnightCancelOffers,
} from "../../actions/midnight/cancelOffers.js";
import { createChainCheck } from "../../actions/requirements/chainCheck.js";
import { assertRegistryTargetsHaveCode } from "../../entities/requirements/assertContractCode.js";
import { validateReferenceTime } from "../../helpers/validate.js";
import type {
  MidnightCancelOffersAction,
  ReferenceTimestampParams,
  Transaction,
} from "../../types/index.js";
import { type IntentParams, resolveIntent } from "../intent.js";
import type { Action, TransactionPlan } from "../types.js";
import {
  getPlanObject,
  validatePlanField,
  validatePlanFields,
} from "../validation.js";
import { validateSignaturelessMidnightAction } from "./authorization.js";

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * Offer groups to cancel in full for `account` through a direct Midnight call.
 * No authorization, approval or signature is needed.
 * @example
 * ```ts
 * import type { MidnightCancelOffersPlanParams } from "@morpho-org/morpho-sdk";
 * import type { Address, Hex } from "viem";
 *
 * declare const maker: Address;
 * declare const group: Hex;
 * const params: MidnightCancelOffersPlanParams = { chainId: 8453, account: maker, groups: [group] };
 * ```
 */
export interface MidnightCancelOffersPlanParams
  extends Pick<
      IntentParams,
      "chainId" | "account" | "expiresAt" | "calldataOrigin"
    >,
    ReferenceTimestampParams {
  /** Nonempty list of distinct 32-byte offer groups, cancelled in list order. */
  readonly groups: readonly Hex[];
}

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * Prepares a full cancellation of `account`'s offer groups as one direct Midnight transaction.
 * One group builds a bare `setConsumed(group, maxUint128, account)`; two or more build one Midnight
 * core `multicall` of those calls, which cancels every group or none. The transaction never targets
 * MidnightBundlesV2, so it builds on every chain with a Midnight deployment. `account`, or an
 * operator it authorized on Midnight, must send it. Validates the groups with the same parse
 * constructor as the entity `cancelOffers`, in the same order. Expiry is plan metadata, not an
 * onchain deadline.
 * @param client - Client used to validate the chain and Midnight core code, not retained by the plan.
 * @param params.chainId - Chain containing the Midnight deployment.
 * @param params.account - Non-zero maker whose groups are cancelled.
 * @param params.groups - Nonempty list of distinct 32-byte offer groups.
 * @param params.now - Reference Unix timestamp in seconds; omitting it uses the device clock (an untyped JavaScript `null` does too).
 * @param params.expiresAt - Expiry in Unix seconds, later than `now`; defaults to `now + 2h`.
 * @param params.calldataOrigin - Optional non-empty hex bytes appended to the built transaction.
 * @returns A deep-frozen plan with one `midnightCancelOffers` step and no signature requests.
 * @throws {InvalidBigIntInputError} when a supplied non-null `now` is not a bigint.
 * @throws {ZeroAccountError} when `account` is the zero address.
 * @throws {InvalidTransactionPlanError} when `account` is malformed or `calldataOrigin` exceeds 1 MiB.
 * @throws {NonIntegerInputError} when `expiresAt` is not a safe integer.
 * @throws {NonPositiveInputError} when `expiresAt` is not positive.
 * @throws {ExpiredDeadlineError} when `expiresAt` is at or before the reference time.
 * @throws {InvalidCalldataOriginError} when attribution bytes are empty or malformed.
 * @throws {EmptyMidnightGroupCancellationsError} when `groups` is empty.
 * @throws {InvalidMidnightHexInputError} when a group is not 32-byte hex.
 * @throws {DuplicateMidnightGroupCancellationError} when a group appears more than once.
 * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
 * @throws {UnknownAddressError} when the chain has no `midnight` deployment.
 * @throws {ChainIdMismatchError} when the client declares or serves another chain.
 * @throws {MissingContractCodeError} when the registered Midnight core has no deployed code.
 * @throws {viem.BaseError} when the RPC chain ID or bytecode read fails.
 * @example
 * ```ts
 * import { buildTransactions, prepareMidnightCancelOffers } from "@morpho-org/morpho-sdk";
 * import { createPublicClient, http, type Address, type Hex } from "viem";
 * import { base } from "viem/chains";
 *
 * declare const maker: Address;
 * declare const group: Hex;
 * const client = createPublicClient({ chain: base, transport: http() });
 * const plan = await prepareMidnightCancelOffers(client, {
 *   chainId: base.id,
 *   account: maker,
 *   groups: [group],
 *   now: (await client.getBlock()).timestamp,
 * });
 * // One transaction: setConsumed(group, maxUint128, maker) on Midnight.
 * const [tx] = buildTransactions(plan);
 * ```
 */
export async function prepareMidnightCancelOffers(
  client: Client,
  params: MidnightCancelOffersPlanParams,
): Promise<TransactionPlan> {
  const { account, chainId } = params;
  const now = params.now ?? Time.timestamp();
  // Reject a non-bigint clock before deriving the default expiry.
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
  const parsed = parseMidnightCancelOffers({
    chainId,
    groups: params.groups,
    onBehalf: account,
  });
  const chainCheck = createChainCheck(client, chainId);
  await chainCheck();
  // A code-less core would accept the cancellation as a silent no-op, leaving every offer fillable.
  await assertRegistryTargetsHaveCode(
    client,
    chainId,
    [{ role: "midnight", address: parsed.midnight }],
    chainCheck,
  );
  return deepFreeze({
    version: 2,
    account,
    chainId,
    expiresAt,
    ...(calldataOrigin && { calldataOrigin }),
    steps: [
      {
        id: "midnightCancelOffers",
        label: "Cancel Midnight offers",
        action: {
          type: "midnightCancelOffers",
          inputs: { chainId, account, groups: [...parsed.groups] },
        },
      },
    ],
    signatureRequests: [],
  });
}

/** @internal Validates the stored cancellation's plain input shape. */
export function validateMidnightCancelOffersPlanAction(
  action: Record<string, unknown>,
  path: string,
): void {
  const inputsPath = `${path}.inputs`;
  const inputs = getPlanObject(action.inputs, inputsPath);
  validatePlanFields(inputs, {
    path: inputsPath,
    fields: { groups: "array" },
  });
  for (const [index, group] of (inputs.groups as unknown[]).entries()) {
    validatePlanField(group, {
      path: `${inputsPath}.groups[${index}]`,
      type: "bytes32",
    });
  }
  // Midnight never consumes a signature reference.
  validateSignaturelessMidnightAction(action, path);
}

/** @internal Encodes the stored cancellation through the same action as `cancelOffers`. */
export function buildMidnightCancelOffers(
  action: Extract<Action, { type: "midnightCancelOffers" }>,
): Readonly<Transaction<MidnightCancelOffersAction>> {
  const { chainId, account, groups } = action.inputs;
  return midnightCancelOffers({ chainId, groups, onBehalf: account });
}
