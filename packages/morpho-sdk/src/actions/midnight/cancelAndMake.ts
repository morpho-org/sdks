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
  maxUint128,
  zeroAddress,
  zeroHash,
} from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import { validateDeadline } from "../../helpers/validate.js";
import { validateMidnightMarket } from "../../helpers/validateMidnightMarket.js";
import {
  DuplicateMidnightGroupCancellationError,
  EmptyMidnightGroupCancellationsError,
  InputExceedsMaxError,
  type Metadata,
  type MidnightBlueSupply,
  type MidnightCancelAndMakeAction,
  type MidnightCollateralTransfer,
  type MidnightGroupCancellation,
  MidnightReplacementGroupCancelledError,
  NegativeInputError,
  NonPositiveInputError,
  type Transaction,
  UnknownMidnightRatifierError,
} from "../../types/index.js";

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

/** Offer root activated and published by a Midnight Bundles V2 maker bundle. */
export interface MidnightOfferPublication {
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
  /** Optional loan assets parked on Morpho Blue for the maker; share-price slippage is not checked. */
  readonly blueSupply?: MidnightBlueSupply;
  /** Optional collateral supplied to `market` for the maker before activation. */
  readonly collateral?: {
    readonly market: MarketParams;
    readonly supplies: readonly MidnightCollateralTransfer[];
  };
}

/**
 * Parameters for encoding a Midnight Bundles V2 maker bundle: an offer publication or repost, or,
 * without publication fields, a cancellation of offer groups only.
 */
export type MidnightCancelAndMakeParams = {
  /** Chain id used to resolve `MidnightBundlesV2` and the V1 ratifiers. */
  readonly chainId: number;
  /** Offer groups to cancel, each with its largest accepted consumption. Empty for a new publication. */
  readonly cancellations: readonly MidnightGroupCancellation[];
  /** Bundle execution deadline timestamp. Pass `maxUint256` explicitly for no expiry. */
  readonly deadline: bigint;
  /** Optional analytics metadata appended to calldata. */
  readonly metadata?: Metadata;
} & (
  | MidnightOfferPublication
  | { readonly [K in keyof MidnightOfferPublication]?: never }
);

/** Blue market argument for `MidnightBundlesV2` calls that park no loan assets. */
const emptyBlueMarket = {
  loanToken: zeroAddress,
  collateralToken: zeroAddress,
  oracle: zeroAddress,
  irm: zeroAddress,
  lltv: 0n,
} as const;

/** Midnight market argument for `MidnightBundlesV2` calls that supply no collateral. */
const emptyMidnightMarket = {
  chainId: 0n,
  midnight: zeroAddress,
  loanToken: zeroAddress,
  collateralParams: [],
  maturity: 0n,
  rcfThreshold: 0n,
  enterGate: zeroAddress,
  liquidatorGate: zeroAddress,
} as const;

const validateParams = (params: MidnightCancelAndMakeParams): void => {
  validateDeadline(params.deadline);
  const cancelledGroups = new Set<string>();
  for (const [
    index,
    { group, maxConsumed },
  ] of params.cancellations.entries()) {
    const field = `cancellations[${index}].maxConsumed`;
    if (maxConsumed < 0n) throw new NegativeInputError(field, maxConsumed);
    if (maxConsumed > maxUint128) {
      throw new InputExceedsMaxError({
        field,
        value: maxConsumed,
        max: maxUint128,
      });
    }
    const key = group.toLowerCase();
    if (cancelledGroups.has(key)) {
      throw new DuplicateMidnightGroupCancellationError({ index, group });
    }
    cancelledGroups.add(key);
  }
  if (params.root == null) {
    if (params.cancellations.length === 0) {
      throw new EmptyMidnightGroupCancellationsError();
    }
    return;
  }
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
  for (const group of params.groups) {
    if (cancelledGroups.has(group.toLowerCase())) {
      throw new MidnightReplacementGroupCancelledError({ group });
    }
  }
  if (params.blueSupply != null && params.blueSupply.assets <= 0n) {
    throw new NonPositiveInputError(
      "blueSupply.assets",
      params.blueSupply.assets,
    );
  }
  if (params.collateral == null) return;
  validateMidnightMarket({
    market: params.collateral.market,
    chainId: params.chainId,
  });
  for (const [
    index,
    { collateralIndex, assets },
  ] of params.collateral.supplies.entries()) {
    if (assets <= 0n) {
      throw new NonPositiveInputError(
        `collateral.supplies[${index}].assets`,
        assets,
      );
    }
    // Throws UnknownCollateralIndexError when the index is not configured on the market.
    MarketUtils.getCollateralByIndex(params.collateral.market, collateralIndex);
  }
};

