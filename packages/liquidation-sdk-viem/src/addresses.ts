import {
  type Address,
  ChainId,
  addresses,
  addressesRegistry,
  deployments,
  registerCustomAddresses,
} from "@morpho-org/blue-sdk";
import type { MidasConfig } from "./tokens/midas";

declare module "@morpho-org/blue-sdk" {
  interface ChainAddresses {
    timeBoundedUrd?: Address;
    marketRewardsProgramRegistry?: Address;

    mkr?: Address;
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

registerCustomAddresses({
  addresses: {
    [ChainId.EthMainnet]: {
      usd0: "0x73A15FeD60Bf67631dC6cd7Bc5B6e8da8190aCF5",
      "usd0++": "0x35D8949372D46B7a3D5A56006AE77B215fc69bC0",
      "usd0usd0++": "0x1d08E7adC263CfC70b1BaBe6dC5Bb339c16Eec52",
      sUsds: "0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD",
      usds: "0xdC035D45d973E3EC169d2276DDab16f1e407384F",
      sky: "0x56072C95FAA701256059aa122697B133aDEd9279",
      mkrSkyConverter: "0xBDcFCA946b6CDd965f99a839e4435Bcdc1bc470B",
      daiUsdsConverter: "0x3225737a9Bbb6473CB4a45b7244ACa2BeFdB276A",
    },
  },
});

export const mainnetAddresses = addresses[ChainId.EthMainnet]!;

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
    "0xbB51E2a15A9158EBE2b0Ceb8678511e063AB7a55": {
      // mEdge
      instantRedemptionVault: "0x9B2C5E30E3B1F6369FC746A1C1E47277396aF15D",
      redemptionAsset: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
    },
    "0x030b69280892c888670EDCDCD8B69Fd8026A0BF3": {
      // mMEV
      instantRedemptionVault: "0xac14a14f578C143625Fc8F54218911e8F634184D",
      redemptionAsset: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
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
  [ChainId.PolygonMainnet]: {},
  [ChainId.ArbitrumMainnet]: {},
  [ChainId.OptimismMainnet]: {},
  [ChainId.WorldChainMainnet]: {},
  [ChainId.FraxtalMainnet]: {},
  [ChainId.ScrollMainnet]: {},
  [ChainId.InkMainnet]: {},
  [ChainId.Unichain]: {},
  [ChainId.SonicMainnet]: {},
  [ChainId.HemiMainnet]: {},
  [ChainId.ModeMainnet]: {},
  [ChainId.CornMainnet]: {},
  [ChainId.PlumeMainnet]: {},
  [ChainId.CampMainnet]: {},
  [ChainId.KatanaMainnet]: {},
  [ChainId.EtherlinkMainnet]: {},
  [ChainId.TacMainnet]: {},
  [ChainId.LiskMainnet]: {},
  [ChainId.HyperliquidMainnet]: {},
  [ChainId.SeiMainnet]: {},
  [ChainId.ZeroGMainnet]: {},
  [ChainId.LineaMainnet]: {},
  [ChainId.MonadMainnet]: {},
  [ChainId.StableMainnet]: {},
  [ChainId.CronosMainnet]: {},
  [ChainId.CeloMainnet]: {},
  [ChainId.AbstractMainnet]: {},
  [ChainId.BitlayerMainnet]: {},
  [ChainId.BscMainnet]: {},
  [ChainId.SoneiumMainnet]: {},
};

export const preLiquidationFactoryConfigs: Record<
  number,
  PreLiquidationFactoryConfig
> = {
  [ChainId.EthMainnet]: {
    address: addressesRegistry[ChainId.EthMainnet].preLiquidationFactory,
    startBlock: deployments[ChainId.EthMainnet].preLiquidationFactory,
  },
  [ChainId.BaseMainnet]: {
    address: addressesRegistry[ChainId.BaseMainnet].preLiquidationFactory,
    startBlock: deployments[ChainId.BaseMainnet].preLiquidationFactory,
  },
  [ChainId.PolygonMainnet]: {
    address: addressesRegistry[ChainId.PolygonMainnet].preLiquidationFactory,
    startBlock: deployments[ChainId.PolygonMainnet].preLiquidationFactory,
  },
  [ChainId.ArbitrumMainnet]: {
    address: addressesRegistry[ChainId.ArbitrumMainnet].preLiquidationFactory,
    startBlock: deployments[ChainId.ArbitrumMainnet].preLiquidationFactory,
  },
  [ChainId.OptimismMainnet]: {
    address: addressesRegistry[ChainId.OptimismMainnet].preLiquidationFactory,
    startBlock: deployments[ChainId.OptimismMainnet].preLiquidationFactory,
  },
  [ChainId.WorldChainMainnet]: {
    address: addressesRegistry[ChainId.WorldChainMainnet].preLiquidationFactory,
    startBlock: deployments[ChainId.WorldChainMainnet].preLiquidationFactory,
  },
  [ChainId.FraxtalMainnet]: {
    address: addressesRegistry[ChainId.FraxtalMainnet].preLiquidationFactory,
    startBlock: deployments[ChainId.FraxtalMainnet].preLiquidationFactory,
  },
  [ChainId.ScrollMainnet]: {
    address: addressesRegistry[ChainId.ScrollMainnet].preLiquidationFactory,
    startBlock: deployments[ChainId.ScrollMainnet].preLiquidationFactory,
  },
  [ChainId.InkMainnet]: {
    address: addressesRegistry[ChainId.InkMainnet].preLiquidationFactory,
    startBlock: deployments[ChainId.InkMainnet].preLiquidationFactory,
  },
  [ChainId.Unichain]: {
    address: addressesRegistry[ChainId.Unichain].preLiquidationFactory,
    startBlock: deployments[ChainId.Unichain].preLiquidationFactory,
  },
  [ChainId.SonicMainnet]: {
    address: addressesRegistry[ChainId.SonicMainnet].preLiquidationFactory,
    startBlock: deployments[ChainId.SonicMainnet].preLiquidationFactory,
  },
  [ChainId.HemiMainnet]: {
    address: addressesRegistry[ChainId.HemiMainnet].preLiquidationFactory,
    startBlock: deployments[ChainId.HemiMainnet].preLiquidationFactory,
  },
  [ChainId.ModeMainnet]: {
    address: addressesRegistry[ChainId.ModeMainnet].preLiquidationFactory,
    startBlock: deployments[ChainId.ModeMainnet].preLiquidationFactory,
  },
  [ChainId.CornMainnet]: {
    address: addressesRegistry[ChainId.CornMainnet].preLiquidationFactory,
    startBlock: deployments[ChainId.CornMainnet].preLiquidationFactory,
  },
  [ChainId.PlumeMainnet]: {
    address: addressesRegistry[ChainId.PlumeMainnet].preLiquidationFactory,
    startBlock: deployments[ChainId.PlumeMainnet].preLiquidationFactory,
  },
  [ChainId.CampMainnet]: {
    address: addressesRegistry[ChainId.CampMainnet].preLiquidationFactory,
    startBlock: deployments[ChainId.CampMainnet].preLiquidationFactory,
  },
  [ChainId.KatanaMainnet]: {
    address: addressesRegistry[ChainId.KatanaMainnet].preLiquidationFactory,
    startBlock: deployments[ChainId.KatanaMainnet].preLiquidationFactory,
  },
  [ChainId.EtherlinkMainnet]: {
    address: addressesRegistry[ChainId.EtherlinkMainnet].preLiquidationFactory,
    startBlock: deployments[ChainId.EtherlinkMainnet].preLiquidationFactory,
  },
  [ChainId.TacMainnet]: {
    address: addressesRegistry[ChainId.TacMainnet].preLiquidationFactory,
    startBlock: deployments[ChainId.TacMainnet].preLiquidationFactory,
  },
  [ChainId.LiskMainnet]: {
    address: addressesRegistry[ChainId.LiskMainnet].preLiquidationFactory,
    startBlock: deployments[ChainId.LiskMainnet].preLiquidationFactory,
  },
  [ChainId.HyperliquidMainnet]: {
    address:
      addressesRegistry[ChainId.HyperliquidMainnet].preLiquidationFactory,
    startBlock: deployments[ChainId.HyperliquidMainnet].preLiquidationFactory,
  },
  [ChainId.SeiMainnet]: {
    address: addressesRegistry[ChainId.SeiMainnet].preLiquidationFactory,
    startBlock: deployments[ChainId.SeiMainnet].preLiquidationFactory,
  },
  [ChainId.ZeroGMainnet]: {
    address: addressesRegistry[ChainId.ZeroGMainnet].preLiquidationFactory,
    startBlock: deployments[ChainId.ZeroGMainnet].preLiquidationFactory,
  },
  [ChainId.LineaMainnet]: {
    address: addressesRegistry[ChainId.LineaMainnet].preLiquidationFactory,
    startBlock: deployments[ChainId.LineaMainnet].preLiquidationFactory,
  },
  [ChainId.MonadMainnet]: {
    address: addressesRegistry[ChainId.MonadMainnet].preLiquidationFactory,
    startBlock: deployments[ChainId.MonadMainnet].preLiquidationFactory,
  },
  [ChainId.StableMainnet]: {
    address: addressesRegistry[ChainId.StableMainnet].preLiquidationFactory,
    startBlock: deployments[ChainId.StableMainnet].preLiquidationFactory,
  },
  [ChainId.CronosMainnet]: {
    address: addressesRegistry[ChainId.CronosMainnet].preLiquidationFactory,
    startBlock: deployments[ChainId.CronosMainnet].preLiquidationFactory,
  },
  [ChainId.CeloMainnet]: {
    address: addressesRegistry[ChainId.CeloMainnet].preLiquidationFactory,
    startBlock: deployments[ChainId.CeloMainnet].preLiquidationFactory,
  },
  [ChainId.AbstractMainnet]: {
    address: addressesRegistry[ChainId.AbstractMainnet].preLiquidationFactory,
    startBlock: deployments[ChainId.AbstractMainnet].preLiquidationFactory,
  },
  [ChainId.BitlayerMainnet]: {
    address: addressesRegistry[ChainId.BitlayerMainnet].preLiquidationFactory,
    startBlock: deployments[ChainId.BitlayerMainnet].preLiquidationFactory,
  },
  [ChainId.BscMainnet]: {
    address: addressesRegistry[ChainId.BscMainnet].preLiquidationFactory,
    startBlock: deployments[ChainId.BscMainnet].preLiquidationFactory,
  },
  [ChainId.SoneiumMainnet]: {
    address: addressesRegistry[ChainId.SoneiumMainnet].preLiquidationFactory,
    startBlock: deployments[ChainId.SoneiumMainnet].preLiquidationFactory,
  },
};
