import {
  type Address,
  type ChainAddresses,
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
    sUsds?: Address;
    usd0?: Address;
    usds?: Address;
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

mainnetAddresses.usd0 = "0x73A15FeD60Bf67631dC6cd7Bc5B6e8da8190aCF5";
mainnetAddresses["usd0++"] = "0x35D8949372D46B7a3D5A56006AE77B215fc69bC0";
mainnetAddresses["usd0usd0++"] = "0x1d08E7adC263CfC70b1BaBe6dC5Bb339c16Eec52";
mainnetAddresses.sUsds = "0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD";
mainnetAddresses.usds = "0xdC035D45d973E3EC169d2276DDab16f1e407384F";

export const curvePools = {
  "usd0usd0++": "0x1d08E7adC263CfC70b1BaBe6dC5Bb339c16Eec52",
  usd0usdc: "0x14100f81e33C33Ecc7CDac70181Fb45B6E78569F",
} as const;
