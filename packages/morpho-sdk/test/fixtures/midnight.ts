import {
  type IOffer,
  MAX_CONTINUOUS_FEE,
  MarketParams,
  MarketUtils,
  OfferUtils,
} from "@morpho-org/midnight-sdk";
import type { MidnightApiTake } from "@morpho-org/midnight-sdk/api";
import { ChainId, getChainAddress } from "@morpho-org/morpho-ts";
import type { Address, Hex } from "viem";
import { zeroAddress } from "viem";

export const midnightChainId = ChainId.BaseMainnet;
export const midnightLiquidationCursor = 250000000000000000n;

export const midnightAddresses = {
  midnight: getChainAddress(midnightChainId, "midnight"),
  midnightBundles: getChainAddress(midnightChainId, "midnightBundles"),
  midnightMempool: getChainAddress(midnightChainId, "midnightMempool"),
  ecrecoverRatifier: getChainAddress(midnightChainId, "ecrecoverRatifier"),
  setterRatifier: getChainAddress(midnightChainId, "setterRatifier"),
  loanToken: "0x0000000000000000000000000000000000006000" as Address,
  dai: "0x0000000000000000000000000000000000006100" as Address,
  collateralToken: "0x0000000000000000000000000000000000007000" as Address,
  oracle: "0x0000000000000000000000000000000000008000" as Address,
  maker: "0x0000000000000000000000000000000000009000" as Address,
  taker: "0x000000000000000000000000000000000000A000" as Address,
};

export const midnightMarket = new MarketParams({
  chainId: midnightChainId,
  midnight: midnightAddresses.midnight,
  loanToken: midnightAddresses.loanToken,
  collateralParams: [
    {
      token: midnightAddresses.collateralToken,
      lltv: 770000000000000000n,
      liquidationCursor: midnightLiquidationCursor,
      oracle: midnightAddresses.oracle,
    },
  ],
  maturity: 2_000n,
  rcfThreshold: 0n,
  enterGate: zeroAddress,
  liquidatorGate: zeroAddress,
});

export const midnightOtherMarket = new MarketParams({
  chainId: midnightChainId,
  midnight: midnightAddresses.midnight,
  loanToken: midnightAddresses.loanToken,
  collateralParams: [
    {
      token: midnightAddresses.collateralToken,
      lltv: 770000000000000000n,
      liquidationCursor: midnightLiquidationCursor,
      oracle: midnightAddresses.oracle,
    },
  ],
  maturity: 2_001n,
  rcfThreshold: 0n,
  enterGate: zeroAddress,
  liquidatorGate: zeroAddress,
});

export const midnightMarketId = MarketUtils.toId(midnightMarket);

export const midnightBaseOffer = (overrides: Partial<IOffer> = {}): IOffer => ({
  market: overrides.market ?? midnightMarket,
  buy: overrides.buy ?? false,
  maker: overrides.maker ?? midnightAddresses.maker,
  start: overrides.start ?? 0n,
  expiry: overrides.expiry ?? 2_100n,
  tick: overrides.tick ?? 5_000n,
  group: overrides.group,
  callback: overrides.callback ?? zeroAddress,
  callbackData: overrides.callbackData ?? "0x",
  receiverIfMakerIsSeller:
    overrides.receiverIfMakerIsSeller ??
    (overrides.buy ? zeroAddress : midnightAddresses.maker),
  ratifier: overrides.ratifier ?? midnightAddresses.ecrecoverRatifier,
  reduceOnly: overrides.reduceOnly ?? false,
  maxUnits: overrides.maxUnits ?? 100n,
  maxAssets: overrides.maxAssets ?? 0n,
  continuousFeeCap: overrides.continuousFeeCap ?? MAX_CONTINUOUS_FEE,
});

export const midnightApiTake = (
  overrides: Partial<IOffer> = {},
): MidnightApiTake => {
  const offer = OfferUtils.toStruct({ offer: midnightBaseOffer(overrides) });

  return {
    marketId: MarketUtils.toId(offer.market),
    units: 100n,
    offer,
    ratifierData: "0x1234" as Hex,
  };
};
