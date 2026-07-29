import { zeroAddress, zeroHash } from "viem";
import { type OfferStruct, OfferUtils } from "../offers/index.js";

/** @internal Empty protocol offer struct used for Merkle padding. */
export const EMPTY_OFFER_STRUCT: OfferStruct = {
  market: {
    chainId: 0n,
    midnight: zeroAddress,
    loanToken: zeroAddress,
    collateralParams: [],
    maturity: 0n,
    rcfThreshold: 0n,
    enterGate: zeroAddress,
    liquidatorGate: zeroAddress,
  },
  buy: false,
  maker: zeroAddress,
  start: 0n,
  expiry: 0n,
  tick: 0n,
  group: zeroHash,
  callback: zeroAddress,
  callbackData: "0x",
  receiverIfMakerIsSeller: zeroAddress,
  ratifier: zeroAddress,
  reduceOnly: false,
  maxUnits: 0n,
  maxAssets: 0n,
  continuousFeeCap: 0n,
};

const EMPTY_OFFER_DEFAULT_GROUP = OfferUtils.hashStruct(EMPTY_OFFER_STRUCT);

/** @internal Returns whether an address value is the zero address. */
export function isZeroAddress(value: string): boolean {
  return value.toLowerCase() === zeroAddress;
}

/**
 * @internal Returns whether an offer struct is the protocol empty offer.
 *
 * Tree padding may carry the empty offer's derived default group, while payload
 * decoding only treats the canonical zero-group empty struct as padding.
 */
export function isEmptyOfferStruct(
  offer: OfferStruct,
  options: { readonly allowDefaultGroup?: boolean } = {},
): boolean {
  const hasEmptyGroup =
    offer.group === zeroHash ||
    (options.allowDefaultGroup === true &&
      offer.group === EMPTY_OFFER_DEFAULT_GROUP);

  return (
    offer.market.chainId === 0n &&
    isZeroAddress(offer.market.midnight) &&
    isZeroAddress(offer.market.loanToken) &&
    offer.market.collateralParams.length === 0 &&
    offer.market.maturity === 0n &&
    offer.market.rcfThreshold === 0n &&
    isZeroAddress(offer.market.enterGate) &&
    isZeroAddress(offer.market.liquidatorGate) &&
    offer.buy === false &&
    isZeroAddress(offer.maker) &&
    offer.start === 0n &&
    offer.expiry === 0n &&
    offer.tick === 0n &&
    hasEmptyGroup &&
    isZeroAddress(offer.callback) &&
    offer.callbackData === "0x" &&
    isZeroAddress(offer.receiverIfMakerIsSeller) &&
    isZeroAddress(offer.ratifier) &&
    offer.reduceOnly === false &&
    offer.maxUnits === 0n &&
    offer.maxAssets === 0n &&
    offer.continuousFeeCap === 0n
  );
}
