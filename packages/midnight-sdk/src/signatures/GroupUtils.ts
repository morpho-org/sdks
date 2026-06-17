import { concat, type Hash, keccak256, zeroHash } from "viem";
import { InvalidOfferGroupError } from "../errors.js";
import { type IOffer, type OfferStruct, OfferUtils } from "../offers/index.js";

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
  /** Offers in this protocol group. */
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
 * helpers also accept standalone offers and normalize them into one-offer
 * groups.
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
   * Use when accepting mixed tree inputs. `Tree.create` and `TreeUtils`
   * call this internally so callers can pass either explicit groups or
   * standalone offers.
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
    return {
      offers,
      id: hash(offers),
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
  export function hash(offers: readonly IOffer[]): Hash {
    if (offers.length === 0) {
      throw new InvalidOfferGroupError(
        "Provide at least one offer in the group.",
      );
    }

    const offerHashes = offers.map((offer) =>
      OfferUtils.hash({ offer, group: zeroHash }),
    );
    const sorted =
      offerHashes.length > 1 ? [...offerHashes].sort() : offerHashes;

    return keccak256(concat(sorted));
  }

  /**
   * Converts a group into ABI-compatible offers carrying the group id.
   *
   * Use after `Group.create` and before Merkle tree descriptor construction,
   * payload encoding, or any custom encoder that needs offer structs with their
   * final group id.
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
    return group.offers.map((offer) =>
      OfferUtils.toStruct({ offer, group: group.id }),
    );
  }
}
