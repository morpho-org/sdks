import { InvalidTreeError } from "@morpho-org/midnight-sdk";
import { getChainAddresses } from "@morpho-org/morpho-ts";
import { type Address, isAddressEqual, zeroAddress, zeroHash } from "viem";
import {
  EmptyMidnightCollateralSuppliesError,
  MidnightReplacementGroupCancelledError,
  UnsupportedMidnightAuthorizationTargetError,
} from "../types/index.js";
import type { MidnightCancelAndMakeParams } from "../types/midnightCancelAndMake.js";
import { validateMidnightAddress } from "./validateMidnightAccount.js";
import { validateMidnightUint128Field } from "./validateMidnightBounds.js";
import { validateMidnightCollateralSupplies } from "./validateMidnightCollateralSupplies.js";
import { validateMidnightMarket } from "./validateMidnightMarket.js";
import { validatePositiveInput } from "./validatePositiveInput.js";

/** Blue market argument for `MidnightBundlesV2` calls that park no loan assets. */
const emptyBlueMarket = {
  loanToken: zeroAddress,
  collateralToken: zeroAddress,
  oracle: zeroAddress,
  irm: zeroAddress,
  lltv: 0n,
} as const;

/**
 * Validates publication content after snapshot and hex-shape validation.
 *
 * @param params - Publication, chain deployment, and groups cancelled by this bundle.
 * @returns Nothing when publication content and funding inputs are valid.
 * @throws {InvalidTreeError} when the root is zero, payload empty, or groups empty.
 * @throws {UnsupportedChainIdError} when the chain is absent from the registry.
 * @throws {MidnightCalldataEncodingError} when the ratifier or collateral market address is malformed.
 * @throws {UnsupportedMidnightAuthorizationTargetError} when the ratifier is not supported.
 * @throws {MidnightReplacementGroupCancelledError} when a published group is cancelled.
 * @throws {NonPositiveInputError} when Blue funding or a collateral supply is not positive.
 * @throws {InputExceedsMaxError} when funding or collateral supply totals exceed uint128.
 * @throws {EmptyMidnightCollateralSuppliesError} when collateral supplies are empty.
 * @throws {ChainIdMismatchError} when the collateral market targets another chain.
 * @throws {MidnightMarketAddressMismatchError} when its Midnight deployment differs.
 * @throws {UnknownCollateralIndexError} when a supply index is not configured.
 * @internal
 */
export const validateMidnightCancelAndMakePublication = ({
  publication,
  chainId,
  cancelledGroups,
}: {
  readonly publication: NonNullable<MidnightCancelAndMakeParams["publication"]>;
  readonly chainId: number;
  readonly cancelledGroups: ReadonlySet<string>;
}): void => {
  if (publication.root === zeroHash) {
    throw new InvalidTreeError("Offer root cannot be zero.");
  }
  if (publication.payload === "0x") {
    throw new InvalidTreeError("Offer payload cannot be empty.");
  }
  if (publication.groups.length === 0) {
    throw new InvalidTreeError("Offer groups cannot be empty.");
  }
  const { priceRatifierV1, rateRatifierV1 } = getChainAddresses(chainId);
  const supportedTargets = [priceRatifierV1, rateRatifierV1].filter(
    (target): target is Address => target != null,
  );
  validateMidnightAddress("publication.ratifier", publication.ratifier);
  if (
    !supportedTargets.some((target) =>
      isAddressEqual(publication.ratifier, target),
    )
  ) {
    throw new UnsupportedMidnightAuthorizationTargetError({
      authorized: publication.ratifier,
      chainId,
      supportedTargets,
    });
  }
  for (const group of publication.groups) {
    if (cancelledGroups.has(group.toLowerCase())) {
      throw new MidnightReplacementGroupCancelledError({ group });
    }
  }
  if (publication.blueSupply != null) {
    // Validation only; rejects non-positive Blue supply amounts.
    validatePositiveInput("blueSupply.assets", publication.blueSupply.assets);
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
      chainId,
    });
    // Validation only; checks supply entries and their per-index totals.
    validateMidnightCollateralSupplies({
      market: publication.collateral.market,
      field: "collateral.supplies",
      supplies: publication.collateral.supplies,
    });
  }
};

/**
 * Copies validated publication fields and supplies zero ABI defaults for omitted steps.
 *
 * @param publication - Snapshotted publication, or undefined for cancellation only.
 * @returns ABI defaults and copied publication fields, without mutating the input.
 * @internal
 */
export const normalizeMidnightCancelAndMakePublication = (
  publication: MidnightCancelAndMakeParams["publication"],
) => {
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
  return {
    supplies,
    blueSupply,
    signature,
    blueMarket: blueSupply?.market ?? emptyBlueMarket,
    assetsToPark: blueSupply?.assets ?? 0n,
    callbackSalt: blueSupply?.callbackSalt ?? zeroHash,
    ratifier: publication?.ratifier ?? zeroAddress,
    root: publication?.root ?? zeroHash,
    groups: [...(publication?.groups ?? [])],
    payload: publication?.payload ?? "0x",
  };
};
