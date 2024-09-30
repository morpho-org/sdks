import {
  Address,
  ChainAddresses,
  ChainId,
  addresses,
} from "@morpho-org/blue-sdk";

declare module "@morpho-org/blue-sdk" {
  interface ChainAddresses {
    timeBoundedUrd?: Address;
    marketRewardsProgramRegistry?: Address;

    weEth?: Address;
    ezEth?: Address;
    rsEth?: Address;
    usdE?: Address;
    sUsdE?: Address;
    usd0?: Address;
    "usd0++"?: Address;
    "usd0usd0++"?: Address;
    verUsdc?: Address;
    rsweth?: Address;
    bsdEth?: Address;
    re7Weth?: Address;
    "PT-USDe-25JUL2024"?: Address;
    "PT-ezETH-26DEC2024"?: Address;
    "PT-sUSDE-24OCT2024"?: Address;
    "PT-weETH-26DEC2024"?: Address;
    "PT-weETH-27JUN2024"?: Address;
  }
}

export const mainnetAddresses = addresses[ChainId.EthMainnet] as ChainAddresses;
export const baseAddresses = addresses[ChainId.BaseMainnet] as ChainAddresses;

mainnetAddresses["PT-USDe-25JUL2024"] =
  "0xa0021EF8970104c2d008F38D92f115ad56a9B8e1";
mainnetAddresses["PT-ezETH-26DEC2024"] =
  "0xf7906F274c174A52d444175729E3fa98f9bde285";
mainnetAddresses["PT-sUSDE-24OCT2024"] =
  "0xAE5099C39f023C91d3dd55244CAFB36225B0850E";
mainnetAddresses["PT-weETH-26DEC2024"] =
  "0x6ee2b5E19ECBa773a352E5B21415Dc419A700d1d";
mainnetAddresses["PT-weETH-27JUN2024"] =
  "0xc69Ad9baB1dEE23F4605a82b3354F8E40d1E5966";

mainnetAddresses["usd0"] = "0x73A15FeD60Bf67631dC6cd7Bc5B6e8da8190aCF5";

export const pendleTokens: Record<ChainId, Set<Address>> = {
  [ChainId.EthMainnet]: new Set([
    mainnetAddresses["PT-USDe-25JUL2024"],
    mainnetAddresses["PT-ezETH-26DEC2024"],
    mainnetAddresses["PT-sUSDE-24OCT2024"],
    mainnetAddresses["PT-weETH-26DEC2024"],
    mainnetAddresses["PT-weETH-27JUN2024"],
  ]),
  [ChainId.BaseMainnet]: new Set(),
};

export const curvePools = {
  "usd0usd0++": "0x1d08e7adc263cfc70b1babe6dc5bb339c16eec52",
  usd0usdc: "0x14100f81e33c33ecc7cdac70181fb45b6e78569f",
};
