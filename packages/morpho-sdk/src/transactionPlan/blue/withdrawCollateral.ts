import {
  AccrualPosition,
  type MarketId,
  MarketParams,
  MathLib,
} from "@morpho-org/blue-sdk";
import { deepFreeze, Time } from "@morpho-org/morpho-ts";
import type { Client } from "viem";
import { blueWithdrawCollateral } from "../../actions/blue/withdrawCollateral.js";
import { normalizeBundlesCommonParams } from "../../actions/bundles/common.js";
import { DEFAULT_LLTV_BUFFER } from "../../helpers/constant.js";
import { getBlueBundlesV1QuoteTimestamp } from "../../helpers/getBlueBundlesV1QuoteTimestamp.js";
import {
  validatePositionHealthAfterWithdraw,
  validateUint256Field,
} from "../../helpers/validate.js";
import {
  NonPositiveInputError,
  type ReferenceTimestampParams,
} from "../../types/index.js";
import {
  IncompleteTransactionPlanError,
  TransactionPlanSignatureMismatchError,
} from "../error.js";
import type { IntentParams } from "../intent.js";
import type { Action, SignatureRequest, TransactionPlan } from "../types.js";
import {
  getPlanObject,
  validatePlanField,
  validatePlanFields,
} from "../validation.js";
import { validateMorphoAuthorizationRequest } from "./authorization.js";
import {
  type BlueMarketSnapshot,
  type BluePositionSnapshot,
  prepareBlue,
} from "./prepare.js";

/**
 * Represents caller intent and caller-fetched snapshots for a Blue collateral withdrawal.
 * The snapshots are validated and used to fix the withdrawal's buffered LTV cap before any
 * authorization read; they are not stored in the resulting plan.
 * @example
 * ```ts
 * import type { BlueWithdrawCollateralPlanParams } from "@morpho-org/morpho-sdk";
 * const withdrawal = {
 *   collateralAssets: 1_000_000n,
 *   supportSignature: true,
 * } satisfies Pick<BlueWithdrawCollateralPlanParams, "collateralAssets" | "supportSignature">;
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export interface BlueWithdrawCollateralPlanParams
  extends IntentParams,
    ReferenceTimestampParams {
  /** ID derived from both snapshots' market parameter tuples. */
  readonly marketId: MarketId;
  /** Caller-fetched market and the chain it was read from. */
  readonly marketData: BlueMarketSnapshot;
  /** Caller-fetched accrual position for `account` and the chain it was read from. */
  readonly positionData: BluePositionSnapshot;
  /** Positive collateral amount in token base units. */
  readonly collateralAssets: bigint;
}

