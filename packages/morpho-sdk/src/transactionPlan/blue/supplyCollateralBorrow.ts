import { type MarketId, MathLib } from "@morpho-org/blue-sdk";
import { deepFreeze, Time } from "@morpho-org/morpho-ts";
import { type Client, maxUint256 } from "viem";
import { blueSupplyCollateralBorrow } from "../../actions/blue/supplyCollateralBorrow.js";
import { validateClientChainId } from "../../actions/requirements/validateClientChainId.js";
import { getBlueBundlesV1QuoteTimestamp } from "../../helpers/getBlueBundlesV1QuoteTimestamp.js";
import {
  DEFAULT_LLTV_BUFFER,
  validatePositionHealth,
} from "../../helpers/index.js";
import { parseNativeFunding } from "../../helpers/parse.js";
import {
  type AuthorizationRequirementSignature,
  MissingAccrualPositionError,
  type ReferenceTimestampParams,
  type VaultV2BlueReallocation,
} from "../../types/index.js";
import {
  IncompleteTransactionPlanError,
  InvalidTransactionPlanError,
  TransactionPlanSignatureMismatchError,
} from "../error.js";
import type { Funding, IntentParams } from "../intent.js";
import { getVaultPermit, validateTokenPermitRequest } from "../permit.js";
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
 * Intent and caller-fetched snapshots for an atomic Blue collateral supply and borrow.
 * @example
 * ```ts
 * import type { BlueSupplyCollateralBorrowPlanParams } from "@morpho-org/morpho-sdk";
 * const withAmounts = (params: BlueSupplyCollateralBorrowPlanParams) => ({ ...params, collateralAssets: 10n ** 18n, borrowAssets: 100n });
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export interface BlueSupplyCollateralBorrowPlanParams
  extends IntentParams,
    ReferenceTimestampParams {
  readonly marketId: MarketId;
  readonly marketData: BlueMarketSnapshot;
  /** Required when borrowing; belongs to the account and market. */
  readonly positionData?: BluePositionSnapshot;
  readonly collateralAssets: bigint;
  readonly borrowAssets: bigint;
  readonly funding?: Funding;
  readonly reallocations?: Iterable<VaultV2BlueReallocation>;
  /** Maximum WAD-scaled penalty rate per reallocation in [0, WAD], defaulting to zero. Each rate applies to that reallocation's assets, so it does not bound total proceeds lost. */
  readonly maxPenalty?: bigint;
}

/**
 * Prepares collateral funding and Morpho authorization for one BlueBundlesV1 call. Snapshots
 * are validated before reads; health uses the expiry floored at max(now, lastUpdate).
 * Expiries more than 365 days out retain the legacy +2h projection, like the entity handle.
 * The SDK never signs. Native funding is exclusive and
 * only supports the chain's wrapped native collateral token. Reallocation penalties reduce proceeds.
 * @param client - Viem client used for prerequisite and registered-contract reads.
 * @param params - Intent, amounts and caller-fetched market/position snapshots.
 * @param params.maxPenalty - Maximum WAD-scaled penalty rate per reallocation in [0, WAD], defaulting to zero. Each rate applies to that reallocation's assets, so it does not bound total proceeds lost.
 * @returns A data-only plan with approvals, authorization and the combined operation.
 * @throws {InvalidBigIntInputError} when a supplied maxPenalty is not a bigint.
 * @throws {ZeroAccountError} when the account is zero.
 * @throws {NonIntegerInputError} when expiry or referral basis points are not safe integers.
 * @throws {ExpiredDeadlineError} when expiry is not later than the reference timestamp.
 * @throws {InvalidCalldataOriginError} when attribution bytes are malformed or empty.
 * @throws {BlueSnapshotChainMismatchError} when a snapshot belongs to another chain.
 * @throws {MarketIdMismatchError} when a snapshot or market tuple belongs to another market.
 * @throws {AccrualPositionUserMismatchError} when the position belongs to another account.
 * @throws {MissingAccrualPositionError} when a borrow has no position snapshot.
 * @throws {MissingMarketPriceError} when the position snapshot has no usable oracle price.
 * @throws {BorrowExceedsSafeLtvError} when the quoted debt exceeds the buffered LLTV bound.
 * @throws {NegativeInputError} when an amount, maxPenalty or referral fee is negative.
 * @throws {NonPositiveInputError} when both legs are zero, or a reallocation amount is not positive.
 * @throws {InputExceedsMaxError} when an amount exceeds its ABI bound or aggregate penalties exceed borrowing.
 * Also thrown when maxPenalty exceeds WAD or a penalty exceeds maxPenalty (zero by default).
 * @throws {ReallocationsRequireBorrowError} when reallocations accompany no borrow.
 * @throws {InvalidReallocationAddressError} when a vault or adapter address is malformed.
 * @throws {InvalidVaultV2BlueReallocationShapeError} when a reallocation has an invalid shape.
 * @throws {InvalidReallocationSourceTypeError} when a source is incomplete or unknown.
 * @throws {InconsistentReallocationPenaltyError} when one vault has conflicting penalties.
 * @throws {ReallocationWithdrawalOnTargetMarketError} when the source equals the target market.
 * @throws {ReallocationLoanTokenMismatchError} when a source has another loan token.
 * @throws {InputExceedsMaxError} when `referralFee.bps` exceeds 1,000.
 * @throws {ReferralFeeRecipientMissingError} when a positive referral fee has no nonzero recipient.
 * @throws {NativeAmountOnNonWNativeAssetError} when native funding targets another token.
 * @throws {ChainWNativeMissingError} when native funding has no registered wrapped native token.
 * @throws {ChainIdMismatchError} when the client targets another chain.
 * @throws {MissingContractCodeError} when a registered execution target is absent.
 * @throws {UnsupportedChainIdError} when the chain is not registered.
 * @throws {UnknownAddressError} when the chain has no registered execution target.
 * @see blueSupplyCollateralBorrow for the underlying encoder constraints.
 * @example
 * ```ts
 * import { prepareBlueSupplyCollateralBorrow } from "@morpho-org/morpho-sdk";
 * import { MarketParams } from "@morpho-org/morpho-sdk/blue/entities";
 * import { fetchAccrualPosition, fetchMarket } from "@morpho-org/morpho-sdk/blue/fetch";
 * import { createPublicClient, http, parseEther } from "viem";
 * import { mainnet } from "viem/chains";
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const marketParams = new MarketParams({
 *   loanToken: "0xdC035D45d973E3EC169d2276DDab16f1e407384F",
 *   collateralToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
 *   oracle: "0x76b2242ea5BE1FCBBF4206EA09601EA5aB22Af4d",
 *   irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
 *   lltv: 860000000000000000n,
 * });
 * const account = "0x0000000000000000000000000000000000000001";
 * const block = await client.getBlock();
 * const fetchParams = { blockNumber: block.number };
 * const plan = await prepareBlueSupplyCollateralBorrow(client, {
 *   chainId: mainnet.id, account, marketId: marketParams.id,
 *   marketData: { chainId: mainnet.id, market: await fetchMarket(marketParams.id, client, fetchParams) },
 *   positionData: { chainId: mainnet.id, position: await fetchAccrualPosition(account, marketParams.id, client, fetchParams) },
 *   collateralAssets: parseEther("1"), borrowAssets: parseEther("100"),
 *   now: block.timestamp, supportSignature: true,
 * });
 * // plan: TransactionPlan; sign its pending requests externally before building.
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export async function prepareBlueSupplyCollateralBorrow(
  client: Client,
  params: BlueSupplyCollateralBorrowPlanParams,
): Promise<TransactionPlan> {
  const preparedParams = captureSupplyBorrowIntent(params);
  const { chainId, account, marketId, marketData, positionData, now } =
    preparedParams;
  const { collateralAssets, borrowAssets } = params;
  const { maxPenalty } = params;
  const id = "blueSupplyCollateralBorrow";
  let label = "Supply collateral and borrow on Blue";
  if (borrowAssets === 0n) {
    label = "Supply collateral on Blue";
  } else if (collateralAssets === 0n) {
    label = "Borrow on Blue";
  }
  const marketParams = marketData.market.params;
  const reallocations = [...(params.reallocations ?? [])];
  const maxLtv =
    borrowAssets > 0n
      ? MathLib.zeroFloorSub(marketParams.lltv, DEFAULT_LLTV_BUFFER)
      : maxUint256;
  const nativeAmount =
    params.funding?.type === "native" ? collateralAssets : undefined;
  const prepared = await prepareBlue(
    { client, params: preparedParams },
    (intent) => {
      // Run all encoder constraints before reading prerequisites.
      blueSupplyCollateralBorrow({
        market: { chainId, marketParams },
        args: {
          userAddress: account,
          collateralAssets,
          borrowAssets,
          maxLtv,
          nativeAmount,
          reallocations,
          maxPenalty,
          ...intent,
        },
      });
      if (borrowAssets > 0n) {
        const position = positionData?.position;
        if (position === undefined) {
          throw new MissingAccrualPositionError(marketId);
        }
        validatePositionHealth({
          positionData: position.accrueInterest(
            getBlueBundlesV1QuoteTimestamp({
              lastUpdate: position.market.lastUpdate,
              now,
              deadline: intent.deadline,
            }),
          ),
          additionalCollateral: collateralAssets,
          borrowAmount: borrowAssets,
          marketId,
          lltv: marketParams.lltv,
        });
      }
      const native = parseNativeFunding({
        chainId,
        token: marketParams.collateralToken,
        fundedAmount: collateralAssets,
        nativeAmount,
      });
      return {
        id,
        needsAuthorization: borrowAssets > 0n,
        ...(collateralAssets > 0n && native === 0n
          ? {
              tokenPull: {
                token: marketParams.collateralToken,
                amount: collateralAssets,
              },
            }
          : {}),
      };
    },
  );
  // Native-only supply has no prerequisites that would otherwise validate the client's chain.
  await validateClientChainId(client, chainId);
  const authorization = prepared.signatureRequests.find(
    (request) => request.id === prepared.morphoAuthorizationRequestId,
  );
  const permit = prepared.signatureRequests.find(
    (request) => request.kind === "permit",
  );
  return deepFreeze(
    structuredClone({
      version: 2,
      chainId,
      account,
      expiresAt: prepared.intent.expiresAt,
      ...(prepared.intent.calldataOrigin && {
        calldataOrigin: prepared.intent.calldataOrigin,
      }),
      steps: [
        ...prepared.steps,
        {
          id,
          label,
          action: {
            type: "blueSupplyCollateralBorrow",
            inputs: {
              chainId,
              account,
              marketParams: { ...marketParams, id: marketParams.id },
              collateralAssets,
              borrowAssets,
              maxLtv,
              nativeAssets: nativeAmount,
              ...(maxPenalty !== undefined && { maxPenalty }),
              reallocations: reallocations.map((entry) => ({
                ...entry,
                from:
                  entry.from.type === "market"
                    ? {
                        ...entry.from,
                        marketParams: {
                          ...entry.from.marketParams,
                          id: entry.from.marketParams.id,
                        },
                      }
                    : entry.from,
              })),
              deadline: prepared.intent.deadline,
              referralFeePct: prepared.intent.referralFeePct,
              referralFeeRecipient: prepared.intent.referralFeeRecipient,
              ...(authorization?.kind === "morphoAuthorization" && {
                authorizationNonce: authorization.args.nonce,
              }),
            },
            signatureRequestIds: {
              ...(permit && { tokenPermit: permit.id }),
              ...(authorization && { morphoAuthorization: authorization.id }),
            },
          },
        },
      ],
      signatureRequests: prepared.signatureRequests,
    }),
  );
}

