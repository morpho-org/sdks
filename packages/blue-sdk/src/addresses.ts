import {
  type DeepPartial,
  type DottedKeys,
  deepFreeze,
  entries,
} from "@morpho-org/morpho-ts";
import isPlainObject from "lodash.isplainobject";
import mergeWith from "lodash.mergewith";
import { ChainId } from "./chain.js";
import { UnsupportedChainIdError } from "./errors.js";
import type { Address } from "./types.js";

/** Address used to replicate an erc20-behaviour for native token.
 *
 * NB: data might differ from expected onchain native token data
 */
export const NATIVE_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

export interface ChainAddresses {
  morpho: Address;
  permit2?: Address;
  bundler3: {
    bundler3: Address;
    generalAdapter1: Address;
    paraswapAdapter?: Address;
    erc20WrapperAdapter?: Address;
    compoundV2MigrationAdapter?: Address;
    compoundV3MigrationAdapter?: Address;
    aaveV2MigrationAdapter?: Address;
    aaveV3CoreMigrationAdapter?: Address;
    aaveV3PrimeMigrationAdapter?: Address;
    aaveV3EtherFiMigrationAdapter?: Address;
    aaveV3OptimizerMigrationAdapter?: Address;
  };
  adaptiveCurveIrm: Address;
  publicAllocator?: Address;
  metaMorphoFactory?: Address;
  vaultV2Factory?: Address;
  morphoVaultV1AdapterFactory?: Address;
  registryList?: Address;
  chainlinkOracleFactory?: Address;
  preLiquidationFactory?: Address;
  wNative?: Address;
  morphoToken?: Address;
  /**
   * Must implement DAI specific permit (otherwise breaks permit signatures).
   */
  dai?: Address;
  /**
   * Must implement USDC permit version 2 (otherwise breaks permit signatures).
   */
  usdc?: Address;
  stEth?: Address;
  wstEth?: Address;
}

