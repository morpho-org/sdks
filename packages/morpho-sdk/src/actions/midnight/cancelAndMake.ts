import {
  InvalidTreeError,
  type MarketParams,
  MarketUtils,
  midnightBundlesV2Abi,
} from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import {
  type Address,
  encodeFunctionData,
  type Hex,
  isAddressEqual,
  zeroAddress,
  zeroHash,
} from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import { validateMidnightMarket } from "../../helpers/validateMidnightMarket.js";
import {
  type Metadata,
  type MidnightCancelAndMakeAction,
  type MidnightGroupCancellation,
  MidnightReplacementGroupCancelledError,
  NonPositiveInputError,
  type Transaction,
  UnknownMidnightRatifierError,
} from "../../types/index.js";
import {
  emptyBlueMarket,
  emptyMidnightMarket,
  toBundlesV2Cancellations,
} from "./bundlesV2.js";

/** Collateral pulled from the maker and supplied to Midnight before offers are published. */
export interface MidnightCollateralTransfer {
  /** Index of the collateral in the market's `collateralParams`. */
  readonly collateralIndex: bigint;
  /** Collateral assets pulled from the maker. */
  readonly assets: bigint;
}

/**
 * Delegated root-activation signature passed to the ratifier's `setIsRootRatifiedWithSig`.
 * Omit it to activate the root directly with `setIsRootRatified`.
 */
export interface MidnightRootActivationSignature {
  /** Tree height committed by the signature. */
  readonly height: bigint;
  /** Ratifier signature nonce. */
  readonly nonce: bigint;
  /** Signature deadline timestamp, independent of the bundle deadline. */
  readonly deadline: bigint;
  readonly v: number;
  readonly r: Hex;
  readonly s: Hex;
}

/** Parameters for encoding an atomic Midnight Bundles V2 offer publication or repost. */
export interface MidnightCancelAndMakeParams {
  /** Chain id used to resolve `MidnightBundlesV2` and the V1 ratifiers. */
  readonly chainId: number;
  /** PriceRatifierV1 or RateRatifierV1 that ratifies `root`. */
  readonly ratifier: Address;
  /** Offer tree root to activate. */
  readonly root: Hex;
  /** Distinct offer groups contained in `root`. */
  readonly groups: readonly Hex[];
  /** Encoded offer payload for `root`, published to the Midnight log. */
  readonly payload: Hex;
  /** Optional delegated root-activation signature. */
  readonly rootSignature?: MidnightRootActivationSignature;
  /** Optional collateral supplied to `market` for the maker before activation. */
  readonly collateral?: {
    readonly market: MarketParams;
    readonly supplies: readonly MidnightCollateralTransfer[];
  };
  /** Previous offer groups to cancel, each with its largest accepted consumption. Empty for a new publication. */
  readonly cancellations: readonly MidnightGroupCancellation[];
  /** Bundle execution deadline timestamp. Pass `maxUint256` explicitly for no expiry. */
  readonly deadline: bigint;
  /** Optional analytics metadata appended to calldata. */
  readonly metadata?: Metadata;
}

/**
 * Encodes `MidnightBundlesV2.midnightBundlesV2CancelAndMake` for `msg.sender`: cancel previous
 * groups under consumption guards, optionally supply collateral, activate `root`, and publish `payload`.
 *
 * The contract does not check that `payload` matches `root`; callers must derive both from the
 * same tree. Prefer `client.morpho.midnight(chainId).cancelAndMakeLend(...)` or
 * `cancelAndMakeBorrow(...)`, which do so and resolve approvals and authorization.
 *
 * @param params - Offer root, payload, cancellations, optional collateral, and deadline.
 * @returns Deep-frozen transaction targeting `MidnightBundlesV2`.
 * @throws {UnknownAddressError} when the chain has no `midnightBundlesV2` deployment.
 * @throws {UnknownMidnightRatifierError} when `ratifier` is not the chain's PriceRatifierV1 or RateRatifierV1.
 * @throws {InvalidTreeError} when `root` is zero, or `payload` or `groups` is empty.
 * @throws {MidnightReplacementGroupCancelledError} when a published group is also cancelled.
 * @throws {DuplicateMidnightGroupCancellationError} when a cancelled group appears more than once.
 * @throws {NegativeInputError} when `deadline` or a `maxConsumed` ceiling is negative.
 * @throws {InputExceedsMaxError} when a `maxConsumed` ceiling exceeds `uint128`.
 * @throws {MidnightMarketAddressMismatchError} when the collateral market targets another Midnight deployment.
 * @throws {UnknownCollateralIndexError} when a collateral index is not configured on the market.
 * @throws {NonPositiveInputError} when a collateral supply amount is non-positive.
 * @example
 * ```ts
 * import { midnightCancelAndMake } from "@morpho-org/morpho-sdk";
 * import { maxUint256, type Address, type Hex } from "viem";
 *
 * declare const rateRatifierV1: Address;
 * declare const root: Hex;
 * declare const group: Hex;
 * declare const payload: Hex;
 * declare const previousGroup: Hex;
 * const tx = midnightCancelAndMake({
 *   chainId: 8453,
 *   ratifier: rateRatifierV1,
 *   root,
 *   groups: [group],
 *   payload,
 *   cancellations: [{ group: previousGroup, maxConsumed: 0n }],
 *   deadline: maxUint256,
 * });
 * ```
 */
