import { type MarketId, MarketUtils } from "@morpho-org/blue-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Client, zeroAddress } from "viem";
import { blueSupplyCollateral } from "../../actions/blue/supplyCollateral.js";
import { validateClientChainId } from "../../actions/requirements/validateClientChainId.js";
import {
  validateNativeAsset,
  validateReferralFee,
  validateUint256Field,
} from "../../helpers/validate.js";
import {
  type BlueSupplyCollateralAction,
  NonPositiveInputError,
  type ReferenceTimestampParams,
  type Transaction,
} from "../../types/index.js";
import {
  InvalidTransactionPlanError,
  TransactionPlanSignatureMismatchError,
} from "../error.js";
import type { Funding, IntentParams } from "../intent.js";
import { getSignedTokenPermit, validateTokenPermitRequest } from "../permit.js";
import type { Action, SignatureRequest, TransactionPlan } from "../types.js";
import { getPlanObject, validatePlanFields } from "../validation.js";
import { type BlueMarketSnapshot, prepareBlue } from "./prepare.js";

type SupplyCollateralAction = Extract<Action, { type: "blueSupplyCollateral" }>;
const actionId = "blueSupplyCollateral";

/**
 * Intent for supplying collateral without borrowing in a Blue market.
 * @example
 * ```ts
 * import type { BlueSupplyCollateralPlanParams } from "@morpho-org/morpho-sdk";
 * const withNativeFunding = (params: BlueSupplyCollateralPlanParams): BlueSupplyCollateralPlanParams =>
 *   ({ ...params, funding: { type: "native" } }); // Only for a wNative collateral market.
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export interface BlueSupplyCollateralPlanParams
  extends IntentParams,
    ReferenceTimestampParams {
  /** ID of the market in which to supply collateral. */
  readonly marketId: MarketId;
  /** Market snapshot fetched by the caller on the target chain. */
  readonly marketData: BlueMarketSnapshot;
  /** Gross collateral supplied in token base units, before referral fees. */
  readonly collateralAssets: bigint;
  /** Defaults to ERC-20; native funding requires wNative collateral and stores `nativeAssets = collateralAssets`. */
  readonly funding?: Funding;
}