const _addressesRegistry = {
  [ChainId.EthMainnet]: {
    morpho: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    bundler3: {
      bundler3: "0x6566194141eefa99Af43Bb5Aa71460Ca2Dc90245",
      generalAdapter1: "0x4A6c312ec70E8747a587EE860a0353cd42Be0aE0",
      paraswapAdapter: "0x03b5259Bd204BfD4A616E5B79b0B786d90c6C38f",
      erc20WrapperAdapter: "0xf83D17dFE160597b19e4FdD8ea61A23e9a87F962",
      compoundV2MigrationAdapter: "0x9B89c07f480Df1945279031b5fC6fF241b8f1101",
      compoundV3MigrationAdapter: "0xdBa5bdE29eA030Bfa6A608592dFcA1D02CB26773",
      aaveV2MigrationAdapter: "0x40288815C399709dFC0875A384B637fFe387961B",
      aaveV3CoreMigrationAdapter: "0xb09e40EbE31b738fbf20289270a397118707D475",
      aaveV3PrimeMigrationAdapter: "0x2CC8d502a65824B4cF9A58DB03490bA024BDB806",
      aaveV3EtherFiMigrationAdapter:
        "0x4011dc6581fA05F9B0c7A12AdCd676e2b1a59ca3",
      aaveV3OptimizerMigrationAdapter:
        "0x9e2ea2d5785598a163D569D795f286F5C55ad972",
    },
    adaptiveCurveIrm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
    publicAllocator: "0xfd32fA2ca22c76dD6E550706Ad913FC6CE91c75D",
    metaMorphoFactory: "0x1897A8997241C1cD4bD0698647e4EB7213535c24",
    vaultV2Factory: "0xA1D94F746dEfa1928926b84fB2596c06926C0405",
    morphoVaultV1AdapterFactory: "0xD1B8E2dee25c2b89DCD2f98448a7ce87d6F63394",
    registryList: "0x3696c5eAe4a7Ffd04Ea163564571E9CD8Ed9364e",
    chainlinkOracleFactory: "0x3A7bB36Ee3f3eE32A60e9f2b33c1e5f2E83ad766",
    preLiquidationFactory: "0x6FF33615e792E35ed1026ea7cACCf42D9BF83476",

    wNative: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    morphoToken: "0x9994E35Db50125E0DF82e4c2dde62496CE330999",
    // Must implement DAI specific permit (otherwise breaks permit signatures).
    dai: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    sDai: "0x83F20F44975D03b1b09e64809B757c47f942BEeA",
    mkr: "0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2",
    stEth: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
    wstEth: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
    osEth: "0xf1C9acDc66974dFB6dEcB12aA385b9cD01190E38",
    bIB01: "0xCA30c93B02514f86d5C86a6e375E3A330B435Fb5",
    // If we want to change the wbIB01 address, we have to check if the new one has simple permit or not.
    // Currently, wbIB01 is considered to have simple permit.
    wbIB01: "0xcA2A7068e551d5C4482eb34880b194E4b945712F",
    bC3M: "0x2F123cF3F37CE3328CC9B5b8415f9EC5109b45e7",
    // If we want to change the wbC3M address, we have to check if the new one has simple permit or not.
    // Currently, wbC3M is considered to have simple permit.
    wbC3M: "0x95D7337d43340E2721960Dc402D9b9117f0d81a2",
    // Must implement USDC permit version 2 (otherwise breaks permit signatures).
    usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    usdt: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    crvUsd: "0xf939E0A03FB07F59A73314E73794Be0E57ac1b4E",

    "stkcvxcrvUSDTWBTCWETH-morpho":
      "0xb0Ce26C88e4e7DCa51968b6047f44646f5064278",
    crvUSDTWBTCWETH: "0xf5f5B97624542D72A9E06f04804Bf81baA15e2B4",
    "stkcvxcrvUSDCWBTCWETH-morpho":
      "0x0ea1a65A2c255f24Ee8D81eA6AaC54Decd9d269e",
    crvUSDCWBTCWETH: "0x7F86Bf177Dd4F3494b841a37e810A34dD56c829B",
    "stkcvxcrvCRVUSDTBTCWSTETH-morpho":
      "0x3ce8Ec9f3d89aD0A2DdbCC3FDB8991BD241Fc82E",
    crvCRVUSDTBTCWSTETH: "0x2889302a794dA87fBF1D6Db415C1492194663D13",
    "stkcvxTryLSD-morpho": "0x6BA072F0d22806F2C52e9792AF47f2D59103BEBE",
    tryLSD: "0x2570f1bD5D2735314FC102eb12Fc1aFe9e6E7193",
    "stkcvxcrvUSDETHCRV-morpho": "0xAc904BAfBb5FB04Deb2b6198FdCEedE75a78Ce5a",
    crvUSDETHCRV: "0x4eBdF703948ddCEA3B11f675B4D1Fba9d2414A14",
    "stkcvx2BTC-f-morpho": "0x385E12cf4040543Bc8C18e05C1298Be5B04f3f5e",
    "2BTC-f": "0xB7ECB2AA52AA64a717180E030241bC75Cd946726",
  },
  [ChainId.BaseMainnet]: {
    morpho: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    bundler3: {
      bundler3: "0x6BFd8137e702540E7A42B74178A4a49Ba43920C4",
      generalAdapter1: "0xb98c948CFA24072e58935BC004a8A7b376AE746A",
      paraswapAdapter: "0x6abE8ABd0275E5564ed1336F0243A52C32562F71",
      erc20WrapperAdapter: "0xdeEf55F0A7366cC3Baf5E04313269389Fe17E9AE",
      compoundV3MigrationAdapter: "0x85D4812Ef92c040d4270eD8547b6835e41FbbB70",
      aaveV3CoreMigrationAdapter: "0xb27Aa2a964eAd5ed661D86974b37e4fB995b36f5",
    },
    adaptiveCurveIrm: "0x46415998764C29aB2a25CbeA6254146D50D22687",
    publicAllocator: "0xA090dD1a701408Df1d4d0B85b716c87565f90467",
    metaMorphoFactory: "0xFf62A7c278C62eD665133147129245053Bbf5918",
    vaultV2Factory: "0x4501125508079A99ebBebCE205DeC9593C2b5857",
    morphoVaultV1AdapterFactory: "0xF42D9c36b34c9c2CF3Bc30eD2a52a90eEB604642",
    registryList: "0x5C2531Cbd2cf112Cf687da3Cd536708aDd7DB10a",
    chainlinkOracleFactory: "0x2DC205F24BCb6B311E5cdf0745B0741648Aebd3d",
    preLiquidationFactory: "0x8cd16b62E170Ee0bA83D80e1F80E6085367e2aef",

    wNative: "0x4200000000000000000000000000000000000006",
    // Must implement USDC permit version 2 (otherwise breaks permit signatures).
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    verUsdc: "0x59aaF835D34b1E3dF2170e4872B785f11E2a964b",
    testUsdc: "0xBC77067f829979812d795d516E523C4033b66409",
  },
  [ChainId.PolygonMainnet]: {
    morpho: "0x1bF0c2541F820E775182832f06c0B7Fc27A25f67",
    bundler3: {
      bundler3: "0x2d9C3A9E67c966C711208cc78b34fB9E9f8db589",
      generalAdapter1: "0xB261B51938A9767406ef83bbFbaAFE16691b7047",
      paraswapAdapter: "0x5F2617F12D1fDd1e43e72Cb80C92dFcE8124Db8d",
      compoundV3MigrationAdapter: "0xB34D2f54139bA12defC315C0822aDf9A5eB9A9b7",
      aaveV2MigrationAdapter: "0x43980Ae597f12Ff64690506b2AEEFFb4D8BeAF2a",
      aaveV3CoreMigrationAdapter: "0xEcB1662a1dff5C20650CF98c3334d2fddcD50742",
    },
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    adaptiveCurveIrm: "0xe675A2161D4a6E2de2eeD70ac98EEBf257FBF0B0",
    publicAllocator: "0xfac15aff53ADd2ff80C2962127C434E8615Df0d3",
    metaMorphoFactory: "0xa9c87daB340631C34BB738625C70499e29ddDC98",
    chainlinkOracleFactory: "0x1ff7895Eb842794c5d07C4c547b6730e61295215",
    preLiquidationFactory: "0xeDadDe37D76c72b98725614d0b41C20Fe612d304",

    wNative: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
    // Must implement USDC permit version 2 (otherwise breaks permit signatures).
    usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  },
  [ChainId.ArbitrumMainnet]: {
    morpho: "0x6c247b1F6182318877311737BaC0844bAa518F5e",
    bundler3: {
      bundler3: "0x1FA4431bC113D308beE1d46B0e98Cb805FB48C13",
      generalAdapter1: "0x9954aFB60BB5A222714c478ac86990F221788B88",
      paraswapAdapter: "0xAA5c30C1482c189cA0d56057D3ac4dD7Af1e4726",
      aaveV3CoreMigrationAdapter: "0x1923670d4F4eB7435d865E7477d28FEAFfA40C93",
      compoundV3MigrationAdapter: "0x86Ca77a4a37A9CDBe9bBf4975F6d69531B96444b",
    },
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    adaptiveCurveIrm: "0x66F30587FB8D4206918deb78ecA7d5eBbafD06DA",
    publicAllocator: "0x769583Af5e9D03589F159EbEC31Cc2c23E8C355E",
    metaMorphoFactory: "0x878988f5f561081deEa117717052164ea1Ef0c82",
    chainlinkOracleFactory: "0x98Ce5D183DC0c176f54D37162F87e7eD7f2E41b5",
    preLiquidationFactory: "0x635c31B5DF1F7EFbCbC07E302335Ef4230758e3d",

    wNative: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    // Must implement USDC permit version 2 (otherwise breaks permit signatures).
    usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  },
  [ChainId.OptimismMainnet]: {
    morpho: "0xce95AfbB8EA029495c66020883F87aaE8864AF92",
    bundler3: {
      bundler3: "0xFBCd3C258feB131D8E038F2A3a670A7bE0507C05",
      generalAdapter1: "0x79481C87f24A3C4332442A2E9faaf675e5F141f0",
      paraswapAdapter: "0x31F539f4Ed14fA1fd18781e93f6739249692aDC5",
    },
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    adaptiveCurveIrm: "0x8cD70A8F399428456b29546BC5dBe10ab6a06ef6",
    publicAllocator: "0x0d68a97324E602E02799CD83B42D337207B40658",
    metaMorphoFactory: "0x3Bb6A6A0Bc85b367EFE0A5bAc81c5E52C892839a",
    chainlinkOracleFactory: "0x1ec408D4131686f727F3Fd6245CF85Bc5c9DAD70",
    preLiquidationFactory: "0x3d05C01EE8e97361b9E19D172128255eaE5F98B9",

    wNative: "0x4200000000000000000000000000000000000006",
    // Must implement USDC permit version 2 (otherwise breaks permit signatures).
    usdc: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
  },
  [ChainId.WorldChainMainnet]: {
    morpho: "0xE741BC7c34758b4caE05062794E8Ae24978AF432",
    bundler3: {
      bundler3: "0x3D07BF2FFb23248034bF704F3a4786F1ffE2a448",
      generalAdapter1: "0x30fa9A3cF56931ACEea42E28D35519a97D90aA67",
    },
    adaptiveCurveIrm: "0x34E99D604751a72cF8d0CFDf87069292d82De472",
    publicAllocator: "0xef9889B4e443DEd35FA0Bd060f2104Cca94e6A43",
    metaMorphoFactory: "0x4DBB3a642a2146d5413750Cca3647086D9ba5F12",
    chainlinkOracleFactory: "0xd706690BA1Fe26b70c4AD89e60ff62cEB3A2eD02",
    preLiquidationFactory: "0xe3cE2051a24e58DBFC0eFBe4c2d9e89c5eAe4695",

    wNative: "0x4200000000000000000000000000000000000006",
  },
  [ChainId.FraxtalMainnet]: {
    morpho: "0xa6030627d724bA78a59aCf43Be7550b4C5a0653b",
    bundler3: {
      bundler3: "0xA7a414823Ef0F8CFb2c4f67f2F445DA940641d91",
      generalAdapter1: "0x228dDF333DDf6D1895dA1dE8a846EDD27F1284eD",
    },
    adaptiveCurveIrm: "0xA0D4D77b5D9933073572E19C172BFE866312673b",
    publicAllocator: "0x37a888192165fC39884f87c64E2476BfD2C09675",
    metaMorphoFactory: "0x27D4Af0AC9E7FDfA6D0853236f249CC27AE79488",
    chainlinkOracleFactory: "0x39d8622C607A691D7705E8842fbB12E3c38dCD41",
    preLiquidationFactory: "0x373ccddcd3F09D2e1430B3F2b290B9bF56Ae7336",

    wNative: "0xFC00000000000000000000000000000000000006",
  },
  [ChainId.ScrollMainnet]: {
    morpho: "0x2d012EdbAdc37eDc2BC62791B666f9193FDF5a55",
    bundler3: {
      bundler3: "0x60F9159d4dCd724e743212416FD57d8aC0B60768",
      generalAdapter1: "0xD2780fae0869cDc06EE202152304A39653361525",
    },
    adaptiveCurveIrm: "0xa5EA7500A27C0079961D93366A6e93aafF18CB90",
    publicAllocator: "0x8a7f671E45E51dE245649Cf916cA0256FB8a9927",
    metaMorphoFactory: "0x56b65742ade55015e6480959808229Ad6dbc9295",
    chainlinkOracleFactory: "0xb5961902E60b188b1c665B7b72Ef616656A9e24E",
    preLiquidationFactory: "0xeD960178e4aDA0296786Fa79D84e8FDF7bd44B25",

    wNative: "0x5300000000000000000000000000000000000004",
    // Must implement USDC permit version 2 (otherwise breaks permit signatures).
    usdc: "0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4",
  },
  [ChainId.InkMainnet]: {
    morpho: "0x857f3EefE8cbda3Bc49367C996cd664A880d3042",
    bundler3: {
      bundler3: "0x7db0F1E2bf1f47ec82220090F388d75D8B9BB6BC",
      generalAdapter1: "0xB8B2aDdCDe1cdC94AaE18a0F8A19df03D8683610",
    },
    adaptiveCurveIrm: "0x9515407b1512F53388ffE699524100e7270Ee57B",
    publicAllocator: "0x85416891752a6B81106c1C2999AE1AF5d8Cd3357",
    metaMorphoFactory: "0xd3f39505d0c48AFED3549D625982FdC38Ea9904b",
    chainlinkOracleFactory: "0x3FFFE273ee348b9E1ef89533025C7f165B17B439",
    preLiquidationFactory: "0x30607fEa77168d2c0401B6f60F0B40E32F9339E3",

    wNative: "0x4200000000000000000000000000000000000006",
    // Must implement USDC permit version 2 (otherwise breaks permit signatures).
    usdc: "0xF1815bd50389c46847f0Bda824eC8da914045D14",
  },
  [ChainId.Unichain]: {
    morpho: "0x8f5ae9CddB9f68de460C77730b018Ae7E04a140A",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    bundler3: {
      bundler3: "0x7DD85759182495AF7F6757DA75036d24A9B58bc3",
      generalAdapter1: "0xC11329d19C2275c9E759867e879ECFcEeD7e30A0",
      paraswapAdapter: "0xAa870Da2a9F611A3A53d0D2AEe5664B3700a59c9",
      compoundV3MigrationAdapter: "0x617f8d7885CCE689115Af04576F7cB6F2534fA9a",
    },
    adaptiveCurveIrm: "0x9a6061d51743B31D2c3Be75D83781Fa423f53F0E",
    publicAllocator: "0xB0c9a107fA17c779B3378210A7a593e88938C7C9",
    metaMorphoFactory: "0xe9EdE3929F43a7062a007C3e8652e4ACa610Bdc0",
    chainlinkOracleFactory: "0x43269546e1D586a1f7200a0AC07e26f9631f7539",
    preLiquidationFactory: "0xb04e4D3D59Ee47Ca9BA192707AF13A7D02969911",

    wNative: "0x4200000000000000000000000000000000000006",
    // Must implement USDC permit version 2 (otherwise breaks permit signatures).
    usdc: "0x078D782b760474a361dDA0AF3839290b0EF57AD6",
  },
  [ChainId.SonicMainnet]: {
    morpho: "0xd6c916eB7542D0Ad3f18AEd0FCBD50C582cfa95f",
    bundler3: {
      bundler3: "0xB06F1Ad8c908b958E596c42973f67F2f1d9a9afF",
      generalAdapter1: "0x31D5aee8D75EEab548cfA0d11C4f9843a5201eaf",
    },
    adaptiveCurveIrm: "0xDEfCf242226425f93d8DD0e314735C28517C473F",
    publicAllocator: "0x6Cef2EDC70D87E8f1623f3096efF05d066E59B36",
    metaMorphoFactory: "0x0cE9e3512CB4df8ae7e265e62Fb9258dc14f12e8",
    chainlinkOracleFactory: "0x7DA59Fa482F1F49fADc486d8e47BADc506fEb86d",
    preLiquidationFactory: "0xc72129DA4CC808e955699111b8c22B22Ca8A10b8",

    wNative: "0x039e2fB66102314Ce7b64Ce5Ce3E5183bc94aD38",
  },
  [ChainId.HemiMainnet]: {
    morpho: "0xa4Ca2c2e25b97DA19879201bA49422bc6f181f42",
    bundler3: {
      bundler3: "0x8eDa6E01a20E3Cd90B3B2AF6F790cB8FADEf3Ea8",
      generalAdapter1: "0x9623090C3943ad63F7d794378273610Dd0deeFD4",
    },
    adaptiveCurveIrm: "0xdEbdEa31624552DF904A065221cD14088ABDeD70",
    publicAllocator: "0x4107Ea1746909028d6212B315dE5fE9538F9eb39",
    metaMorphoFactory: "0x8e52179BeB18E882040b01632440d8Ca0f01da82",
    chainlinkOracleFactory: "0xB3cb32E6185446a6Bc7A047E4FfA138fA939e133",
    preLiquidationFactory: "0x40F2896C551194e364F7C846046C34d8a9FE97e4",

    wNative: "0x4200000000000000000000000000000000000006",
    // Must implement USDC permit version 2 (otherwise breaks permit signatures).
    usdc: "0xad11a8BEb98bbf61dbb1aa0F6d6F2ECD87b35afA",
  },
  [ChainId.ModeMainnet]: {
    morpho: "0xd85cE6BD68487E0AaFb0858FDE1Cd18c76840564",
    bundler3: {
      bundler3: "0xFEA0edFa081C8D5960Ec9Bf6684981dB1834305d",
      generalAdapter1: "0xF53925b95Cc409447066cd5c1A7756084b2Ee0a4",
    },
    adaptiveCurveIrm: "0xE3d46Ae190Cb39ccA3655E966DcEF96b4eAe1d1c",
    publicAllocator: "0xEE868Bf3359DA30c10ea472EAEBFC0a06E8F0120",
    metaMorphoFactory: "0xae5b0884bfff430493D6C844B9fd052Af7d79278",
    chainlinkOracleFactory: "0xf9380f7898423Bd7FDe3C9fDD1b2671A2471f39D",
    preLiquidationFactory: "0x249E4808264c545861e43728186a731dE7c7D745",

    wNative: "0x4200000000000000000000000000000000000006",
  },
  [ChainId.CornMainnet]: {
    morpho: "0xc2B1E031540e3F3271C5F3819F0cC7479a8DdD90",
    bundler3: {
      bundler3: "0x086889F9bdE8349512dD77088A7114E6C1c42Af7",
      generalAdapter1: "0x464a402244bCDdc0c2091D5193E8ffdb2be54Ca9",
    },
    adaptiveCurveIrm: "0x58a42117d753a0e69694545DfA19d64c2fB759fB",
    publicAllocator: "0xDFde06e2B2A2D718eE5560b73dA4F830E56A2f10",
    metaMorphoFactory: "0xe430821595602eA5DD0cD350f86987437c7362fA",
    chainlinkOracleFactory: "0x16278156D366fC91536b6b81482ffaC47EEa06D6",
    preLiquidationFactory: "0xb9065AC18d3EBdb3263B77B587f9c5CD570545D1",

    wNative: "0xda5dDd7270381A7C2717aD10D1c0ecB19e3CDFb2",
    // Must implement USDC permit version 2 (otherwise breaks permit signatures).
    usdc: "0xDF0B24095e15044538866576754F3C964e902Ee6",
  },
  [ChainId.PlumeMainnet]: {
    morpho: "0x42b18785CE0Aed7BF7Ca43a39471ED4C0A3e0bB5",
    bundler3: {
      bundler3: "0x5437C8788f4CFbaA55be6FBf30379bc7dd7f69C3",
      generalAdapter1: "0x65ff368930Cb7eB4CA5C5eBC58bb69E6Ed198BA5",
    },
    adaptiveCurveIrm: "0x7420302Ddd469031Cd2282cd64225cCd46F581eA",
    publicAllocator: "0x58485338D93F4e3b4Bf2Af1C9f9C0aDF087AEf1C",
    metaMorphoFactory: "0x2525D453D9BA13921D5aB5D8c12F9202b0e19456",
    chainlinkOracleFactory: "0x133F742c0D36864F37e15C33a18bA6fdc950ED0f",
    preLiquidationFactory: "0xF184156Cf6Ad4D3dA7F6449D40755A0f9de97ef3",

    wNative: "0xEa237441c92CAe6FC17Caaf9a7acB3f953be4bd1",
  },
  [ChainId.CampMainnet]: {
    morpho: "0xc7CAd9B1377Eb8103397Cb07Cb5c4f03eb2eBEa8",
    bundler3: {
      bundler3: "0xc1A86b3a552C5a34e1ecc910341A64Cc89b2CB01",
      generalAdapter1: "0x86eaf48Fd73c1Aa30E801D01d0efFd731c3E5E85",
    },
    adaptiveCurveIrm: "0xeEccdD33c0C06d7DDa31E3C4a1Cdb35a2A756246",
    publicAllocator: "0x1e145648DA9aC9d831B4F7931C06e9828083BD40",
    metaMorphoFactory: "0xa8CD521d42b716821D7ddD2Ca6a237087aA5b487",
    chainlinkOracleFactory: "0x24Bc64f44B429EEA86c8B1f9C03F54Ab0C6c0C15",
    preLiquidationFactory: "0x6C0155CC30f760DC49138B389F5B69F56eD08841",

    wNative: "0x1aE9c40eCd2DD6ad5858E5430A556d7aff28A44b",
  },
  [ChainId.KatanaMainnet]: {
    morpho: "0xD50F2DffFd62f94Ee4AEd9ca05C61d0753268aBc",
    bundler3: {
      bundler3: "0xA8C5e23C9C0DF2b6fF716486c6bBEBB6661548C8",
      generalAdapter1: "0x916Aa175C36E845db45fF6DDB886AE437d403B61",
    },
    adaptiveCurveIrm: "0x4F708C0ae7deD3d74736594C2109C2E3c065B428",
    publicAllocator: "0x39EB6Da5e88194C82B13491Df2e8B3E213eD2412",
    metaMorphoFactory: "0x1c8De6889acee12257899BFeAa2b7e534de32E16",
    chainlinkOracleFactory: "0x7D047fB910Bc187C18C81a69E30Fa164f8c536eC",
    preLiquidationFactory: "0x678EB53A3bB79111263f47B84989d16D81c36D85",

    wNative: "0xEE7D8BCFb72bC1880D0Cf19822eB0A2e6577aB62",
  },
  [ChainId.EtherlinkMainnet]: {
    morpho: "0xbCE7364E63C3B13C73E9977a83c9704E2aCa876e",
    bundler3: {
      bundler3: "0x69dc8086191437b55775b79C730BB3876397e7D1",
      generalAdapter1: "0xEabdAC78A7f0a9B3dF0e23D69A5a5fF7f580a910",
    },
    adaptiveCurveIrm: "0xC1523BE776e66ba07b609b1914D0925278f21FE5",
    publicAllocator: "0x8b8B1bd41d36c06253203CD21463994aB752c1e6",
    metaMorphoFactory: "0x997a79c3C04c5B9eb27d343ae126bcCFb5D74781",
    chainlinkOracleFactory: "0x12FA40f687a35611720E1DcB59976B6e51247298",
    preLiquidationFactory: "0xd1c37fDd941256FC184eF3A07Be540a90b81Ec21",

    wNative: "0xc9B53AB2679f573e480d01e0f49e2B5CFB7a3EAb",
  },
  [ChainId.TacMainnet]: {
    morpho: "0x918B9F2E4B44E20c6423105BB6cCEB71473aD35c",
    bundler3: {
      bundler3: "0x84b189823D0f84c36728Bb3335dD8C833564e72f",
      generalAdapter1: "0x6D94E7dCA6d8FAE2CF954633C2Cf9c286258E0af",
    },
    adaptiveCurveIrm: "0x7E82b16496fA8CC04935528dA7F5A2C684A3C7A3",
    publicAllocator: "0x414247afcf1fE3b94C617e7E3A7adB81D8D3208F",
    metaMorphoFactory: "0xcDA78f4979d17Ec93052A84A12001fe0088AD734",
    chainlinkOracleFactory: "0xbf10eD52dD60C60E901BF022c3675303ad4a56b1",
    preLiquidationFactory: "0x5851C1e423A2F93aFb821834a63cA052D19ae4Ef",

    wNative: "0xB63B9f0eb4A6E6f191529D71d4D88cc8900Df2C9",
  },
  [ChainId.LiskMainnet]: {
    morpho: "0x00cD58DEEbd7A2F1C55dAec715faF8aed5b27BF8",
    bundler3: {
      bundler3: "0xD96E5e02580C4EAfE15B5537b25eE3dEe5861e00",
      generalAdapter1: "0x76cFE4BF840C7b461772fE7CDE399f58c4173584",
    },
    adaptiveCurveIrm: "0x5576629f21D528A8c3e06C338dDa907B94563902",
    publicAllocator: "0xb1E5B1De2a54ab55C412B5ee1E38e46799588103",
    metaMorphoFactory: "0x01dD876130690469F685a65C2B295A90a81BaD91",
    chainlinkOracleFactory: "0x2eb4D17C2AAf1EA62Bf83Fb49Dd1128b14AF4D93",
    preLiquidationFactory: "0xF2c325F26691b6556e6f66451bb38bDa37FEbaa7",

    wNative: "0x4200000000000000000000000000000000000006",
    // Must implement USDC permit version 2 (otherwise breaks permit signatures).
    usdc: "0xF242275d3a6527d877f2c927a82D9b057609cc71",
  },
  [ChainId.HyperliquidMainnet]: {
    morpho: "0x68e37dE8d93d3496ae143F2E900490f6280C57cD",
    bundler3: {
      bundler3: "0xa3F50477AfA601C771874260A3B34B40e244Fa0e",
      generalAdapter1: "0xD7F48aDE56613E8605863832B7B8A1985B934aE4",
    },
    adaptiveCurveIrm: "0xD4a426F010986dCad727e8dd6eed44cA4A9b7483",
    publicAllocator: "0x517505be22D9068687334e69ae7a02fC77edf4Fc",
    metaMorphoFactory: "0xec051b19d654C48c357dC974376DeB6272f24e53",
    vaultV2Factory: "0xD7217E5687FF1071356C780b5fe4803D9D967da7",
    morphoVaultV1AdapterFactory: "0xdf5202e29654e02011611A086f15477880580CAc",
    registryList: "0x857B55cEb57dA0C2A83EE08a8dB529B931089aee",
    chainlinkOracleFactory: "0xeb476f124FaD625178759d13557A72394A6f9aF5",
    preLiquidationFactory: "0x1b6782Ac7A859503cE953FBf4736311CC335B8f0",

    wNative: "0x5555555555555555555555555555555555555555",
  },
  [ChainId.SeiMainnet]: {
    morpho: "0xc9cDAc20FCeAAF616f7EB0bb6Cd2c69dcfa9094c",
    bundler3: {
      bundler3: "0xF9457356F18A3349Bb317Ac144c3Bcc62e5761aD",
      generalAdapter1: "0x02e0e71e145f254820B9D89c9E6068f08256F601",
    },
    adaptiveCurveIrm: "0x6eFA8e3Aa8279eB2fd46b6083A9E52dA72EA56c4",
    publicAllocator: "0xD878509446bE2C601f0f032F501851001B159D6B",
    metaMorphoFactory: "0x8Dea49ec5bd5AeAc8bcf96B3E187F59354118291",
    chainlinkOracleFactory: "0x4bD68c2FF3274207EC07ED281C915758b6F23F07",
    preLiquidationFactory: "0x65eD61058cEB4895B7d62437BaCEA39b04f6D27B",
    wNative: "0xE30feDd158A2e3b13e9badaeABaFc5516e95e8C7",
  },
} as const;