/**
 * Encodes `MidnightBundlesV2.midnightBundlesV2CancelAndMake` for `msg.sender`: cancel previous
 * groups under consumption guards, optionally park loan assets on Morpho Blue for the maker's
 * `BlueBuyCallback` or supply collateral, activate `root`, and publish `payload`.
 * Without `ratifier`, `root`, `groups` and `payload`, it only cancels groups (`cancelOffers` uses this).
 * Execution reverts as a whole if any group's consumption exceeds its `maxConsumed` ceiling.
 *
 * The contract does not check that `payload` matches `root`; callers must derive both from the
 * same tree. Prefer `client.morpho.midnight(chainId).cancelAndMakeLend(...)` or
 * `cancelAndMakeBorrow(...)` or `supplyBlueMakeLend(...)`, which do so and resolve approvals and
 * authorization.
 *
 * @param params - Offer root, payload, cancellations, optional Blue supply or collateral, and deadline.
 * @returns Deep-frozen transaction targeting `MidnightBundlesV2`.
 * @throws {UnknownAddressError} when the chain has no `midnightBundlesV2` deployment or, when publishing,
 *   no PriceRatifierV1/RateRatifierV1 deployment.
 * @throws {EmptyMidnightGroupCancellationsError} when nothing is published and no groups are cancelled.
 * @throws {UnknownMidnightRatifierError} when `ratifier` is not the chain's PriceRatifierV1 or RateRatifierV1.
 * @throws {InvalidTreeError} when `root` is zero, or `payload` or `groups` is empty.
 * @throws {MidnightReplacementGroupCancelledError} when a published group is also cancelled.
 * @throws {DuplicateMidnightGroupCancellationError} when a cancelled group appears more than once.
 * @throws {NonPositiveInputError} when `deadline` is not positive.
 * @throws {NegativeInputError} when a `maxConsumed` ceiling is negative.
 * @throws {InputExceedsMaxError} when a `maxConsumed` ceiling exceeds `uint128` or `deadline` exceeds `uint256`.
 * @throws {ChainIdMismatchError} when the collateral market targets another chain.
 * @throws {MidnightMarketAddressMismatchError} when the collateral market targets another Midnight deployment.
 * @throws {UnknownCollateralIndexError} when a collateral index is not configured on the market.
 * @throws {NonPositiveInputError} when a collateral supply amount is non-positive.
 * @throws {NonPositiveInputError} when `blueSupply.assets` is non-positive.
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
  validateParams(params);
  const cancellations = params.cancellations.map(({ group, maxConsumed }) => ({
    group,
    maxConsumed,
  }));
  const supplies = (params.collateral?.supplies ?? []).map(
    ({ collateralIndex, assets }) => ({ collateralIndex, assets }),
  );
  const blueSupply =
    params.blueSupply == null
      ? undefined
      : {
          market: {
            loanToken: params.blueSupply.market.loanToken,
            collateralToken: params.blueSupply.market.collateralToken,
            oracle: params.blueSupply.market.oracle,
            irm: params.blueSupply.market.irm,
            lltv: params.blueSupply.market.lltv,
          },
          assets: params.blueSupply.assets,
          callbackSalt: params.blueSupply.callbackSalt,
        };
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
        blueSupply?.market ?? emptyBlueMarket,
        blueSupply?.assets ?? 0n,
        blueSupply?.callbackSalt ?? zeroHash,
        params.collateral == null
          ? emptyMidnightMarket
          : MarketUtils.toStruct(params.collateral.market),
        supplies,
        params.ratifier ?? zeroAddress,
        params.root ?? zeroHash,
        signature.height,
        signature.nonce,
        signature.deadline,
        signature.v,
        signature.r,
        signature.s,
        cancellations,
        params.payload ?? "0x",
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
        ratifier: params.ratifier ?? zeroAddress,
        root: params.root ?? zeroHash,
        groups: [...(params.groups ?? [])],
        cancellations,
        collateralSupplies: supplies,
        ...(blueSupply && { blueSupply }),
        deadline: params.deadline,
      },
    },
  });
};
