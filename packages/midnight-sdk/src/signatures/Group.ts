import type { Hash } from "viem";
import { type IOffer, Offer, OfferUtils } from "../offers/index.js";
import { type GroupInput, GroupUtils, type IGroup } from "./GroupUtils.js";

/**
 * Protocol offer group with one shared consumption group id.
 *
 * Create a group after building related offers and before building the tree to
 * publish. Offers inside one group must share maker, side, and loan token. The
 * constructor hashes every offer to derive the group id, then copies each offer
 * with that id. Offers inside one group must also share cap mode and value
 * because Midnight tracks one consumed scalar per maker and group; group
 * creation is resource-intensive compared to offer construction.
 *
 * @example
 * ```ts
 * import { Group, Offer } from "@morpho-org/midnight-sdk";
 * import { zeroAddress } from "viem";
 *
 * const offer = Offer.create({
 *   market: {
 *     loanToken: "0x0000000000000000000000000000000000006000",
 *     collateralParams: [
 *       {
 *         token: "0x0000000000000000000000000000000000007000",
 *         lltv: 770000000000000000n,
 *         maxLif: 1061007957559681697n,
 *         oracle: "0x0000000000000000000000000000000000008000",
 *       },
 *     ],
 *     maturity: 54_000n,
 *     rcfThreshold: 0n,
 *     enterGate: zeroAddress,
 *     liquidatorGate: zeroAddress,
 *   },
 *   buy: true,
 *   maker: "0x0000000000000000000000000000000000009000",
 *   tick: 5_000n,
 *   expiry: 3_600n,
 *   ratifier: "0x0000000000000000000000000000000000004000",
 *   maxUnits: 100n,
 * });
 * const group = Group.create([offer]);
 * console.log(group.offers.length);
 * ```
 */
export class Group implements IGroup {
  private readonly _offers: readonly Offer[];

  /** Content-addressed group id. */
  public readonly id: Hash;

  private constructor(offers: Iterable<IOffer>) {
    const validatedOffers = OfferUtils.validateOfferGroup({ offers });
    this.id = GroupUtils.hash(validatedOffers);
    this._offers = validatedOffers.map(
      (offer) => new Offer({ ...offer, group: this.id }),
    );
  }

  /**
   * Offers in this protocol group.
   *
   * Returns a fresh array so callers cannot mutate the group's offer list.
   *
   * @returns Offers in caller order.
   * @example
   * ```ts
   * import { Group, Offer } from "@morpho-org/midnight-sdk";
   * import { zeroAddress } from "viem";
   *
   * const offer = Offer.create({
   *   market: {
   *     loanToken: "0x0000000000000000000000000000000000006000",
   *     collateralParams: [
   *       {
   *         token: "0x0000000000000000000000000000000000007000",
   *         lltv: 770000000000000000n,
   *         maxLif: 1061007957559681697n,
   *         oracle: "0x0000000000000000000000000000000000008000",
   *       },
   *     ],
   *     maturity: 54_000n,
   *     rcfThreshold: 0n,
   *     enterGate: zeroAddress,
   *     liquidatorGate: zeroAddress,
   *   },
   *   buy: true,
   *   maker: "0x0000000000000000000000000000000000009000",
   *   tick: 5_000n,
   *   expiry: 3_600n,
   *   ratifier: "0x0000000000000000000000000000000000004000",
   *   maxUnits: 100n,
   * });
   * const group = Group.create([offer]);
   * console.log(group.offers.length);
   * ```
   */
  public get offers(): readonly Offer[] {
    return [...this._offers];
  }

  /**
   * Returns a group instance from group or standalone offer input.
   *
   * Use at boundaries that accept either a prebuilt `Group`, a plain `IGroup`,
   * or a standalone offer that should form its own group. Existing `Group`
   * instances are returned as-is.
   *
   * @param entry - Group object or standalone offer.
   * @returns Group instance.
   * @throws {InvalidOfferGroupError} when group mechanics are invalid.
   * @example
   * ```ts
   * import { Group, Offer } from "@morpho-org/midnight-sdk";
   * import { zeroAddress } from "viem";
   *
   * const offer = Offer.create({
   *   market: {
   *     loanToken: "0x0000000000000000000000000000000000006000",
   *     collateralParams: [
   *       {
   *         token: "0x0000000000000000000000000000000000007000",
   *         lltv: 770000000000000000n,
   *         maxLif: 1061007957559681697n,
   *         oracle: "0x0000000000000000000000000000000000008000",
   *       },
   *     ],
   *     maturity: 54_000n,
   *     rcfThreshold: 0n,
   *     enterGate: zeroAddress,
   *     liquidatorGate: zeroAddress,
   *   },
   *   buy: true,
   *   maker: "0x0000000000000000000000000000000000009000",
   *   tick: 5_000n,
   *   expiry: 3_600n,
   *   ratifier: "0x0000000000000000000000000000000000004000",
   *   maxUnits: 100n,
   * });
   * const group = Group.from(offer);
   * console.log(group.offers.length);
   * ```
   */
  public static from(entry: GroupInput): Group {
    return entry instanceof Group
      ? entry
      : new Group("offers" in entry ? entry.offers : [entry]);
  }

  /**
   * Creates a protocol-valid offer group.
   *
   * Use after `Offer.create` for laddered offers with the same cap mode and
   * value that should consume from one group id. Pass the returned group into
   * `Tree.create` alongside other groups or standalone offers. This hashes every
   * offer and copies the validated offers into group-owned instances, so it is
   * resource-intensive and should be done once per group definition.
   *
   * @param offers - Iterable of offers to group.
   * @returns Group instance.
   * @throws {InvalidOfferGroupError} when group mechanics are invalid.
   * @example
   * ```ts
   * import { Group, Offer } from "@morpho-org/midnight-sdk";
   * import { zeroAddress } from "viem";
   *
   * const offer = Offer.create({
   *   market: {
   *     loanToken: "0x0000000000000000000000000000000000006000",
   *     collateralParams: [
   *       {
   *         token: "0x0000000000000000000000000000000000007000",
   *         lltv: 770000000000000000n,
   *         maxLif: 1061007957559681697n,
   *         oracle: "0x0000000000000000000000000000000000008000",
   *       },
   *     ],
   *     maturity: 54_000n,
   *     rcfThreshold: 0n,
   *     enterGate: zeroAddress,
   *     liquidatorGate: zeroAddress,
   *   },
   *   buy: true,
   *   maker: "0x0000000000000000000000000000000000009000",
   *   tick: 5_000n,
   *   expiry: 3_600n,
   *   ratifier: "0x0000000000000000000000000000000000004000",
   *   maxUnits: 100n,
   * });
   * const group = Group.create([offer]);
   * console.log(group.offers.length);
   * ```
   */
  public static create(offers: Iterable<IOffer>): Group {
    return new Group(offers);
  }
}