export type ChainDeployments<Addresses = ChainAddresses> = {
  [key in keyof Addresses]: Address extends Addresses[key]
    ? bigint
    : ChainDeployments<Addresses[key]>;
};

const _deployments = {
  [ChainId.EthMainnet]: {
    morpho: 18883124n,
    permit2: 15986406n,
    bundler3: {
      bundler3: 21643807n,
      generalAdapter1: 21872136n,
      paraswapAdapter: 21643807n,
      erc20WrapperAdapter: 21872136n,
      compoundV2MigrationAdapter: 21643807n,
      compoundV3MigrationAdapter: 21643807n,
      aaveV2MigrationAdapter: 21643807n,
      aaveV3CoreMigrationAdapter: 21643807n,
      aaveV3PrimeMigrationAdapter: 21643807n,
      aaveV3EtherFiMigrationAdapter: 21643807n,
      aaveV3OptimizerMigrationAdapter: 21643807n,
    },
    adaptiveCurveIrm: 18883124n,
    publicAllocator: 19375099n,
    metaMorphoFactory: 21439510n,
    vaultV2Factory: 23375073n,
    morphoVaultV1AdapterFactory: 23375073n,
    registryList: 23375119n,
    chainlinkOracleFactory: 19375066n,
    preLiquidationFactory: 21414664n,
  },
  [ChainId.BaseMainnet]: {
    morpho: 13977148n,
    permit2: 1425180n,
    bundler3: {
      bundler3: 25161671n,
      generalAdapter1: 26539234n,
      paraswapAdapter: 25161671n,
      erc20WrapperAdapter: 26539234n,
      compoundV3MigrationAdapter: 25161671n,
      aaveV3CoreMigrationAdapter: 25161671n,
    },
    adaptiveCurveIrm: 13977152n,
    publicAllocator: 13979545n,
    metaMorphoFactory: 23928808n,
    vaultV2Factory: 35615206n,
    morphoVaultV1AdapterFactory: 35615206n,
    registryList: 35615358n,
    chainlinkOracleFactory: 13978286n,
    preLiquidationFactory: 23779056n,
  },
  [ChainId.PolygonMainnet]: {
    morpho: 66931042n,
    bundler3: {
      bundler3: 68074185n,
      generalAdapter1: 68074185n,
      paraswapAdapter: 68074185n,
      compoundV3MigrationAdapter: 68690465n,
      aaveV2MigrationAdapter: 68690465n,
      aaveV3CoreMigrationAdapter: 68690465n,
    },
    permit2: 35701901n,
    adaptiveCurveIrm: 66931042n,
    publicAllocator: 66931042n,
    metaMorphoFactory: 66931042n,
    chainlinkOracleFactory: 66931042n,
    preLiquidationFactory: 68074185n,
  },
  [ChainId.ArbitrumMainnet]: {
    morpho: 296446593n,
    bundler3: {
      bundler3: 307326238n,
      generalAdapter1: 307326238n,
      paraswapAdapter: 307326988n,
      aaveV3CoreMigrationAdapter: 358694526n,
      compoundV3MigrationAdapter: 358693964n,
    },
    permit2: 38692735n,
    adaptiveCurveIrm: 296446593n,
    publicAllocator: 296446593n,
    metaMorphoFactory: 296447195n,
    chainlinkOracleFactory: 296447195n,
    preLiquidationFactory: 307326238n,
  },
  [ChainId.OptimismMainnet]: {
    morpho: 130770075n,
    bundler3: {
      bundler3: 132139369n,
      generalAdapter1: 132139369n,
      paraswapAdapter: 132139438n,
    },
    permit2: 38854427n,
    adaptiveCurveIrm: 130770075n,
    publicAllocator: 130770075n,
    metaMorphoFactory: 130770189n,
    chainlinkOracleFactory: 130770189n,
    preLiquidationFactory: 132139369n,
  },
  [ChainId.WorldChainMainnet]: {
    morpho: 9025669n,
    bundler3: {
      bundler3: 10273494n,
      generalAdapter1: 10273494n,
    },
    adaptiveCurveIrm: 9025669n,
    publicAllocator: 9025669n,
    metaMorphoFactory: 9025733n,
    chainlinkOracleFactory: 9025733n,
    preLiquidationFactory: 10273494n,
  },
  [ChainId.FraxtalMainnet]: {
    morpho: 15317931n,
    bundler3: {
      bundler3: 16536231n,
      generalAdapter1: 16536231n,
    },
    adaptiveCurveIrm: 15317931n,
    publicAllocator: 15317931n,
    metaMorphoFactory: 15318007n,
    chainlinkOracleFactory: 15318007n,
    preLiquidationFactory: 16536231n,
  },
  [ChainId.ScrollMainnet]: {
    morpho: 12842868n,
    bundler3: {
      bundler3: 13504587n,
      generalAdapter1: 13504587n,
    },
    adaptiveCurveIrm: 12842868n,
    publicAllocator: 12842868n,
    metaMorphoFactory: 12842903n,
    chainlinkOracleFactory: 12842903n,
    preLiquidationFactory: 13504587n,
  },
  [ChainId.InkMainnet]: {
    morpho: 4078776n,
    bundler3: {
      bundler3: 6385077n,
      generalAdapter1: 6385077n,
    },
    adaptiveCurveIrm: 4078776n,
    publicAllocator: 4078776n,
    metaMorphoFactory: 4078830n,
    chainlinkOracleFactory: 4078830n,
    preLiquidationFactory: 6385077n,
  },
  [ChainId.Unichain]: {
    morpho: 9139027n,
    permit2: 0n,
    bundler3: {
      bundler3: 9381237n,
      generalAdapter1: 9381237n,
      paraswapAdapter: 20872902n,
      compoundV3MigrationAdapter: 22019479n,
    },
    adaptiveCurveIrm: 9139027n,
    publicAllocator: 9139027n,
    metaMorphoFactory: 9316789n,
    chainlinkOracleFactory: 9316789n,
    preLiquidationFactory: 9381237n,
  },
  [ChainId.SonicMainnet]: {
    morpho: 9100931n,
    bundler3: {
      bundler3: 9102286n,
      generalAdapter1: 9102286n,
    },
    adaptiveCurveIrm: 9100931n,
    publicAllocator: 9100931n,
    metaMorphoFactory: 9101319n,
    chainlinkOracleFactory: 9101319n,
    preLiquidationFactory: 9102286n,
  },
  [ChainId.HemiMainnet]: {
    morpho: 1188872n,
    bundler3: {
      bundler3: 1188907n,
      generalAdapter1: 1188907n,
    },
    adaptiveCurveIrm: 1188872n,
    publicAllocator: 1188872n,
    metaMorphoFactory: 1188885n,
    chainlinkOracleFactory: 1188885n,
    preLiquidationFactory: 1188907n,
  },
  [ChainId.ModeMainnet]: {
    morpho: 19983370n,
    bundler3: {
      bundler3: 19983599n,
      generalAdapter1: 19983599n,
    },
    adaptiveCurveIrm: 19983370n,
    publicAllocator: 19983370n,
    metaMorphoFactory: 19983443n,
    chainlinkOracleFactory: 19983443n,
    preLiquidationFactory: 19983599n,
  },
  [ChainId.CornMainnet]: {
    morpho: 251401n,
    bundler3: {
      bundler3: 253107n,
      generalAdapter1: 253107n,
    },
    adaptiveCurveIrm: 251401n,
    publicAllocator: 251401n,
    metaMorphoFactory: 253027n,
    chainlinkOracleFactory: 253027n,
    preLiquidationFactory: 253107n,
  },
  [ChainId.PlumeMainnet]: {
    morpho: 765994n,
    bundler3: {
      bundler3: 789925n,
      generalAdapter1: 789925n,
    },
    adaptiveCurveIrm: 765994n,
    publicAllocator: 765994n,
    metaMorphoFactory: 766078n,
    chainlinkOracleFactory: 766078n,
    preLiquidationFactory: 789925n,
  },
  [ChainId.CampMainnet]: {
    morpho: 4804080n,
    bundler3: {
      bundler3: 4804690n,
      generalAdapter1: 4804690n,
    },
    adaptiveCurveIrm: 4804080n,
    publicAllocator: 4804080n,
    metaMorphoFactory: 4804270n,
    chainlinkOracleFactory: 4804270n,
    preLiquidationFactory: 4804690n,
  },
  [ChainId.KatanaMainnet]: {
    morpho: 2741069n,
    bundler3: {
      bundler3: 2741993n,
      generalAdapter1: 2741993n,
    },
    adaptiveCurveIrm: 2741069n,
    publicAllocator: 2741069n,
    metaMorphoFactory: 2741420n,
    chainlinkOracleFactory: 2741420n,
    preLiquidationFactory: 2741993n,
  },
  [ChainId.EtherlinkMainnet]: {
    morpho: 21047448n,
    bundler3: {
      bundler3: 21050766n,
      generalAdapter1: 21050766n,
    },
    adaptiveCurveIrm: 21047448n,
    publicAllocator: 21047448n,
    metaMorphoFactory: 21050315n,
    chainlinkOracleFactory: 21050315n,
    preLiquidationFactory: 21050766n,
  },
  [ChainId.TacMainnet]: {
    morpho: 853025n,
    bundler3: {
      bundler3: 978967n,
      generalAdapter1: 978967n,
    },
    adaptiveCurveIrm: 853025n,
    publicAllocator: 853025n,
    metaMorphoFactory: 978654n,
    chainlinkOracleFactory: 978654n,
    preLiquidationFactory: 978967n,
  },
  [ChainId.LiskMainnet]: {
    morpho: 15731231n,
    bundler3: {
      bundler3: 15731595n,
      generalAdapter1: 15731595n,
    },
    adaptiveCurveIrm: 15731231n,
    publicAllocator: 15731231n,
    metaMorphoFactory: 15731333n,
    chainlinkOracleFactory: 15731333n,
    preLiquidationFactory: 15731595n,
  },
  [ChainId.HyperliquidMainnet]: {
    morpho: 1988429n,
    bundler3: {
      bundler3: 1988956n,
      generalAdapter1: 1988956n,
    },
    adaptiveCurveIrm: 1988429n,
    publicAllocator: 1988429n,
    metaMorphoFactory: 1988677n,
    vaultV2Factory: 14188393n,
    morphoVaultV1AdapterFactory: 14188393n,
    registryList: 14188698n,
    chainlinkOracleFactory: 1988677n,
    preLiquidationFactory: 1988956n,
  },
  [ChainId.SeiMainnet]: {
    morpho: 166036723n,
    bundler3: {
      bundler3: 168897284n,
      generalAdapter1: 168897284n,
    },
    adaptiveCurveIrm: 166036723n,
    publicAllocator: 166036723n,
    metaMorphoFactory: 168896078n,
    chainlinkOracleFactory: 168896078n,
    preLiquidationFactory: 168897284n,
  },
} as const satisfies Record<ChainId, ChainDeployments>;