export const midnightCancelAndMake = (
  params: MidnightCancelAndMakeParams,
): Readonly<Transaction<MidnightCancelAndMakeAction>> => {
  const priceRatifierV1 = getChainAddress(params.chainId, "priceRatifierV1");
  const rateRatifierV1 = getChainAddress(params.chainId, "rateRatifierV1");
  if (
    !isAddressEqual(params.ratifier, priceRatifierV1) &&
    !isAddressEqual(params.ratifier, rateRatifierV1)
  ) {
    throw new UnknownMidnightRatifierError({
      ratifier: params.ratifier,
      priceRatifierV1,
      rateRatifierV1,
    });
  }
  if (params.root === zeroHash) {
    throw new InvalidTreeError("Offer root cannot be zero.");
  }
  if (params.payload === "0x") {
    throw new InvalidTreeError("Offer payload cannot be empty.");
  }
  if (params.groups.length === 0) {
    throw new InvalidTreeError("Offer groups cannot be empty.");
  }
  const cancellations = toBundlesV2Cancellations(params);
  const cancelled = new Set(
    cancellations.map(({ group }) => group.toLowerCase()),
  );
  for (const group of params.groups) {
    if (cancelled.has(group.toLowerCase())) {
      throw new MidnightReplacementGroupCancelledError({ group });
    }
  }

  const supplies = (params.collateral?.supplies ?? []).map(
    ({ collateralIndex, assets }, index) => {
      if (assets <= 0n) {
        throw new NonPositiveInputError(
          `collateral.supplies[${index}].assets`,
          assets,
        );
      }
      return { collateralIndex, assets };
    },
  );
  if (params.collateral != null) {
    validateMidnightMarket({
      market: params.collateral.market,
      chainId: params.chainId,
    });
    for (const { collateralIndex } of supplies) {
      MarketUtils.getCollateralByIndex(
        params.collateral.market,
        collateralIndex,
      );
    }
  }
  const signature = params.rootSignature ?? {
    height: 0n,
    nonce: 0n,
    deadline: 0n,
    v: 0,
    r: zeroHash,
    s: zeroHash,
  };

  let tx = {
    to: getChainAddress(params.chainId, "midnightBundlesV2"),
    value: 0n,
    data: encodeFunctionData({
      abi: midnightBundlesV2Abi,
      functionName: "midnightBundlesV2CancelAndMake",
      args: [
        emptyBlueMarket,
        0n,
        zeroHash,
        params.collateral == null
          ? emptyMidnightMarket
          : MarketUtils.toStruct(params.collateral.market),
        supplies,
        params.ratifier,
        params.root,
        signature.height,
        signature.nonce,
        signature.deadline,
        signature.v,
        signature.r,
        signature.s,
        cancellations,
        params.payload,
        params.deadline,
        zeroAddress,
      ],
    }),
  };
  if (params.metadata) {
    tx = addTransactionMetadata(tx, params.metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "midnightCancelAndMake",
      args: {
        ratifier: params.ratifier,
        root: params.root,
        groups: [...params.groups],
        cancellations,
        collateralSupplies: supplies,
        deadline: params.deadline,
      },
    },
  });
};
