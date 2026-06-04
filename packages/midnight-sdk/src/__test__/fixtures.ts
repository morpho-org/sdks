import type { Address, Hex } from "viem";

import {
  type IMarket,
  type IMarketParams,
  Market,
  MarketParams,
} from "../market/index.js";
import { type IOffer, Offer } from "../offers/index.js";

export const addresses = {
  midnight: "0x0000000000000000000000000000000000001000" as Address,
  midnightBundles: "0x0000000000000000000000000000000000002000" as Address,
  midnightMempool: "0x0000000000000000000000000000000000003000" as Address,
  ecrecoverRatifier: "0x0000000000000000000000000000000000004000" as Address,
  setterRatifier: "0x0000000000000000000000000000000000005000" as Address,
  loanToken: "0x0000000000000000000000000000000000006000" as Address,
  collateralToken: "0x0000000000000000000000000000000000007000" as Address,
  oracle: "0x0000000000000000000000000000000000008000" as Address,
  maker: "0x0000000000000000000000000000000000009000" as Address,
  taker: "0x000000000000000000000000000000000000A000" as Address,
  receiver: "0x000000000000000000000000000000000000b000" as Address,
  callback: "0x000000000000000000000000000000000000c000" as Address,
};

export const group =
  "0x1111111111111111111111111111111111111111111111111111111111111111" as Hex;

export const marketId =
  "0x2222222222222222222222222222222222222222222222222222222222222222" as Hex;

export const baseMarketParamsInput = (): IMarketParams => ({
  loanToken: addresses.loanToken,
  collateralParams: [
    {
      token: addresses.collateralToken,
      lltv: 770000000000000000n,
      maxLif: 1298701298701298701n,
      oracle: addresses.oracle,
    },
  ],
  maturity: 2_000n,
  rcfThreshold: 0n,
  enterGate: "0x0000000000000000000000000000000000000000",
  liquidatorGate: "0x0000000000000000000000000000000000000000",
});

export const baseMarketParams = () => new MarketParams(baseMarketParamsInput());

export const baseMarketInput = (): IMarket => ({
  id: marketId,
  params: baseMarketParams(),
  totalUnits: 1_000n,
  lossFactor: 0n,
  withdrawable: 500n,
  continuousFeeCredit: 0n,
  settlementFeeCbps: [1, 2, 3, 4, 5, 6, 7],
  continuousFee: 10,
  tickSpacing: 4,
});

export const baseMarket = () => new Market(baseMarketInput());

export const baseOfferInput = (overrides: Partial<IOffer> = {}): IOffer => ({
  market: overrides.market ?? baseMarketParams(),
  buy: overrides.buy ?? true,
  maker: overrides.maker ?? addresses.maker,
  start: overrides.start ?? 0n,
  expiry: overrides.expiry ?? 2_100n,
  tick: overrides.tick ?? 5_000n,
  group: overrides.group ?? group,
  callback: overrides.callback ?? "0x0000000000000000000000000000000000000000",
  callbackData: overrides.callbackData ?? "0x",
  receiverIfMakerIsSeller: overrides.receiverIfMakerIsSeller ?? addresses.maker,
  ratifier: overrides.ratifier ?? addresses.ecrecoverRatifier,
  reduceOnly: overrides.reduceOnly ?? false,
  maxUnits: overrides.maxUnits ?? 100n,
  maxAssets: overrides.maxAssets ?? 1_000n,
});

export const baseOffer = (overrides: Partial<IOffer> = {}) =>
  new Offer(baseOfferInput(overrides));