export type AddressLabel = DottedKeys<(typeof _addressesRegistry)[ChainId]>;

export const getChainAddresses = (chainId: number): ChainAddresses => {
  const chainAddresses = addresses[chainId];
  if (chainAddresses == null) throw new UnsupportedChainIdError(chainId);

  return chainAddresses;
};

/**
 * Assumptions:
 * - unwrapped token has same number of decimals than wrapped tokens.
 */
const _unwrappedTokensMapping: Record<number, Record<Address, Address>> = {
  [ChainId.EthMainnet]: {
    [_addressesRegistry[ChainId.EthMainnet].wbIB01]:
      _addressesRegistry[ChainId.EthMainnet].bIB01,
    [_addressesRegistry[ChainId.EthMainnet].wbC3M]:
      _addressesRegistry[ChainId.EthMainnet].bC3M,
    [_addressesRegistry[ChainId.EthMainnet].wNative]: NATIVE_ADDRESS,
    [_addressesRegistry[ChainId.EthMainnet].stEth]: NATIVE_ADDRESS,
    [_addressesRegistry[ChainId.EthMainnet].wstEth]:
      _addressesRegistry[ChainId.EthMainnet].stEth,
    [_addressesRegistry[ChainId.EthMainnet]["stkcvxcrvUSDTWBTCWETH-morpho"]]:
      _addressesRegistry[ChainId.EthMainnet].crvUSDTWBTCWETH,
    [_addressesRegistry[ChainId.EthMainnet]["stkcvxcrvUSDCWBTCWETH-morpho"]]:
      _addressesRegistry[ChainId.EthMainnet].crvUSDCWBTCWETH,
    [_addressesRegistry[ChainId.EthMainnet][
      "stkcvxcrvCRVUSDTBTCWSTETH-morpho"
    ]]: _addressesRegistry[ChainId.EthMainnet].crvCRVUSDTBTCWSTETH,
    [_addressesRegistry[ChainId.EthMainnet]["stkcvxTryLSD-morpho"]]:
      _addressesRegistry[ChainId.EthMainnet].tryLSD,
    [_addressesRegistry[ChainId.EthMainnet]["stkcvxcrvUSDETHCRV-morpho"]]:
      _addressesRegistry[ChainId.EthMainnet].crvUSDETHCRV,
    [_addressesRegistry[ChainId.EthMainnet]["stkcvx2BTC-f-morpho"]]:
      _addressesRegistry[ChainId.EthMainnet]["2BTC-f"],
  },
  [ChainId.BaseMainnet]: {
    [_addressesRegistry[ChainId.BaseMainnet].wNative]: NATIVE_ADDRESS,
    [_addressesRegistry[ChainId.BaseMainnet].verUsdc]:
      _addressesRegistry[ChainId.BaseMainnet].usdc,
    [_addressesRegistry[ChainId.BaseMainnet].testUsdc]:
      _addressesRegistry[ChainId.BaseMainnet].usdc,
  },
  [ChainId.PolygonMainnet]: {
    [_addressesRegistry[ChainId.PolygonMainnet].wNative]: NATIVE_ADDRESS,
  },
  [ChainId.OptimismMainnet]: {
    [_addressesRegistry[ChainId.OptimismMainnet].wNative]: NATIVE_ADDRESS,
  },
  [ChainId.WorldChainMainnet]: {
    [_addressesRegistry[ChainId.WorldChainMainnet].wNative]: NATIVE_ADDRESS,
  },
  [ChainId.ScrollMainnet]: {
    [_addressesRegistry[ChainId.ScrollMainnet].wNative]: NATIVE_ADDRESS,
  },
  [ChainId.InkMainnet]: {
    [_addressesRegistry[ChainId.InkMainnet].wNative]: NATIVE_ADDRESS,
  },
  [ChainId.Unichain]: {
    [_addressesRegistry[ChainId.Unichain].wNative]: NATIVE_ADDRESS,
  },
  [ChainId.SonicMainnet]: {
    [_addressesRegistry[ChainId.SonicMainnet].wNative]: NATIVE_ADDRESS,
  },
  [ChainId.HemiMainnet]: {
    [_addressesRegistry[ChainId.HemiMainnet].wNative]: NATIVE_ADDRESS,
  },
  [ChainId.ModeMainnet]: {
    [_addressesRegistry[ChainId.ModeMainnet].wNative]: NATIVE_ADDRESS,
  },
  [ChainId.CornMainnet]: {
    [_addressesRegistry[ChainId.CornMainnet].wNative]: NATIVE_ADDRESS,
  },
  [ChainId.PlumeMainnet]: {
    [_addressesRegistry[ChainId.PlumeMainnet].wNative]: NATIVE_ADDRESS,
  },
  [ChainId.CampMainnet]: {
    [_addressesRegistry[ChainId.CampMainnet].wNative]: NATIVE_ADDRESS,
  },
  [ChainId.KatanaMainnet]: {
    [_addressesRegistry[ChainId.KatanaMainnet].wNative]: NATIVE_ADDRESS,
  },
  [ChainId.ArbitrumMainnet]: {
    [_addressesRegistry[ChainId.ArbitrumMainnet].wNative]: NATIVE_ADDRESS,
  },
  [ChainId.EtherlinkMainnet]: {
    [_addressesRegistry[ChainId.EtherlinkMainnet].wNative]: NATIVE_ADDRESS,
  },
  [ChainId.TacMainnet]: {
    [_addressesRegistry[ChainId.TacMainnet].wNative]: NATIVE_ADDRESS,
  },
  [ChainId.LiskMainnet]: {
    [_addressesRegistry[ChainId.LiskMainnet].wNative]: NATIVE_ADDRESS,
  },
  [ChainId.HyperliquidMainnet]: {
    [_addressesRegistry[ChainId.HyperliquidMainnet].wNative]: NATIVE_ADDRESS,
  },
  [ChainId.SeiMainnet]: {
    [_addressesRegistry[ChainId.SeiMainnet].wNative]: NATIVE_ADDRESS,
  },
};

