import { MarketConfig } from "@morpho-org/blue-sdk";
import { Address } from "viem";
import { fetchMarketConfig } from "../fetch";

declare module "@morpho-org/blue-sdk" {
  namespace MarketConfig {
    let fetch: typeof fetchMarketConfig;
  }

  interface MarketConfig {
    asViem(): {
      loanToken: Address;
      collateralToken: Address;
      oracle: Address;
      irm: Address;
      lltv: bigint;
    };
  }
}

MarketConfig.fetch = fetchMarketConfig;
MarketConfig.prototype.asViem = function () {
  return this as {
    loanToken: Address;
    collateralToken: Address;
    oracle: Address;
    irm: Address;
    lltv: bigint;
  };
};

export { MarketConfig };
