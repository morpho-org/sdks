import { concat, type Hash, keccak256 } from "viem";
import { InvalidOfferGroupError } from "../errors.js";
import { type IOffer, type OfferStruct, OfferUtils } from "../offers/index.js";

/**
 * Plain offer group shape accepted by group and tree utilities.
 *
 * @example
 * ```ts
 * import { Offer, type IGroup } from "@morpho-org/midnight-sdk";
 * import { zeroAddress } from "viem";
 *
 * const group: IGroup = {
 *   offers: [
 *     Offer.create({
 *       market: {
 *         chainId: 8453,
 *         midnight: "0x0000000000000000000000000000000000001000",
 *         loanToken: "0x0000000000000000000000000000000000006000",
 *         collateralParams: [
 *           {
 *             token: "0x0000000000000000000000000000000000007000",
 *             lltv: 770000000000000000n,
 *             liquidationCursor: 250000000000000000n,
 *             oracle: "0x0000000000000000000000000000000000008000",
 *           },
 *         ],
 *         maturity: 54_000n,
 *         rcfThreshold: 0n,
 *         enterGate: zeroAddress,
 *         liquidatorGate: zeroAddress,
 *       },
 *       buy: true,
 *       maker: "0x0000000000000000000000000000000000009000",
 *       tick: 5_000n,
 *       group: zeroHash,
 *       expiry: 3_600n,
 *       ratifier: "0x0000000000000000000000000000000000004000",
 *       maxUnits: 100n,
 *     }),
 *   ],
 * };
 * console.log(group.offers.length);
 * ```
 */
export interface IGroup {
  /** Offers in this protocol group. The group id is derived from this list. */
  readonly offers: readonly IOffer[];
}

/**
 * Group object or standalone offer accepted by tree helpers.
 *
 * Use standalone offers for independent consumption groups. Use `Group.create`
 * first when multiple offers from the same maker, side, loan token, cap mode,
 * and cap value should share one consumption group.
 *
 * @example
 * ```ts
 * import { Offer, type GroupInput } from "@morpho-org/midnight-sdk";
 * import { zeroAddress } from "viem";
 *
 * const input: GroupInput = Offer.create({
 *   market: {
 *     chainId: 8453,
 *     midnight: "0x0000000000000000000000000000000000001000",
 *     loanToken: "0x0000000000000000000000000000000000006000",
 *     collateralParams: [
 *       {
 *         token: "0x0000000000000000000000000000000000007000",
 *         lltv: 770000000000000000n,
 *         liquidationCursor: 250000000000000000n,
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
 * console.log(input);
 * ```
 */
export type GroupInput = IGroup | IOffer;

