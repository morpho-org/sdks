import type { AccrualPosition } from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress, Time } from "@morpho-org/morpho-ts";
import type { Address, Client } from "viem";
import {
  midnightRedeem,
  parseMidnightRedeemPreparation,
} from "../../actions/midnight/redeem.js";
import { createChainCheck } from "../../actions/requirements/chainCheck.js";
import { assertRegistryTargetsHaveCode } from "../../entities/requirements/assertContractCode.js";
import { validateReferenceTime } from "../../helpers/validate.js";
import {
  InvalidBigIntInputError,
  type ReferenceTimestampParams,
} from "../../types/index.js";
import { type IntentParams, resolveIntent } from "../intent.js";
import type { Action, TransactionPlan } from "../types.js";
import { getPlanObject, validatePlanFields } from "../validation.js";
import { validateSignaturelessMidnightAction } from "./authorization.js";
import { storedMarketTuple } from "./market.js";
import { validateStoredMidnightMarket } from "./validation.js";

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * Owner-bound snapshot and intent for redeeming Midnight credit.
 */
export interface MidnightRedeemPlanParams
  extends Pick<
      IntentParams,
      "chainId" | "account" | "expiresAt" | "calldataOrigin"
    >,
    ReferenceTimestampParams {
  /** Position to redeem, as returned by the Midnight accrual position fetcher. */
  readonly positionData: AccrualPosition;
  /** Exact credit units to redeem. Defaults to the position's face value at `now`. */
  readonly units?: bigint;
  /** Recipient of the loan assets. Defaults to `account`. */
  readonly receiver?: Address;
}

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * Prepares one direct Midnight withdrawal to redeem the account's credit. Validates the snapshot
 * and amounts with `parseMidnightRedeemPreparation`, which applies the entity `redeem` checks in
 * the same order.
 * The selected units are fixed against the supplied snapshot and reference time.
 * Fees may continue accruing before maturity. Expiry is checked during preparation only;
 * it is not an onchain deadline.
 *
 * @param client - Client used to verify the chain, not retained by the plan.
 * @param params.chainId - Chain containing the Midnight market.
 * @param params.account - Position owner who submits the withdrawal.
 * @param params.positionData - Owner-bound snapshot containing the market and its available liquidity.
 * @param params.units - Optional positive credit units; defaults to the accrued position face value.
 * @param params.receiver - Optional recipient; defaults to the owner. Midnight and market token contracts are rejected.
 * @param params.now - Reference timestamp in seconds, normally the snapshot block's timestamp; omitting it uses the device clock (an untyped JavaScript `null` does too).
 * @param params.expiresAt - Optional plan expiry in Unix seconds; defaults to two hours after `now`.
 * @param params.calldataOrigin - Optional attribution bytes appended to the built transaction.
 * @returns A frozen plan with one redemption step and no approvals, authorizations, or signature requests.
 * @throws {InvalidBigIntInputError} If a supplied non-null `now` is not a bigint, or supplied
 *   units are not a bigint, including `null`.
 * @throws {ZeroAccountError} If the account is the zero address.
 * @throws {NonIntegerInputError} If expiry is not a safe integer.
 * @throws {ExpiredDeadlineError} If expiry is not later than `now`.
 * @throws {InvalidCalldataOriginError} If the attribution is not non-empty, even-length hex.
 * @throws {InvalidTransactionPlanError} If the account is not a valid address or attribution exceeds 1 MiB.
 * @throws {MissingAccrualPositionError} If no position snapshot is supplied.
 * @throws {AccrualPositionUserMismatchError} If the snapshot is unbound or belongs to another account.
 * @throws {ChainIdMismatchError} If the snapshot or client targets a different chain.
 * @throws {MidnightMarketAddressMismatchError} If the snapshot targets a different Midnight deployment.
 * @throws {InvalidMarketParameterError} If the snapshot market's chain ID or collateral configuration is invalid, or the position's market ID does not match its market.
 * @throws {InvalidMidnightPositionLossFactorError} If the market loss factor is below the
 *   position's `lastLossFactor`, which `fetchMidnightAccrualPosition` snapshots never are.
 * @throws {InvalidMidnightPositionAccrualStateError} If the snapshot's credit, pending fee or
 *   loss factor are inconsistent, which `fetchMidnightAccrualPosition` snapshots never are.
 * @throws {NoMidnightCreditToRedeemError} If the default face value is zero.
 * @throws {NonPositiveInputError} If expiry or explicitly supplied units are not positive.
 * @throws {InputExceedsMaxError} If units exceed uint128.
 * @throws {MidnightRedeemExceedsCreditError} If units exceed accrued credit.
 * @throws {InsufficientMidnightWithdrawableLiquidityError} If units exceed available market liquidity.
 * @throws {MidnightZeroReceiverError} If the receiver is the zero address.
 * @throws {MidnightContractReceiverError} If the receiver is a blocked contract.
 * @throws {MidnightCalldataEncodingError} If market fields cannot be ABI-encoded.
 * @throws {UnsupportedChainIdError} If the chain is absent from the address registry.
 * @throws {UnknownAddressError} If Midnight core is not registered on the chain.
 * @throws {MissingContractCodeError} If the registered Midnight core has no deployed code.
 * @throws {viem.BaseError} If the `eth_chainId` or bytecode request fails.
 * @example
 * ```ts
 * import {
 *   buildTransactions,
 *   prepareMidnightRedeem,
 *   type TransactionPlan,
 * } from "@morpho-org/morpho-sdk";
 * import { fetchMidnightAccrualPosition } from "@morpho-org/morpho-sdk/fetch";
 * import { type Address, type Hash, createPublicClient, http } from "viem";
 * import { base } from "viem/chains";
 *
 * async function prepareCreditRedemption(account: Address, marketId: Hash) {
 *   const client = createPublicClient({ chain: base, transport: http() });
 *   const block = await client.getBlock();
 *   const positionData = await fetchMidnightAccrualPosition(client, {
 *     marketId,
 *     user: account,
 *     blockNumber: block.number,
 *   });
 *   const plan: TransactionPlan = await prepareMidnightRedeem(client, {
 *     chainId: base.id,
 *     account,
 *     positionData,
 *     now: block.timestamp,
 *   });
 *   // plan.steps: a single "midnightRedeem" step; plan.signatureRequests is empty.
 *   // Send the transaction from plan.account on plan.chainId.
 *   return buildTransactions(plan);
 * }
 * ```
 */