export function getUnwrappedToken(wrappedToken: Address, chainId: number) {
  return unwrappedTokensMapping[chainId]?.[wrappedToken];
}

/**
 * The registry of all known ERC20Wrapper tokens.
 */
export const erc20WrapperTokens: Record<number, Set<Address>> = {};

/**
 * The registry of all known PermissionedERC20Wrapper with a `hasPermission` getter.
 * All permissioned wrapper tokens are considered ERC20Wrapper and automatically added to the erc20WrapperTokens registry.
 */
export const permissionedWrapperTokens: Record<number, Set<Address>> = {
  [ChainId.BaseMainnet]: new Set([
    _addressesRegistry[ChainId.BaseMainnet].testUsdc,
  ]),
};

/**
 * The registry of all known permissioned wrapped Backed tokens.
 * All permissioned Backed tokens are considered ERC20Wrapper and automatically added to the erc20WrapperTokens registry.
 */
export const permissionedBackedTokens: Record<number, Set<Address>> = {
  [ChainId.EthMainnet]: new Set([
    _addressesRegistry[ChainId.EthMainnet].wbIB01,
    _addressesRegistry[ChainId.EthMainnet].wbC3M,
  ]),
};

/**
 * The registry of all known permissioned wrapped tokens that require a Coinbase attestation.
 * All permissioned Coinbase tokens are considered PermissionedERC20Wrapper and automatically added to the permissionedWrapperTokens registry.
 */
