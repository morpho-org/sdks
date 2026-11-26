import { OfferUtils } from "@morpho-org/midnight-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { type Hex, zeroAddress } from "viem";

export const chainId = 1;
export const account = "0x1000000000000000000000000000000000000001";
export const maker = "0x2000000000000000000000000000000000000002";
export const collateral = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
export const deadline = 2000n;
const group =
  "0x1111111111111111111111111111111111111111111111111111111111111111";
export const market = {
  chainId,
  midnight: getChainAddress(chainId, "midnight"),
  loanToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  collateralParams: [
    {
      token: collateral,
      lltv: 770000000000000000n,
      liquidationCursor: 0n,
      oracle: maker,
    },
  ],
  maturity: deadline,
  rcfThreshold: 0n,
  enterGate: zeroAddress,
  liquidatorGate: zeroAddress,
} as const;

/** Creates an ABI-ready offer input for an SDK builder without a quote service. */
export function takeable(buy: boolean) {
  return {
    units: 100n,
    ratifierData: "0x1234" as Hex,
    offer: OfferUtils.toStruct({
      offer: {
        market,
        buy,
        maker,
        start: 0n,
        expiry: deadline,
        tick: 5000n,
        group,
        callback: zeroAddress,
        callbackData: "0x",
        receiverIfMakerIsSeller: buy ? zeroAddress : maker,
        ratifier: getChainAddress(chainId, "ecrecoverRatifier"),
        reduceOnly: false,
        maxUnits: 100n,
        maxAssets: 0n,
        continuousFeeCap: 0n,
      },
    }),
  };
}
