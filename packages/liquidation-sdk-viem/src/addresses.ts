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
    sky?: Address;
    mkrSkyConverter?: Address;
    daiUsdsConverter?: Address;
    "PT-USDe-25JUL2024"?: Address;
    "PT-ezETH-26DEC2024"?: Address;
    "PT-sUSDE-24OCT2024"?: Address;
    "PT-weETH-26DEC2024"?: Address;
    "PT-weETH-27JUN2024"?: Address;
  }
}

type PreLiquidationFactoryConfig = {
  address: Address;
  deploymentBlock: bigint;
};

export const mainnetAddresses = addresses[ChainId.EthMainnet] as ChainAddresses;
export const baseAddresses = addresses[ChainId.BaseMainnet] as ChainAddresses;

mainnetAddresses.usd0 = "0x73A15FeD60Bf67631dC6cd7Bc5B6e8da8190aCF5";
mainnetAddresses["usd0++"] = "0x35D8949372D46B7a3D5A56006AE77B215fc69bC0";
mainnetAddresses["usd0usd0++"] = "0x1d08E7adC263CfC70b1BaBe6dC5Bb339c16Eec52";
mainnetAddresses.sUsds = "0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD";
mainnetAddresses.usds = "0xdC035D45d973E3EC169d2276DDab16f1e407384F";
mainnetAddresses.sky = "0x56072C95FAA701256059aa122697B133aDEd9279";
mainnetAddresses.mkrSkyConverter = "0xBDcFCA946b6CDd965f99a839e4435Bcdc1bc470B";
mainnetAddresses.daiUsdsConverter =
  "0x3225737a9Bbb6473CB4a45b7244ACa2BeFdB276A";

export const curvePools = {
  "usd0usd0++": "0x1d08E7adC263CfC70b1BaBe6dC5Bb339c16Eec52",
  usd0usdc: "0x14100f81e33C33Ecc7CDac70181Fb45B6E78569F",
} as const;

export const preLiquidationFactoryConfigs: Record<
  ChainId,
  PreLiquidationFactoryConfig
> = {
  [ChainId.EthMainnet]: {
    address: "0x6FF33615e792E35ed1026ea7cACCf42D9BF83476",
    deploymentBlock: 21414664n,
  },
  [ChainId.BaseMainnet]: {
    address: "0x8cd16b62E170Ee0bA83D80e1F80E6085367e2aef",
    deploymentBlock: 23779056n,
  },
};
