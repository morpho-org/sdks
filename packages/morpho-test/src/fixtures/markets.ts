import {
  ChainId,
  MarketConfig,
  type MarketParams,
  addresses,
} from "@morpho-org/blue-sdk";
import { randomAddress } from "@morpho-org/test";
import { parseEther, parseUnits, zeroAddress } from "viem";

const { adaptiveCurveIrm, wNative, usdc, wstEth, wbIB01 } =
  addresses[ChainId.EthMainnet];

export const markets = {
  [ChainId.EthMainnet]: {
    eth_wstEth: new MarketConfig({
      loanToken: wNative,
      collateralToken: wstEth,
      oracle: "0x2a01EB9496094dA03c4E364Def50f5aD1280AD72",
      irm: adaptiveCurveIrm,
      lltv: parseUnits("94.5", 16),
    }),

    eth_wstEth_2: new MarketConfig({
      loanToken: wNative,
      collateralToken: wstEth,
      oracle: "0xbD60A6770b27E084E8617335ddE769241B0e71D8",
      irm: adaptiveCurveIrm,
      lltv: parseUnits("94.5", 16),
    }),

    eth_rEth: new MarketConfig({
      loanToken: wNative,
      collateralToken: "0xae78736Cd615f374D3085123A210448E74Fc6393",
      oracle: "0x1b4A3F92e5Fffd1d35A98751c9FE4472483579bB",
      irm: adaptiveCurveIrm,
      lltv: parseUnits("94.5", 16),
    }),

    usdt_wbtc: new MarketConfig({
      loanToken: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      collateralToken: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
      oracle: "0x008bF4B1cDA0cc9f0e882E0697f036667652E1ef",
      irm: adaptiveCurveIrm,
      lltv: parseUnits("86", 16),
    }),

    usdt_wstEth: new MarketConfig({
      loanToken: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      collateralToken: wstEth,
      oracle: "0x95DB30fAb9A3754e42423000DF27732CB2396992",
      irm: adaptiveCurveIrm,
      lltv: parseUnits("86", 16),
    }),

    usdc_wbtc: new MarketConfig({
      // USDC(wBTC, 86%, Chainlink, AdaptiveCurve)
      loanToken: usdc,
      collateralToken: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
      oracle: "0xDddd770BADd886dF3864029e4B377B5F6a2B6b83",
      irm: adaptiveCurveIrm,
      lltv: parseUnits("86", 16),
    }),

    usdc_wstEth: new MarketConfig({
      // USDC(wstETH, 86%, Chainlink, AdaptiveCurve)
      loanToken: usdc,
      collateralToken: wstEth,
      oracle: "0x48F7E36EB6B826B2dF4B2E630B62Cd25e89E40e2",
      irm: adaptiveCurveIrm,
      lltv: parseUnits("86", 16),
    }),

    usdc_sDai: new MarketConfig({
      // USDC(wstETH, 86%, Chainlink, AdaptiveCurve)
      loanToken: usdc,
      collateralToken: "0x83F20F44975D03b1b09e64809B757c47f942BEeA",
      oracle: "0x6CAFE228eC0B0bC2D076577d56D35Fe704318f6d",
      irm: adaptiveCurveIrm,
      lltv: parseUnits("96.5", 16),
    }),

    usdc_wbIB01: new MarketConfig({
      // USDC(wbIB01, 96.5%, Chainlink, AdaptiveCurve)
      loanToken: usdc,
      collateralToken: wbIB01,
      oracle: "0x6E8F5b2DF218443E87fe8aA9811E6956716dde88",
      irm: adaptiveCurveIrm,
      lltv: parseUnits("96.5", 16),
    }),

    usdc_idle: new MarketConfig({
      loanToken: usdc,
      collateralToken: zeroAddress,
      oracle: zeroAddress,
      irm: zeroAddress,
      lltv: 0n,
    }),

    crvUsd_stkcvxcrvUSDTWBTCWETH: new MarketConfig({
      loanToken: "0xf939E0A03FB07F59A73314E73794Be0E57ac1b4E",
      collateralToken: "0xb0Ce26C88e4e7DCa51968b6047f44646f5064278",
      oracle: "0x077Af6c2D4A75D4145d141F9e9421864C3940CB3",
      irm: adaptiveCurveIrm,
      lltv: parseUnits("86", 16),
    }),

    crvUsd_stkcvxcrvUSDCWBTCWETH: new MarketConfig({
      loanToken: "0xf939E0A03FB07F59A73314E73794Be0E57ac1b4E",
      collateralToken: "0x0ea1a65A2c255f24Ee8D81eA6AaC54Decd9d269e",
      oracle: "0xd2F7C3B2fC97cC7b6AfDd76D163394680EFc35b9",
      irm: adaptiveCurveIrm,
      lltv: parseUnits("86", 16),
    }),

    crvUsd_stkcvxcrvCRVUSDTBTCWSTETH: new MarketConfig({
      loanToken: "0xf939E0A03FB07F59A73314E73794Be0E57ac1b4E",
      collateralToken: "0x3ce8Ec9f3d89aD0A2DdbCC3FDB8991BD241Fc82E",
      oracle: "0xa9f7900476F43C45Ebf56cEa669B9c960C176112",
      irm: adaptiveCurveIrm,
      lltv: parseUnits("86", 16),
    }),

    crvUsd_stkcvxTryLSD: new MarketConfig({
      loanToken: "0xf939E0A03FB07F59A73314E73794Be0E57ac1b4E",
      collateralToken: "0x6BA072F0d22806F2C52e9792AF47f2D59103BEBE",
      oracle: "0x18B0d7311a97c5377445C80c768ab5201Bb27B5a",
      irm: adaptiveCurveIrm,
      lltv: parseUnits("86", 16),
    }),

    crvUsd_stkcvxcrvUSDETHCRV: new MarketConfig({
      loanToken: "0xf939E0A03FB07F59A73314E73794Be0E57ac1b4E",
      collateralToken: "0xAc904BAfBb5FB04Deb2b6198FdCEedE75a78Ce5a",
      oracle: "0xad7e157815df05029125B568E39d5402550d60bb",
      irm: adaptiveCurveIrm,
      lltv: parseUnits("86", 16),
    }),

    crvUsd_stkcvx2BTC: new MarketConfig({
      loanToken: "0xf939E0A03FB07F59A73314E73794Be0E57ac1b4E",
      collateralToken: "0x385E12cf4040543Bc8C18e05C1298Be5B04f3f5e",
      oracle: "0x20c4fA59f032bEC6de1905B7201CB88DFD968abA",
      irm: adaptiveCurveIrm,
      lltv: 860000000000000000n,
    }),

    usda_re7Eth: new MarketConfig({
      loanToken: "0x0000206329b97DB379d5E1Bf586BbDB969C63274",
      collateralToken: "0x78Fc2c2eD1A4cDb5402365934aE5648aDAd094d0",
      oracle: "0x76052A2A28fDCB8124f4686C63C68355b142de3B",
      irm: adaptiveCurveIrm,
      lltv: parseUnits("86", 16),
    }),
  },
};

export const randomMarket = (params: Partial<MarketParams> = {}) =>
  new MarketConfig({
    collateralToken: randomAddress(),
    loanToken: randomAddress(),
    oracle: randomAddress(),
    irm: randomAddress(),
    lltv: parseEther("0.80"),
    ...params,
  });
