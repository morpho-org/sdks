import { ChainId, registerCustomAddresses } from "@morpho-org/morpho-ts";
import type { Address, Hash } from "viem";
import { zeroAddress } from "viem";

import { MAX_CONTINUOUS_FEE } from "../constants.js";
import {
  type IMarket,
  type IMarketParams,
  Market,
  MarketParams,
  MarketUtils,
} from "../market/index.js";
import { type IOffer, Offer } from "../offers/index.js";

export const chainId = ChainId.BaseMainnet;

export const addresses = {
  midnight: "0x0000000000000000000000000000000000001000" as Address,
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

registerCustomAddresses({
  addresses: {
    [chainId]: {
      midnight: addresses.midnight,
      midnightMempool: addresses.midnightMempool,
      ecrecoverRatifier: addresses.ecrecoverRatifier,
      setterRatifier: addresses.setterRatifier,
    },
  },
});

export const group =
  "0x1111111111111111111111111111111111111111111111111111111111111111" as Hash;

export const baseMarketParamsInput = (): IMarketParams => ({
  chainId,
  midnight: addresses.midnight,
  loanToken: addresses.loanToken,
  collateralParams: [
    {
      token: addresses.collateralToken,
      lltv: 770000000000000000n,
      liquidationCursor: 250000000000000000n,
      oracle: addresses.oracle,
    },
  ],
  maturity: 2_000n,
  rcfThreshold: 0n,
  enterGate: "0x0000000000000000000000000000000000000000",
  liquidatorGate: "0x0000000000000000000000000000000000000000",
});

export const baseMarketParams = () => new MarketParams(baseMarketParamsInput());

export const marketId = MarketUtils.toId(baseMarketParamsInput());

export const baseMarketInput = (): IMarket => ({
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

export const baseOfferInput = (overrides: Partial<IOffer> = {}): IOffer => {
  const buy = overrides.buy ?? true;

  return {
    market: overrides.market ?? baseMarketParams(),
    buy,
    maker: overrides.maker ?? addresses.maker,
    start: overrides.start ?? 0n,
    expiry: overrides.expiry ?? 2_100n,
    tick: overrides.tick ?? 5_000n,
    group: overrides.group,
    callback: overrides.callback ?? zeroAddress,
    callbackData: overrides.callbackData ?? "0x",
    receiverIfMakerIsSeller:
      overrides.receiverIfMakerIsSeller ??
      (buy ? zeroAddress : addresses.maker),
    ratifier: overrides.ratifier ?? addresses.ecrecoverRatifier,
    reduceOnly: overrides.reduceOnly ?? false,
    maxUnits: overrides.maxUnits ?? 100n,
    maxAssets: overrides.maxAssets ?? 1_000n,
    continuousFeeCap: overrides.continuousFeeCap ?? MAX_CONTINUOUS_FEE,
  };
};

export const baseOffer = (overrides: Partial<IOffer> = {}) =>
  new Offer(baseOfferInput(overrides));