/**
 * Make-side helpers for Midnight offer groups.
 *
 * Groups sit between `Offer.create` and `Tree.create`: they assign a
 * content-addressed group id to offers that share one consumption bucket. One
 * group must use one cap mode and value because Midnight tracks a single
 * consumed scalar per maker and group. Tree helpers derive that id for explicit
 * groups and preserve it on grouped offer copies.
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
   * Returns whether an entry is an explicit group rather than a standalone offer.
   *
   * Plain offer objects can also contain incidental `offers` properties, so the
   * discriminant must reject values that still carry the offer `market` field.
   *
   * @param entry - Group or offer input to inspect.
   * @returns Whether `entry` is an explicit group input.
   * @example
   * ```ts
   * import { GroupUtils, Offer } from "@morpho-org/midnight-sdk";
   *
   * const offer = Offer.from({
   *   market: {
   *     chainId: 8453,
   *     midnight: "0x0000000000000000000000000000000000001000",
   *     loanToken: "0x0000000000000000000000000000000000006000",
   *     collateralParams: [
   *       {
   *         token: "0x0000000000000000000000000000000000007000",
   *         lltv: 770000000000000000n,
   *         liquidationCursor: 250000000000000000n,
   *         oracle: "0x0000000000000000000000000000000000008000",
   *       },
   *     ],
   *     maturity: 54_000n,
   *     rcfThreshold: 0n,
   *     enterGate: "0x0000000000000000000000000000000000000000",
   *     liquidatorGate: "0x0000000000000000000000000000000000000000",
   *   },
   *   buy: true,
   *   maker: "0x0000000000000000000000000000000000009000",
   *   start: 0n,
   *   expiry: 3_600n,
   *   tick: 5_000n,
   *   callback: "0x0000000000000000000000000000000000000000",
   *   callbackData: "0x",
   *   receiverIfMakerIsSeller: "0x0000000000000000000000000000000000000000",
   *   ratifier: "0x0000000000000000000000000000000000004000",
   *   reduceOnly: false,
   *   maxUnits: 100n,
   *   maxAssets: 0n,
   *   continuousFeeCap: 0n,
   * });
   * console.log(GroupUtils.isGroupInput(offer));
   * ```
   */
  export function isGroupInput(entry: GroupInput): entry is IGroup {
    return "offers" in entry && !("market" in entry);
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
   * import { GroupUtils, Offer } from "@morpho-org/midnight-sdk";
   * import { zeroAddress } from "viem";
   *
   * const offer = Offer.create({
   *   market: {
   *     chainId: 8453,
   *     midnight: "0x0000000000000000000000000000000000001000",
   *     loanToken: "0x0000000000000000000000000000000000006000",
   *     collateralParams: [
   *       {
   *         token: "0x0000000000000000000000000000000000007000",
   *         lltv: 770000000000000000n,
   *         liquidationCursor: 250000000000000000n,
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
   * const id = GroupUtils.hash([offer]);
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

    return hashMembers(offerInputs.map((offer) => OfferUtils.groupHash(offer)));
  }

  /**
   * Derives a content-addressed group id from ratifier-specific member hashes.
   *
   * This is the ratifier-agnostic core of {@link hash}: each member hash must
   * commit the offer with `group = 0` under the scheme the offer is ratified
   * with (the protocol offer hash for Ecrecover/Setter, the zero-group leaf
   * hash for `RateRatifierV1`/`PriceRatifierV1`). Hashes are sorted,
   * concatenated, then keccak'd, so member order does not affect the id.
   *
   * @param memberHashes - Zero-group member hashes of one consumption group.
   * @returns Content-addressed group id.
   * @throws {InvalidOfferGroupError} when `memberHashes` is empty.
   * @example
   * ```ts
   * import { GroupUtils, OfferUtils } from "@morpho-org/midnight-sdk";
   *
   * const id = GroupUtils.hashMembers([OfferUtils.groupHash(offer)]);
   * console.log(id);
   * ```
   */
  export function hashMembers(memberHashes: Iterable<Hash>): Hash {
    const hashes = Array.from(memberHashes);
    if (hashes.length === 0) {
      throw new InvalidOfferGroupError(
        "Provide at least one member hash in the group.",
      );
    }

    const sorted = hashes.length > 1 ? [...hashes].sort() : hashes;

    return keccak256(concat(sorted));
  }

  /**
   * Converts a group into ABI-compatible offers carrying the derived group id.
   *
   * Use after `Group.create` for custom encoders that need offer structs with
   * their final group id. The id is derived from the full offer list and
   * applied while encoding, so plain groups cannot drift from offer fields.
   *
   * This helper is encode-only and does not validate protocol group mechanics.
   * Validate with `Group.create` or {@link OfferUtils.validateOfferGroup}
   * before relying on the output for signing, tree roots, or calldata.
   *
   * @param group - Group to encode.
   * @returns ABI-compatible offers in caller order.
   * @throws {InvalidOfferGroupError} when the group has no offers.
   * @example
   * ```ts
   * import { Group, GroupUtils, Offer } from "@morpho-org/midnight-sdk";
   * import { zeroAddress } from "viem";
   *
   * const offer = Offer.create({
   *   market: {
   *     chainId: 8453,
   *     midnight: "0x0000000000000000000000000000000000001000",
   *     loanToken: "0x0000000000000000000000000000000000006000",
   *     collateralParams: [
   *       {
   *         token: "0x0000000000000000000000000000000000007000",
   *         lltv: 770000000000000000n,
   *         liquidationCursor: 250000000000000000n,
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
   * const structs = GroupUtils.toStructs(Group.create([offer]));
   * console.log(structs.length);
   * ```
   */
  export function toStructs(group: IGroup): readonly OfferStruct[] {
    const groupId = hash(group.offers);

    return group.offers.map((offer) =>
      OfferUtils.toStruct({ offer, group: groupId }),
    );
  }
}