export const permissionedCoinbaseTokens: Record<number, Set<Address>> = {
  [ChainId.BaseMainnet]: new Set([
    _addressesRegistry[ChainId.BaseMainnet].verUsdc,
  ]),
};

export const getPermissionedCoinbaseTokens = (chainId: number) =>
  permissionedCoinbaseTokens[chainId] ?? new Set();

entries(permissionedBackedTokens).forEach(([chainId, tokens]) => {
  tokens.forEach((token) =>
    (erc20WrapperTokens[chainId] ??= new Set()).add(token),
  );
});

entries(permissionedCoinbaseTokens).forEach(([chainId, tokens]) => {
  tokens.forEach((token) =>
    (permissionedWrapperTokens[chainId] ??= new Set()).add(token),
  );
});

entries(permissionedWrapperTokens).forEach(([chainId, tokens]) => {
  tokens.forEach((token) =>
    (erc20WrapperTokens[chainId] ??= new Set()).add(token),
  );
});

/** /!\  These tokens can not be listed in `erc20WrapperTokens` because the following specs are different:
 * - calling `depositFor` supplies on blue instead of minting wrapped token to the user
 */
export const convexWrapperTokens: Record<number, Set<Address>> = {
  [ChainId.EthMainnet]: new Set([
    _addressesRegistry[ChainId.EthMainnet]["stkcvxcrvUSDTWBTCWETH-morpho"],
    _addressesRegistry[ChainId.EthMainnet]["stkcvxcrvUSDCWBTCWETH-morpho"],
    _addressesRegistry[ChainId.EthMainnet]["stkcvxcrvCRVUSDTBTCWSTETH-morpho"],
    _addressesRegistry[ChainId.EthMainnet]["stkcvxTryLSD-morpho"],
    _addressesRegistry[ChainId.EthMainnet]["stkcvxcrvUSDETHCRV-morpho"],
    _addressesRegistry[ChainId.EthMainnet]["stkcvx2BTC-f-morpho"],
  ]),
};