/**
 * Prepares a BlueBundlesV1 collateral withdrawal with direct or inline signed Morpho authorization.
 * Health uses the expiry floored at max(now, lastUpdate), with the entity's LLTV buffer.
 * Expiries more than 365 days out retain the legacy +2h projection for unlimited sentinels.
 * No token allowance or Permit2 prerequisite is read or produced.
 * @param client - Viem client used for registered contract-code and Morpho authorization reads.
 * @param params - Intent and matching market and account position snapshots.
 * @param params.chainId - Chain containing the market and registered BlueBundlesV1 contract.
 * @param params.account - Non-zero owner of the collateral position, authorization signer and transaction sender.
 * @param params.marketId - Market ID that both snapshots and their parameter tuples must describe.
 * @param params.marketData.chainId - Chain from which the market snapshot was fetched; must equal `chainId`.
 * @param params.marketData.market - Caller-fetched `Market` providing the market tuple and LLTV.
 * @param params.positionData.chainId - Chain from which the position snapshot was fetched; must equal `chainId`.
 * @param params.positionData.position - Caller-fetched `AccrualPosition` for `account` and `marketId`, used for the deadline-accrued health check.
 * @param params.collateralAssets - Positive collateral withdrawal in token base units, not exceeding the position's collateral.
 * @param params.referralFee.bps - Optional integer referral fee in basis points; defaults to zero and must be at most 1,000.
 * @param params.referralFee.recipient - Non-zero fee recipient required when the optional fee is positive.
 * @param params.supportSignature - Optional Morpho authorization signature preference, defaulting to `false`; otherwise prepares a direct authorization transaction when needed.
 * @param params.now - Optional reference timestamp in Unix seconds, normally the latest block timestamp; defaults to the device clock.
 * @param params.expiresAt - Optional safe-integer Unix expiry later than `now`; defaults to `now + 2h` and governs every deadline.
 * @param params.calldataOrigin - Optional non-empty, even-length hex bytes appended verbatim to every built transaction.
 * @param params.deployless - Optional shared intent field; unused because this operation reads no token metadata or allowances.
 * @returns A deep-frozen, data-only `TransactionPlan` with chain, account, expiry, withdrawal step,
 *   and any preceding Morpho authorization step and signature request. The caller signs; the SDK never does.
 * @throws {BlueSnapshotChainMismatchError} when either snapshot's chain differs from `chainId`.
 * @throws {MarketIdMismatchError} when either snapshot describes another market or a market ID does not hash from its tuple.
 * @throws {AccrualPositionUserMismatchError} when the position belongs to another account.
 * @throws {ZeroAccountError} when `account` is the zero address.
 * @throws {NonIntegerInputError} when `expiresAt` or `referralFee.bps` is not a safe integer.
 * @throws {NonPositiveInputError} when `expiresAt` or `collateralAssets` is not positive.
 * @throws {ExpiredDeadlineError} when `expiresAt` is at or before `now`.
 * @throws {NegativeInputError} when `referralFee.bps` is negative.
 * @throws {InputExceedsMaxError} when `referralFee.bps` exceeds 1,000 or `collateralAssets` exceeds uint256.
 * @throws {InvalidCalldataOriginError} when `calldataOrigin` is empty, malformed or has an odd number of hex digits.
 * @throws {ReferralFeeRecipientMissingError} when a positive referral fee has no non-zero recipient.
 * @throws {UnsupportedMarketIrmError} when projecting an indebted position requires an unsupported IRM without rate data.
 * @throws {WithdrawExceedsCollateralError} when `collateralAssets` exceeds the position's collateral.
 * @throws {MissingMarketPriceError} when the position carries debt but its market price is missing or zero.
 * @throws {WithdrawMakesPositionUnhealthyError} when the accrued remaining position would breach LLTV minus the default buffer.
 * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
 * @throws {UnknownAddressError} when Morpho or BlueBundlesV1 is not registered on the target chain.
 * @throws {MissingContractCodeError} when Morpho or BlueBundlesV1 has no deployed bytecode on the endpoint's chain.
 * @throws {ChainIdMismatchError} when the client declares or its RPC reports another chain.
 * @throws {viem.BaseError} when a contract-code, chain ID, authorization or nonce RPC read fails.
 * @example
 * ```ts
 * import assert from "node:assert/strict";
 * import { markets } from "@morpho-org/morpho-test";
 * import { fetchAccrualPosition } from "@morpho-org/morpho-sdk/blue/fetch";
 * import {
 *   applySignatures, buildTransactions, getPendingSignatureRequests,
 *   prepareBlueWithdrawCollateral,
 * } from "@morpho-org/morpho-sdk";
 * import { createPublicClient, createWalletClient, custom, type EIP1193Provider, http } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const { ethereum } = window as Window & { ethereum?: EIP1193Provider };
 * if (!ethereum) throw new Error("Install an Ethereum wallet to continue.");
 * const wallet = createWalletClient({ chain: mainnet, transport: custom(ethereum) });
 * const [account] = await wallet.requestAddresses();
 * assert(account, "Connect a wallet holding collateral in this market.");
 * const market = markets[mainnet.id].usdc_wbtc;
 * const position = await fetchAccrualPosition(account, market.id, client);
 * const plan = await prepareBlueWithdrawCollateral(client, {
 *   chainId: mainnet.id, account, marketId: market.id,
 *   marketData: { chainId: mainnet.id, market: position.market },
 *   positionData: { chainId: mainnet.id, position },
 *   collateralAssets: 1_000_000n, supportSignature: true,
 *   now: (await client.getBlock()).timestamp,
 * });
 * // plan satisfies TransactionPlan; no token approval or Permit2 request is included.
 * const signatures = await Promise.all(getPendingSignatureRequests(plan).map(
 *   async ({ id, typedData }) => ({ id, signature: await wallet.signTypedData({ ...typedData, account }) }),
 * ));
 * const transactions = buildTransactions(applySignatures(plan, signatures));
 * // transactions satisfies readonly Readonly<Transaction>[]; submit them in order from account.
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export async function prepareBlueWithdrawCollateral(
  client: Client,
  params: BlueWithdrawCollateralPlanParams,
): Promise<TransactionPlan> {
  const now = params.now ?? Time.timestamp();
  const { chainId, account, collateralAssets, marketId } = params;
  const { loanToken, collateralToken, oracle, irm, lltv } =
    params.marketData.market.params;
  const marketParams = { loanToken, collateralToken, oracle, irm, lltv };
  const { intent, steps, signatureRequests, morphoAuthorizationRequestId } =
    await prepareBlue(
      { client, params: { ...params, now } },
      (resolvedIntent) => {
        // Reject invalid fees and deadlines before authorization reads.
        normalizeBundlesCommonParams(resolvedIntent);
        if (collateralAssets <= 0n) {
          throw new NonPositiveInputError("collateralAssets", collateralAssets);
        }
        // Reject amounts outside the ABI range before reading authorization state.
        validateUint256Field("collateralAssets", collateralAssets);
        const position = params.positionData.position;
        // Validate health against the same accrual horizon used by the existing handle.
        validatePositionHealthAfterWithdraw({
          positionData:
            position.borrowShares === 0n
              ? new AccrualPosition(position, position.market)
              : position.accrueInterest(
                  getBlueBundlesV1QuoteTimestamp({
                    lastUpdate: position.market.lastUpdate,
                    now,
                    deadline: resolvedIntent.deadline,
                  }),
                ),
          withdrawAmount: collateralAssets,
          lltv,
          marketId,
        });
        return { id: "blueWithdrawCollateral", needsAuthorization: true };
      },
    );
  return deepFreeze({
    version: 2,
    chainId,
    account,
    expiresAt: intent.expiresAt,
    ...(intent.calldataOrigin && { calldataOrigin: intent.calldataOrigin }),
    steps: [
      ...steps,
      {
        id: "blueWithdrawCollateral",
        label: "Withdraw Blue collateral",
        action: {
          type: "blueWithdrawCollateral",
          signatureRequestIds:
            morphoAuthorizationRequestId === undefined
              ? {}
              : { morphoAuthorization: morphoAuthorizationRequestId },
          inputs: {
            chainId,
            account,
            collateralAssets,
            ...(morphoAuthorizationRequestId === undefined
              ? {}
              : {
                  authorizationNonce: signatureRequests.find(
                    ({ id }) => id === morphoAuthorizationRequestId,
                  )?.args.nonce,
                }),
            marketParams,
            maxLtv: MathLib.zeroFloorSub(lltv, DEFAULT_LLTV_BUFFER),
            ...normalizeBundlesCommonParams(intent),
          },
        },
      },
    ],
    signatureRequests,
  });
}

/** @internal Binds an inline authorization to the collateral withdrawal that consumes it. */
export function validateBlueWithdrawCollateralAuthorizationRequest(
  request: Extract<SignatureRequest, { kind: "morphoAuthorization" }>,
  action: Extract<Action, { type: "blueWithdrawCollateral" }>,
): void {
  if (
    action.signatureRequestIds.morphoAuthorization !== request.id ||
    action.inputs.authorizationNonce === undefined
  ) {
    throw new TransactionPlanSignatureMismatchError(request.id, "reference");
  }
  // Pin the signature to the prepared collateral withdrawal's nonce and deadline.
  validateMorphoAuthorizationRequest(request, {
    ...action.inputs,
    nonce: action.inputs.authorizationNonce,
  });
}

