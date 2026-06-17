import type { Hash } from "viem";
import { type IOffer, type Offer, OfferUtils } from "../offers/index.js";
import { GroupUtils, type IGroup } from "./GroupUtils.js";

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
export class Group implements IGroup {
  private readonly _offers: readonly Offer[];

  private constructor(offers: readonly Offer[]) {
    this._offers = [...offers];
  }

  /**
   * Offers in this protocol group.
   *
   * Returns a fresh array so callers cannot mutate the group's offer list.
   *
   * @returns Offers in caller order.
   * @example
   * ```ts
   * import { Group } from "@morpho-org/midnight-sdk";
   *
   * const group = Group.create([{} as never]);
   * console.log(group.offers.length);
   * ```
   */
  public get offers(): readonly Offer[] {
    return [...this._offers];
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
    return GroupUtils.hash(this._offers);
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

    return new Group(validatedOffers);
  }
}