export async function prepareMidnightRedeem(
  client: Client,
  params: MidnightRedeemPlanParams,
): Promise<TransactionPlan> {
  const { account, chainId, positionData } = params;
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
  if (params.units !== undefined && typeof params.units !== "bigint") {
    throw new InvalidBigIntInputError("units", params.units);
  }
  const parsed = parseMidnightRedeemPreparation({
    chainId,
    accountAddress: account,
    positionData,
    units: params.units,
    receiver: params.receiver,
    now,
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
    account,
    chainId,
    expiresAt,
    ...(calldataOrigin && { calldataOrigin }),
    steps: [
      {
        id: "midnightRedeem",
        label: "Redeem Midnight credit",
        action: {
          type: "midnightRedeem",
          inputs: {
            account,
            chainId,
            market: parsed.market.struct,
            units: parsed.units,
            receiver: parsed.receiver,
          },
        },
      },
    ],
    signatureRequests: [],
  });
}

/** @internal Encodes the stored direct withdrawal without retaining the snapshot. */
export function buildMidnightRedeem(
  action: Extract<Action, { type: "midnightRedeem" }>,
) {
  const { account, chainId, market, units, receiver } = action.inputs;
  return midnightRedeem({
    chainId,
    market: storedMarketTuple(market),
    units,
    onBehalf: account,
    receiver,
  });
}

/** @internal Checks the stored redemption shape without consulting live state. */
export function validateMidnightRedeemPlanAction(
  action: Record<string, unknown>,
  path: string,
): void {
  const inputPath = `${path}.inputs`;
  const inputs = getPlanObject(action.inputs, inputPath);
  validatePlanFields(inputs, {
    path: inputPath,
    fields: { units: "uint128 bigint", receiver: "address" },
  });
  validateStoredMidnightMarket(inputs.market, {
    path: `${inputPath}.market`,
    chainId: inputs.chainId as number,
  });
  // Midnight never consumes a signature reference.
  validateSignaturelessMidnightAction(action, path);
}
