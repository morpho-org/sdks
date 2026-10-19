import {
  InvalidTreeError,
  MarketUtils,
  midnightBundlesV2Abi,
} from "@morpho-org/midnight-sdk";
import {
  deepFreeze,
  getChainAddress,
  getChainAddresses,
} from "@morpho-org/morpho-ts";
import {
  type Address,
  encodeFunctionData,
  isAddressEqual,
  maxUint128,
  zeroAddress,
  zeroHash,
} from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import {
  validateDeadline,
  validateMidnightNativeAmount,
} from "../../helpers/validate.js";
import {
  validateMidnightCollateralSupplySums,
  validateMidnightUint128Field,
} from "../../helpers/validateMidnightBounds.js";
import { validateMidnightMarket } from "../../helpers/validateMidnightMarket.js";
import {
  snapshotMidnightCancelAndMakeParams,
  validateMidnightPublication,
} from "../../helpers/validateMidnightPublication.js";
import {
  DuplicateMidnightGroupCancellationError,
  EmptyMidnightCollateralSuppliesError,
  EmptyMidnightGroupCancellationsError,
  InputExceedsMaxError,
  type MidnightCancelAndMakeAction,
  MidnightReplacementGroupCancelledError,
  NegativeInputError,
  NonPositiveInputError,
  type Transaction,
  UnsupportedMidnightAuthorizationTargetError,
} from "../../types/index.js";
import type { MidnightCancelAndMakeParams } from "../../types/midnightCancelAndMake.js";

export type {
  MidnightCancelAndMakeParams,
  MidnightMakeBorrowCollateral,
  MidnightOfferPublication,
  MidnightRootActivationSignature,
} from "../../types/midnightCancelAndMake.js";

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

