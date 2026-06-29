import {
  type IOffer,
  MAX_CONTINUOUS_FEE,
  MarketParams,
  MarketUtils,
  OfferUtils,
} from "@morpho-org/midnight-sdk";
import type { MidnightApiTake } from "@morpho-org/midnight-sdk/api";
import { registerCustomAddresses } from "@morpho-org/morpho-ts";
import type { Address, Hex } from "viem";
import { zeroAddress } from "viem";

export const midnightChainId = 30_001_337;

export const midnightAddresses = {
  morpho: "0x0000000000000000000000000000000000000001" as Address,
  permit2: "0x0000000000000000000000000000000000002222" as Address,
  bundler3: "0x0000000000000000000000000000000000000002" as Address,
  generalAdapter1: "0x0000000000000000000000000000000000000003" as Address,
  adaptiveCurveIrm: "0x0000000000000000000000000000000000000004" as Address,
  midnight: "0x0000000000000000000000000000000000001000" as Address,
  midnightBundles: "0x0000000000000000000000000000000000002000" as Address,
  midnightMempool: "0x0000000000000000000000000000000000003000" as Address,
  ecrecoverRatifier: "0x0000000000000000000000000000000000004000" as Address,
  setterRatifier: "0x0000000000000000000000000000000000005000" as Address,
  loanToken: "0x0000000000000000000000000000000000006000" as Address,
  dai: "0x0000000000000000000000000000000000006100" as Address,
  collateralToken: "0x0000000000000000000000000000000000007000" as Address,
  oracle: "0x0000000000000000000000000000000000008000" as Address,
  maker: "0x0000000000000000000000000000000000009000" as Address,
  taker: "0x000000000000000000000000000000000000a000" as Address,
};

registerCustomAddresses({
  addresses: {
    [midnightChainId]: {
      morpho: midnightAddresses.morpho,
      permit2: midnightAddresses.permit2,
      bundler3: {
        bundler3: midnightAddresses.bundler3,
        generalAdapter1: midnightAddresses.generalAdapter1,
      },
      adaptiveCurveIrm: midnightAddresses.adaptiveCurveIrm,
      midnight: midnightAddresses.midnight,
      midnightBundles: midnightAddresses.midnightBundles,
      midnightMempool: midnightAddresses.midnightMempool,
      ecrecoverRatifier: midnightAddresses.ecrecoverRatifier,
      setterRatifier: midnightAddresses.setterRatifier,
      dai: midnightAddresses.dai,
    },
  },
});

export const midnightMarket = new MarketParams({
  loanToken: midnightAddresses.loanToken,
  collateralParams: [
    {
      token: midnightAddresses.collateralToken,
      lltv: 770000000000000000n,
      maxLif: 1061007957559681697n,
      oracle: midnightAddresses.oracle,
    },
  ],
  maturity: 2_000n,
  rcfThreshold: 0n,
  enterGate: zeroAddress,
  liquidatorGate: zeroAddress,
});

export const midnightOtherMarket = new MarketParams({
  loanToken: midnightAddresses.loanToken,
  collateralParams: [
    {
      token: midnightAddresses.collateralToken,
      lltv: 770000000000000000n,
      maxLif: 1061007957559681697n,
      oracle: midnightAddresses.oracle,
    },
  ],
  maturity: 2_001n,
  rcfThreshold: 0n,
  enterGate: zeroAddress,
  liquidatorGate: zeroAddress,
});

export const midnightMarketId = MarketUtils.toId({
  market: midnightMarket,
  chainId: midnightChainId,
});

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
    marketId: MarketUtils.toId({
      market: offer.market,
      chainId: midnightChainId,
    }),
    units: 100n,
    offer,
    ratifierData: "0x1234" as Hex,
  };
};
