import type { MarketId } from "@morpho-org/blue-sdk";
import { deepFreeze, MathLib, Time } from "@morpho-org/morpho-ts";
import type { Client } from "viem";
import { blueBorrow } from "../../actions/blue/borrow.js";
import { normalizeBundlesCommonParams } from "../../actions/bundles/common.js";
import { getBlueBundlesV1QuoteTimestamp } from "../../helpers/getBlueBundlesV1QuoteTimestamp.js";
import { DEFAULT_LLTV_BUFFER } from "../../helpers/index.js";
import { validatePositionHealth } from "../../helpers/validate.js";
import type { VaultV2BlueReallocation } from "../../types/index.js";
import {
  IncompleteTransactionPlanError,
  InvalidTransactionPlanError,
} from "../error.js";
import type { IntentParams } from "../intent.js";
import type { Action, SignatureRequest, TransactionPlan } from "../types.js";
import {
  getPlanObject,
  validatePlanField,
  validatePlanFields,
} from "../validation.js";
import {
  type BlueMarketSnapshot,
  type BluePositionSnapshot,
  prepareBlue,
} from "./prepare.js";

/**
 * Borrow intent backed by caller-fetched market and position snapshots.
 * @example
 * ```ts
 * const params: BlueBorrowPlanParams = { chainId: 1, account, marketId: market.id,
 *   marketData: { chainId: 1, market }, positionData: { chainId: 1, position }, borrowAssets: 100n };
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export interface BlueBorrowPlanParams extends IntentParams {
  readonly marketId: MarketId;
  readonly marketData: BlueMarketSnapshot;
  readonly positionData: BluePositionSnapshot;
  /** Gross debt increase, before allocator penalties and referral fees. */
  readonly borrowAssets: bigint;
  readonly reallocations?: readonly VaultV2BlueReallocation[];
  /** Maximum WAD-scaled penalty rate per reallocation in [0, WAD], defaulting to zero. Each rate applies to that reallocation's assets, so it does not bound total proceeds lost. */
  readonly maxPenalty?: bigint;
  readonly now?: bigint;
}

