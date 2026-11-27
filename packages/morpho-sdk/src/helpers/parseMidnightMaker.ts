import { Tree, type TreeCreateRequest } from "@morpho-org/midnight-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, type Hex, isAddressEqual, zeroAddress } from "viem";
import {
  DuplicateMidnightGroupCancellationError,
  InvalidBigIntInputError,
  MidnightOfferCallbackDataMismatchError,
  MidnightOfferCallbackMismatchError,
  MidnightOfferContinuousFeeCapError,
  MidnightOfferMakerMismatchError,
  MidnightOfferMarketAddressMismatchError,
  MidnightOfferMarketChainMismatchError,
  MidnightOfferMarketLoanTokenMismatchError,
  MidnightOfferNotReduceOnlyError,
  MidnightOfferRatifierMismatchError,
  MidnightOfferReduceOnlyError,
  MidnightOfferSellerReceiverMismatchError,
  MidnightReplacementGroupCancelledError,
} from "../types/index.js";
import type { MidnightCancelAndMakeParams } from "../types/midnightCancelAndMake.js";
import { wrapMidnightEncoding } from "./encodeMidnightCalldata.js";
import { validateMidnightUint128Field } from "./validateMidnightBounds.js";
import { validateMidnightCancellationGroups } from "./validateMidnightPublication.js";
import { validateOfferSides } from "./validateOfferSides.js";

/** Preserves maker and sell-receiver errors before the upstream tree constructor. @internal */
export const parseMidnightMakerTree = (params: {
  readonly offers:
    | Extract<TreeCreateRequest, { readonly type: "priceV1" }>
    | Extract<TreeCreateRequest, { readonly type: "rateV1" }>
    | Tree<"priceV1">
    | Tree<"rateV1">;
  readonly accountAddress: Address;
}) => {
  const { offers, accountAddress } = params;
  if (offers instanceof Tree) {
    return offers;
  }
  return wrapMidnightEncoding("offers", () => {
    if ("root" in offers && "leaves" in offers) {
      return Tree.from(offers);
    }
    for (const [index, { offer }] of offers.entries.entries()) {
      if (!offer.buy && offer.receiverIfMakerIsSeller === zeroAddress) {
        if (!isAddressEqual(offer.maker, accountAddress)) {
          throw new MidnightOfferMakerMismatchError({
            index,
            expectedMaker: accountAddress,
            actualMaker: offer.maker,
          });
        }
        throw new MidnightOfferSellerReceiverMismatchError({
          index,
          expectedReceiver: offer.maker,
          actualReceiver: offer.receiverIfMakerIsSeller,
        });
      }
    }
    return Tree.from(offers);
  });
};

/** Parses a maker tree once, preserving the opening/exit intent check order. @internal */
export const parseMidnightMakerIntent = (params: {
  readonly offers: Parameters<typeof parseMidnightMakerTree>[0]["offers"];
  readonly accountAddress: Address;
  readonly side: "lend" | "borrow";
  readonly reduceOnly: boolean;
}) => {
  const { side, reduceOnly } = params;
  const tree = parseMidnightMakerTree(params);
  // Reject an exit's wrong side before checking its reduction flags.
  if (reduceOnly) {
    validateOfferSides(tree.offers, side === "lend");
  }
  tree.offers.forEach((offer, index) => {
    if (reduceOnly && !offer.reduceOnly) {
      throw new MidnightOfferNotReduceOnlyError({ index });
    }
    if (!reduceOnly && offer.reduceOnly) {
      throw new MidnightOfferReduceOnlyError({ index });
    }
  });
  return {
    tree,
    reduceOnly,
    accountAddress: params.accountAddress,
  };
};
/** Parses state-independent maker publication bindings before any maker-state read. @internal */
export const parseMidnightMakerBinding = (params: {
  readonly tree: Tree<"priceV1"> | Tree<"rateV1">;
  readonly accountAddress: Address;
  readonly chainId: number;
}) => {
  const { tree, chainId } = params;
  const midnight = getChainAddress(chainId, "midnight");
  tree.offers.forEach((offer, index) => {
    if (!isAddressEqual(offer.maker, params.accountAddress)) {
      throw new MidnightOfferMakerMismatchError({
        index,
        expectedMaker: params.accountAddress,
        actualMaker: offer.maker,
      });
    }
    if (offer.continuousFeeCap !== 0n) {
      throw new MidnightOfferContinuousFeeCapError({
        index,
        continuousFeeCap: offer.continuousFeeCap,
      });
    }
    if (
      !offer.buy &&
      !isAddressEqual(offer.receiverIfMakerIsSeller, offer.maker)
    ) {
      throw new MidnightOfferSellerReceiverMismatchError({
        index,
        expectedReceiver: offer.maker,
        actualReceiver: offer.receiverIfMakerIsSeller,
      });
    }
    const market =
      "params" in offer.market ? offer.market.params : offer.market;
    if (market.chainId !== BigInt(chainId)) {
      throw new MidnightOfferMarketChainMismatchError({
        index,
        expectedChainId: chainId,
        actualChainId: market.chainId,
      });
    }
    if (!isAddressEqual(market.midnight, midnight)) {
      throw new MidnightOfferMarketAddressMismatchError({
        index,
        expectedMidnight: midnight,
        actualMidnight: market.midnight,
      });
    }
  });
  const ratifierType = tree.type;
  const ratifier = getChainAddress(
    chainId,
    ratifierType === "priceV1" ? "priceRatifierV1" : "rateRatifierV1",
  );
  tree.offers.forEach((offer, index) => {
    if (!isAddressEqual(offer.ratifier, ratifier)) {
      throw new MidnightOfferRatifierMismatchError({
        index,
        expectedRatifier: ratifier,
        actualRatifier: offer.ratifier,
      });
    }
  });

  return {
    tree,
    accountAddress: params.accountAddress,
    ratifier,
    ratifierType,
  };
};

