import { zeroAddress } from "viem";
import { InvalidOfferParameterError } from "../errors.js";
import type { IOffer } from "./Offer.js";

/** @internal Rejects a sell offer whose proceeds would go to the zero address. */
export function assertNonzeroSellReceiver(
  offer: Pick<IOffer, "buy" | "receiverIfMakerIsSeller">,
): void {
  if (!offer.buy && offer.receiverIfMakerIsSeller === zeroAddress) {
    throw new InvalidOfferParameterError({
      parameter: "receiverIfMakerIsSeller",
      value: offer.receiverIfMakerIsSeller,
      instruction: "Use a non-zero receiver for sell offers.",
    });
  }
}