function captureSupplyBorrowIntent(
  params: BlueSupplyCollateralBorrowPlanParams,
) {
  const {
    chainId,
    account,
    marketId,
    marketData,
    positionData,
    expiresAt,
    referralFee,
    supportSignature,
    calldataOrigin,
    deployless,
    now = Time.timestamp(),
  } = params;
  return {
    chainId,
    account,
    marketId,
    marketData,
    positionData,
    expiresAt,
    referralFee,
    supportSignature,
    calldataOrigin,
    deployless,
    now,
  };
}

/** @internal Binds either signature role to the combined operation's stored inputs. */
export function validateSupplyCollateralBorrowRequest(
  request: SignatureRequest,
  action: Extract<Action, { type: "blueSupplyCollateralBorrow" }>,
) {
  const { inputs, signatureRequestIds } = action;
  if (
    request.kind === "permit" &&
    signatureRequestIds.tokenPermit === request.id
  ) {
    return validateTokenPermitRequest(request, {
      chainId: inputs.chainId,
      account: inputs.account,
      deadline: inputs.deadline,
      bundler: "bundles.blueBundlesV1",
      asset: inputs.marketParams.collateralToken,
      amount: inputs.collateralAssets,
      exact: true,
    });
  }
  if (
    request.kind === "morphoAuthorization" &&
    signatureRequestIds.morphoAuthorization === request.id &&
    inputs.authorizationNonce !== undefined
  ) {
    return validateMorphoAuthorizationRequest(request, {
      ...inputs,
      nonce: inputs.authorizationNonce,
    });
  }
  throw new TransactionPlanSignatureMismatchError(request.id, "reference");
}