/** Parses maker funding relationships without checking chain state or changing their timing. @internal */
export const parseMidnightMakerFundingBinding = (params: {
  readonly tree: Tree<"priceV1"> | Tree<"rateV1">;
  readonly loanToken: Address;
  readonly callback?: { readonly address: Address; readonly data: Hex };
}) => {
  params.tree.offers.forEach((offer, index) => {
    const market =
      "params" in offer.market ? offer.market.params : offer.market;
    if (!isAddressEqual(market.loanToken, params.loanToken)) {
      throw new MidnightOfferMarketLoanTokenMismatchError({
        index,
        expectedLoanToken: params.loanToken,
        actualLoanToken: market.loanToken,
      });
    }
    if (params.callback != null) {
      if (!isAddressEqual(offer.callback, params.callback.address)) {
        throw new MidnightOfferCallbackMismatchError({
          index,
          expectedCallback: params.callback.address,
          actualCallback: offer.callback,
        });
      }
      if (
        offer.callbackData.toLowerCase() !== params.callback.data.toLowerCase()
      ) {
        throw new MidnightOfferCallbackDataMismatchError({
          index,
          expectedCallbackData: params.callback.data,
          actualCallbackData: offer.callbackData,
        });
      }
    }
  });
  return { loanToken: params.loanToken };
};

/**
 * Rejects malformed cancellations before any maker-state read, with the bundle parser's checks
 * and order: group hex, then each ceiling's type, bounds and duplicate, then overlap with the new
 * tree. Used by TransactionPlan maker constructors; entity flows run these checks in the bundle
 * parser.
 *
 * @param params.cancellations - Groups to cancel with their consumption ceilings.
 * @param params.tree - Parsed offer tree whose groups the bundle publishes.
 * @throws {InvalidMidnightHexInputError} when a cancellation group is not 32-byte hex.
 * @throws {InvalidBigIntInputError} when a `maxConsumed` ceiling is not a bigint.
 * @throws {NegativeInputError} when a `maxConsumed` ceiling is negative.
 * @throws {InputExceedsMaxError} when a `maxConsumed` ceiling exceeds uint128.
 * @throws {DuplicateMidnightGroupCancellationError} when a group is cancelled more than once.
 * @throws {MidnightReplacementGroupCancelledError} when a cancelled group is in the new tree.
 * @internal
 */
export const validateMidnightMakerCancellations = (params: {
  readonly cancellations: MidnightCancelAndMakeParams["cancellations"];
  readonly tree: ReturnType<typeof parseMidnightMakerTree>;
}): void => {
  const { cancellations, tree } = params;
  validateMidnightCancellationGroups(cancellations);
  const cancelledGroups = new Set<string>();
  for (const [index, { group, maxConsumed }] of cancellations.entries()) {
    if (typeof maxConsumed !== "bigint") {
      throw new InvalidBigIntInputError(
        `cancellations[${index}].maxConsumed`,
        maxConsumed,
      );
    }
    validateMidnightUint128Field(
      `cancellations[${index}].maxConsumed`,
      maxConsumed,
    );
    const key = group.toLowerCase();
    if (cancelledGroups.has(key)) {
      throw new DuplicateMidnightGroupCancellationError({ index, group });
    }
    cancelledGroups.add(key);
  }
  for (const { group } of tree.offers) {
    if (cancelledGroups.has(group.toLowerCase())) {
      throw new MidnightReplacementGroupCancelledError({ group });
    }
  }
};