export let addressesRegistry = deepFreeze(_addressesRegistry);
export let addresses = addressesRegistry as Record<number, ChainAddresses>;
export let deployments = deepFreeze(_deployments);
export let unwrappedTokensMapping = deepFreeze(_unwrappedTokensMapping);

/**
 * Registers custom addresses and unwrapped token mappings to extend
 * the default address registry (on ewisting or unknown chains).
 *
 * @param options - Optional configuration object
 * @param options.unwrappedTokens - A mapping of chain IDs to token address maps,
 *                                  where each entry maps wrapped tokens to their unwrapped equivalents.
 * @param options.addresses - Custom address entries to merge into the default registry.
 *                            Can be a subset of `ChainAddresses` if chain is already known.
 *                            Must provide all required addresses if chain is unknown.
 * @param options.deployments - Custom deployment entries to merge into the default registry.
 *                              Can be a subset of `ChainDeployments` if chain is already known.
 *                              Must provide all required deployments if chain is unknown.
 *
 * @throws {Error} If attempting to override an existing address.
 *
 * @example
 * ```ts
 * registerCustomAddresses({
 *   addresses: {
 *     1: { contract: "0xabc..." }
 *   },
 *   unwrappedTokens: {
 *     1: { "0xWrapped": "0xUnwrapped" }
 *   }
 * });
 * ```
 */