/** @internal Encodes the operation using only plain inputs and attached signatures. */
export function buildBlueSupplyCollateralBorrow(
  action: Extract<Action, { type: "blueSupplyCollateralBorrow" }>,
  requests: readonly SignatureRequest[],
) {
  const {
    chainId,
    account,
    marketParams,
    nativeAssets,
    authorizationNonce: _nonce,
    ...args
  } = action.inputs;
  const requirementSignature = getVaultPermit(requests, {
    id: action.signatureRequestIds.tokenPermit,
    asset: marketParams.collateralToken,
    owner: account,
  });
  const request = requests.find(
    (entry) => entry.id === action.signatureRequestIds.morphoAuthorization,
  );
  if (
    action.signatureRequestIds.morphoAuthorization !== undefined &&
    request?.signature === undefined
  ) {
    throw new IncompleteTransactionPlanError(
      action.signatureRequestIds.morphoAuthorization,
    );
  }
  if (request !== undefined && request.kind !== "morphoAuthorization") {
    throw new TransactionPlanSignatureMismatchError(request.id, "reference");
  }
  const authorizationSignature: AuthorizationRequirementSignature | undefined =
    request?.kind === "morphoAuthorization" && request.signature !== undefined
      ? {
          action: {
            type: "authorization",
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
  return blueSupplyCollateralBorrow({
    market: { chainId, marketParams },
    args: {
      ...args,
      nativeAmount: nativeAssets,
      userAddress: account,
      requirementSignature,
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

/** @internal Validates the complete stored input and reallocation shape. */
export function validateSupplyCollateralBorrowPlanAction(
  action: Record<string, unknown>,
  path: string,
): void {
  const inputs = getPlanObject(action.inputs, `${path}.inputs`);
  validatePlanFields(inputs, {
    path: `${path}.inputs`,
    fields: {
      collateralAssets: "uint256 bigint",
      borrowAssets: "uint256 bigint",
      maxLtv: "uint256 bigint",
      deadline: "uint256 bigint",
      reallocations: "array",
    },
  });
  for (const key of [
    "nativeAssets",
    "referralFeePct",
    "authorizationNonce",
    "maxPenalty",
  ]) {
    if (inputs[key] !== undefined) {
      validatePlanField(inputs[key], {
        path: `${path}.inputs.${key}`,
        type: "uint256 bigint",
      });
    }
  }
  if (inputs.referralFeeRecipient !== undefined) {
    validatePlanField(inputs.referralFeeRecipient, {
      path: `${path}.inputs.referralFeeRecipient`,
      type: "address",
    });
  }
  validateMarket(inputs.marketParams, `${path}.inputs.marketParams`);
  const ids = getPlanObject(
    action.signatureRequestIds,
    `${path}.signatureRequestIds`,
  );
  for (const key of Object.keys(ids)) {
    if (key !== "tokenPermit" && key !== "morphoAuthorization") {
      throw new InvalidTransactionPlanError({
        path: `${path}.signatureRequestIds.${key}`,
        reason: "unexpected signature role",
      });
    }
    validatePlanField(ids[key], {
      path: `${path}.signatureRequestIds.${key}`,
      type: "string",
    });
  }
  if (
    ids.tokenPermit !== undefined &&
    ids.tokenPermit === ids.morphoAuthorization
  ) {
    throw new InvalidTransactionPlanError({
      path: `${path}.signatureRequestIds.morphoAuthorization`,
      reason: "signature roles must reference distinct requests",
    });
  }
  if (ids.morphoAuthorization !== undefined) {
    validatePlanField(inputs.authorizationNonce, {
      path: `${path}.inputs.authorizationNonce`,
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
    if (from.type === "market") {
      validatePlanFields(from, {
        path: `${entryPath}.from`,
        fields: { adapter: "address" },
      });
      validateMarket(from.marketParams, `${entryPath}.from.marketParams`);
    } else if (from.type !== "idle") {
      throw new InvalidTransactionPlanError({
        path: `${entryPath}.from.type`,
        reason: "expected market or idle",
      });
    }
  }
}