/** @internal Encodes the self-contained collateral withdrawal recipe. */
export function buildBlueWithdrawCollateral(
  action: Extract<Action, { type: "blueWithdrawCollateral" }>,
  requests: readonly SignatureRequest[],
) {
  const {
    chainId,
    account,
    marketParams,
    collateralAssets,
    maxLtv,
    deadline,
    referralFeePct,
    referralFeeRecipient,
  } = action.inputs;
  const id = action.signatureRequestIds.morphoAuthorization;
  const request =
    id === undefined
      ? undefined
      : requests.find((candidate) => candidate.id === id);
  if (
    id !== undefined &&
    (request?.kind !== "morphoAuthorization" || request.signature === undefined)
  ) {
    throw new IncompleteTransactionPlanError(id);
  }
  if (request?.kind === "morphoAuthorization") {
    validateBlueWithdrawCollateralAuthorizationRequest(request, action);
  }
  return blueWithdrawCollateral({
    market: { chainId, marketParams: new MarketParams(marketParams) },
    args: {
      collateralAssets,
      maxLtv,
      deadline,
      referralFeePct,
      referralFeeRecipient,
      userAddress: account,
      authorizationSignature:
        request?.kind === "morphoAuthorization" &&
        request.signature !== undefined
          ? {
              action: {
                type: "authorization" as const,
                args: {
                  authorized: request.args.authorized,
                  isAuthorized: true,
                  deadline: request.args.deadline,
                },
                typedData: request.typedData,
              },
              args: {
                ...request.args,
                isAuthorized: true,
                signature: request.signature,
              },
            }
          : undefined,
    },
  });
}

/** @internal Validates the stored collateral withdrawal's structural inputs. */
export function validateBlueWithdrawCollateralPlanAction(
  action: Record<string, unknown>,
  path: string,
): void {
  const inputs = getPlanObject(action.inputs, `${path}.inputs`);
  const ids = getPlanObject(
    action.signatureRequestIds,
    `${path}.signatureRequestIds`,
  );
  if (ids.morphoAuthorization !== undefined) {
    validatePlanField(ids.morphoAuthorization, {
      path: `${path}.signatureRequestIds.morphoAuthorization`,
      type: "string",
    });
    validatePlanField(inputs.authorizationNonce, {
      path: `${path}.inputs.authorizationNonce`,
      type: "uint256 bigint",
    });
  }
  validatePlanFields(inputs, {
    path: `${path}.inputs`,
    fields: {
      collateralAssets: "uint256 bigint",
      maxLtv: "uint256 bigint",
      deadline: "uint256 bigint",
      referralFeePct: "uint256 bigint",
      referralFeeRecipient: "address",
    },
  });
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
}
