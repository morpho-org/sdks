import {
  AccrualPosition,
  type MarketId,
  MarketParams,
} from "@morpho-org/blue-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Client, zeroAddress } from "viem";
import { getBlueBundlesV1PenaltyAssets } from "../../actions/blue/common.js";
import { blueWithdraw } from "../../actions/blue/withdraw.js";
import { validateClientChainId } from "../../actions/requirements/validateClientChainId.js";
import {
  validateVaultV2BlueReallocations,
  validateWithdrawAmount,
  validateWithdrawShares,
} from "../../helpers/validate.js";
import type {
  AssetsOrSharesArgs,
  AuthorizationRequirementSignature,
  VaultV2BlueReallocation,
} from "../../types/index.js";
import {
  InputExceedsMaxError,
  MissingAccrualPositionError,
} from "../../types/index.js";
import {
  IncompleteTransactionPlanError,
  InvalidTransactionPlanError,
  TransactionPlanSignatureMismatchError,
} from "../error.js";
import type { IntentParams } from "../intent.js";
import type {
  Action,
  SignatureRequest,
  Step,
  TransactionPlan,
} from "../types.js";
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
 * Caller intent for withdrawing supplied Blue loan assets. Penalties and referral fees reduce proceeds.
 * @example
 * ```ts
 * import { markets } from "@morpho-org/morpho-test";
 * import type { BlueWithdrawPlanParams } from "@morpho-org/morpho-sdk";
 * import { fetchBlueAccrualPosition } from "@morpho-org/morpho-sdk/fetch";
 * import { createPublicClient, type Address, http } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * declare const account: Address; // Connected wallet holding a Blue supply position.
 * const position = await fetchBlueAccrualPosition(account, markets[mainnet.id].usdc_wbtc.id, client);
 * const market = position.market;
 * const params: BlueWithdrawPlanParams = {
 *   chainId: mainnet.id, account, marketId: market.id,
 *   marketData: { chainId: mainnet.id, market }, assets: 1_000_000n,
 *   positionData: { chainId: mainnet.id, position },
 * };
 * // params carries intent and a caller-fetched snapshot, not signatures or transactions.
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export type BlueWithdrawPlanParams = IntentParams &
  AssetsOrSharesArgs & {
    readonly marketId: MarketId;
    readonly marketData: BlueMarketSnapshot;
    /** Caller-fetched position used to validate the available supply balance. */
    readonly positionData: BluePositionSnapshot;
    readonly reallocations?: readonly VaultV2BlueReallocation[];
    /** Maximum WAD-scaled penalty rate per reallocation in [0, WAD], defaulting to zero. Each rate applies to that reallocation's assets, so it does not bound total proceeds lost. */
    readonly maxPenalty?: bigint;
    readonly now?: bigint;
  };

/**
 * Prepares a BlueBundlesV1 withdrawal with only Morpho authorization prerequisites, never token approvals.
 * The caller supplies market and position snapshots; the SDK reads authorization but never signs.
 * Share-based withdrawals have no minimum-proceeds guard.
 * @param client - Viem client on the requested chain.
 * @param params.chainId - Chain containing the market and registered BlueBundlesV1 contract.
 * @param params.account - Non-zero account whose supply position is withdrawn and which sends every plan transaction.
 * @param params.marketId - Market ID matching the caller-fetched snapshot and its market tuple.
 * @param params.marketData.chainId - Chain on which the market snapshot was fetched; must equal `chainId`.
 * @param params.marketData.market - Caller-fetched `Market` snapshot used to fix the market tuple; never stored in the plan.
 * @param params.positionData.chainId - Position snapshot's chain; must match `chainId`.
 * @param params.positionData.position - Caller-fetched `AccrualPosition` belonging to `account` and `marketId`; validates the withdrawal against supplied assets or shares and quotes share-mode penalty coverage.
 * @param params.assets - Exact positive gross loan assets withdrawn in base units; exclusive with `shares`.
 * @param params.shares - Exact positive supply shares burned; exclusive with `assets`, with no full-close sentinel or minimum-proceeds guarantee.
 * @param params.reallocations - Optional ordered Vault V2 BluePublicAllocator inputs; defaults to an empty list. Penalties reduce withdrawal proceeds.
 * @param params.maxPenalty - Maximum WAD-scaled penalty rate per reallocation in [0, WAD], defaulting to zero. Each rate applies to that reallocation's assets, so it does not bound total proceeds lost.
 * @param params.reallocations[].vault - Vault whose liquidity the allocator moves.
 * @param params.reallocations[].from.type - Source discriminator: `market` or `idle`.
 * @param params.reallocations[].from.adapter - Source adapter, required only for a `market` source.
 * @param params.reallocations[].from.marketParams.loanToken - Source market loan token, required only for a `market` source; must match the target loan token.
 * @param params.reallocations[].from.marketParams.collateralToken - Source market collateral token, required only for a `market` source.
 * @param params.reallocations[].from.marketParams.oracle - Source market oracle, required only for a `market` source.
 * @param params.reallocations[].from.marketParams.irm - Source market interest-rate model, required only for a `market` source.
 * @param params.reallocations[].from.marketParams.lltv - Source market WAD-scaled liquidation LTV, required only for a `market` source.
 * @param params.reallocations[].to.adapter - Target adapter supplying the enclosing withdrawal market.
 * @param params.reallocations[].assets - Positive reallocated assets in loan-token base units, bounded by uint128.
 * @param params.reallocations[].penalty - Vault-configured WAD-scaled penalty, bounded by uint64 and applied with upward rounding per allocation.
 * @param params.referralFee.bps - Optional integer referral fee in basis points of gross proceeds after allocator penalties; defaults to zero and must be at most 1,000.
 * @param params.referralFee.recipient - Optional fee recipient; required and non-zero when `referralFee.bps` is positive.
 * @param params.supportSignature - Optional Morpho authorization signature preference; defaults to `false`, selecting a direct authorization transaction when needed. Neither mode requests a token allowance or Permit2 signature.
 * @param params.now - Optional reference timestamp in seconds, normally the latest block timestamp; defaults to the device clock.
 * @param params.expiresAt - Optional Unix expiry in safe-integer seconds, later than `now`; defaults to `now + 2h`.
 * @param params.calldataOrigin - Optional non-empty, even-length hex bytes appended to every built transaction; omitted by default.
 * @param params.deployless - Optional shared intent field; unused because withdrawal reads no token metadata.
 * @returns A deep-frozen, data-only `{ version, chainId, account, expiresAt, steps, signatureRequests, calldataOrigin? }` plan with a withdrawal step. Direct Morpho authorization is a preceding step; signed authorization is consumed inline by the withdrawal. Attach signatures before building.
 * @throws {InvalidBigIntInputError} when a supplied maxPenalty is not a bigint.
 * @throws {ChainIdMismatchError} when the client declares or its transport serves another chain.
 * @throws {UnsupportedChainIdError} when `chainId` is absent from the registry.
 * @throws {UnknownAddressError} when Blue or BlueBundlesV1 is not registered on `chainId`.
 * @throws {BlueSnapshotChainMismatchError} when a market or supplied position snapshot's chain differs from `chainId`.
 * @throws {MarketIdMismatchError} when a market or supplied position snapshot's ID differs from `marketId` or does not hash from its market tuple.
 * @throws {AccrualPositionUserMismatchError} when a supplied position belongs to another account.
 * @throws {ZeroAccountError} when `account` is the zero address.
 * @throws {NonIntegerInputError} when `expiresAt` or `referralFee.bps` is not a safe integer.
 * @throws {NonPositiveInputError} when expiry, the selected withdrawal amount, or a reallocation amount is not positive.
 * @throws {ExpiredDeadlineError} when `expiresAt` is at or before `now`.
 * @throws {NegativeInputError} when the referral fee, a withdrawal amount, maxPenalty, or a reallocation penalty is negative.
 * @throws {InputExceedsMaxError} when referral basis points exceed 1,000, an encoded amount or penalty exceeds its ABI bound, or aggregate allocator penalties exceed withdrawn assets (the snapshot's downward-rounded asset quote in shares mode).
 * Also thrown when maxPenalty exceeds WAD or a penalty exceeds maxPenalty (zero by default).
 * @throws {InvalidCalldataOriginError} when `calldataOrigin` is empty, malformed or has an odd number of hex digits.
 * @throws {InvalidVaultV2BlueReallocationShapeError} when a reallocation entry is not an object or has a legacy Vault V1 shape.
 * @throws {InvalidReallocationAddressError} when a reallocation vault or adapter address is malformed.
 * @throws {InvalidReallocationSourceTypeError} when a reallocation source discriminator or source market tuple is malformed.
 * @throws {InconsistentReallocationPenaltyError} when allocations from one vault specify different penalties.
 * @throws {ReallocationWithdrawalOnTargetMarketError} when a reallocation source is the withdrawal market.
 * @throws {MutuallyExclusiveWithdrawAmountsError} when both withdrawal modes are nonzero.
 * @throws {ReferralFeeRecipientMissingError} when a positive referral fee has no non-zero recipient.
 * @throws {ReallocationLoanTokenMismatchError} when a source market uses another loan token.
 * @throws {MissingAccrualPositionError} when the required position snapshot is missing.
 * @throws {WithdrawExceedsSupplyError} when `assets` exceeds the position's supplied assets.
 * @throws {WithdrawSharesExceedSupplyError} when `shares` exceeds the position's supply shares.
 * @throws {MissingContractCodeError} when registered BlueBundlesV1 or Blue has no deployed code.
 * @throws {viem.BaseError} when a chain, bytecode, authorization or nonce RPC read fails, or ABI encoding rejects malformed input.
 * @throws {UnexpectedRequirementSignatureError} when an authorization requirement returns a nonce that is not a bigint.
 * @throws {TransactionPlanSignatureMismatchError} when the authorization requirement does not match the prepared account, chain, nonce or deadline.
 * @example
 * ```ts
 * import { markets } from "@morpho-org/morpho-test";
 * import { prepareBlueWithdraw, type TransactionPlan } from "@morpho-org/morpho-sdk";
 * import { fetchBlueAccrualPosition } from "@morpho-org/morpho-sdk/fetch";
 * import { createPublicClient, type Address, http } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * declare const account: Address; // Connected wallet holding a Blue supply position.
 * const position = await fetchBlueAccrualPosition(account, markets[mainnet.id].usdc_wbtc.id, client);
 * const market = position.market;
 * const plan: TransactionPlan = await prepareBlueWithdraw(client, {
 *   chainId: mainnet.id, account, marketId: market.id,
 *   marketData: { chainId: mainnet.id, market }, assets: 1_000_000n,
 *   positionData: { chainId: mainnet.id, position },
 *   now: (await client.getBlock()).timestamp,
 * });
 * // plan: { version: 1, chainId, account, expiresAt, steps, signatureRequests }
 * // Sign any pending Morpho authorization request, then build and submit each step in order.
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export async function prepareBlueWithdraw(
  client: Client,
  params: BlueWithdrawPlanParams,
): Promise<TransactionPlan> {
  const { maxPenalty } = params;
  await validateClientChainId(client, params.chainId);
  const { positionData: snapshot } = params;
  if (snapshot == null) {
    throw new MissingAccrualPositionError(params.marketId);
  }
  const withdrawals: Step<Extract<Action, { type: "blueWithdraw" }>>[] = [];
  const {
    intent: resolvedIntent,
    steps,
    signatureRequests,
  } = await prepareBlue({ client, params }, (intent) => {
    const inputs = {
      chainId: params.chainId,
      account: params.account,
      marketParams: {
        loanToken: params.marketData.market.params.loanToken,
        collateralToken: params.marketData.market.params.collateralToken,
        oracle: params.marketData.market.params.oracle,
        irm: params.marketData.market.params.irm,
        lltv: params.marketData.market.params.lltv,
      },
      withdrawAssets: "assets" in params ? (params.assets ?? 0n) : 0n,
      withdrawShares: "shares" in params ? (params.shares ?? 0n) : 0n,
      reallocations: params.reallocations ?? [],
      ...(maxPenalty !== undefined && { maxPenalty }),
      deadline: intent.deadline,
      referralFeePct: intent.referralFeePct,
      referralFeeRecipient: intent.referralFeeRecipient ?? zeroAddress,
    };
    // Validate all encoding constraints before authorization reads.
    buildBlueWithdraw({
      type: "blueWithdraw",
      inputs,
      signatureRequestIds: {},
    });
    const max =
      inputs.withdrawAssets > 0n
        ? inputs.withdrawAssets
        : snapshot.position.market.toSupplyAssets(
            inputs.withdrawShares,
            "Down",
          );
    const penalty = getBlueBundlesV1PenaltyAssets(inputs.reallocations);
    if (penalty > max) {
      throw new InputExceedsMaxError({
        field: "reallocationPenaltyAssets",
        value: penalty,
        max,
      });
    }
    const positionData = new AccrualPosition(
      snapshot.position,
      snapshot.position.market,
    );
    const validateWithdrawal =
      inputs.withdrawShares > 0n
        ? validateWithdrawShares
        : validateWithdrawAmount;
    // Reject over-withdrawals before requesting Morpho authorization.
    validateWithdrawal({
      positionData,
      withdrawShares: inputs.withdrawShares,
      withdrawAssets: inputs.withdrawAssets,
      marketId: params.marketId,
    });
    withdrawals.push({
      id: "blueWithdraw",
      label: "Withdraw from Blue",
      action: { type: "blueWithdraw", inputs, signatureRequestIds: {} },
    });
    return { id: "blueWithdraw", needsAuthorization: true };
  });
  return deepFreeze(
    structuredClone({
      version: 2,
      chainId: params.chainId,
      account: params.account,
      expiresAt: resolvedIntent.expiresAt,
      ...(resolvedIntent.calldataOrigin && {
        calldataOrigin: resolvedIntent.calldataOrigin,
      }),
      steps: [
        ...steps,
        ...withdrawals.map((step) => {
          const authorization = signatureRequests.find(
            (request) => request.kind === "morphoAuthorization",
          );
          return authorization === undefined
            ? step
            : {
                ...step,
                action: {
                  ...step.action,
                  inputs: {
                    ...step.action.inputs,
                    authorizationNonce: authorization.args.nonce,
                  },
                  signatureRequestIds: {
                    morphoAuthorization: authorization.id,
                  },
                },
              };
        }),
      ],
      signatureRequests,
    }),
  );
}