export function registerCustomAddresses({
  unwrappedTokens,
  addresses: customAddresses,
  deployments: customDeployments,
}: {
  unwrappedTokens?: Record<number, Record<Address, Address>>;
  addresses?:
    | DeepPartial<Record<keyof typeof _addressesRegistry, ChainAddresses>>
    | Record<number, ChainAddresses>;
  deployments?:
    | DeepPartial<Record<keyof typeof _deployments, ChainDeployments>>
    | Record<number, ChainDeployments>;
} = {}) {
  const customizer =
    (type: string) =>
    // biome-ignore lint/suspicious/noExplicitAny: type is not trivial and not important here
    (objValue: any, srcValue: any, key: string) => {
      if (
        objValue !== undefined &&
        !isPlainObject(objValue) &&
        objValue !== srcValue
      )
        throw new Error(`Cannot override existing ${type}: ${key}`);
    };

  if (customAddresses)
    addresses = addressesRegistry = deepFreeze(
      mergeWith({}, addressesRegistry, customAddresses, customizer("address")),
    );

  if (customDeployments)
    deployments = deepFreeze(
      mergeWith({}, deployments, customDeployments, customizer("deployment")),
    );

  if (unwrappedTokens)
    unwrappedTokensMapping = deepFreeze(
      mergeWith(
        {},
        unwrappedTokensMapping,
        unwrappedTokens,
        customizer("unwrapped token"),
      ),
    );
}
