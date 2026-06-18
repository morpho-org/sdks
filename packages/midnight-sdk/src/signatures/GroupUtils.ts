import { concat, type Hash, keccak256 } from "viem";
import { InvalidOfferGroupError } from "../errors.js";
import {
  type IOffer,
  Offer,
  type OfferStruct,
  OfferUtils,
} from "../offers/index.js";

/**
 * Plain offer group shape accepted by group and tree utilities.
 *
 * @example
 * ```ts
 * import type { IGroup } from "@morpho-org/midnight-sdk";
 *
 * const group = {} as IGroup;
 * console.log(group.offers.length);
 * ```
 */
export interface IGroup {
  /** Offers in this protocol group, each carrying this group's id. */
  readonly offers: readonly IOffer[];
  /** Protocol group id encoded into each offer. */
  readonly id: Hash;
}

/**
 * Group object or standalone offer accepted by tree helpers.
 *
 * Use standalone offers for independent consumption groups. Use `Group.create`
 * first when multiple offers from the same maker, side, and loan token should
 * share one consumption group.
 *
 * @example
 * ```ts
 * import type { GroupInput } from "@morpho-org/midnight-sdk";
 *
 * const input = {} as GroupInput;
 * console.log(input);
 * ```
 */
export type GroupInput = IGroup | IOffer;

/**
 * Make-side helpers for Midnight offer groups.
 *
 * Groups sit between `Offer.create` and `Tree.create`: they assign a
 * content-addressed group id to offers that share one consumption bucket. Tree
 * helpers read the group id already stored on each offer.
 *
 * @example
 * ```ts
 * import { GroupUtils } from "@morpho-org/midnight-sdk";
 *
 * console.log(typeof GroupUtils.hash);
 * ```
 */
export namespace GroupUtils {
  /**
   * Returns a group object from group or standalone offer input.
   *
   * Use at compatibility boundaries that still need an `IGroup` shape from a
   * standalone offer. Tree helpers now read group ids directly from offers.
   *
   * @param entry - Group object or standalone offer.
   * @returns Group object.
   * @example
   * ```ts
   * import { GroupUtils } from "@morpho-org/midnight-sdk";
   *
   * const group = GroupUtils.normalize({} as never);
   * console.log(group.offers.length);
   * ```
   */
  export function normalize(entry: GroupInput): IGroup {
    if ("offers" in entry) return entry;

    const offers = OfferUtils.validateOfferGroup({ offers: [entry] });
    const id = hash(offers);
    return {
      offers: offers.map((offer) => new Offer({ ...offer, group: id })),
      id,
    };
  }

  /**
   * Derives the deterministic content-addressed id for a group of offers.
   *
   * This mirrors the router implementation: hash each offer with `group = 0`,
   * sort those hashes, concatenate them, then keccak the result.
   *
   * @param offers - Offers to hash as one group.
   * @returns Content-addressed group id.
   * @throws {InvalidOfferGroupError} when `offers` is empty.
   * @example
   * ```ts
   * import { GroupUtils } from "@morpho-org/midnight-sdk";
   *
   * const id = GroupUtils.hash([{} as never]);
   * console.log(id);
   * ```
   */
  export function hash(offers: Iterable<IOffer>): Hash {
    const offerInputs = Array.from(offers);
    if (offerInputs.length === 0) {
      throw new InvalidOfferGroupError(
        "Provide at least one offer in the group.",
      );
    }

    const offerHashes = offerInputs.map((offer) => OfferUtils.hash(offer));
    const sorted =
      offerHashes.length > 1 ? [...offerHashes].sort() : offerHashes;

    return keccak256(concat(sorted));
  }

  /**
   * Converts a group into ABI-compatible offers carrying the group id.
   *
   * Use after `Group.create` for custom encoders that need offer structs with
   * their final group id. Tree and payload helpers read the group id directly
   * from each offer.
   *
   * @param group - Group to encode.
   * @returns ABI-compatible offers in caller order.
   * @example
   * ```ts
   * import { GroupUtils } from "@morpho-org/midnight-sdk";
   *
   * const structs = GroupUtils.toStructs({} as never);
   * console.log(structs.length);
   * ```
   */
  export function toStructs(group: IGroup): readonly OfferStruct[] {
    return group.offers.map((offer) => OfferUtils.toStruct({ offer }));
  }
}