/**
 * Prepares a collateral-only supply through BlueBundlesV1 from a caller-fetched market snapshot.
 * No Morpho authorization is needed. ERC-20 funding reuses an adequate allowance, requests an
 * ERC-2612 permit when supported and enabled, or adds a direct approval step. Native funding
 * needs neither an approval nor a signature.
 * @param client - Viem client for the chain on which the market was fetched.
 * @param params - Market snapshot, amount and shared transaction intent.
 * @param params.chainId - Chain containing the market and BlueBundlesV1.
 * @param params.account - Non-zero account funding, signing and sending the transaction.
 * @param params.marketId - ID of the market in which to supply collateral.
 * @param params.marketData - Caller-fetched snapshot of the selected market and chain.
 * @param params.collateralAssets - Positive gross collateral amount in token base units.
 * @param params.funding.type - `"erc20"` (default) or `"native"` for wNative collateral.
 * @param params.referralFee.bps - Optional fee in integer basis points, at most 1,000.
 * @param params.referralFee.recipient - Non-zero recipient required for a positive fee.
 * @param params.supportSignature - Prefer an ERC-2612 permit where available; defaults to false.
 * @param params.now - Reference Unix timestamp in seconds; defaults to the device clock.
 * @param params.expiresAt - Expiry in Unix seconds, later than `now`; defaults to `now + 2h`.
 * @param params.calldataOrigin - Optional non-empty hex bytes appended to each built transaction.
 * @param params.deployless - Whether permit metadata reads may use deployless aggregation.
 * @returns A frozen plan containing the collateral supply step and any token prerequisites.
 * @throws {BlueSnapshotChainMismatchError} when the snapshot comes from another chain.
 * @throws {MarketIdMismatchError} when the snapshot does not identify the selected market.
 * @throws {ZeroAccountError} when `account` is the zero address.
 * @throws {NonIntegerInputError} when expiry or fee basis points are not safe integers.
 * @throws {NonPositiveInputError} when the collateral amount or expiry is zero.
 * @throws {ExpiredDeadlineError} when expiry is at or before the reference time.
 * @throws {NegativeInputError} when the collateral amount or fee basis points are negative.
 * @throws {InputExceedsMaxError} when collateral exceeds uint256 or `referralFee.bps` exceeds 1,000.
 * @throws {InvalidCalldataOriginError} when attribution bytes are empty or malformed.
 * @throws {InvalidTransactionPlanError} when `calldataOrigin` exceeds 1 MiB.
 * @throws {ReferralFeeRecipientMissingError} when a positive fee has no non-zero recipient.
 * @throws {ChainWNativeMissingError} when native funding is requested on a chain with no wNative.
 * @throws {NativeAmountOnNonWNativeAssetError} when native funding targets non-wNative collateral.
 * @throws {UnsupportedChainIdError} when the chain is absent from the registry.
 * @throws {UnknownAddressError} when Blue or BlueBundlesV1 is not registered.
 * @throws {ChainIdMismatchError} when the client declares or serves another chain.
 * @throws {MissingContractCodeError} when Blue or BlueBundlesV1 has no code on the chain.
 * @example
 * ```ts
 * import { prepareBlueSupplyCollateral } from "@morpho-org/morpho-sdk";
 * import { fetchMarket } from "@morpho-org/morpho-sdk/blue/fetch";
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const prepare = async (marketId: Parameters<typeof fetchMarket>[0], account: `0x${string}`) =>
 *   prepareBlueSupplyCollateral(client, {
 *     chainId: mainnet.id,
 *     account,
 *     marketId,
 *     collateralAssets: 1_000_000n,
 *     marketData: { chainId: mainnet.id, market: await fetchMarket(marketId, client) },
 *   });
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export async function prepareBlueSupplyCollateral(
  client: Client,
  params: BlueSupplyCollateralPlanParams,
): Promise<TransactionPlan> {
  const { chainId, account, collateralAssets, marketData } = params;
  const { id, loanToken, collateralToken, oracle, irm, lltv } =
    marketData.market.params;
  const marketParams = { id, loanToken, collateralToken, oracle, irm, lltv };
  const native = params.funding?.type === "native";
  const { intent, steps, signatureRequests } = await prepareBlue(
    { client, params },
    (resolvedIntent) => {
      validateUint256Field("collateralAssets", collateralAssets);
      if (collateralAssets === 0n) {
        throw new NonPositiveInputError("collateralAssets", collateralAssets);
      }
      // Reject invalid fees before resolving any token prerequisites.
      validateReferralFee(resolvedIntent);
      if (native) {
        validateNativeAsset(chainId, collateralToken);
      }
      return {
        id: actionId,
        tokenPull: native
          ? undefined
          : { token: collateralToken, amount: collateralAssets },
      };
    },
  );
  if (native) {
    await validateClientChainId(client, chainId);
  }
  const tokenPermit = signatureRequests.find(({ kind }) => kind === "permit");
  return deepFreeze(
    structuredClone({
      version: 2,
      chainId,
      account,
      expiresAt: intent.expiresAt,
      ...(intent.calldataOrigin && { calldataOrigin: intent.calldataOrigin }),
      steps: [
        ...steps,
        {
          id: actionId,
          label: "Supply Blue collateral",
          action: {
            type: actionId,
            inputs: {
              chainId,
              account,
              marketParams,
              collateralAssets,
              ...(native && { nativeAssets: collateralAssets }),
              deadline: intent.deadline,
              referralFeePct: intent.referralFeePct,
              referralFeeRecipient: intent.referralFeeRecipient ?? zeroAddress,
            },
            signatureRequestIds: tokenPermit
              ? { tokenPermit: tokenPermit.id }
              : {},
          },
        },
      ],
      signatureRequests,
    }),
  );
}

/** @internal Validates the stored collateral supply action and its token permit role. */
export function validateSupplyCollateralPlanAction(
  action: Record<string, unknown>,
  path: string,
): void {
  const inputsPath = `${path}.inputs`;
  const inputs = getPlanObject(action.inputs, inputsPath);
  validatePlanFields(inputs, {
    path: inputsPath,
    fields: {
      collateralAssets: "uint256 bigint",
      deadline: "uint256 bigint",
      referralFeePct: "uint256 bigint",
      referralFeeRecipient: "address",
    },
  });
  const marketPath = `${inputsPath}.marketParams`;
  const market = getPlanObject(inputs.marketParams, marketPath);
  validatePlanFields(market, {
    path: marketPath,
    fields: {
      id: "hex",
      loanToken: "address",
      collateralToken: "address",
      irm: "address",
      oracle: "address",
      lltv: "uint256 bigint",
    },
  });
  if (typeof market.id !== "string" || market.id.length !== 66) {
    throw new InvalidTransactionPlanError({
      path: `${marketPath}.id`,
      reason: "expected a 32-byte market ID",
    });
  }
  validateNativeAssets(inputs, `${inputsPath}.nativeAssets`);
  const rolesPath = `${path}.signatureRequestIds`;
  const roles = getPlanObject(action.signatureRequestIds, rolesPath);
  for (const role of Object.keys(roles)) {
    if (role !== "tokenPermit" || inputs.nativeAssets !== undefined) {
      throw new InvalidTransactionPlanError({
        path: `${rolesPath}.${role}`,
        reason: "only ERC-20 funding can reference a token permit",
      });
    }
  }
}

