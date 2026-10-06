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
  maxUint128,
  zeroAddress,
  zeroHash,
} from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import { validateDeadline } from "../../helpers/validate.js";
import { validateMidnightMarket } from "../../helpers/validateMidnightMarket.js";
import {
  DuplicateMidnightGroupCancellationError,
  EmptyMidnightCollateralSuppliesError,
  EmptyMidnightGroupCancellationsError,
  InputExceedsMaxError,
  type Metadata,
  type MidnightCancelAndMakeAction,
  type MidnightCollateralTransfer,
  type MidnightGroupCancellation,
  MidnightReplacementGroupCancelledError,
  NegativeInputError,
  NonPositiveInputError,
  type Transaction,
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
  /**
   * Ratifier that activates `root`. MidnightBundlesV2 authorizes it over the maker's whole
   * Midnight account, so pass a trusted contract.
   */
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
}

/**
 * Parameters for encoding a Midnight Bundles V2 maker bundle: an offer publication or repost, or,
 * without a publication, a cancellation of offer groups only.
 */
export interface MidnightCancelAndMakeParams {
  /** Chain id used to resolve `MidnightBundlesV2`. */
  readonly chainId: number;
  /** Offer groups to cancel, each with its largest accepted consumption. Empty for a new publication. */
  readonly cancellations: readonly MidnightGroupCancellation[];
  /** Bundle execution deadline timestamp. Pass `maxUint256` explicitly for no expiry. */
  readonly deadline: bigint;
  /** Optional analytics metadata appended to calldata. */
  readonly metadata?: Metadata;
  /** Offers to publish after the cancellations. Omit to cancel offer groups only. */
  readonly publication?: MidnightOfferPublication;
}

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
  const publication = params.publication;
  if (publication == null) {
    if (params.cancellations.length === 0) {
      throw new EmptyMidnightGroupCancellationsError();
    }
    return;
  }
  if (publication.root === zeroHash) {
    throw new InvalidTreeError("Offer root cannot be zero.");
  }
  if (publication.payload === "0x") {
    throw new InvalidTreeError("Offer payload cannot be empty.");
  }
  if (publication.groups.length === 0) {
    throw new InvalidTreeError("Offer groups cannot be empty.");
  }
  for (const group of publication.groups) {
    if (cancelledGroups.has(group.toLowerCase())) {
      throw new MidnightReplacementGroupCancelledError({ group });
    }
  }
  if (publication.collateral == null) return;
  if (publication.collateral.supplies.length === 0) {
    throw new EmptyMidnightCollateralSuppliesError();
  }
  validateMidnightMarket({
    market: publication.collateral.market,
    chainId: params.chainId,
  });
  for (const [
    index,
    { collateralIndex, assets },
  ] of publication.collateral.supplies.entries()) {
    if (assets <= 0n) {
      throw new NonPositiveInputError(
        `collateral.supplies[${index}].assets`,
        assets,
      );
    }
    // Throws UnknownCollateralIndexError when the index is not configured on the market.
    MarketUtils.getCollateralByIndex(
      publication.collateral.market,
      collateralIndex,
    );
  }
};

/**
 * Encodes `MidnightBundlesV2.midnightBundlesV2CancelAndMake` for `msg.sender`: cancel previous
 * groups under consumption guards, optionally supply collateral, activate `root`, and publish `payload`.
 * Without `publication`, it only cancels groups (`cancelOffers` uses this).
 * Execution reverts as a whole if any group's consumption exceeds its `maxConsumed` ceiling.
 *
 * The contract does not check that `payload` matches `root`; callers must derive both from the
 * same tree. Prefer `client.morpho.midnight(chainId).makeLend(...)`,
 * `makeBorrow(...)`, or `supplyCollateralMakeBorrow(...)`, which derive the tree data and
 * resolve the requirements for each flow.
 *
 * @param params.chainId - Chain id used to resolve `MidnightBundlesV2`.
 * @param params.cancellations - Offer groups to cancel and their consumption ceilings.
 * @param params.deadline - Bundle execution deadline timestamp; pass `maxUint256` explicitly for no expiry.
 * @param params.metadata - Optional analytics metadata appended to calldata.
 * @param params.publication - Offers to publish after the cancellations; omit for cancellation only.
 * @param params.publication.ratifier - Ratifier that activates the offer root.
 * @param params.publication.root - Offer tree root to activate.
 * @param params.publication.groups - Distinct offer groups contained in the root.
 * @param params.publication.payload - Encoded offer payload published to the Midnight log.
 * @param params.publication.rootSignature - Optional delegated root-activation signature; omitted, all fields are zero.
 * @param params.publication.rootSignature.height - Tree height committed by the signature.
 * @param params.publication.rootSignature.nonce - Ratifier signature nonce.
 * @param params.publication.rootSignature.deadline - Signature deadline timestamp, independent of the bundle `deadline`.
 * @param params.publication.rootSignature.v - Signature recovery id.
 * @param params.publication.rootSignature.r - Signature `r` component.
 * @param params.publication.rootSignature.s - Signature `s` component.
 * @param params.publication.collateral - Optional collateral to supply on `collateral.market` for `msg.sender`.
 * @param params.publication.collateral.market - Midnight market receiving the collateral; every offer must target it.
 * @param params.publication.collateral.supplies - Collateral index and assets per supply; must not be empty.
 * @returns Deep-frozen transaction targeting `MidnightBundlesV2`.
 * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
 * @throws {UnknownAddressError} when the chain has no `midnightBundlesV2` deployment.
 * @throws {EmptyMidnightGroupCancellationsError} when nothing is published and no groups are cancelled.
 * @throws {EmptyMidnightCollateralSuppliesError} when a collateral market has no collateral supplies.
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
 *   cancellations: [{ group: previousGroup, maxConsumed: 0n }],
 *   deadline: maxUint256,
 *   publication: {
 *     ratifier: rateRatifierV1,
 *     root,
 *     groups: [group],
 *     payload,
 *   },
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
  const publication = params.publication;
  const supplies = (publication?.collateral?.supplies ?? []).map(
    ({ collateralIndex, assets }) => ({ collateralIndex, assets }),
  );
  const signature = publication?.rootSignature ?? {
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
        emptyBlueMarket, // blueMarket
        0n, // assetsToPark
        zeroHash, // callbackSalt
        publication?.collateral == null
          ? emptyMidnightMarket
          : MarketUtils.toStruct(publication.collateral.market), // market
        supplies, // collateralSupplies
        publication?.ratifier ?? zeroAddress, // ratifier
        publication?.root ?? zeroHash, // newRoot
        signature.height, // signatureHeight
        signature.nonce, // signatureNonce
        signature.deadline, // signatureDeadline
        signature.v, // v
        signature.r, // r
        signature.s, // s
        cancellations, // groupsToCancel
        publication?.payload ?? "0x", // payload
        params.deadline, // deadline
        zeroAddress, // wrappedNative
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
        ratifier: publication?.ratifier ?? zeroAddress,
        root: publication?.root ?? zeroHash,
        groups: [...(publication?.groups ?? [])],
        cancellations,
        collateralSupplies: supplies,
        deadline: params.deadline,
      },
    },
  });
};
