import { concat, type Hash, keccak256, zeroHash } from "viem";
import { InvalidOfferGroupError } from "../errors.js";
import {
  type IOffer,
  type Offer,
  type OfferStruct,
  OfferUtils,
} from "../offers/index.js";

const comparableHex = (value: string) => value.toLowerCase();

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
 * Parameters for {@link GroupUtils.validateForApiPublication}.
 *
 * @example
 * ```ts
 * import type { ValidateGroupForApiPublicationParams } from "@morpho-org/midnight-sdk";
 *
 * const params = {} as ValidateGroupForApiPublicationParams;
 * console.log(params.group.id);
 * ```
 */
export interface ValidateGroupForApiPublicationParams {
  /** Group to validate before publishing through the public API. */
  readonly group: IGroup;
}

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

  /**
   * Validates the public API publication rules known locally.
   *
   * This helper intentionally stays narrow: changing public policy should be
   * surfaced by `MidnightApi.validateMempoolTree` when possible.
   *
   * Use this before including a multi-offer group in a public mempool tree when
   * you want local feedback before calling `MidnightApi.validateMempoolTree`.
   * The API validation endpoint remains the final policy check before signing
   * or approving a tree.
   *
   * @param params - Group validation parameters.
   * @returns Offers in the same order as the group.
   * @throws {InvalidOfferGroupError} when the group cannot be published through the public API.
   * @example
   * ```ts
   * import { GroupUtils } from "@morpho-org/midnight-sdk";
   *
   * const offers = GroupUtils.validateForApiPublication({ group: {} as never });
   * console.log(offers.length);
   * ```
   */
  export function validateForApiPublication(
    params: ValidateGroupForApiPublicationParams,
  ): readonly Offer[] {
    const offers = OfferUtils.validateOfferGroup({
      offers: params.group.offers,
    });
    const expectedGroup = comparableHex(hash(offers));
    const expectedCallback = comparableHex(offers[0]!.callback);
    const expectedCallbackData = comparableHex(offers[0]!.callbackData);

    if (comparableHex(params.group.id) !== expectedGroup) {
      throw new InvalidOfferGroupError(
        "API-published groups must use the content-addressed group id.",
      );
    }

    for (const offer of offers) {
      if (
        comparableHex(offer.callback) !== expectedCallback ||
        comparableHex(offer.callbackData) !== expectedCallbackData
      ) {
        throw new InvalidOfferGroupError(
          "All offers in an API-published group must use the same callback address and data.",
        );
      }
    }

    return offers;
  }
}

/**
 * Protocol offer group with one shared consumption group id.
 *
 * Create a group after building related offers and before building the tree to
 * publish. Offers inside one group must share maker, side, and loan token.
 *
 * @example
 * ```ts
 * import { Group } from "@morpho-org/midnight-sdk";
 *
 * const group = Group.create([{} as never]);
 * console.log(group.offers.length);
 * ```
 */
export class Group {
  /** Offers in this protocol group. */
  public readonly offers: readonly Offer[];

  private readonly _id: Hash;

  private constructor(id: Hash, offers: readonly Offer[]) {
    this._id = id;
    this.offers = [...offers];
  }

  /**
   * Content-addressed group id.
   *
   * @returns Group id derived from the group's offers.
   * @example
   * ```ts
   * import { Group } from "@morpho-org/midnight-sdk";
   *
   * const group = Group.create([{} as never]);
   * console.log(group.id);
   * ```
   */
  public get id(): Hash {
    return this._id;
  }

  /**
   * Creates a protocol-valid offer group.
   *
   * Use after `Offer.create` for laddered offers that should consume from one
   * group id. Pass the returned group into `Tree.create` alongside other groups
   * or standalone offers.
   *
   * @param offers - Offers to group.
   * @returns Group instance.
   * @throws {InvalidOfferGroupError} when group mechanics are invalid.
   * @example
   * ```ts
   * import { Group } from "@morpho-org/midnight-sdk";
   *
   * const group = Group.create([{} as never]);
   * console.log(group.offers.length);
   * ```
   */
  public static create(offers: readonly IOffer[]): Group {
    const validatedOffers = OfferUtils.validateOfferGroup({ offers });

    return new Group(GroupUtils.hash(validatedOffers), validatedOffers);
  }
}