/**
 * Prepares a BlueBundlesV1 borrow against existing collateral. No token allowance is needed.
 * Health uses the expiry, floored at max(now, lastUpdate), like the entity handle.
 * Expiries more than 365 days out retain the legacy +2h projection for unlimited sentinels.
 * Snapshots are not retained in the stored plan.
 * Reads Morpho authorization of BlueBundlesV1 (and its nonce when signing) from `client`.
 * @param client - Viem client for `params.chainId`, used for Morpho authorization and contract code reads.
 * @param params - Borrow intent and chain-tagged snapshots for the borrowing account.
 * @param params.maxPenalty - Maximum WAD-scaled penalty rate per reallocation in [0, WAD], defaulting to zero. Each rate applies to that reallocation's assets, so it does not bound total proceeds lost.
 * @returns A data-only plan with any Morpho authorization prerequisite before the borrow.
 * @throws {InvalidBigIntInputError} when a supplied maxPenalty is not a bigint.
 * @throws {ChainIdMismatchError} When the client declares another chain or its RPC reports another chain.
 * @throws {MissingContractCodeError} When BlueBundlesV1 or Morpho Blue has no deployed code.
 * @throws {UnsupportedBlueMarketIrmError} When positive debt requires an unsupported IRM projection.
 * @throws {viem.BaseError} When a chain ID, authorization, nonce, or contract code read fails.
 * @throws {BlueSnapshotChainMismatchError} When a snapshot was read from another chain.
 * @throws {MarketIdMismatchError} When a snapshot describes another market.
 * @throws {AccrualPositionUserMismatchError} When `positionData` belongs to another account.
 * @throws {ZeroAccountError} When `account` is the zero address.
 * @throws {NonIntegerInputError} When `expiresAt` or `referralFee.bps` is not a safe integer.
 * @throws {NonPositiveInputError} When `expiresAt`, `borrowAssets` or a reallocation amount is not positive.
 * @throws {ExpiredDeadlineError} When `expiresAt` is at or before `now`.
 * @throws {NegativeInputError} When `referralFee.bps`, maxPenalty or a reallocation penalty is negative.
 * @throws {InputExceedsMaxError} When a fee or reallocation bound is exceeded, including aggregate allocator penalties above the borrow.
 * Also thrown when maxPenalty exceeds WAD or a penalty exceeds maxPenalty (zero by default).
 * @throws {InvalidCalldataOriginError} When `calldataOrigin` is empty, malformed or has an odd number of hex digits.
 * @throws {InputExceedsMaxError} when `referralFee.bps` exceeds 1,000.
 * @throws {ReferralFeeRecipientMissingError} When a positive referral fee has no recipient.
 * @throws {InvalidVaultV2BlueReallocationShapeError} When a reallocation entry is malformed.
 * @throws {ReallocationWithdrawalOnTargetMarketError} When a reallocation sources the target market.
 * @throws {MissingMarketPriceError} When the market snapshot has no oracle price.
 * @throws {BorrowExceedsSafeLtvError} When the resulting debt exceeds buffered LLTV.
 * @see blueBorrow for the remaining reallocation encoding errors.
 * @example
 * ```ts
 * import { prepareBlueBorrow } from "@morpho-org/morpho-sdk";
 * import { fetchBlueAccrualPosition, fetchBlueMarket } from "@morpho-org/morpho-sdk/fetch";
 * import type { MarketId } from "@morpho-org/blue-sdk";
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const account = "0x0000000000000000000000000000000000000001";
 * const marketId = "0xb8fc70e82bc5bb53e773626fcc6a23f7eefa036918d7ef216ecfb1950a94a85e" as MarketId;
 * const plan = await prepareBlueBorrow(client, {
 *   chainId: 1, account, marketId, borrowAssets: 1_000_000n, supportSignature: true,
 *   marketData: { chainId: 1, market: await fetchBlueMarket(marketId, client) },
 *   positionData: { chainId: 1, position: await fetchBlueAccrualPosition(account, marketId, client) },
 *   now: (await client.getBlock()).timestamp,
 * });
 * // Sign the pending Morpho authorization request if any, attach it with applySignatures, then build.
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export async function prepareBlueBorrow(
  client: Client,
  {
    chainId,
    account,
    marketId,
    marketData,
    positionData,
    borrowAssets,
    reallocations,
    maxPenalty,
    expiresAt,
    referralFee,
    supportSignature,
    calldataOrigin,
    deployless,
    now = Time.timestamp(),
  }: BlueBorrowPlanParams,
): Promise<TransactionPlan> {
  const params = {
    chainId,
    account,
    marketId,
    marketData,
    positionData,
    borrowAssets,
    reallocations,
    maxPenalty,
    expiresAt,
    referralFee,
    supportSignature,
    calldataOrigin,
    deployless,
    now,
  };
  let inputs: Extract<Action, { type: "blueBorrow" }>["inputs"] | undefined;
  const { intent, steps, signatureRequests, morphoAuthorizationRequestId } =
    await prepareBlue({ client, params }, (resolvedIntent) => {
      const marketParams = params.marketData.market.params;
      const position = params.positionData.position;
      inputs = {
        chainId: params.chainId,
        account: params.account,
        marketParams: { ...marketParams },
        borrowAssets: params.borrowAssets,
        authorizationNonce: 0n,
        maxLtv: MathLib.zeroFloorSub(marketParams.lltv, DEFAULT_LLTV_BUFFER),
        reallocations: structuredClone(params.reallocations ?? []),
        ...(maxPenalty !== undefined && { maxPenalty }),
        ...normalizeBundlesCommonParams({
          deadline: resolvedIntent.deadline,
          referralFeePct: resolvedIntent.referralFeePct,
          referralFeeRecipient: resolvedIntent.referralFeeRecipient,
        }),
      };
      // Validate the pure encoding, including aggregate penalties, before any RPC reads.
      buildBlueBorrow(
        { type: "blueBorrow", inputs, signatureRequestIds: {} },
        [],
      );
      // Reject debt that exceeds the buffered LLTV at the shared health horizon.
      validatePositionHealth({
        positionData: position.accrueInterest(
          getBlueBundlesV1QuoteTimestamp({
            lastUpdate: position.market.lastUpdate,
            now,
            deadline: resolvedIntent.deadline,
          }),
        ),
        additionalCollateral: 0n,
        borrowAmount: params.borrowAssets,
        marketId: params.marketId,
        lltv: marketParams.lltv,
      });
      return { id: "blueBorrow", needsAuthorization: true };
    });
  if (inputs === undefined) {
    throw new InvalidTransactionPlanError({
      path: "inputs",
      reason: "expected prepared borrow inputs",
    });
  }
  return deepFreeze(
    structuredClone({
      version: 2,
      account: inputs.account,
      chainId: inputs.chainId,
      expiresAt: intent.expiresAt,
      ...(intent.calldataOrigin && { calldataOrigin: intent.calldataOrigin }),
      steps: [
        ...steps,
        {
          id: "blueBorrow",
          label: "Borrow from Blue",
          action: {
            type: "blueBorrow",
            inputs: {
              ...inputs,
              authorizationNonce:
                signatureRequests.find(
                  (request) => request.id === morphoAuthorizationRequestId,
                )?.args.nonce ?? 0n,
            },
            signatureRequestIds: morphoAuthorizationRequestId
              ? { morphoAuthorization: morphoAuthorizationRequestId }
              : {},
          },
        },
      ],
      signatureRequests,
    } satisfies TransactionPlan),
  );
}

/** @internal Encodes a prepared borrow without state reads or signing. */
export function buildBlueBorrow(
  action: Extract<Action, { type: "blueBorrow" }>,
  requests: readonly SignatureRequest[],
) {
  const {
    chainId,
    account,
    marketParams,
    borrowAssets,
    maxLtv,
    reallocations,
    maxPenalty,
    deadline,
    referralFeePct,
    referralFeeRecipient,
  } = action.inputs;
  const id = action.signatureRequestIds.morphoAuthorization;
  const request = requests.find((candidate) => candidate.id === id);
  if (
    id !== undefined &&
    (request?.kind !== "morphoAuthorization" || request.signature === undefined)
  ) {
    throw new IncompleteTransactionPlanError(id);
  }
  const authorizationSignature =
    request?.kind === "morphoAuthorization" && request.signature !== undefined
      ? {
          action: {
            type: "authorization" as const,
            args: {
              authorized: request.args.authorized,
              isAuthorized: true,
              deadline: request.args.deadline,
            },
          },
          args: {
            ...request.args,
            isAuthorized: true,
            signature: request.signature,
          },
        }
      : undefined;
  return blueBorrow({
    market: { chainId, marketParams },
    args: {
      borrowAssets,
      maxLtv,
      reallocations,
      maxPenalty,
      deadline,
      referralFeePct,
      referralFeeRecipient,
      userAddress: account,
      authorizationSignature,
    },
  });
}

