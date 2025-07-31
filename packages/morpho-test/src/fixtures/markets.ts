import {
  ChainId,
  type IMarketParams,
  MarketParams,
  addressesRegistry,
} from "@morpho-org/blue-sdk";
import { randomAddress } from "@morpho-org/test";
import { parseEther, parseUnits } from "viem";

const { adaptiveCurveIrm, wNative, sDai, usdc, wstEth, wbIB01, usdt, dai } =
  addressesRegistry[ChainId.EthMainnet];

const {
  adaptiveCurveIrm: adaptiveCurveIrm_base,
  wNative: wNative_base,
  usdc: usdc_base,
} = addressesRegistry[ChainId.BaseMainnet];

const { adaptiveCurveIrm: adaptiveCurveIrm_arb, wNative: wNative_arb } =
  addressesRegistry[ChainId.ArbitrumMainnet];

const { adaptiveCurveIrm: adaptiveCurveIrm_polygon, wNative: wNative_polygon } =
  addressesRegistry[ChainId.PolygonMainnet];

export const markets = {
  [ChainId.EthMainnet]: {
    eth_idle: MarketParams.idle(wNative),
    eth_wstEth: new MarketParams({
      loanToken: wNative,
      collateralToken: wstEth,
      oracle: "0x2a01EB9496094dA03c4E364Def50f5aD1280AD72",
      irm: adaptiveCurveIrm,
      lltv: parseUnits("94.5", 16),
    }),
    eth_wstEth_2: new MarketParams({
      loanToken: wNative,
      collateralToken: wstEth,
      oracle: "0xbD60A6770b27E084E8617335ddE769241B0e71D8",
      irm: adaptiveCurveIrm,
      lltv: parseUnits("94.5", 16),
    }),
    eth_rEth: new MarketParams({
      loanToken: wNative,
      collateralToken: "0xae78736Cd615f374D3085123A210448E74Fc6393",
      oracle: "0x1b4A3F92e5Fffd1d35A98751c9FE4472483579bB",
      irm: adaptiveCurveIrm,
      lltv: parseUnits("94.5", 16),
    }),
    eth_sDai: new MarketParams({
      loanToken: wNative,
      collateralToken: sDai,
      oracle: "0x0f9bb760D76af1B5Ca89102084E1963F6698AFda",
      irm: adaptiveCurveIrm,
      lltv: parseUnits("86", 16),
    }),
    eth_wbtc: new MarketParams({
      loanToken: wNative,
      collateralToken: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
      oracle: "0xc29B3Bc033640baE31ca53F8a0Eb892AdF68e663",
      irm: adaptiveCurveIrm,
      lltv: parseUnits("91.5", 16),
    }),
    eth_ezEth: new MarketParams({
      loanToken: wNative,
      collateralToken: "0xbf5495Efe5DB9ce00f80364C8B423567e58d2110",
      oracle: "0x61025e2B0122ac8bE4e37365A4003d87ad888Cc3",
      irm: adaptiveCurveIrm,
      lltv: parseUnits("86", 16),
    }),
    eth_apxEth: new MarketParams({
      loanToken: wNative,
      collateralToken: "0x9Ba021B0a9b958B5E75cE9f6dff97C7eE52cb3E6",
      oracle: "0x037D67A5E6F19d0Fb26A6603d2D4fE9d70eC3258",
      irm: adaptiveCurveIrm,
      lltv: parseUnits("86", 16),
    }),
    eth_osEth: new MarketParams({
      loanToken: wNative,
      collateralToken: "0xf1C9acDc66974dFB6dEcB12aA385b9cD01190E38",
      oracle: "0x224F2F1333b45E34fFCfC3bD01cE43C73A914498",
      irm: adaptiveCurveIrm,
      lltv: parseUnits("86", 16),
    }),
    eth_weEth: new MarketParams({
      loanToken: wNative,
      collateralToken: "0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee",
      oracle: "0x3fa58b74e9a8eA8768eb33c8453e9C2Ed089A40a",
      irm: adaptiveCurveIrm,
      lltv: parseUnits("86", 16),
    }),

    usdt_idle: MarketParams.idle(usdt),
    usdt_weth_86: new MarketParams({
      loanToken: usdt,
      collateralToken: wNative,
      oracle: "0xe9eE579684716c7Bb837224F4c7BeEfA4f1F3d7f",
      irm: adaptiveCurveIrm,
      lltv: parseUnits("86", 16),
    }),
    usdt_weth_91_5: new MarketParams({
      loanToken: usdt,
      collateralToken: wNative,
      oracle: "0xe9eE579684716c7Bb837224F4c7BeEfA4f1F3d7f",
      irm: adaptiveCurveIrm,
      lltv: parseUnits("91.5", 16),
    }),
    usdt_wbtc: new MarketParams({
      loanToken: usdt,
      collateralToken: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
      oracle: "0x008bF4B1cDA0cc9f0e882E0697f036667652E1ef",
      irm: adaptiveCurveIrm,
      lltv: parseUnits("86", 16),
    }),
    usdt_wstEth: new MarketParams({
      loanToken: usdt,
      collateralToken: wstEth,
      oracle: "0x95DB30fAb9A3754e42423000DF27732CB2396992",
      irm: adaptiveCurveIrm,
      lltv: parseUnits("86", 16),
    }),
    usdt_sDai: new MarketParams({
      loanToken: usdt,
      collateralToken: sDai,
      oracle: "0x7538C68d863b28E34b986C1E8daFEDa31D824923",
      irm: adaptiveCurveIrm,
      lltv: parseUnits("94.5", 16),
    }),

    usdc_idle: MarketParams.idle(usdc),
    usdc_wbtc: new MarketParams({
      // USDC(wBTC, 86%, Chainlink, AdaptiveCurve)
      loanToken: usdc,
      collateralToken: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
      oracle: "0xDddd770BADd886dF3864029e4B377B5F6a2B6b83",
      irm: adaptiveCurveIrm,
      lltv: parseUnits("86", 16),
    }),
    usdc_wstEth: new MarketParams({
      // USDC(wstETH, 86%, Chainlink, AdaptiveCurve)
      loanToken: usdc,
      collateralToken: wstEth,
      oracle: "0x48F7E36EB6B826B2dF4B2E630B62Cd25e89E40e2",
      irm: adaptiveCurveIrm,
      lltv: parseUnits("86", 16),
    }),
    usdc_sDai: new MarketParams({
      loanToken: usdc,
      collateralToken: sDai,
      oracle: "0x6CAFE228eC0B0bC2D076577d56D35Fe704318f6d",
      irm: adaptiveCurveIrm,
      lltv: parseUnits("96.5", 16),
    }),
    usdc_wbIB01: new MarketParams({
      // USDC(wbIB01, 96.5%, Chainlink, AdaptiveCurve)
      loanToken: usdc,
      collateralToken: wbIB01,
      oracle: "0x6E8F5b2DF218443E87fe8aA9811E6956716dde88",
      irm: adaptiveCurveIrm,
      lltv: parseUnits("96.5", 16),
    }),

    dai_sUsde: new MarketParams({
      // DAI(sUSDe, 86%, Exchange rate, AdaptiveCurve)
      loanToken: dai,
      collateralToken: "0x9D39A5DE30e57443BfF2A8307A4256c8797A3497",
      oracle: "0x5D916980D5Ae1737a8330Bf24dF812b2911Aae25",
      irm: adaptiveCurveIrm,
      lltv: parseUnits("86", 16),
    }),

    crvUsd_stkcvxcrvUSDTWBTCWETH: new MarketParams({
      loanToken: "0xf939E0A03FB07F59A73314E73794Be0E57ac1b4E",
      collateralToken: "0xb0Ce26C88e4e7DCa51968b6047f44646f5064278",
      oracle: "0x077Af6c2D4A75D4145d141F9e9421864C3940CB3",
      irm: adaptiveCurveIrm,
      lltv: parseUnits("86", 16),
    }),
    crvUsd_stkcvxcrvUSDCWBTCWETH: new MarketParams({
      loanToken: "0xf939E0A03FB07F59A73314E73794Be0E57ac1b4E",
      collateralToken: "0x0ea1a65A2c255f24Ee8D81eA6AaC54Decd9d269e",
      oracle: "0xd2F7C3B2fC97cC7b6AfDd76D163394680EFc35b9",
      irm: adaptiveCurveIrm,
      lltv: parseUnits("86", 16),
    }),
    crvUsd_stkcvxcrvCRVUSDTBTCWSTETH: new MarketParams({
      loanToken: "0xf939E0A03FB07F59A73314E73794Be0E57ac1b4E",
      collateralToken: "0x3ce8Ec9f3d89aD0A2DdbCC3FDB8991BD241Fc82E",
      oracle: "0xa9f7900476F43C45Ebf56cEa669B9c960C176112",
      irm: adaptiveCurveIrm,
      lltv: parseUnits("86", 16),
    }),
    crvUsd_stkcvxTryLSD: new MarketParams({
      loanToken: "0xf939E0A03FB07F59A73314E73794Be0E57ac1b4E",
      collateralToken: "0x6BA072F0d22806F2C52e9792AF47f2D59103BEBE",
      oracle: "0x18B0d7311a97c5377445C80c768ab5201Bb27B5a",
      irm: adaptiveCurveIrm,
      lltv: parseUnits("86", 16),
    }),
    crvUsd_stkcvxcrvUSDETHCRV: new MarketParams({
      loanToken: "0xf939E0A03FB07F59A73314E73794Be0E57ac1b4E",
      collateralToken: "0xAc904BAfBb5FB04Deb2b6198FdCEedE75a78Ce5a",
      oracle: "0xad7e157815df05029125B568E39d5402550d60bb",
      irm: adaptiveCurveIrm,
      lltv: parseUnits("86", 16),
    }),
    crvUsd_stkcvx2BTC: new MarketParams({
      loanToken: "0xf939E0A03FB07F59A73314E73794Be0E57ac1b4E",
      collateralToken: "0x385E12cf4040543Bc8C18e05C1298Be5B04f3f5e",
      oracle: "0x20c4fA59f032bEC6de1905B7201CB88DFD968abA",
      irm: adaptiveCurveIrm,
      lltv: 860000000000000000n,
    }),

    usda_re7Eth: new MarketParams({
      loanToken: "0x0000206329b97DB379d5E1Bf586BbDB969C63274",
      collateralToken: "0x78Fc2c2eD1A4cDb5402365934aE5648aDAd094d0",
      oracle: "0x76052A2A28fDCB8124f4686C63C68355b142de3B",
      irm: adaptiveCurveIrm,
      lltv: parseUnits("86", 16),
    }),
  },
  [ChainId.BaseMainnet]: {
    eth_wstEth: new MarketParams({
      loanToken: wNative_base,
      collateralToken: "0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452",
      oracle: "0x4A11590e5326138B514E08A9B52202D42077Ca65",
      irm: adaptiveCurveIrm_base,
      lltv: parseUnits("94.5", 16),
    }),
    usdc_eth: new MarketParams({
      loanToken: usdc_base,
      collateralToken: wNative_base,
      oracle: "0xFEa2D58cEfCb9fcb597723c6bAE66fFE4193aFE4",
      irm: adaptiveCurveIrm_base,
      lltv: parseUnits("86", 16),
    }),
  },
  [ChainId.ArbitrumMainnet]: {
    eth_wstEth: new MarketParams({
      loanToken: wNative_arb,
      collateralToken: "0x5979D7b546E38E414F7E9822514be443A4800529",
      oracle: "0x70dCd188B6444fefFb772b1d3273D8f2767556FE",
      irm: adaptiveCurveIrm_arb,
      lltv: parseUnits("94.5", 16),
    }),
  },
  [ChainId.PolygonMainnet]: {
    wPol_wEth: new MarketParams({
      loanToken: wNative_polygon,
      collateralToken: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
      oracle: "0x648Ff6ad9F0Cefe508AE979d7Bf4Fa48ae99CA9E",
      irm: adaptiveCurveIrm_polygon,
      lltv: parseUnits("77", 16),
    }),
  },
} as const;

export const randomMarket = (params: Partial<IMarketParams> = {}) =>
  new MarketParams({
    collateralToken: randomAddress(),
    loanToken: randomAddress(),
    oracle: randomAddress(),
    irm: randomAddress(),
    lltv: parseEther("0.80"),
    ...params,
  });
