import {
  type Address,
  type ChainAddresses,
  ChainId,
  addresses,
} from "@morpho-org/blue-sdk";
import type { MidasConfig } from "./tokens/midas";

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
  startBlock: bigint;
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

export const midasConfigs: Record<ChainId, Record<Address, MidasConfig>> = {
  [ChainId.EthMainnet]: {
    "0xDD629E5241CbC5919847783e6C96B2De4754e438": {
      // mTBILL
      instantRedemptionVault: "0x569D7dccBF6923350521ecBC28A555A500c4f0Ec",
      redemptionAsset: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
    },
    "0x2a8c22E3b10036f3AEF5875d04f8441d4188b656": {
      // mBASIS
      instantRedemptionVault: "0x19AB19e61A930bc5C7B75Bf06cDd954218Ca9F0b",
      redemptionAsset: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
    },
    "0x007115416AB6c266329a03B09a8aa39aC2eF7d9d": {
      // mBTC
      instantRedemptionVault: "0x30d9D1e76869516AEa980390494AaEd45C3EfC1a",
      redemptionAsset: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", // wBTC
    },
  },
  [ChainId.BaseMainnet]: {
    "0xDD629E5241CbC5919847783e6C96B2De4754e438": {
      // mTBILL
      instantRedemptionVault: "0x2a8c22E3b10036f3AEF5875d04f8441d4188b656",
      redemptionAsset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
    },
    "0x1C2757c1FeF1038428b5bEF062495ce94BBe92b2": {
      // mBASIS
      instantRedemptionVault: "0xF804a646C034749b5484bF7dfE875F6A4F969840",
      redemptionAsset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
    },
  },
  [ChainId.ArbitrumMainnet]: {},
  [ChainId.OptimismMainnet]: {},
};

export const preLiquidationFactoryConfigs: Record<
  ChainId,
  PreLiquidationFactoryConfig
> = {
  [ChainId.EthMainnet]: {
    address: "0x6FF33615e792E35ed1026ea7cACCf42D9BF83476",
    startBlock: 21429900n,
  },
  [ChainId.BaseMainnet]: {
    address: "0x8cd16b62E170Ee0bA83D80e1F80E6085367e2aef",
    startBlock: 23779056n,
  },
  [ChainId.ArbitrumMainnet]: {
    address: "0x635c31B5DF1F7EFbCbC07E302335Ef4230758e3d",
    startBlock: 307326238n,
  },
  [ChainId.OptimismMainnet]: {
    address: "0x3d05C01EE8e97361b9E19D172128255eaE5F98B9",
    startBlock: 132139369n,
  },
};