/** @internal Binds an inline authorization to the withdrawal that consumes it. */
export function validateBlueWithdrawAuthorizationRequest(
  request: Extract<SignatureRequest, { kind: "morphoAuthorization" }>,
  action: Extract<Action, { type: "blueWithdraw" }>,
): void {
  if (
    action.signatureRequestIds.morphoAuthorization !== request.id ||
    action.inputs.authorizationNonce === undefined
  ) {
    throw new TransactionPlanSignatureMismatchError(request.id, "reference");
  }
  // Pin the signature to the prepared withdrawal's account, nonce and deadline.
  validateMorphoAuthorizationRequest(request, {
    chainId: action.inputs.chainId,
    account: action.inputs.account,
    nonce: action.inputs.authorizationNonce,
    deadline: action.inputs.deadline,
  });
}

/**
 * @internal Encodes the self-contained withdrawal recipe and its inline authorization, if requested.
 * @param action - Withdrawal recipe with optional WAD-scaled maxPenalty in [0, WAD], defaulting to zero.
 * @param requests - Available authorization signatures.
 * @throws {NegativeInputError} when maxPenalty is negative.
 * @throws {InputExceedsMaxError} when maxPenalty exceeds WAD or a penalty exceeds maxPenalty (zero by default).
 */
export function buildBlueWithdraw(
  action: Extract<Action, { type: "blueWithdraw" }>,
  requests: readonly SignatureRequest[] = [],
) {
  const {
    chainId,
    account,
    marketParams,
    authorizationNonce: _authorizationNonce,
    ...args
  } = action.inputs;
  let authorizationSignature: AuthorizationRequirementSignature | undefined;
  const id = action.signatureRequestIds.morphoAuthorization;
  if (id !== undefined) {
    const request = requests.find((candidate) => candidate.id === id);
    if (request?.signature === undefined) {
      throw new IncompleteTransactionPlanError(id);
    }
    if (request.kind !== "morphoAuthorization") {
      throw new TransactionPlanSignatureMismatchError(id, "reference");
    }
    // Reject mismatches before encoding signed authorization into the withdrawal.
    validateBlueWithdrawAuthorizationRequest(request, action);
    authorizationSignature = {
      action: {
        type: "authorization",
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
    };
  }
  const targetMarketParams = new MarketParams(marketParams);
  // Reject malformed entries with typed errors before reading their source fields.
  validateVaultV2BlueReallocations(args.reallocations, {
    targetMarketId: targetMarketParams.id,
    maxPenalty: args.maxPenalty,
  });
  const reallocations = args.reallocations.map((entry) => ({
    ...entry,
    from:
      entry.from.type === "market"
        ? {
            ...entry.from,
            marketParams: new MarketParams(entry.from.marketParams),
          }
        : entry.from,
  }));
  return blueWithdraw({
    market: { chainId, marketParams: targetMarketParams },
    args: {
      ...args,
      reallocations,
      userAddress: account,
      authorizationSignature,
    },
  });
}

/** @internal Validates stored withdrawal scalars and allocator input shapes. */
export function validateBlueWithdrawPlanAction(
  action: Record<string, unknown>,
  path: string,
): void {
  const inputs = getPlanObject(action.inputs, `${path}.inputs`);
  if (inputs.maxPenalty !== undefined) {
    validatePlanField(inputs.maxPenalty, {
      path: `${path}.inputs.maxPenalty`,
      type: "uint256 bigint",
    });
  }
  const roles = getPlanObject(
    action.signatureRequestIds,
    `${path}.signatureRequestIds`,
  );
  if (roles.morphoAuthorization !== undefined) {
    validatePlanField(roles.morphoAuthorization, {
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
      withdrawAssets: "uint256 bigint",
      withdrawShares: "uint256 bigint",
      deadline: "uint256 bigint",
      referralFeePct: "uint256 bigint",
      referralFeeRecipient: "address",
      reallocations: "array",
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
    if (from.type === "idle") {
      continue;
    }
    if (from.type !== "market") {
      throw new InvalidTransactionPlanError({
        path: `${entryPath}.from.type`,
        reason: "expected market or idle",
      });
    }
    validatePlanFields(from, {
      path: `${entryPath}.from`,
      fields: { adapter: "address" },
    });
    validatePlanFields(
      getPlanObject(from.marketParams, `${entryPath}.from.marketParams`),
      {
        path: `${entryPath}.from.marketParams`,
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
}