/**
 * Encodes `MidnightBundlesV2.midnightBundlesV2CancelAndMake` for `msg.sender`: cancel previous
 * groups under consumption guards, optionally park loan assets on Morpho Blue for the maker's
 * `BlueBuyCallback` or supply collateral, activate `root`, and publish `payload`.
 * Without `publication`, it only cancels groups (`cancelOffers` uses this).
 * Execution reverts as a whole if any group's consumption exceeds its `maxConsumed` ceiling.
 * The builder snapshots every input field once before validation and encoding. It checks root,
 * groups, cancellation groups, Blue callback salt, and root-signature `r`/`s` as 32-byte hex and
 * checks payload hex shape and size, but cannot decode it; callers must supply a mutually
 * consistent root, group list, and payload.
 *
 * The contract does not check that `payload` matches `root`. Prefer
 * `client.morpho.midnight(chainId).makeLend(...)`,
 * `makeBorrow(...)`, `supplyCollateralMakeBorrow(...)`, or `supplyBlueMakeLend(...)`, which derive
 * the tree data and resolve the requirements for each flow; `supplyBlueMakeLend` also runs the
 * Blue parking checks (callback, callbackData, empty-market and zero-share guards) that this builder
 * skips.
 *
 * @param params.chainId - Chain id used to resolve `MidnightBundlesV2`.
 * @param params.cancellations - Offer groups to cancel and their consumption ceilings.
 * @param params.deadline - Bundle execution deadline timestamp; pass `maxUint256` explicitly for no expiry. Not checked against the clock; validate freshness before building.
 * @param params.nativeAmount - Optional native ETH sent as `value`; the bundle wraps it into the
 *   chain's wNative and transfers it to `msg.sender` before pulling. It may cover part or all of the
 *   maximum wNative amount this call can pull, but not more. Any wrapped native not pulled stays in
 *   the sender's wallet as wNative. The wNative approval to `MidnightBundlesV2` is still required
 *   for the full pulled amount.
 * @param params.metadata - Optional analytics metadata appended to calldata.
 * @param params.publication - Offers to publish after the cancellations; omit for cancellation only.
 * @param params.publication.ratifier - The chain's registered `priceRatifierV1` or `rateRatifierV1`,
 *   which activates the offer root.
 * @param params.publication.root - Offer tree root to activate.
 * @param params.publication.groups - Distinct offer groups contained in the root.
 * @param params.publication.payload - Encoded offer payload published to the Midnight log.
 * @param params.publication.rootSignature - Optional builder-only delegated root-activation
 *   signature. Maker entity methods never set it; they encode zero signature fields and rely on
 *   MidnightBundlesV2 authorization.
 * @param params.publication.rootSignature.height - Tree height committed by the signature.
 * @param params.publication.rootSignature.nonce - Ratifier signature nonce.
 * @param params.publication.rootSignature.deadline - Signature deadline timestamp, independent of the bundle `deadline`.
 * @param params.publication.rootSignature.v - Signature recovery id.
 * @param params.publication.rootSignature.r - Signature `r` component.
 * @param params.publication.rootSignature.s - Signature `s` component.
 * @param params.publication.blueSupply - Optional loan assets to supply on Blue for the maker's `BlueBuyCallback`.
 * @param params.publication.blueSupply.market - Blue market receiving the loan assets.
 * @param params.publication.blueSupply.assets - Loan assets pulled from `msg.sender` and supplied on Blue; must be positive.
 * @param params.publication.blueSupply.callbackSalt - Salt selecting the maker's `BlueBuyCallback`.
 * @param params.publication.collateral - Optional collateral to supply on `collateral.market` for `msg.sender`.
 * @param params.publication.collateral.market - Midnight market receiving the collateral; every offer must target it.
 * @param params.publication.collateral.supplies - Collateral index and assets per supply; must not be empty.
 * @returns Deep-frozen transaction targeting `MidnightBundlesV2`.
 * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
 * @throws {UnknownAddressError} when the chain has no `midnightBundlesV2` deployment.
 * @throws {UnsupportedMidnightAuthorizationTargetError} when the ratifier is not the chain's registered `priceRatifierV1` or `rateRatifierV1`.
 * @throws {EmptyMidnightGroupCancellationsError} when nothing is published and no groups are cancelled.
 * @throws {EmptyMidnightCollateralSuppliesError} when a collateral market has no collateral supplies.
 * @throws {InvalidTreeError} when `root` is zero, or `payload` or `groups` is empty.
 * @throws {InvalidMidnightHexInputError} when a publication root or group, cancellation group,
 *   Blue callback salt, or root-signature `r`/`s` is not 32-byte hex, or when payload is malformed,
 *   odd-length, or larger than 1,000,000 bytes.
 * @throws {MidnightReplacementGroupCancelledError} when a published group is also cancelled.
 * @throws {DuplicateMidnightGroupCancellationError} when a cancelled group appears more than once.
 * @throws {NonPositiveInputError} when `deadline` is not positive.
 * @throws {NegativeInputError} when a `maxConsumed` ceiling or `nativeAmount` is negative.
 * @throws {InputExceedsMaxError} when a `maxConsumed` ceiling, collateral supply amount, collateral supply sum, or Blue supply amount exceeds `uint128`, `deadline` exceeds `uint256`, or `nativeAmount` exceeds the maximum wNative pull, including zero when no wNative is pulled.
 * @throws {ChainWNativeMissingError} when wNative is not configured for the chain.
 * @throws {NativeAmountOnNonWNativeAssetError} when configured token pulls contain no wNative token.
 * @throws {ChainIdMismatchError} when the collateral market targets another chain.
 * @throws {MidnightMarketAddressMismatchError} when the collateral market targets another Midnight deployment.
 * @throws {UnknownCollateralIndexError} when a collateral index is not configured on the market.
 * @throws {NonPositiveInputError} when a collateral supply amount is non-positive.
 * @throws {NonPositiveInputError} when `blueSupply.assets` is non-positive.
 * @example
 * ```ts
 * import { getChainAddress } from "@morpho-org/morpho-ts";
 * import { maxUint256, type Hex } from "viem";
 * import { midnightCancelAndMake } from "@morpho-org/morpho-sdk";
 *
 * const rateRatifierV1 = getChainAddress(8453, "rateRatifierV1");
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
  const snapshot = snapshotMidnightCancelAndMakeParams(params);
  // Throws on malformed or oversized hex; validation only.
  validateMidnightPublication(snapshot);
  validateDeadline(snapshot.deadline);
  const cancelledGroups = new Set<string>();
  for (const [
    index,
    { group, maxConsumed },
  ] of snapshot.cancellations.entries()) {
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
  const publication = snapshot.publication;
  if (publication == null) {
    if (snapshot.cancellations.length === 0) {
      throw new EmptyMidnightGroupCancellationsError();
    }
  } else {
    if (publication.root === zeroHash) {
      throw new InvalidTreeError("Offer root cannot be zero.");
    }
    if (publication.payload === "0x") {
      throw new InvalidTreeError("Offer payload cannot be empty.");
    }
    if (publication.groups.length === 0) {
      throw new InvalidTreeError("Offer groups cannot be empty.");
    }
    const { priceRatifierV1, rateRatifierV1 } = getChainAddresses(
      snapshot.chainId,
    );
    const supportedTargets = [priceRatifierV1, rateRatifierV1].filter(
      (target): target is Address => target != null,
    );
    if (
      !supportedTargets.some((target) =>
        isAddressEqual(publication.ratifier, target),
      )
    ) {
      throw new UnsupportedMidnightAuthorizationTargetError({
        authorized: publication.ratifier,
        chainId: snapshot.chainId,
        supportedTargets,
      });
    }
    for (const group of publication.groups) {
      if (cancelledGroups.has(group.toLowerCase())) {
        throw new MidnightReplacementGroupCancelledError({ group });
      }
    }
    if (publication.blueSupply != null) {
      if (publication.blueSupply.assets <= 0n) {
        throw new NonPositiveInputError(
          "blueSupply.assets",
          publication.blueSupply.assets,
        );
      }
      validateMidnightUint128Field(
        "blueSupply.assets",
        publication.blueSupply.assets,
      );
    }
    if (publication.collateral != null) {
      if (publication.collateral.supplies.length === 0) {
        throw new EmptyMidnightCollateralSuppliesError();
      }
      validateMidnightMarket({
        market: publication.collateral.market,
        chainId: snapshot.chainId,
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
        validateMidnightUint128Field(
          `collateral.supplies[${index}].assets`,
          assets,
        );
        // Throws UnknownCollateralIndexError when the index is not configured on the market.
        MarketUtils.getCollateralByIndex(
          publication.collateral.market,
          collateralIndex,
        );
      }
      validateMidnightCollateralSupplySums(
        "collateral.supplies",
        publication.collateral.supplies,
      );
    }
  }
  const collateral = publication?.collateral;
  const collateralPulls =
    collateral == null
      ? []
      : collateral.supplies.map(({ collateralIndex, assets }) => ({
          token: MarketUtils.getCollateralByIndex(
            collateral.market,
            collateralIndex,
          ).token,
          assets,
        }));
  const nativeFunding = validateMidnightNativeAmount({
    chainId: snapshot.chainId,
    nativeAmount: snapshot.nativeAmount,
    pulls: [
      ...(publication?.blueSupply != null && publication.blueSupply.assets > 0n
        ? [
            {
              token: publication.blueSupply.market.loanToken,
              assets: publication.blueSupply.assets,
            },
          ]
        : []),
      ...collateralPulls,
    ],
  });
  const cancellations = snapshot.cancellations.map(
    ({ group, maxConsumed }) => ({
      group,
      maxConsumed,
    }),
  );
  const supplies = (publication?.collateral?.supplies ?? []).map(
    ({ collateralIndex, assets }) => ({ collateralIndex, assets }),
  );
  const blueSupply =
    publication?.blueSupply == null
      ? undefined
      : {
          market: {
            loanToken: publication.blueSupply.market.loanToken,
            collateralToken: publication.blueSupply.market.collateralToken,
            oracle: publication.blueSupply.market.oracle,
            irm: publication.blueSupply.market.irm,
            lltv: publication.blueSupply.market.lltv,
          },
          assets: publication.blueSupply.assets,
          callbackSalt: publication.blueSupply.callbackSalt,
        };
  const signature = publication?.rootSignature ?? {
    height: 0n,
    nonce: 0n,
    deadline: 0n,
    v: 0,
    r: zeroHash,
    s: zeroHash,
  };

  let tx = {
    to: getChainAddress(snapshot.chainId, "midnightBundlesV2"),
    value: nativeFunding.value,
    data: encodeFunctionData({
      abi: midnightBundlesV2Abi,
      functionName: "midnightBundlesV2CancelAndMake",
      args: [
        blueSupply?.market ?? emptyBlueMarket, // blueMarket
        blueSupply?.assets ?? 0n, // assetsToPark
        blueSupply?.callbackSalt ?? zeroHash, // callbackSalt
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
        snapshot.deadline, // deadline
        nativeFunding.wrappedNative, // wrappedNative
      ],
    }),
  };
  if (snapshot.metadata) {
    tx = addTransactionMetadata(tx, snapshot.metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "midnightCancelAndMake",
      args: {
        market:
          publication?.collateral == null
            ? zeroHash
            : MarketUtils.toId(publication.collateral.market),
        ratifier: publication?.ratifier ?? zeroAddress,
        root: publication?.root ?? zeroHash,
        groups: [...(publication?.groups ?? [])],
        cancellations,
        collateralSupplies: supplies,
        ...(blueSupply && { blueSupply }),
        deadline: snapshot.deadline,
      },
    },
  });
};