function validateMarket(value: unknown, path: string): void {
  const market = getPlanObject(value, path);
  validatePlanFields(market, {
    path,
    fields: {
      id: "hex",
      loanToken: "address",
      collateralToken: "address",
      oracle: "address",
      irm: "address",
      lltv: "uint256 bigint",
    },
  });
  if (typeof market.id !== "string" || market.id.length !== 66) {
    throw new InvalidTransactionPlanError({
      path: `${path}.id`,
      reason: "expected a 32-byte market ID",
    });
  }
}

/** @internal Validates the stored borrow recipe, including each allocator input. */
export function validateBorrowPlanAction(
  action: Record<string, unknown>,
  path: string,
): void {
  const inputs = getPlanObject(action.inputs, `${path}.inputs`);
  getPlanObject(action.signatureRequestIds, `${path}.signatureRequestIds`);
  validatePlanFields(inputs, {
    path: `${path}.inputs`,
    fields: {
      borrowAssets: "uint256 bigint",
      authorizationNonce: "uint256 bigint",
      maxLtv: "uint256 bigint",
      deadline: "uint256 bigint",
      referralFeePct: "uint256 bigint",
      referralFeeRecipient: "address",
      reallocations: "array",
    },
  });
  validateMarket(inputs.marketParams, `${path}.inputs.marketParams`);
  if (inputs.maxPenalty !== undefined) {
    validatePlanField(inputs.maxPenalty, {
      path: `${path}.inputs.maxPenalty`,
      type: "uint256 bigint",
    });
  }
  for (const [index, value] of (inputs.reallocations as unknown[]).entries()) {
    const entryPath = `${path}.inputs.reallocations[${index}]`;
    const entry = getPlanObject(value, entryPath);
    validatePlanFields(entry, {
      path: entryPath,
      fields: {
        vault: "address",
        assets: "uint256 bigint",
        penalty: "uint256 bigint",
      },
    });
    validatePlanFields(getPlanObject(entry.to, `${entryPath}.to`), {
      path: `${entryPath}.to`,
      fields: { adapter: "address" },
    });
    const from = getPlanObject(entry.from, `${entryPath}.from`);
    if (from.type !== "market" && from.type !== "idle") {
      throw new InvalidTransactionPlanError({
        path: `${entryPath}.from.type`,
        reason: "expected market or idle",
      });
    }
    if (from.type === "market") {
      validatePlanFields(from, {
        path: `${entryPath}.from`,
        fields: { adapter: "address" },
      });
      validateMarket(from.marketParams, `${entryPath}.from.marketParams`);
    }
  }
}