function validateNativeAssets(
  {
    collateralAssets,
    nativeAssets,
  }: { readonly collateralAssets?: unknown; readonly nativeAssets?: unknown },
  path: string,
): void {
  if (
    nativeAssets !== undefined &&
    (nativeAssets === 0n || nativeAssets !== collateralAssets)
  ) {
    throw new InvalidTransactionPlanError({
      path,
      reason: "expected the full collateral amount for native funding",
    });
  }
}

/** @internal Checks that the permit authorizes this exact ERC-20 collateral pull. */
export function validateSupplyCollateralPermitRequest(
  request: Extract<SignatureRequest, { kind: "permit" }>,
  action: SupplyCollateralAction,
): void {
  const {
    chainId,
    account,
    marketParams,
    collateralAssets,
    deadline,
    nativeAssets,
  } = action.inputs;
  if (
    action.signatureRequestIds.tokenPermit !== request.id ||
    nativeAssets !== undefined
  ) {
    throw new TransactionPlanSignatureMismatchError(request.id, "reference");
  }
  validateTokenPermitRequest(request, {
    chainId,
    account,
    asset: marketParams.collateralToken,
    amount: collateralAssets,
    deadline,
    bundler: "bundles.blueBundlesV1",
    exact: true,
  });
}

/** @internal Encodes a collateral supply from stored inputs and an optional signed permit. */
export function buildBlueSupplyCollateral(
  action: SupplyCollateralAction,
  requests: readonly SignatureRequest[],
): Readonly<Transaction<BlueSupplyCollateralAction>> {
  const {
    chainId,
    account,
    marketParams,
    collateralAssets,
    nativeAssets,
    deadline,
    referralFeePct,
    referralFeeRecipient,
  } = action.inputs;
  validateNativeAssets(action.inputs, "action.inputs.nativeAssets");
  return blueSupplyCollateral({
    market: {
      chainId,
      marketParams: {
        ...marketParams,
        liquidationIncentiveFactor:
          MarketUtils.getLiquidationIncentiveFactor(marketParams),
      },
    },
    args: {
      collateralAssets,
      nativeAmount: nativeAssets,
      deadline,
      referralFeePct,
      referralFeeRecipient,
      userAddress: account,
      requirementSignature: getSignedTokenPermit(requests, {
        id: action.signatureRequestIds.tokenPermit,
        asset: marketParams.collateralToken,
        owner: account,
      }),
    },
  });
}
