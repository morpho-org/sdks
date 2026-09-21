import { ChainId } from "./chain.js";
import {
  IncompleteChainRegistryError,
  RegistryValueAlreadyRegisteredError,
  UnknownAddressError,
  UnsupportedChainIdError,
} from "./errors.js";
import type { DeepPartial, DottedKeys } from "./types.js";
import { deepFreeze, entries, fromEntries, isHexEqual, keys } from "./utils.js";

/** Address used to replicate an erc20-behaviour for native token.
 *
 * NB: data might differ from expected onchain native token data
 */
export const NATIVE_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

/** Registry entry for protocol, adapter, factory, and token addresses on one chain. */
export interface ChainAddresses {
  /** Morpho Blue core contract for isolated lending markets, positions, authorization, and liquidations. */
  blue: `0x${string}`;
  /** Permit2 contract used by periphery contracts for token approvals. */
  permit2?: `0x${string}`;
  /** Standalone bundle periphery contracts for composing protocol workflows. */
  readonly bundles?: {
    /** VaultExitBundlesV1 periphery contract for force-withdraw and in-kind redemption vault-exit flows. */
    readonly vaultExitBundlesV1: `0x${string}`;
    /** VaultBundlesV1 periphery contract for vault deposit, withdraw, and same-asset migrate flows. */
    readonly vaultBundlesV1?: `0x${string}`;
    /** BlueBundlesV1 periphery contract for fixed Morpho Blue supply, borrow, repay, withdraw, and migrate flows. */
    readonly blueBundlesV1?: `0x${string}`;
  };
  /** AdaptiveCurveIrm contract that lets Morpho update utilization-responsive borrow rates per market. */
  adaptiveCurveIrm: `0x${string}`;
  /** Vault V2 BluePublicAllocator contract for permissionless reallocations subject to allocation caps and penalties. */
  vaultV2BluePublicAllocator?: `0x${string}`;
  /** MetaMorpho factory that creates and indexes Morpho Vault V1 ERC4626 vaults. */
  metaMorphoFactory?: `0x${string}`;
  /** VaultV2 factory that creates and indexes Morpho Vault V2 ERC4626/ERC2612 vaults. */
  vaultV2Factory?: `0x${string}`;
  /** Legacy VaultV2 Morpho Market V1 adapter factory used to create and index Blue market adapters. */
  morphoMarketV1AdapterFactory?: `0x${string}`;
  /** VaultV2 Morpho Market V1 adapter V2 factory for Blue market adapters constrained to AdaptiveCurveIrm markets. */
  morphoMarketV1AdapterV2Factory?: `0x${string}`;
  /** VaultV2 Morpho Vault V1 adapter factory for adapters that allocate VaultV2 assets into MetaMorpho vaults. */
  morphoVaultV1AdapterFactory?: `0x${string}`;
  /** Adapter RegistryList that delegates VaultV2 adapter validation to owner-added sub-registries. */
  registryList?: `0x${string}`;
  /** MorphoChainlinkOracleV2 factory that creates and indexes Morpho Blue Chainlink/ERC4626 price oracles. */
  chainlinkOracleFactory?: `0x${string}`;
  /**
   * PreLiquidation factory that creates and indexes linear LIF/LCF pre-liquidation contracts for Morpho markets.
   *
   * @deprecated Pre-liquidation support is deprecated and will be removed in the next major.
   */
  preLiquidationFactory?: `0x${string}`;
  /** Canonical wrapped native token used by adapters and unwrapped-token mappings on this chain. */
  wNative?: `0x${string}`;
  /**
   * DAI token.
   *
   * Must implement DAI-specific permit, otherwise permit signatures break.
   */
  dai?: `0x${string}`;
  /**
   * USDC token.
   *
   * Must implement USDC permit version 2, otherwise permit signatures break.
   */
  usdc?: `0x${string}`;
  /**
   * EURC token.
   *
   * Must implement EURC permit version 2, otherwise permit signatures break.
   */
  eurc?: `0x${string}`;
  /** Lido stETH token used in Ethereum native-token wrapping and staking flows. */
  stEth?: `0x${string}`;
  /** Lido wstETH token mapped to stETH for unwrap-aware flows. */
  wstEth?: `0x${string}`;
  /** Midnight core contract for fixed-maturity credit/debt markets, offers, collateral, and liquidations. */
  midnight?: `0x${string}`;
  /** MidnightBundles periphery contract for batched take, repay, collateral, permit, and referral workflows. */
  midnightBundles?: `0x${string}`;
  /** BlueBuyCallback factory for parking Midnight buy-offer funds in Morpho Blue markets. */
  midnightBlueBuyCallbackFactory?: `0x${string}`;
  /** Midnight onchain mempool log contract used by app and orderbook flows for offer payload publication. */
  midnightMempool?: `0x${string}`;
  /** EcrecoverRatifier contract that validates EIP-712 signed Merkle roots of Midnight offers. */
  ecrecoverRatifier?: `0x${string}`;
  /** EcrecoverAuthorizer contract that validates EIP-712 Midnight authorization signatures. */
  ecrecoverAuthorizer?: `0x${string}`;
  /** SetterRatifier contract that validates Midnight offer Merkle roots ratified onchain by the maker or delegate. */
  setterRatifier?: `0x${string}`;
  /** PriceRatifierV1 contract that validates Merkle roots of price-bounded Midnight offers ratified onchain by the maker or delegate. Not yet deployed: the key stays absent until deployment. */
  priceRatifierV1?: `0x${string}`;
  /** RateRatifierV1 contract that validates Merkle roots of rate-bounded Midnight offers ratified onchain by the maker or delegate. Not yet deployed: the key stays absent until deployment. */
  rateRatifierV1?: `0x${string}`;
}

const _addressesRegistry = {
  [ChainId.EthMainnet]: {
    blue: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    bundles: {
      vaultExitBundlesV1: "0xaf85aF286637A033BE7d59ED8cC566afa3309B02",
      vaultBundlesV1: "0x02912516d49dE997db75B9D7858faAE59209650B",
      blueBundlesV1: "0x38B0C12AB81976e9417D4ebfe2A34DB6DF22e6AD",
    },
    adaptiveCurveIrm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
    vaultV2BluePublicAllocator: "0x00b8e1509398ED692C3F326CbAf1694F9A881e27",
    metaMorphoFactory: "0x1897A8997241C1cD4bD0698647e4EB7213535c24",
    vaultV2Factory: "0xA1D94F746dEfa1928926b84fB2596c06926C0405",
    morphoMarketV1AdapterFactory: "0xb049465969ac6355127cDf9E88deE63d25204d5D",
    morphoMarketV1AdapterV2Factory:
      "0x32BB1c0D48D8b1B3363e86eeB9A0300BAd61ccc1",
    morphoVaultV1AdapterFactory: "0xD1B8E2dee25c2b89DCD2f98448a7ce87d6F63394",
    registryList: "0x3696c5eAe4a7Ffd04Ea163564571E9CD8Ed9364e",
    chainlinkOracleFactory: "0x3A7bB36Ee3f3eE32A60e9f2b33c1e5f2E83ad766",
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: "0x6FF33615e792E35ed1026ea7cACCf42D9BF83476",

    wNative: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    /** DAI token with the DAI-specific permit implementation required by permit flows. */
    dai: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    /** Spark Savings DAI ERC4626 vault token mapped as a known Ethereum asset. */
    sDai: "0x83F20F44975D03b1b09e64809B757c47f942BEeA",
    /** Maker token mapped as a known Ethereum asset. */
    mkr: "0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2",
    stEth: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
    wstEth: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
    /** StakeWise osETH token mapped as a known Ethereum liquid staking asset. */
    osEth: "0xf1C9acDc66974dFB6dEcB12aA385b9cD01190E38",
    /** Backed bIB01 token mapped as the underlying asset for its wrapped permissioned token. */
    bIB01: "0xCA30c93B02514f86d5C86a6e375E3A330B435Fb5",
    /**
     * Wrapped Backed bIB01 permissioned token.
     *
     * If this address changes, verify whether the replacement has simple permit support.
     */
    wbIB01: "0xcA2A7068e551d5C4482eb34880b194E4b945712F",
    /** Backed bC3M token mapped as the underlying asset for its wrapped permissioned token. */
    bC3M: "0x2F123cF3F37CE3328CC9B5b8415f9EC5109b45e7",
    /**
     * Wrapped Backed bC3M permissioned token.
     *
     * If this address changes, verify whether the replacement has simple permit support.
     */
    wbC3M: "0x95D7337d43340E2721960Dc402D9b9117f0d81a2",
    /** USDC token with permit version 2 support required by permit flows. */
    usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    /** EURC token with permit version 2 support required by permit flows. */
    eurc: "0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c",
    /** USDT token mapped as a known Ethereum stablecoin asset. */
    usdt: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    /** crvUSD token mapped as a known Ethereum stablecoin asset. */
    crvUsd: "0xf939E0A03FB07F59A73314E73794Be0E57ac1b4E",

    /** Morpho-specific staked Convex wrapper for the Curve USDT/WBTC/WETH pool token. */
    "stkcvxcrvUSDTWBTCWETH-morpho":
      "0xb0Ce26C88e4e7DCa51968b6047f44646f5064278",
    /** Curve USDT/WBTC/WETH pool token mapped as the unwrapped asset for its Morpho Convex wrapper. */
    crvUSDTWBTCWETH: "0xf5f5B97624542D72A9E06f04804Bf81baA15e2B4",
    /** Morpho-specific staked Convex wrapper for the Curve USDC/WBTC/WETH pool token. */
    "stkcvxcrvUSDCWBTCWETH-morpho":
      "0x0ea1a65A2c255f24Ee8D81eA6AaC54Decd9d269e",
    /** Curve USDC/WBTC/WETH pool token mapped as the unwrapped asset for its Morpho Convex wrapper. */
    crvUSDCWBTCWETH: "0x7F86Bf177Dd4F3494b841a37e810A34dD56c829B",
    /** Morpho-specific staked Convex wrapper for the Curve CRV/USDT/BTC/wstETH pool token. */
    "stkcvxcrvCRVUSDTBTCWSTETH-morpho":
      "0x3ce8Ec9f3d89aD0A2DdbCC3FDB8991BD241Fc82E",
    /** Curve CRV/USDT/BTC/wstETH pool token mapped as the unwrapped asset for its Morpho Convex wrapper. */
    crvCRVUSDTBTCWSTETH: "0x2889302a794dA87fBF1D6Db415C1492194663D13",
    /** Morpho-specific staked Convex wrapper for the Curve TryLSD pool token. */
    "stkcvxTryLSD-morpho": "0x6BA072F0d22806F2C52e9792AF47f2D59103BEBE",
    /** Curve TryLSD pool token mapped as the unwrapped asset for its Morpho Convex wrapper. */
    tryLSD: "0x2570f1bD5D2735314FC102eb12Fc1aFe9e6E7193",
    /** Morpho-specific staked Convex wrapper for the Curve crvUSD/ETH/CRV pool token. */
    "stkcvxcrvUSDETHCRV-morpho": "0xAc904BAfBb5FB04Deb2b6198FdCEedE75a78Ce5a",
    /** Curve crvUSD/ETH/CRV pool token mapped as the unwrapped asset for its Morpho Convex wrapper. */
    crvUSDETHCRV: "0x4eBdF703948ddCEA3B11f675B4D1Fba9d2414A14",
    /** Morpho-specific staked Convex wrapper for the Curve 2BTC-f pool token. */
    "stkcvx2BTC-f-morpho": "0x385E12cf4040543Bc8C18e05C1298Be5B04f3f5e",
    /** Curve 2BTC-f pool token mapped as the unwrapped asset for its Morpho Convex wrapper. */
    "2BTC-f": "0xB7ECB2AA52AA64a717180E030241bC75Cd946726",

    midnight: "0x471686c42792F93528B000beF54bC10E3aa2045f",
    midnightBundles: "0x7c00dBB2b6b6b9B28745332e550dC8782Fcf77EC",
    midnightBlueBuyCallbackFactory:
      "0x172d1FdC5f79bFe1ED46448f18541E591E5c93a7",
    midnightMempool: "0xde2d62449301a09A51EbF9326EA60d2e8BF4A8F7",
    ecrecoverRatifier: "0xAC439c81CAA6ef4C7B7E8F0110F8CE63A4b6D43e",
    ecrecoverAuthorizer: "0xfC3303119E46AF831CacdBDB6e1A04C9C369ffF7",
    setterRatifier: "0xb72c416382c8A6399D0765CebfB032F040B00B3c",
  },
  [ChainId.BaseMainnet]: {
    blue: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    bundles: {
      vaultExitBundlesV1: "0xE52E169C342C096C4949ABb944DC9f30E3F5Ea84",
      vaultBundlesV1: "0x2B08A911f48dE25A7e305D910Afb5597aBE8ea7B",
      blueBundlesV1: "0x4D28D900e381eCE4B351302f1Abe588496793A2b",
    },
    adaptiveCurveIrm: "0x46415998764C29aB2a25CbeA6254146D50D22687",
    vaultV2BluePublicAllocator: "0xAED282B8aD9257BB1272e93aE63A32A53621e412",
    metaMorphoFactory: "0xFf62A7c278C62eD665133147129245053Bbf5918",
    vaultV2Factory: "0x4501125508079A99ebBebCE205DeC9593C2b5857",
    morphoMarketV1AdapterFactory: "0x133baC94306B99f6dAD85c381a5be851d8DD717c",
    morphoMarketV1AdapterV2Factory:
      "0x9a1B378C43BA535cDB89934230F0D3890c51C0EB",
    morphoVaultV1AdapterFactory: "0xF42D9c36b34c9c2CF3Bc30eD2a52a90eEB604642",
    registryList: "0x5C2531Cbd2cf112Cf687da3Cd536708aDd7DB10a",
    chainlinkOracleFactory: "0x2DC205F24BCb6B311E5cdf0745B0741648Aebd3d",
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: "0x8cd16b62E170Ee0bA83D80e1F80E6085367e2aef",

    wNative: "0x4200000000000000000000000000000000000006",
    /** USDC token with permit version 2 support required by permit flows. */
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    /** EURC token with permit version 2 support required by permit flows. */
    eurc: "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42",
    /** Coinbase-attested wrapped USDC token mapped to canonical USDC when unwrapped. */
    verUsdc: "0x59aaF835D34b1E3dF2170e4872B785f11E2a964b",
    /** Permissioned test USDC wrapper mapped to canonical Base USDC when unwrapped. */
    testUsdc: "0xBC77067f829979812d795d516E523C4033b66409",

    midnight: "0xAdedD8ab6dE832766Fedf0FaC4992E5C4D3EA18A",
    midnightBundles: "0x091183d729BE9f808c212b475E387A12E67850A7",
    midnightBlueBuyCallbackFactory:
      "0x7337f119Eca028bD39E0e543cEf71631D2333425",
    midnightMempool: "0xdD6DCE32e21f7b020898a8258dA37355b4017993",
    ecrecoverRatifier: "0xd6e70365C8E8DDa9a4ca662C07bbE663b017755E",
    ecrecoverAuthorizer: "0x292bEa9f1443d54E0E509120c919106765c6a493",
    setterRatifier: "0x800B5F12A61B8198a5a6EfD794Cac6699B294d63",
  },
  [ChainId.PolygonMainnet]: {
    blue: "0x1bF0c2541F820E775182832f06c0B7Fc27A25f67",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    bundles: {
      vaultExitBundlesV1: "0x7Ae2B7012c82ea18a6BeE98ad09a684C88d6e36a",
      vaultBundlesV1: "0x386ABE0188b7FADA897cE4dF9d72E8F57915B103",
      blueBundlesV1: "0x93a1B342f3DF2c2bb5D0d8D5AF819450fFA4bE78",
    },
    adaptiveCurveIrm: "0xe675A2161D4a6E2de2eeD70ac98EEBf257FBF0B0",
    vaultV2BluePublicAllocator: "0xAb06a92cd253Bc12Dec8f719a693a6b472CCDfF4",
    metaMorphoFactory: "0xa9c87daB340631C34BB738625C70499e29ddDC98",
    vaultV2Factory: "0xC11a53eE9B1eCc7a068D8e40F8F17926584F97Cf",
    morphoMarketV1AdapterFactory: "0xD1A0C86F28ecD1657Ad06415c2B230cC89D9b6dd",
    morphoMarketV1AdapterV2Factory:
      "0xc0006f52B38625C283dd2f972dD9B779A5851Dd0",
    morphoVaultV1AdapterFactory: "0xEb174FEA51Da241eB3B516959B216e013de2888a",
    registryList: "0xb70a43821d2707fA9d0EDd9511CC499F468Ba564",
    chainlinkOracleFactory: "0x1ff7895Eb842794c5d07C4c547b6730e61295215",
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: "0xeDadDe37D76c72b98725614d0b41C20Fe612d304",

    wNative: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
    /** USDC token with permit version 2 support required by permit flows. */
    usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  },
  [ChainId.ArbitrumMainnet]: {
    blue: "0x6c247b1F6182318877311737BaC0844bAa518F5e",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    bundles: {
      vaultExitBundlesV1: "0x7B885a940164eD51A068725f577a12197b76109b",
      vaultBundlesV1: "0x5afAb0B2414E30c92a708234ea1b383Ce6317ED5",
      blueBundlesV1: "0x30a388A64b99192702a83D2CA9B95D79702afbf2",
    },
    adaptiveCurveIrm: "0x66F30587FB8D4206918deb78ecA7d5eBbafD06DA",
    vaultV2BluePublicAllocator: "0x85b66Fe31e6788E5a6825EAe689f4c6c38AF3704",
    metaMorphoFactory: "0x878988f5f561081deEa117717052164ea1Ef0c82",
    vaultV2Factory: "0x6b46fa3cc9EBF8aB230aBAc664E37F2966Bf7971",
    morphoMarketV1AdapterFactory: "0x96456Bf888D4de607Bf3ca0b3C8e4DF9b0d0Ad47",
    morphoMarketV1AdapterV2Factory:
      "0xeF84b1ecEbe43283ec5AF95D7a5c4D7dE0a9859b",
    morphoVaultV1AdapterFactory: "0xD8Fc8a85779551e78B516da9f74061cb3b086793",
    registryList: "0xc00eb3c7aD1aE986A7f05F5A9d71aCa39c763C65",
    chainlinkOracleFactory: "0x98Ce5D183DC0c176f54D37162F87e7eD7f2E41b5",
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: "0x635c31B5DF1F7EFbCbC07E302335Ef4230758e3d",

    wNative: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    /** USDC token with permit version 2 support required by permit flows. */
    usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  },
  [ChainId.OptimismMainnet]: {
    blue: "0xce95AfbB8EA029495c66020883F87aaE8864AF92",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    bundles: {
      vaultExitBundlesV1: "0x80De0F063aC662a4ee86c2F4Db0b52746094ad62",
      vaultBundlesV1: "0x112088363eE4CcF3F37EaBD98FDDeEd98F0Be485",
      blueBundlesV1: "0x317ca3534f8Cf92Accb4b4366F48017E596bc34a",
    },
    adaptiveCurveIrm: "0x8cD70A8F399428456b29546BC5dBe10ab6a06ef6",
    vaultV2BluePublicAllocator: "0xc6945A915Bb7e2A365469f120A33D2FA42951cF3",
    metaMorphoFactory: "0x3Bb6A6A0Bc85b367EFE0A5bAc81c5E52C892839a",
    vaultV2Factory: "0x6128b680b277Bf4Df80DFE9D8c55A498660870ef",
    morphoMarketV1AdapterFactory: "0x65956d5Ba4974983ecCe111612FC0A0c22650A11",
    morphoMarketV1AdapterV2Factory:
      "0x71B299bDb52b6396429cd1E11c418324502CB434",
    morphoVaultV1AdapterFactory: "0xEe9F7C64dD827ED7b5CAA2272936366FAca00CF3",
    registryList: "0xD1346be260cd22Eab9E6163010b0D5CbfAAAD32b",
    chainlinkOracleFactory: "0x1ec408D4131686f727F3Fd6245CF85Bc5c9DAD70",
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: "0x3d05C01EE8e97361b9E19D172128255eaE5F98B9",

    wNative: "0x4200000000000000000000000000000000000006",
    /** USDC token with permit version 2 support required by permit flows. */
    usdc: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
  },
  [ChainId.WorldChainMainnet]: {
    blue: "0xE741BC7c34758b4caE05062794E8Ae24978AF432",
    bundles: {
      vaultExitBundlesV1: "0xcf7b4a40f25A6b839A93b8A8b45297F2a5383E73",
      vaultBundlesV1: "0x768BBD5F6c22b2498cC9C19832d3AEE08240755a",
      blueBundlesV1: "0xEd44094c917D891D68f46E8cc2fd50D790707a65",
    },
    adaptiveCurveIrm: "0x34E99D604751a72cF8d0CFDf87069292d82De472",
    vaultV2BluePublicAllocator: "0x5Fe47f63ACd84f8A69b97E0a5122fCBff08Df48F",
    metaMorphoFactory: "0x4DBB3a642a2146d5413750Cca3647086D9ba5F12",
    vaultV2Factory: "0x6846EA318B6B987Ee6b28eBFd87c3409F1d13108",
    morphoMarketV1AdapterFactory: "0xAf93F2d8508053432659d509b0210fdF1472493D",
    morphoMarketV1AdapterV2Factory:
      "0xEd0b06fcdDB6dD0985e2de9D22ad034d313b7dBd",
    morphoVaultV1AdapterFactory: "0xbF7DEa3756668C7E396C655D646C039826ba8416",
    registryList: "0x06A47994B4890dcA28C076969cedE1151d86EFCF",
    chainlinkOracleFactory: "0xd706690BA1Fe26b70c4AD89e60ff62cEB3A2eD02",
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: "0xe3cE2051a24e58DBFC0eFBe4c2d9e89c5eAe4695",

    wNative: "0x4200000000000000000000000000000000000006",
    /** USDC token with permit version 2 support required by permit flows. */
    usdc: "0x79A02482A880bCE3F13e09Da970dC34db4CD24d1",
    /** EURC token with permit version 2 support required by permit flows. */
    eurc: "0x1C60ba0A0eD1019e8Eb035E6daF4155A5cE2380B",
  },
  [ChainId.FraxtalMainnet]: {
    blue: "0xa6030627d724bA78a59aCf43Be7550b4C5a0653b",
    adaptiveCurveIrm: "0xA0D4D77b5D9933073572E19C172BFE866312673b",
    metaMorphoFactory: "0x27D4Af0AC9E7FDfA6D0853236f249CC27AE79488",
    chainlinkOracleFactory: "0x39d8622C607A691D7705E8842fbB12E3c38dCD41",
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: "0x373ccddcd3F09D2e1430B3F2b290B9bF56Ae7336",
    vaultV2Factory: "0x711bCE12269a3a496eFaABB8B9AD5A4485E08A24",
    morphoMarketV1AdapterV2Factory:
      "0xa036C78AE8e162feD4db4abbD41f79995F28bC4b",
    registryList: "0x50d4e8af118db0D5b301B18Ef37435F987Fe2D2B",

    wNative: "0xFC00000000000000000000000000000000000006",
  },
  [ChainId.ScrollMainnet]: {
    blue: "0x2d012EdbAdc37eDc2BC62791B666f9193FDF5a55",
    adaptiveCurveIrm: "0xa5EA7500A27C0079961D93366A6e93aafF18CB90",
    metaMorphoFactory: "0x56b65742ade55015e6480959808229Ad6dbc9295",
    chainlinkOracleFactory: "0xb5961902E60b188b1c665B7b72Ef616656A9e24E",
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: "0xeD960178e4aDA0296786Fa79D84e8FDF7bd44B25",
    vaultV2Factory: "0x474cdCF6B3be2eb770065b88d2F7c57A9BC609E0",
    morphoMarketV1AdapterV2Factory:
      "0x3199Ddb2aA394B175a814EB79BB654822Ee1100F",
    registryList: "0x0ED73cc76a0ebd7C5a6a95397718D8F1dCC219b1",

    wNative: "0x5300000000000000000000000000000000000004",
    /** USDC token with permit version 2 support required by permit flows. */
    usdc: "0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4",
  },
  [ChainId.InkMainnet]: {
    blue: "0x857f3EefE8cbda3Bc49367C996cd664A880d3042",
    adaptiveCurveIrm: "0x9515407b1512F53388ffE699524100e7270Ee57B",
    metaMorphoFactory: "0xd3f39505d0c48AFED3549D625982FdC38Ea9904b",
    chainlinkOracleFactory: "0x3FFFE273ee348b9E1ef89533025C7f165B17B439",
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: "0x30607fEa77168d2c0401B6f60F0B40E32F9339E3",
    vaultV2Factory: "0x35587F8d98eA305FB762934a63F3c1564037F9C7",
    morphoMarketV1AdapterV2Factory:
      "0x92A070b2b4Af436ba4a168451fb360e45b849355",
    registryList: "0xe7D687a017B549fe723E78a6Bc1206216C701821",

    wNative: "0x4200000000000000000000000000000000000006",
    /** USDC token with permit version 2 support required by permit flows. */
    usdc: "0xF1815bd50389c46847f0Bda824eC8da914045D14",
  },
  [ChainId.Unichain]: {
    blue: "0x8f5ae9CddB9f68de460C77730b018Ae7E04a140A",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    bundles: {
      vaultExitBundlesV1: "0x0628B860947fA0c195988F65d53850546A489732",
      vaultBundlesV1: "0x40755e3e2513D71cB79DC3Eeefd8Eb848d9cd899",
      blueBundlesV1: "0x2c4331BC5EC245da744F35832C8797456cFC8045",
    },
    adaptiveCurveIrm: "0x9a6061d51743B31D2c3Be75D83781Fa423f53F0E",
    vaultV2BluePublicAllocator: "0x2b7Bf2f2027bcfE3A1F6Bc93EA80220a883a6851",
    metaMorphoFactory: "0xe9EdE3929F43a7062a007C3e8652e4ACa610Bdc0",
    vaultV2Factory: "0xC9b34c108014B44e5a189A830e7e04c56704a0c9",
    morphoMarketV1AdapterFactory: "0x117b92Ab1C025B175ED38a0CDe5A067a745224a0",
    morphoMarketV1AdapterV2Factory:
      "0x9a13bdA35F98811fbAcf097966b2C838f3F9c58C",
    morphoVaultV1AdapterFactory: "0xf1Ab9e885C0faa0cbCEd407498BBA895537aD754",
    registryList: "0xB9130D2A87d7c60ED7E7e4b25bdA6e3E6841becB",
    chainlinkOracleFactory: "0x43269546e1D586a1f7200a0AC07e26f9631f7539",
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: "0xb04e4D3D59Ee47Ca9BA192707AF13A7D02969911",

    wNative: "0x4200000000000000000000000000000000000006",
    /** USDC token with permit version 2 support required by permit flows. */
    usdc: "0x078D782b760474a361dDA0AF3839290b0EF57AD6",
  },
  [ChainId.SonicMainnet]: {
    blue: "0xd6c916eB7542D0Ad3f18AEd0FCBD50C582cfa95f",
    adaptiveCurveIrm: "0xDEfCf242226425f93d8DD0e314735C28517C473F",
    metaMorphoFactory: "0x0cE9e3512CB4df8ae7e265e62Fb9258dc14f12e8",
    chainlinkOracleFactory: "0x7DA59Fa482F1F49fADc486d8e47BADc506fEb86d",
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: "0xc72129DA4CC808e955699111b8c22B22Ca8A10b8",
    vaultV2Factory: "0xc8BE2FD6f65FB3ce25Dd6a50F21A9245B9E399d7",
    morphoMarketV1AdapterV2Factory:
      "0xc49224e28992E693aFaa778a6F54c329E5Ac9704",
    registryList: "0x1fbF65D5C905ac9144afbB2f410F4e12F69edF5D",

    wNative: "0x039e2fB66102314Ce7b64Ce5Ce3E5183bc94aD38",
  },
  [ChainId.HemiMainnet]: {
    blue: "0xa4Ca2c2e25b97DA19879201bA49422bc6f181f42",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    adaptiveCurveIrm: "0xdEbdEa31624552DF904A065221cD14088ABDeD70",
    metaMorphoFactory: "0x8e52179BeB18E882040b01632440d8Ca0f01da82",
    chainlinkOracleFactory: "0xB3cb32E6185446a6Bc7A047E4FfA138fA939e133",
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: "0x40F2896C551194e364F7C846046C34d8a9FE97e4",
    vaultV2Factory: "0x3c75C433e7902193497617EaFCc8385A3D031836",
    morphoMarketV1AdapterV2Factory:
      "0x0d9E428075b8A691e12237984b8284E40ab9363A",
    registryList: "0xbd30B731C881149e2BA23C7fd375D5608208Ecb3",

    wNative: "0x4200000000000000000000000000000000000006",
    /** USDC token with permit version 2 support required by permit flows. */
    usdc: "0xad11a8BEb98bbf61dbb1aa0F6d6F2ECD87b35afA",
  },
  [ChainId.ModeMainnet]: {
    blue: "0xd85cE6BD68487E0AaFb0858FDE1Cd18c76840564",
    adaptiveCurveIrm: "0xE3d46Ae190Cb39ccA3655E966DcEF96b4eAe1d1c",
    metaMorphoFactory: "0xae5b0884bfff430493D6C844B9fd052Af7d79278",
    chainlinkOracleFactory: "0xf9380f7898423Bd7FDe3C9fDD1b2671A2471f39D",
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: "0x249E4808264c545861e43728186a731dE7c7D745",
    vaultV2Factory: "0x68DCEA6df0f07385946AA0cDA2648c27a050e26e",
    morphoMarketV1AdapterV2Factory:
      "0x97CF0f15bf580838900161F2a4D7CE9BC88E8d5D",
    registryList: "0x8dBDae88260aAE80f195c0CBFBa5b0917E8B3296",

    wNative: "0x4200000000000000000000000000000000000006",
  },
  [ChainId.CornMainnet]: {
    blue: "0xc2B1E031540e3F3271C5F3819F0cC7479a8DdD90",
    adaptiveCurveIrm: "0x58a42117d753a0e69694545DfA19d64c2fB759fB",
    metaMorphoFactory: "0xe430821595602eA5DD0cD350f86987437c7362fA",
    chainlinkOracleFactory: "0x16278156D366fC91536b6b81482ffaC47EEa06D6",
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: "0xb9065AC18d3EBdb3263B77B587f9c5CD570545D1",

    wNative: "0xda5dDd7270381A7C2717aD10D1c0ecB19e3CDFb2",
    /** USDC token with permit version 2 support required by permit flows. */
    usdc: "0xDF0B24095e15044538866576754F3C964e902Ee6",
  },
  [ChainId.PlumeMainnet]: {
    blue: "0x42b18785CE0Aed7BF7Ca43a39471ED4C0A3e0bB5",
    adaptiveCurveIrm: "0x7420302Ddd469031Cd2282cd64225cCd46F581eA",
    metaMorphoFactory: "0x2525D453D9BA13921D5aB5D8c12F9202b0e19456",
    vaultV2Factory: "0x4f0a370bb367843CFd914c4d9972523aD2f8FCc9",
    morphoMarketV1AdapterFactory: "0x1675357fdA9e6784DdAD7AD5b3C3DF1fdD4dc4C9",
    morphoMarketV1AdapterV2Factory:
      "0xB7c243AfACb25870775ADFdAe9D0EAc2324dD152",
    morphoVaultV1AdapterFactory: "0x5935fFcD1C5D269840ae7c685bC957A73E04AEDB",
    registryList: "0x60d3184BDD31BAE7De973894B3bA0b3B6900B79a",
    chainlinkOracleFactory: "0x133F742c0D36864F37e15C33a18bA6fdc950ED0f",
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: "0xF184156Cf6Ad4D3dA7F6449D40755A0f9de97ef3",

    usdc: "0xc98E8c6cB80AC48E4bbD3B56f5895DD64dA7d10a",
    wNative: "0xEa237441c92CAe6FC17Caaf9a7acB3f953be4bd1",
  },
  [ChainId.CampMainnet]: {
    blue: "0xea4f2979D7A99B40404b447Cf71c008e3805760F",
    adaptiveCurveIrm: "0xd5661D965cc60ed1954d4f6725b766051De3ef97",
    metaMorphoFactory: "0x3F4b9246b7Cd3F7671c70BeBd5AAFC08e5bb5f16",
    chainlinkOracleFactory: "0x391A3fd481743FE48409e2e31eDac8a5f4C7653A",
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: "0xD55fA5DF6F1A21C2B93009A702aad3a0891C1B48",

    wNative: "0x3bd5C81a8Adf3355078Dc5F73c41d3194B316690",
    /** USDC token with permit version 2 support required by permit flows. */
    usdc: "0x8a2B28364102Bea189D99A475C494330Ef2bDD0B",
  },
  [ChainId.KatanaMainnet]: {
    blue: "0xD50F2DffFd62f94Ee4AEd9ca05C61d0753268aBc",
    bundles: {
      vaultExitBundlesV1: "0xa434ABcc7e945b804c87B4f3c0a76b20651d4863",
      vaultBundlesV1: "0x2464F4d0a4481732e7cC90ADD5abF986A48A06Dd",
      blueBundlesV1: "0xCA52e5B901D9939013Fa8744dCbDeE0B6BdD5B39",
    },
    adaptiveCurveIrm: "0x4F708C0ae7deD3d74736594C2109C2E3c065B428",
    vaultV2BluePublicAllocator: "0xd952175e940D97775cBC5a523977a6f091D0d702",
    metaMorphoFactory: "0x1c8De6889acee12257899BFeAa2b7e534de32E16",
    vaultV2Factory: "0xFcb8b57E56787bB29e130Fca67f3c5a1232975D1",
    morphoMarketV1AdapterFactory: "0x2e6BE3a3A27fb45c6AbA2D1833eeA48E8788538e",
    morphoMarketV1AdapterV2Factory:
      "0x6d6A3ba62836d6B40277767dCAc8fd390d4BcedC",
    morphoVaultV1AdapterFactory: "0xc8D22B1adD3D176600E9952e7876e9249254cAAF",
    registryList: "0xA9132a09838fD20304dF2B2892679d06A4cc6371",
    chainlinkOracleFactory: "0x7D047fB910Bc187C18C81a69E30Fa164f8c536eC",
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: "0x678EB53A3bB79111263f47B84989d16D81c36D85",

    wNative: "0xEE7D8BCFb72bC1880D0Cf19822eB0A2e6577aB62",
  },
  [ChainId.EtherlinkMainnet]: {
    blue: "0xbCE7364E63C3B13C73E9977a83c9704E2aCa876e",
    adaptiveCurveIrm: "0xC1523BE776e66ba07b609b1914D0925278f21FE5",
    metaMorphoFactory: "0x997a79c3C04c5B9eb27d343ae126bcCFb5D74781",
    chainlinkOracleFactory: "0x12FA40f687a35611720E1DcB59976B6e51247298",
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: "0xd1c37fDd941256FC184eF3A07Be540a90b81Ec21",
    vaultV2Factory: "0xDa4C5e0f8830002750f788eA729891B4B38EC1c2",
    morphoMarketV1AdapterV2Factory:
      "0x588737013F0302a2fa82Dc03DA06126a81B8be45",
    registryList: "0xEe583Ac409a12cc6BD97DD5ca6d2c0ecC8fA86FF",

    wNative: "0xc9B53AB2679f573e480d01e0f49e2B5CFB7a3EAb",
  },
  [ChainId.TacMainnet]: {
    blue: "0x918B9F2E4B44E20c6423105BB6cCEB71473aD35c",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    adaptiveCurveIrm: "0x7E82b16496fA8CC04935528dA7F5A2C684A3C7A3",
    metaMorphoFactory: "0xcDA78f4979d17Ec93052A84A12001fe0088AD734",
    chainlinkOracleFactory: "0xbf10eD52dD60C60E901BF022c3675303ad4a56b1",
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: "0x5851C1e423A2F93aFb821834a63cA052D19ae4Ef",
    vaultV2Factory: "0x0437C5B0CF1edFb8309613E4fEBE2a512D9a735d",
    morphoMarketV1AdapterV2Factory:
      "0xabA00365C6284548F90480993fc46dbB7775FB96",
    registryList: "0x784125737238e058B646FDB502F5B6d940713B95",

    wNative: "0xB63B9f0eb4A6E6f191529D71d4D88cc8900Df2C9",
  },
  [ChainId.LiskMainnet]: {
    blue: "0x00cD58DEEbd7A2F1C55dAec715faF8aed5b27BF8",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    adaptiveCurveIrm: "0x5576629f21D528A8c3e06C338dDa907B94563902",
    metaMorphoFactory: "0x01dD876130690469F685a65C2B295A90a81BaD91",
    chainlinkOracleFactory: "0x2eb4D17C2AAf1EA62Bf83Fb49Dd1128b14AF4D93",
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: "0xF2c325F26691b6556e6f66451bb38bDa37FEbaa7",
    vaultV2Factory: "0x8DB1483C64384FA8581D6e6e82C6F44812090c2d",
    morphoMarketV1AdapterV2Factory:
      "0x382d00918B744Bd91B906f38CAe54e67649E770C",
    registryList: "0x3f4A754Af683a1b9AD7E20608630bED3B459d230",

    wNative: "0x4200000000000000000000000000000000000006",
    /** USDC token with permit version 2 support required by permit flows. */
    usdc: "0xF242275d3a6527d877f2c927a82D9b057609cc71",
  },
  [ChainId.HyperliquidMainnet]: {
    blue: "0x68e37dE8d93d3496ae143F2E900490f6280C57cD",
    bundles: {
      vaultExitBundlesV1: "0xC1749C8d50bc645D5116ccf4C858Bc45cB981Ac4",
      vaultBundlesV1: "0xB5173417e28482c61C14A4C2e217b158fF0db666",
      blueBundlesV1: "0x84849171E1783630E1C4253b9C9d4b4208b0D86A",
    },
    adaptiveCurveIrm: "0xD4a426F010986dCad727e8dd6eed44cA4A9b7483",
    vaultV2BluePublicAllocator: "0x056dd7D4B373ED26c788190085CC6C52B8e7479d",
    metaMorphoFactory: "0xec051b19d654C48c357dC974376DeB6272f24e53",
    vaultV2Factory: "0xD7217E5687FF1071356C780b5fe4803D9D967da7",
    morphoMarketV1AdapterFactory: "0xc6b8B565C715134b0Ca3D6fa3D29B25759D0b9e2",
    morphoMarketV1AdapterV2Factory:
      "0xaEff6Ef4B7bbfbAadB18b634A8F11392CBeB72Be",
    morphoVaultV1AdapterFactory: "0xdf5202e29654e02011611A086f15477880580CAc",
    registryList: "0x857B55cEb57dA0C2A83EE08a8dB529B931089aee",
    chainlinkOracleFactory: "0xeb476f124FaD625178759d13557A72394A6f9aF5",
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: "0x1b6782Ac7A859503cE953FBf4736311CC335B8f0",

    wNative: "0x5555555555555555555555555555555555555555",
    /** USDC token with permit version 2 support required by permit flows. */
    usdc: "0xb88339CB7199b77E23DB6E890353E22632Ba630f",
  },
  [ChainId.SeiMainnet]: {
    blue: "0xc9cDAc20FCeAAF616f7EB0bb6Cd2c69dcfa9094c",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    adaptiveCurveIrm: "0x6eFA8e3Aa8279eB2fd46b6083A9E52dA72EA56c4",
    metaMorphoFactory: "0x8Dea49ec5bd5AeAc8bcf96B3E187F59354118291",
    chainlinkOracleFactory: "0x4bD68c2FF3274207EC07ED281C915758b6F23F07",
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: "0x65eD61058cEB4895B7d62437BaCEA39b04f6D27B",
    vaultV2Factory: "0x30f5b078C80bD06fEdc3B40b4a4441a96Dd9cf22",
    morphoMarketV1AdapterV2Factory:
      "0xbADd49F7db90f65fF5822681AA6B8548E8356a1D",
    registryList: "0x26abEaee65A878E9Fe8F99fEb31aec62fbA2624E",

    wNative: "0xE30feDd158A2e3b13e9badaeABaFc5516e95e8C7",
    usdc: "0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392",
  },
  [ChainId.ZeroGMainnet]: {
    blue: "0x9CDD13a2212D94C4f12190cA30783B743E83C89e",
    adaptiveCurveIrm: "0xf52e20C42FEc624819D4184226C4777D7cbd767e",
    metaMorphoFactory: "0x41528AadC7314658b07Ca6e7213B9b77289B477f",
    chainlinkOracleFactory: "0x5115c1a74ABf096150593EecF3e20F016fc9dB43",
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: "0x534858821653467c2ae231dc027aa1F2c8D91802",
    vaultV2Factory: "0x9c7E1f6fc953aED9C273D8D7B17A654e70721E80",
    morphoMarketV1AdapterFactory: "0xb76A46cC0c4E8B25Df7Df278371b3D78d95D0b2b",
    morphoMarketV1AdapterV2Factory:
      "0x2614BAEA6aE12117565668720aD92ca0149aBA03",
    morphoVaultV1AdapterFactory: "0x42a147a5af2A699b323168508A039e54f5078092",
    registryList: "0x9749cF858Ef950Eea7fA16a35f8C8817ca65066c",

    wNative: "0x1Cd0690fF9a693f5EF2dD976660a8dAFc81A109c",
  },
  [ChainId.LineaMainnet]: {
    blue: "0x6B0D716aC0A45536172308e08fC2C40387262c9F",
    adaptiveCurveIrm: "0x85C2Ef4Bd69f42D7Da19Fb9dcdD7Fb8d0F59cDeE",
    metaMorphoFactory: "0xA148a8223B622A72dC36472DE1492aBb5c089BA7",
    vaultV2Factory: "0x5DC11CF8BA4C39d1194F91218D35008d9F52A5d0",
    morphoMarketV1AdapterFactory: "0x3267BbdC94274B4BE081c01ffc6123dA12E8c043",
    morphoVaultV1AdapterFactory: "0x6FaF26DD640e22457cA4fd5DA702BA3E169eEd87",
    registryList: "0x122Ea8ff8888C29F8736665d576e3fAEF15D27D5",
    chainlinkOracleFactory: "0x3FFF726062B03BfD5BC485eeEEcc92CF1d8F0105",
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: "0x05a0Ff4E564ED1ba6B42247E19edFf83545C3C40",
    morphoMarketV1AdapterV2Factory:
      "0xcAB7C66F7191Ad3Ef1e7fEeb67F3137BC975F8cE",

    wNative: "0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f",
    usdc: "0x176211869cA2b568f2A7D4EE941E073a821EE1ff",
  },
  [ChainId.MonadMainnet]: {
    blue: "0xD5D960E8C380B724a48AC59E2DfF1b2CB4a1eAee",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    bundles: {
      vaultExitBundlesV1: "0xB04b831893A6E2E02Be347cD259690c5Bc7D0675",
      vaultBundlesV1: "0xcDDc5311A7ccDb2A7Bf97299149bE1D687F3C76e",
      blueBundlesV1: "0x9C76E91bf08E712a713e3baB2F5AE01f6ec8845A",
    },
    adaptiveCurveIrm: "0x09475a3D6eA8c314c592b1a3799bDE044E2F400F",
    vaultV2BluePublicAllocator: "0x0A503aB026EFACBC0F7feE7795F34B80b5B9a662",
    metaMorphoFactory: "0x33f20973275B2F574488b18929cd7DCBf1AbF275",
    vaultV2Factory: "0x8B2F922162FBb60A6a072cC784A2E4168fB0bb0c",
    morphoMarketV1AdapterFactory: "0x8Da54fbF89B3D6fC6DCC92F31CF75a211ACF3d46",
    morphoMarketV1AdapterV2Factory:
      "0xa00666E86C7e2FA8d2c78d9481E687e098340180",
    morphoVaultV1AdapterFactory: "0x9f3c0999425656fD189C69a8aD68cB64986D644A",
    registryList: "0x6a42f8b46224baA4DbBBc2F860F4675eeA7bd52B",
    chainlinkOracleFactory: "0xC8659Bcd5279DB664Be973aEFd752a5326653739",
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: "0xB5b3e541abD19799E0c65905a5a42BD37d6c94c0",
    wNative: "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A",
    usdc: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603",
  },
  [ChainId.StableMainnet]: {
    blue: "0xa40103088A899514E3fe474cD3cc5bf811b1102e",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    bundles: {
      vaultExitBundlesV1: "0x258d5c815CCE7017E24c63a7669F51ABcD0Dd4e5",
      vaultBundlesV1: "0x2b910f5368e4939A2906ADa85c21fc0e51C4A861",
      blueBundlesV1: "0xFB606389166c04828D6Dba36F77871489673CeA0",
    },
    adaptiveCurveIrm: "0x41e846FC8108b8527C1D4EDB4c9564E56442940f",
    vaultV2BluePublicAllocator: "0x5C884d4B1510EAd302EC50A2AB4DE9c0b9E407ce",
    metaMorphoFactory: "0xb4ae5673c48621189E2bEfBA96F31912032DD1AE",
    vaultV2Factory: "0x7fc35488803D49D00a94b206A223f7661898BE3a",
    morphoMarketV1AdapterFactory: "0x2A5F218FE4Dac3b1f4E096e8ae83074bB1713833",
    morphoMarketV1AdapterV2Factory:
      "0x9282DBa3d1788f4f02B5DdFc4fc5985e70197620",
    morphoVaultV1AdapterFactory: "0x4EF83ACD552598a1196c1aBDD0bA2EdE6f2237B4",
    registryList: "0xCe93fcB2849EB886F1e81d45D2747dF803f843C3",
    chainlinkOracleFactory: "0xF24C6eAB91e43EacE18a4e893a48565C09132505",
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: "0x741A6604e974FeAF35a5FBb1416B3e01c33e5C0e",

    // There is no wrapped native token because the native token USDT0 is already an ERC20.
  },
  [ChainId.CronosMainnet]: {
    blue: "0xDF9a1DC07e5dEe5ccCCaBeC35e446C70fAF7434e",
    adaptiveCurveIrm: "0x1Db002C086439d55B9f33E6c0693Eb850F7c0607",
    metaMorphoFactory: "0xEA67e5566Ca2c0176d9db172A7f9A1e1F22E9D3A",
    vaultV2Factory: "0x05519a0835a1bFD90f110aA7ca46e9A5F81Ed3b4",
    morphoMarketV1AdapterFactory: "0xaCFf4ad3B357F5A43A20570cF3eb9Ba0086d4e9a",
    morphoMarketV1AdapterV2Factory:
      "0xE39f6B5Dd03F4ce8C201b946E662E653d94fA121",
    morphoVaultV1AdapterFactory: "0x8840F99Bb2D4f69fb02b2d019384C5c98a11746c",
    registryList: "0x295e0aB80f8234398cd0E51C85D873ee69E5F0DD",
    chainlinkOracleFactory: "0x44b2c8e4474751EF2BBC57B92928aFB99DA785De",
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: "0x8bedC738f5F0D54dF7E003297AAc6692b870F3Ed",

    wNative: "0x5C7F8A570d578ED84E63fdFA7b1eE72dEae1AE23",
  },
  [ChainId.CeloMainnet]: {
    blue: "0xd24ECdD8C1e0E57a4E26B1a7bbeAa3e95466A569",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    adaptiveCurveIrm: "0x683CAAADdfA2F42e24880E202676526d501a5dED",
    metaMorphoFactory: "0x6870aA9f66C1e5Efe8Dbe8730e86E9e91f688275",
    chainlinkOracleFactory: "0x3a4849b5174Dc6828c6Dc9BBD87e61Ed1ebE9fFA",
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: "0x717a3eF7D366F5ce4636011924D0Bd65ea5eCE2f",
    // No wrapped native is provided as the native asset CELO is already an ERC20.
    usdc: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",

    vaultV2Factory: "0xB237fdB403992f4AAe0963F5304799242035E22d",
    morphoMarketV1AdapterV2Factory:
      "0x8F5C08671A3986b2B0261FF78f5c2F291208BceC",
    registryList: "0x448Babad091267362fe83588838Ed7b192C1dc5A",
  },
  [ChainId.AbstractMainnet]: {
    blue: "0xc85CE8ffdA27b646D269516B8d0Fa6ec2E958B55",
    adaptiveCurveIrm: "0xd334eb112CfD1EB4a50FB871b7D9895EBB955C43",
    metaMorphoFactory: "0x83A7f60c9fc57cEf1e8001bda98783AA1A53E4b1",
    chainlinkOracleFactory: "0x3585E3fD72F8d1b02250E1F6496b706c6e092884",
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: "0x1058DA51242dF63bA3A61c838A61405ea6Edb083",
    vaultV2Factory: "0xecCd168c7d8e40f7166Fe226B4cf2cA3Db7A9754",
    morphoMarketV1AdapterV2Factory:
      "0xAA2D848d759d872A45e5658B55B02e589101D9C0",
    registryList: "0x906A0E39C8329b73011d033A3441d2f013013a1A",

    wNative: "0x3439153EB7AF838Ad19d56E1571FBD09333C2809",
    /** USDC token with permit version 2 support required by permit flows. */
    usdc: "0x84A71ccD554Cc1b02749b35d22F684CC8ec987e1",
  },
  [ChainId.BitlayerMainnet]: {
    blue: "0xAeA7eFF1bD3c875c18ef50F0387892dF181431C6",
    adaptiveCurveIrm: "0xefB565442B9Eb740B50Cf928C14d21c0111254F9",
    metaMorphoFactory: "0xb95De4a9C81Ba6240378F383f88592d30937d048",
    chainlinkOracleFactory: "0xfDc69d06De855701731D142F28bD401802DA4daF",
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: "0x4E28CAE07A008FF2D7D345992C969118eb253CD6",
    vaultV2Factory: "0x20d7eAd4830b53fB29bb4C4e8a80FD5F1f7d7F2c",
    morphoMarketV1AdapterV2Factory:
      "0x626f8ea9b3B70C03F8cf9a29eFBb9F3b093d1599",
    registryList: "0x9d3ce545ffC4d00e372B9733343f001085b045D2",

    wNative: "0xfF204e2681A6fA0e2C3FaDe68a1B28fb90E4Fc5F",
    /** USDC token with permit version 2 support required by permit flows. */
    usdc: "0xf8C374CE88A3BE3d374e8888349C7768B607c755",
  },
  [ChainId.BscMainnet]: {
    blue: "0x01b0Bd309AA75547f7a37Ad7B1219A898E67a83a",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    adaptiveCurveIrm: "0x7112D95cB5f6b13bF5F5B94a373bB3b2B381F979",
    metaMorphoFactory: "0x92983687e672cA6d96530f9Dbe11a196cE905d72",
    chainlinkOracleFactory: "0xDf2035fC15919588526dBb5560863C812F135236",
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: "0xEB8871F0FA8aB787AbCD28d1095f7B486d241D42",
    vaultV2Factory: "0x29955201601630f686beAF47b0B03be7b86d160F",
    morphoMarketV1AdapterV2Factory:
      "0x18c1b03ac8007224FE86442a91fEE3135ba767CD",
    registryList: "0x705A9Df14b294E6d4E673520369f289bd48C4cCB",

    wNative: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
  },
  [ChainId.SoneiumMainnet]: {
    blue: "0xE75Fc5eA6e74B824954349Ca351eb4e671ADA53a",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    adaptiveCurveIrm: "0x68F9b666b984527A7c145Db4103Cc6d3171C797F",
    metaMorphoFactory: "0x7026b436f294e560b3C26E731f5cac5992cA2B33",
    chainlinkOracleFactory: "0x669F1A4cE3127740eCdB3E36adFC5Df6Db1EA74b",
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: "0xcBD0710425613d666C5Ffb4dE2eE73554F21c34B",
    vaultV2Factory: "0x783b4853Da42DBA4A86eFa4b94ABd48100c6D982",
    morphoMarketV1AdapterV2Factory:
      "0xd25Ae31a2480DF33b7E5F8CfEE4229248309d519",
    registryList: "0x01eD6405cDf9784022c5466eA1091c78f46B829f",

    wNative: "0x4200000000000000000000000000000000000006",
    /** USDC token with permit version 2 support required by permit flows. */
    usdc: "0xbA9986D2381edf1DA03B0B9c1f8b00dc4AacC369",
  },
  [ChainId.TempoMainnet]: {
    blue: "0x10EE9AAC980A180dd4DcFc96C746d60B0EA88f97",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    bundles: {
      vaultExitBundlesV1: "0x8225192b8638bDe9D41a6d96aBb824F660Ef57E1",
      vaultBundlesV1: "0xe8aA1d8f1Cb111B7f52957D662Ee310D6d2Ee9B9",
      blueBundlesV1: "0xAE863452f44ADD237739A85eb6BB1989E2368362",
    },
    adaptiveCurveIrm: "0x112fd4042E442C3C12C67AD23587b0afe36eB74E",
    vaultV2BluePublicAllocator: "0xDC9693CE6488640faEf173Ec2635ff99fdC25a07",
    vaultV2Factory: "0x3DE400E3F79113194fa5AF6Ae5C474947E0C82Db",
    morphoMarketV1AdapterV2Factory:
      "0xF85aD5f14cC903533FC409B8098B58b4C2f36697",
    morphoVaultV1AdapterFactory: "0x669771F03ab55CebF753E90C3c9D80ad9391cf25",
    registryList: "0xB118227C728b5ce52445a5aAee48C8a281C429E0",
    chainlinkOracleFactory: "0xc2c167BC5cBD833ce58239e85073258F10aD4DF6",
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: "0xB83d2D5CAE5Fc64a408cA82447445442Fe249fe3",
  },
  [ChainId.EdenMainnet]: {
    blue: "0xF050a2BB0468FF23cF2964AC182196C94D6815C3",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    adaptiveCurveIrm: "0x08A7b3a39E5425d616Cc9c046cf96B5eF21a139f",
    vaultV2Factory: "0x9aaCAA01F5e6BC876D07f023744E3E0A456a64cf",
    morphoMarketV1AdapterV2Factory:
      "0x59e8C53D383F22b6371b5833504dfAa4136aE6f7",
    registryList: "0xB78BA19a8Bf3202DA7036ec1830222FDC5e0297e",
    chainlinkOracleFactory: "0xD6202eFF2e869dc473EB13c38Cc787835Bf8B6df",
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: "0x83346d9fc31a239Ae1739672AD84A567C7beF529",
    wNative: "0x00000000000000000000000000000000ce1E571a",
  },
  [ChainId.PharosMainnet]: {
    blue: "0x18573fA18fd17dDfD790B4a5B5b2977aad3b4Efb",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    adaptiveCurveIrm: "0xD5E02889C13230458506CC842347c4E62F8cDF3a",
    vaultV2Factory: "0x8E01ed1E1A41029b3137FcE9Aa880c0A54827498",
    morphoMarketV1AdapterV2Factory:
      "0xe510e1fcC429943cA3455A7bfBD79f0307Cd8403",
    registryList: "0xbe858d729548eB49BbFA05Acd3674ca8cdaAdD4b",
    chainlinkOracleFactory: "0xb8118256d8Aa950ec0B26a0b8Be7C6c1a858f6a3",
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: "0x37511F85B0Eff260d429f693247339dC91C76f90",
    wNative: "0x52C48d4213107b20bC583832b0d951FB9CA8F0B0",
  },
  [ChainId.GensynMainnet]: {
    blue: "0x8c45B34999883FF4B47cD3be095D585682cd9227",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    adaptiveCurveIrm: "0x549EFFAE58F9Db253AAF60fbCeC8B4cB74a952A8",
    vaultV2Factory: "0xe2558155AEcEF57cAADB98e39b0538ab0ae95693",
    morphoMarketV1AdapterV2Factory:
      "0x155134544AE2Ec3AB23034BF620538482C5E3c40",
    registryList: "0xdaE77f687883D656Aa4dc7fF89c0c891510C61A5",
    chainlinkOracleFactory: "0xf9b22d1652ce918CfC5d102269801AFbfEFa85F9",
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: "0x57C88ACAbd4Fa19257104ECCF64ccA34e5eB8961",
    wNative: "0x4200000000000000000000000000000000000006",
  },
  [ChainId.FlareMainnet]: {
    blue: "0xF4346F5132e810f80a28487a79c7559d9797E8B0",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    adaptiveCurveIrm: "0xE5B5627C5973AfAE1928a6b8e5c1D6AABFEC8a7a",
    vaultV2Factory: "0x6FC83ECc0e8142635D77200e5052be8A0a9D2f42",
    morphoMarketV1AdapterV2Factory:
      "0xd8237ea1b5974c83C6b0c8942dc2a16F42f789dd",
    registryList: "0x9730d0B30d9145B66a8e09D26295e36cb84F64a9",
    chainlinkOracleFactory: "0x95cB3625598F9abf6cb8B874AA1EfEEbE7822642",
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: "0xf215D05a04b97f98Bb1bF4E0E5Cb97Ef38fa8895",
    wNative: "0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d",
  },
  [ChainId.XdcMainnet]: {
    blue: "0xEa49B0fE898aF913A3826F9f462eE2cDcb854fD9",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    adaptiveCurveIrm: "0x15c7312B0f26aa0AA70B24a0D2AF87B9e7D614A0",
    vaultV2Factory: "0x227544d6989cD15c05AAB6dde4F29523dcfdbe2B",
    morphoMarketV1AdapterV2Factory:
      "0x5C00c99F2235439725417E9f037B7D38FfF35d31",
    registryList: "0x79A8C4e9E502C1867cAf2E7202f0C6b89aaCd5c1",
    chainlinkOracleFactory: "0x6Ad93a3aA829514473D3DF67382894A76c7283B4",
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: "0xe3845262d726a827817C7196143CDa9a4404218d",
    wNative: "0x951857744785E80e2De051c32EE7b25f9c458C42",
  },
  [ChainId.KaiaMainnet]: {
    blue: "0xA8BEebdca34d83C697c302A0594f3c41f3994cd2",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    adaptiveCurveIrm: "0xA4E2bA20Fc64D721D95BD5a28FF71844C5bb5cF2",
    vaultV2BluePublicAllocator: "0x3b369B37eba1655e8c44bC08E3A604D592c4a14F",
    vaultV2Factory: "0xf2Aecd4a4d4C21d08770e34F392C4C271aBD9144",
    morphoMarketV1AdapterV2Factory:
      "0x4d04C39ca604b560c50F4045c558378FD9AEBCF4",
    registryList: "0xfCA12228DA5fba6E9c0B57a8e8322d0eBaCa03Bc",
    chainlinkOracleFactory: "0x3e89C1071814b2c4170c90260Fcb60B903AD4602",
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: "0xe8eCe452F04117e5Fe1Ea4403097215443225440",
    wNative: "0x19Aac5f612f524B754CA7e7c41cbFa2E981A4432",
  },
  [ChainId.ArcMainnet]: {
    blue: "0x34CD04070dD72b14E241112F6d83812Df5Af7fCD",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    bundles: {
      vaultExitBundlesV1: "0x2095B5974101A94B726593f0E81d177B058849C7",
      vaultBundlesV1: "0x76c1dEefAe48523E14903085081Bda2999450b68",
      blueBundlesV1: "0x3c4BaE2a2Ef708ddaAE40A0b66623afE44eF4A7F",
    },
    adaptiveCurveIrm: "0xF02615d094Fc02fC031C35fe705e175aA4653f20",
    vaultV2BluePublicAllocator: "0x4c2ff4D792d0a03A0e461e4B9B00Bc812A0147C2",
    vaultV2Factory: "0x3b0eefaBfa22ec7CF2c73877ac16e78D76749f12",
    morphoMarketV1AdapterV2Factory:
      "0x6C2FF5114E45b50bc7195c2F1f87C98cbdad62Cc",
    morphoVaultV1AdapterFactory: "0x77788033B22CEaB8D51Ec8F9dFD4a40E54F380B0",
    registryList: "0xdEBC92370Cd74d55DA144116138681dbbb528765",
    chainlinkOracleFactory: "0xbFc8D6167a02889D5EB08a023d9aB712B44f7dE8",
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: "0x8edf6Ac769a7E7D81d571aC0FB8733aD724f6922",
    midnight: "0x208786922BE56fDE2D1Fa60e6b9eC5D723e8d7b0",
    midnightBundles: "0x3609525024c88f794CBE09e4832810E2bd737beC",
    midnightBlueBuyCallbackFactory:
      "0x9bD11e1EC7bf3520896F8e3e63d4B70f8d6d177E",
    midnightMempool: "0x26bded5Fb01373CE875dEa14E52799D04C839C1A",
    ecrecoverRatifier: "0xA3B53aDe6668b6ceC03a9E56a993B47034F43715",
    ecrecoverAuthorizer: "0xe1dccAdc10c35AE9e2207059B233fE5c634CF20f",
    setterRatifier: "0x3915156EBFC246Ee9aC3236af561546B7D9D924c",
  },
  [ChainId.MorphMainnet]: {
    blue: "0xAd10d07901Dc3195c3cb5e78E061F4EA8D9B4905",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    adaptiveCurveIrm: "0xfB69467De332E03FF502B85bB2249d2f721F3319",
    vaultV2BluePublicAllocator: "0x20d990D9eBf8003Df8cAD3Aa36aeF4404e3Ccb86",
    vaultV2Factory: "0x7D8BF8B276f967F7539c9e91E1a85a33fefE612B",
    morphoMarketV1AdapterV2Factory:
      "0xa01D7c41cf419405d4DF2e5750d26438DCAC28a6",
    registryList: "0x553c013d1978CF82EF6b316f5c247B73718ba481",
    chainlinkOracleFactory: "0xE91032cE5B8D86bA4Be146c186984F49Af37fbf1",
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: "0x41581344ba49B07EFA758a0F2a199b90f05Cc866",
    wNative: "0x5300000000000000000000000000000000000011",
  },
  [ChainId.MegaEthMainnet]: {
    blue: "0x18120312A7cf44DcfEc6dCe5632a431579ED9100",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    adaptiveCurveIrm: "0x56875764185548B0ca72A1877b3aE15E44e8A323",
    vaultV2BluePublicAllocator: "0xB4A1B0EF18d169c19fC7617aCE898A06Dc495a7C",
    vaultV2Factory: "0xf133FA5A78C398B31Cc4a180E6Ae84111D6DCF5B",
    morphoMarketV1AdapterV2Factory:
      "0x00a58b7a9B3E86CB21f5F11f29F4A12346457012",
    registryList: "0x3aE18af9717C734820137726967bef4fBc5Ec95c",
    chainlinkOracleFactory: "0x02522D475E7064E1d1E966e3197db050b19b2FC2",
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: "0xF6035B231028E61cd2283651f22ecA45f8e3ADc8",
    wNative: "0x4200000000000000000000000000000000000006",
  },
  [ChainId.RobinhoodMainnet]: {
    blue: "0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    bundles: {
      vaultExitBundlesV1: "0xCE29862924756584BBD0D75CA1249d22007E2813",
      vaultBundlesV1: "0xcC108538f36242D6E0d6B9255f6D9Ccd137D70Fe",
      blueBundlesV1: "0x53A1eB6589861F686af7c531211E35Aefe30210f",
    },
    adaptiveCurveIrm: "0x2BD3d5965B26B51814AC95127B2b80dD6CcC0fa1",
    vaultV2BluePublicAllocator: "0xCe5c1aFa115fF8b1D6913509bfc79D9AE08CC857",
    vaultV2Factory: "0x0FBad98595b0186dA120E41f77C102beb49f803c",
    morphoMarketV1AdapterV2Factory:
      "0x79370Ed003CE325C088E530d5e8655c99c2993e1",
    morphoVaultV1AdapterFactory: "0x7a91222F3f7B927bB8fb624593Ca86e111C2F85e",
    registryList: "0xe785a2eFD384BA7B95BaEd3851BC76aeD67C676f",
    chainlinkOracleFactory: "0xB7c16F6F8cF531447Bf27Ca7220f981E79C9cdF2",
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: "0x0B0cFa151c06d2342799267754b0a2c320C43D5B",
    midnight: "0x6120765Ba5336150BbdDdD0Cd9108B5bFD369632",
    midnightBundles: "0x71aa985ff80AbcE3b8b443845633674Ca9f7575C",
    midnightBlueBuyCallbackFactory:
      "0x53cbCd884CABA07762c72F43283D3fa72de42D4f",
    midnightMempool: "0xcEF685D4796FA80F71a97e803D2c0b6719F1b4E2",
    ecrecoverRatifier: "0x90B800999e4ACd1bD20283BD450bBd2e06D91F7C",
    ecrecoverAuthorizer: "0x75FCdD113fe33a8bEd3CD3C35955DE094Bd2bdf8",
    setterRatifier: "0x708d6Bf6F847202a0755bb5636bE663B174242ea",
    wNative: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
  },
} as const;

/** Deployment block registry with the same shape as `ChainAddresses`. */
export type ChainDeployments<Addresses = ChainAddresses> = {
  [key in keyof Addresses]: `0x${string}` extends Addresses[key]
    ? bigint
    : ChainDeployments<Addresses[key]>;
};

const _deployments = {
  [ChainId.EthMainnet]: {
    blue: 18883124n,
    permit2: 15986406n,
    bundles: { vaultExitBundlesV1: 25_720_868n },
    adaptiveCurveIrm: 18883124n,
    vaultV2BluePublicAllocator: 25770408n,
    metaMorphoFactory: 21439510n,
    vaultV2Factory: 23375073n,
    morphoMarketV1AdapterFactory: 23375073n,
    morphoMarketV1AdapterV2Factory: 23981459n,
    morphoVaultV1AdapterFactory: 23375073n,
    registryList: 23375119n,
    chainlinkOracleFactory: 19375066n,
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: 21414664n,

    midnight: 25_798_183n,
    midnightBundles: 25_798_264n,
    midnightBlueBuyCallbackFactory: 25_798_272n,
    midnightMempool: 25_798_183n,
    ecrecoverRatifier: 25_798_183n,
    ecrecoverAuthorizer: 25_798_183n,
    setterRatifier: 25_798_183n,
  },
  [ChainId.BaseMainnet]: {
    blue: 13977148n,
    permit2: 1425180n,
    bundles: { vaultExitBundlesV1: 49_765_458n },
    adaptiveCurveIrm: 13977152n,
    vaultV2BluePublicAllocator: 50063965n,
    metaMorphoFactory: 23928808n,
    vaultV2Factory: 35615206n,
    morphoMarketV1AdapterFactory: 35615206n,
    morphoMarketV1AdapterV2Factory: 39285528n,
    morphoVaultV1AdapterFactory: 35615206n,
    registryList: 35615358n,
    chainlinkOracleFactory: 13978286n,
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: 23779056n,

    midnight: 48286884n,
    midnightBundles: 48286997n,
    midnightBlueBuyCallbackFactory: 49_544_552n,
    midnightMempool: 48286884n,
    ecrecoverRatifier: 48286884n,
    ecrecoverAuthorizer: 48286884n,
    setterRatifier: 48286884n,
  },
  [ChainId.PolygonMainnet]: {
    blue: 66931042n,
    bundles: { vaultExitBundlesV1: 91_743_910n },
    permit2: 35701901n,
    adaptiveCurveIrm: 66931042n,
    vaultV2BluePublicAllocator: 92141509n,
    metaMorphoFactory: 66931042n,
    vaultV2Factory: 77371907n,
    morphoMarketV1AdapterFactory: 77371907n,
    morphoMarketV1AdapterV2Factory: 80128162n,
    morphoVaultV1AdapterFactory: 77371907n,
    registryList: 77372020n,
    chainlinkOracleFactory: 66931042n,
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: 68074185n,
  },
  [ChainId.ArbitrumMainnet]: {
    blue: 296446593n,
    bundles: { vaultExitBundlesV1: 492_901_559n },
    permit2: 38692735n,
    adaptiveCurveIrm: 296446593n,
    vaultV2BluePublicAllocator: 495274087n,
    metaMorphoFactory: 296447195n,
    vaultV2Factory: 387016724n,
    morphoMarketV1AdapterFactory: 387016724n,
    morphoMarketV1AdapterV2Factory: 409152917n,
    morphoVaultV1AdapterFactory: 387016724n,
    registryList: 387017701n,
    chainlinkOracleFactory: 296447195n,
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: 307326238n,
  },
  [ChainId.OptimismMainnet]: {
    blue: 130770075n,
    bundles: { vaultExitBundlesV1: 155_360_936n },
    permit2: 38854427n,
    adaptiveCurveIrm: 130770075n,
    vaultV2BluePublicAllocator: 155659263n,
    metaMorphoFactory: 130770189n,
    vaultV2Factory: 142122059n,
    morphoMarketV1AdapterFactory: 142122059n,
    morphoMarketV1AdapterV2Factory: 144881071n,
    morphoVaultV1AdapterFactory: 142122059n,
    registryList: 142122170n,
    chainlinkOracleFactory: 130770189n,
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: 132139369n,
  },
  [ChainId.WorldChainMainnet]: {
    blue: 9025669n,
    bundles: { vaultExitBundlesV1: 33_492_822n },
    adaptiveCurveIrm: 9025669n,
    vaultV2BluePublicAllocator: 33790828n,
    metaMorphoFactory: 9025733n,
    vaultV2Factory: 20253005n,
    morphoMarketV1AdapterFactory: 20253005n,
    morphoMarketV1AdapterV2Factory: 23013012n,
    morphoVaultV1AdapterFactory: 20253005n,
    registryList: 20253132n,
    chainlinkOracleFactory: 9025733n,
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: 10273494n,
  },
  [ChainId.FraxtalMainnet]: {
    blue: 15317931n,
    adaptiveCurveIrm: 15317931n,
    metaMorphoFactory: 15318007n,
    chainlinkOracleFactory: 15318007n,
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: 16536231n,

    vaultV2Factory: 31_182_482n,
    morphoMarketV1AdapterV2Factory: 31_182_547n,
    registryList: 31_182_547n,
  },
  [ChainId.ScrollMainnet]: {
    blue: 12842868n,
    adaptiveCurveIrm: 12842868n,
    metaMorphoFactory: 12842903n,
    chainlinkOracleFactory: 12842903n,
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: 13504587n,

    vaultV2Factory: 28_647_107n,
    morphoMarketV1AdapterV2Factory: 28_647_179n,
    registryList: 28_647_179n,
  },
  [ChainId.InkMainnet]: {
    blue: 4078776n,
    adaptiveCurveIrm: 4078776n,
    metaMorphoFactory: 4078830n,
    chainlinkOracleFactory: 4078830n,
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: 6385077n,

    vaultV2Factory: 35_682_429n,
    morphoMarketV1AdapterV2Factory: 35_682_573n,
    registryList: 35_682_573n,
  },
  [ChainId.Unichain]: {
    blue: 9139027n,
    permit2: 0n,
    bundles: { vaultExitBundlesV1: 55_572_727n },
    adaptiveCurveIrm: 9139027n,
    vaultV2BluePublicAllocator: 56168924n,
    metaMorphoFactory: 9316789n,
    vaultV2Factory: 29092109n,
    morphoMarketV1AdapterFactory: 29092109n,
    morphoMarketV1AdapterV2Factory: 34613548n,
    morphoVaultV1AdapterFactory: 29092109n,
    registryList: 29092328n,
    chainlinkOracleFactory: 9316789n,
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: 9381237n,
  },
  [ChainId.SonicMainnet]: {
    blue: 9100931n,
    adaptiveCurveIrm: 9100931n,
    metaMorphoFactory: 9101319n,
    chainlinkOracleFactory: 9101319n,
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: 9102286n,

    vaultV2Factory: 60_993_716n,
    morphoMarketV1AdapterV2Factory: 60_993_824n,
    registryList: 60_993_824n,
  },
  [ChainId.HemiMainnet]: {
    blue: 1188872n,
    adaptiveCurveIrm: 1188872n,
    metaMorphoFactory: 1188885n,
    chainlinkOracleFactory: 1188885n,
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: 1188907n,

    vaultV2Factory: 3_609_553n,
    morphoMarketV1AdapterV2Factory: 3_609_563n,
    registryList: 3_609_563n,
  },
  [ChainId.ModeMainnet]: {
    blue: 19983370n,
    adaptiveCurveIrm: 19983370n,
    metaMorphoFactory: 19983443n,
    chainlinkOracleFactory: 19983443n,
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: 19983599n,

    vaultV2Factory: 34_507_011n,
    morphoMarketV1AdapterV2Factory: 34_507_081n,
    registryList: 34_507_081n,
  },
  [ChainId.CornMainnet]: {
    blue: 251401n,
    adaptiveCurveIrm: 251401n,
    metaMorphoFactory: 253027n,
    chainlinkOracleFactory: 253027n,
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: 253107n,
  },
  [ChainId.PlumeMainnet]: {
    blue: 765994n,
    adaptiveCurveIrm: 765994n,
    metaMorphoFactory: 766078n,
    vaultV2Factory: 32235414n,
    morphoMarketV1AdapterFactory: 32235414n,
    morphoMarketV1AdapterV2Factory: 41965167n,
    morphoVaultV1AdapterFactory: 32235414n,
    registryList: 32235782n,
    chainlinkOracleFactory: 766078n,
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: 789925n,
  },
  [ChainId.CampMainnet]: {
    blue: 2410315n,
    adaptiveCurveIrm: 2410315n,
    metaMorphoFactory: 2410440n,
    chainlinkOracleFactory: 2410440n,
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: 2471517n,
  },
  [ChainId.KatanaMainnet]: {
    blue: 2741069n,
    bundles: { vaultExitBundlesV1: 39_579_123n },
    adaptiveCurveIrm: 2741069n,
    vaultV2BluePublicAllocator: 40217302n,
    metaMorphoFactory: 2741420n,
    vaultV2Factory: 13096629n,
    morphoMarketV1AdapterFactory: 13096629n,
    morphoMarketV1AdapterV2Factory: 18619527n,
    morphoVaultV1AdapterFactory: 13096629n,
    registryList: 13096853n,
    chainlinkOracleFactory: 2741420n,
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: 2741993n,
  },
  [ChainId.EtherlinkMainnet]: {
    blue: 21047448n,
    adaptiveCurveIrm: 21047448n,
    metaMorphoFactory: 21050315n,
    chainlinkOracleFactory: 21050315n,
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: 21050766n,

    vaultV2Factory: 37_474_154n,
    morphoMarketV1AdapterV2Factory: 37_474_326n,
    registryList: 37_474_326n,
  },
  [ChainId.TacMainnet]: {
    blue: 853025n,
    permit2: 553679n,
    adaptiveCurveIrm: 853025n,
    metaMorphoFactory: 978654n,
    chainlinkOracleFactory: 978654n,
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: 978967n,

    vaultV2Factory: 13_304_185n,
    morphoMarketV1AdapterV2Factory: 13_304_411n,
    registryList: 13_304_411n,
  },
  [ChainId.LiskMainnet]: {
    blue: 15731231n,
    adaptiveCurveIrm: 15731231n,
    metaMorphoFactory: 15731333n,
    chainlinkOracleFactory: 15731333n,
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: 15731595n,

    vaultV2Factory: 27_226_961n,
    morphoMarketV1AdapterV2Factory: 27_227_042n,
    registryList: 27_227_042n,
  },
  [ChainId.HyperliquidMainnet]: {
    blue: 1988429n,
    bundles: { vaultExitBundlesV1: 42_767_282n },
    adaptiveCurveIrm: 1988429n,
    vaultV2BluePublicAllocator: 43372279n,
    metaMorphoFactory: 1988677n,
    vaultV2Factory: 14188393n,
    morphoMarketV1AdapterFactory: 14188393n,
    morphoMarketV1AdapterV2Factory: 21460330n,
    morphoVaultV1AdapterFactory: 14188393n,
    registryList: 14188698n,
    chainlinkOracleFactory: 1988677n,
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: 1988956n,
  },
  [ChainId.SeiMainnet]: {
    blue: 166036723n,
    permit2: 118721449n,
    adaptiveCurveIrm: 166036723n,
    metaMorphoFactory: 168896078n,
    chainlinkOracleFactory: 168896078n,
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: 168897284n,
    usdc: 154131168n,

    vaultV2Factory: 197_444_083n,
    morphoMarketV1AdapterV2Factory: 197_444_447n,
    registryList: 197_444_447n,
  },
  [ChainId.ZeroGMainnet]: {
    blue: 7526486n,
    adaptiveCurveIrm: 7526486n,
    metaMorphoFactory: 7526768n,
    chainlinkOracleFactory: 7526768n,
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: 7527649n,

    vaultV2Factory: 7_527_933n,
    morphoMarketV1AdapterFactory: 7_527_933n,
    morphoMarketV1AdapterV2Factory: 16_385_508n,
    morphoVaultV1AdapterFactory: 7_527_933n,
    registryList: 7_528_068n,
  },
  [ChainId.LineaMainnet]: {
    blue: 25072608n,
    adaptiveCurveIrm: 25072608n,
    metaMorphoFactory: 25072665n,
    vaultV2Factory: 25072951n,
    morphoMarketV1AdapterFactory: 25072951n,
    morphoVaultV1AdapterFactory: 25072951n,
    registryList: 25073088n,
    chainlinkOracleFactory: 25072665n,
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: 25072853n,

    morphoMarketV1AdapterV2Factory: 26_530_057n,
  },
  [ChainId.MonadMainnet]: {
    blue: 31907457n,
    permit2: 0n,
    bundles: { vaultExitBundlesV1: 94_631_561n },
    adaptiveCurveIrm: 31907457n,
    vaultV2BluePublicAllocator: 96602489n,
    metaMorphoFactory: 32320327n,
    vaultV2Factory: 32321811n,
    morphoMarketV1AdapterFactory: 32321811n,
    morphoMarketV1AdapterV2Factory: 41103883n,
    morphoVaultV1AdapterFactory: 32321811n,
    registryList: 32322465n,
    chainlinkOracleFactory: 32320327n,
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: 32321504n,
    usdc: 22909616n,
  },
  [ChainId.StableMainnet]: {
    blue: 1504506n,
    permit2: 0n,
    bundles: { vaultExitBundlesV1: 34_970_501n },
    adaptiveCurveIrm: 1504506n,
    vaultV2BluePublicAllocator: 35817019n,
    metaMorphoFactory: 1504774n,
    vaultV2Factory: 1506182n,
    morphoMarketV1AdapterFactory: 1506182n,
    morphoVaultV1AdapterFactory: 1506182n,
    morphoMarketV1AdapterV2Factory: 5110812n,
    registryList: 1506877n,
    chainlinkOracleFactory: 1504774n,
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: 1741861n,
  },
  [ChainId.CronosMainnet]: {
    blue: 38459435n,
    adaptiveCurveIrm: 38459435n,
    metaMorphoFactory: 38459727n,
    vaultV2Factory: 38461643n,
    morphoMarketV1AdapterFactory: 38461643n,
    morphoMarketV1AdapterV2Factory: 44236918n,
    morphoVaultV1AdapterFactory: 38461643n,
    registryList: 38461812n,
    chainlinkOracleFactory: 38459727n,
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: 38460388n,
  },
  [ChainId.CeloMainnet]: {
    blue: 40249329n,
    adaptiveCurveIrm: 40249329n,
    metaMorphoFactory: 40259931n,
    chainlinkOracleFactory: 40259931n,
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: 41808392n,
    usdc: 23412006n,

    vaultV2Factory: 57_278_683n,
    morphoMarketV1AdapterV2Factory: 57_278_849n,
    registryList: 57_278_849n,
  },
  [ChainId.AbstractMainnet]: {
    blue: 13947713n,
    adaptiveCurveIrm: 13947713n,
    metaMorphoFactory: 13949369n,
    chainlinkOracleFactory: 13949369n,
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: 13949482n,
    usdc: 53247n,

    vaultV2Factory: 36_244_191n,
    morphoMarketV1AdapterV2Factory: 36_244_462n,
    registryList: 36_244_462n,
  },
  [ChainId.BitlayerMainnet]: {
    blue: 13516997n,
    adaptiveCurveIrm: 13516997n,
    metaMorphoFactory: 13638155n,
    chainlinkOracleFactory: 13638155n,
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: 13638316n,
    usdc: 4041175n,

    vaultV2Factory: 19_109_598n,
    morphoMarketV1AdapterV2Factory: 19_109_904n,
    registryList: 19_109_904n,
  },
  [ChainId.BscMainnet]: {
    blue: 54344680n,
    permit2: 25343783n,
    adaptiveCurveIrm: 54344680n,
    metaMorphoFactory: 54344985n,
    chainlinkOracleFactory: 54344985n,
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: 54346080n,

    vaultV2Factory: 76_966_373n,
    morphoMarketV1AdapterV2Factory: 76_966_750n,
    registryList: 76_966_750n,
  },
  [ChainId.SoneiumMainnet]: {
    blue: 6440817n,
    adaptiveCurveIrm: 6440817n,
    metaMorphoFactory: 6440899n,
    chainlinkOracleFactory: 6440899n,
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: 6443359n,

    vaultV2Factory: 18_023_802n,
    morphoMarketV1AdapterV2Factory: 18_023_868n,
    registryList: 18_023_868n,
  },
  [ChainId.TempoMainnet]: {
    blue: 2375189n,
    bundles: { vaultExitBundlesV1: 34_046_873n },
    adaptiveCurveIrm: 2375313n,
    vaultV2BluePublicAllocator: 35177253n,
    vaultV2Factory: 2375650n,
    morphoMarketV1AdapterV2Factory: 2375701n,
    morphoVaultV1AdapterFactory: 16475630n,
    registryList: 2375601n,
    chainlinkOracleFactory: 2375626n,
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: 2375010n,
  },
  [ChainId.EdenMainnet]: {
    blue: 53363569n,
    permit2: 52269150n,
    adaptiveCurveIrm: 53363569n,
    vaultV2Factory: 53366326n,
    morphoMarketV1AdapterV2Factory: 53367797n,
    registryList: 53367797n,
    chainlinkOracleFactory: 53364880n,
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: 53364880n,
    wNative: 0n,
  },
  [ChainId.PharosMainnet]: {
    blue: 4202147n,
    permit2: 0n,
    adaptiveCurveIrm: 4202147n,
    vaultV2Factory: 4240410n,
    morphoMarketV1AdapterV2Factory: 4240521n,
    registryList: 4240521n,
    chainlinkOracleFactory: 4202252n,
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: 4202252n,
    wNative: 1617294n,
  },
  [ChainId.GensynMainnet]: {
    blue: 7520470n,
    permit2: 0n,
    adaptiveCurveIrm: 7520470n,
    vaultV2Factory: 7520624n,
    morphoMarketV1AdapterV2Factory: 7520701n,
    registryList: 7520701n,
    chainlinkOracleFactory: 7520548n,
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: 7520548n,
    wNative: 0n,
  },
  [ChainId.FlareMainnet]: {
    blue: 52378788n,
    permit2: 58377404n,
    adaptiveCurveIrm: 52378788n,
    vaultV2Factory: 52383002n,
    morphoMarketV1AdapterV2Factory: 52383110n,
    registryList: 52383110n,
    chainlinkOracleFactory: 52378931n,
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: 52378931n,
    wNative: 39n,
  },
  [ChainId.XdcMainnet]: {
    blue: 101757515n,
    permit2: 92945178n,
    adaptiveCurveIrm: 101757515n,
    vaultV2Factory: 101757669n,
    morphoMarketV1AdapterV2Factory: 101757823n,
    registryList: 101757823n,
    chainlinkOracleFactory: 101757578n,
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: 101757578n,
    wNative: 42776215n,
  },
  [ChainId.KaiaMainnet]: {
    blue: 208021118n,
    permit2: 188994815n,
    adaptiveCurveIrm: 208021118n,
    vaultV2BluePublicAllocator: 224866814n,
    vaultV2Factory: 213463014n,
    morphoMarketV1AdapterV2Factory: 213463079n,
    registryList: 213463079n,
    chainlinkOracleFactory: 213462907n,
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: 213462907n,
    wNative: 104802159n,
  },
  [ChainId.ArcMainnet]: {
    blue: 1208685n,
    permit2: 0n,
    bundles: { vaultExitBundlesV1: 20_322_300n },
    adaptiveCurveIrm: 1208685n,
    vaultV2BluePublicAllocator: 20_322_353n,
    vaultV2Factory: 1208931n,
    morphoMarketV1AdapterV2Factory: 1208978n,
    morphoVaultV1AdapterFactory: 5_314_109n,
    registryList: 1208978n,
    chainlinkOracleFactory: 1208882n,
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: 1208882n,
    midnight: 20_320_779n,
    midnightBundles: 20_321_988n,
    midnightBlueBuyCallbackFactory: 20_322_111n,
    midnightMempool: 20_320_779n,
    ecrecoverRatifier: 20_320_779n,
    ecrecoverAuthorizer: 20_320_779n,
    setterRatifier: 20_320_779n,
  },
  [ChainId.MorphMainnet]: {
    blue: 23180020n,
    permit2: 5081244n,
    adaptiveCurveIrm: 23180020n,
    vaultV2BluePublicAllocator: 25455933n,
    vaultV2Factory: 23180183n,
    morphoMarketV1AdapterV2Factory: 23180228n,
    registryList: 23180228n,
    chainlinkOracleFactory: 23180111n,
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: 23180111n,
    wNative: 0n,
  },
  [ChainId.MegaEthMainnet]: {
    blue: 16408957n,
    permit2: 0n,
    adaptiveCurveIrm: 16408957n,
    vaultV2BluePublicAllocator: 24269516n,
    vaultV2Factory: 16409067n,
    morphoMarketV1AdapterV2Factory: 16409115n,
    registryList: 16409115n,
    chainlinkOracleFactory: 16409024n,
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: 16409024n,
    wNative: 0n,
  },
  [ChainId.RobinhoodMainnet]: {
    blue: 286n,
    permit2: 0n,
    bundles: { vaultExitBundlesV1: 32_383_480n },
    adaptiveCurveIrm: 286n,
    vaultV2BluePublicAllocator: 38318973n,
    vaultV2Factory: 288n,
    morphoMarketV1AdapterV2Factory: 289n,
    morphoVaultV1AdapterFactory: 58_781n,
    registryList: 289n,
    chainlinkOracleFactory: 287n,
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    preLiquidationFactory: 287n,
    midnight: 65_366_296n,
    midnightBundles: 65_387_381n,
    midnightBlueBuyCallbackFactory: 65_391_242n,
    midnightMempool: 65_366_296n,
    ecrecoverRatifier: 65_366_296n,
    ecrecoverAuthorizer: 65_366_296n,
    setterRatifier: 65_366_296n,
    wNative: 2n,
  },
} as const satisfies Record<ChainId, ChainDeployments>;

/** Dot-separated label for an address entry in the chain registry. */
export type AddressLabel =
  | DottedKeys<ChainAddresses>
  | DottedKeys<(typeof _addressesRegistry)[ChainId]>;

/** Address registry keyed by chain id, preserving known-chain key types. */
export type AddressRegistry = typeof _addressesRegistry &
  Record<number, ChainAddresses>;

/** Deployment registry keyed by chain id, preserving known-chain key types. */
export type DeploymentRegistry = typeof _deployments &
  Record<number, ChainDeployments>;

type RegistryInput<
  Input extends Record<number, unknown>,
  KnownKey extends PropertyKey,
  KnownValue,
  CustomValue,
> = {
  [Key in keyof Input]: Key extends KnownKey
    ? DeepPartial<KnownValue>
    : Key extends `${Extract<KnownKey, string | number>}`
      ? DeepPartial<KnownValue>
      : CustomValue;
};

/**
 * Returns the protocol address registry for a chain.
 *
 * @param chainId - The EIP-155 chain id.
 * @returns The configured protocol, adapter, factory, and token addresses for `chainId`.
 * @throws {UnsupportedChainIdError} when no address registry exists for `chainId`.
 * @example
 * ```ts
 * import { ChainId, getChainAddresses } from "@morpho-org/morpho-ts";
 *
 * const chainAddresses = getChainAddresses(ChainId.EthMainnet);
 * // chainAddresses satisfies ChainAddresses
 * ```
 */
export const getChainAddresses = (chainId: number): ChainAddresses => {
  const chainAddresses = blueAddresses[chainId];
  if (chainAddresses == null) throw new UnsupportedChainIdError(chainId);

  return chainAddresses;
};

/**
 * Returns one configured address from a chain registry entry.
 *
 * @param chainId - The EIP-155 chain id.
 * @param label - Dot-separated address label to resolve.
 * @returns The configured address at `label`.
 * @throws UnsupportedChainIdError when no address registry exists for `chainId`.
 * @throws UnknownAddressError when `chainId` is supported but `label` has no registered address.
 * @example
 * ```ts
 * import { getChainAddress } from "@morpho-org/morpho-ts";
 *
 * const midnight = getChainAddress(31337, "midnight");
 * // midnight satisfies `0x${string}`
 * ```
 */
export const getChainAddress = (
  chainId: number,
  label: AddressLabel,
): `0x${string}` => {
  const chainAddresses = blueAddresses[chainId];
  if (chainAddresses == null) throw new UnsupportedChainIdError(chainId);

  let address: unknown = chainAddresses;
  for (const key of label.split(".")) {
    if (!isRecord(address)) {
      address = undefined;
      break;
    }

    address = address[key];
  }

  if (typeof address !== "string")
    throw new UnknownAddressError({ chainId, label: String(label) });

  return address as `0x${string}`;
};

/**
 * Assumptions:
 * - unwrapped token has same number of decimals than wrapped tokens.
 */
const _unwrappedTokensMapping: Record<
  number,
  Record<`0x${string}`, `0x${string}`>
> = {
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
  [ChainId.ZeroGMainnet]: {
    [_addressesRegistry[ChainId.ZeroGMainnet].wNative]: NATIVE_ADDRESS,
  },
  [ChainId.LineaMainnet]: {
    [_addressesRegistry[ChainId.LineaMainnet].wNative]: NATIVE_ADDRESS,
  },
  [ChainId.MonadMainnet]: {
    [_addressesRegistry[ChainId.MonadMainnet].wNative]: NATIVE_ADDRESS,
  },
  [ChainId.CronosMainnet]: {
    [_addressesRegistry[ChainId.CronosMainnet].wNative]: NATIVE_ADDRESS,
  },
  [ChainId.AbstractMainnet]: {
    [_addressesRegistry[ChainId.AbstractMainnet].wNative]: NATIVE_ADDRESS,
  },
  [ChainId.BitlayerMainnet]: {
    [_addressesRegistry[ChainId.BitlayerMainnet].wNative]: NATIVE_ADDRESS,
  },
  [ChainId.BscMainnet]: {
    [_addressesRegistry[ChainId.BscMainnet].wNative]: NATIVE_ADDRESS,
  },
  [ChainId.SoneiumMainnet]: {
    [_addressesRegistry[ChainId.SoneiumMainnet].wNative]: NATIVE_ADDRESS,
  },
  [ChainId.EdenMainnet]: {
    [_addressesRegistry[ChainId.EdenMainnet].wNative]: NATIVE_ADDRESS,
  },
  [ChainId.PharosMainnet]: {
    [_addressesRegistry[ChainId.PharosMainnet].wNative]: NATIVE_ADDRESS,
  },
  [ChainId.GensynMainnet]: {
    [_addressesRegistry[ChainId.GensynMainnet].wNative]: NATIVE_ADDRESS,
  },
  [ChainId.FlareMainnet]: {
    [_addressesRegistry[ChainId.FlareMainnet].wNative]: NATIVE_ADDRESS,
  },
  [ChainId.XdcMainnet]: {
    [_addressesRegistry[ChainId.XdcMainnet].wNative]: NATIVE_ADDRESS,
  },
  [ChainId.KaiaMainnet]: {
    [_addressesRegistry[ChainId.KaiaMainnet].wNative]: NATIVE_ADDRESS,
  },
  [ChainId.MorphMainnet]: {
    [_addressesRegistry[ChainId.MorphMainnet].wNative]: NATIVE_ADDRESS,
  },
  [ChainId.MegaEthMainnet]: {
    [_addressesRegistry[ChainId.MegaEthMainnet].wNative]: NATIVE_ADDRESS,
  },
  [ChainId.RobinhoodMainnet]: {
    [_addressesRegistry[ChainId.RobinhoodMainnet].wNative]: NATIVE_ADDRESS,
  },
};

/**
 * Returns the unwrapped token mapped to a wrapped token on a chain.
 *
 * Lookup is case-insensitive: the registry keys are checksummed, but callers may pass a lowercased address.
 *
 * @param wrappedToken - The wrapped token address to resolve.
 * @param chainId - The EIP-155 chain id.
 * @returns The unwrapped token address, or `undefined` when no mapping is registered.
 * @example
 * ```ts
 * import { ChainId, getUnwrappedToken, NATIVE_ADDRESS, addresses } from "@morpho-org/morpho-ts";
 *
 * const unwrapped = getUnwrappedToken(addresses[ChainId.EthMainnet].wNative!, ChainId.EthMainnet);
 * // unwrapped === NATIVE_ADDRESS
 * ```
 */
export function getUnwrappedToken(
  wrappedToken: `0x${string}`,
  chainId: number,
) {
  const mapping = unwrappedTokensMapping[chainId];
  if (mapping == null || wrappedToken == null) return undefined;

  return (
    mapping[wrappedToken] ??
    entries(mapping).find(([key]) => isHexEqual(key, wrappedToken))?.[1]
  );
}

/**
 * The registry of all known ERC20Wrapper tokens.
 */
export const erc20WrapperTokens: Record<number, Set<`0x${string}`>> = {};

/**
 * The registry of all known PermissionedERC20Wrapper with a `hasPermission` getter.
 * All permissioned wrapper tokens are considered ERC20Wrapper and automatically added to the erc20WrapperTokens registry.
 */
export const permissionedWrapperTokens: Record<number, Set<`0x${string}`>> = {
  [ChainId.BaseMainnet]: new Set([
    _addressesRegistry[ChainId.BaseMainnet].testUsdc,
  ]),
};

/**
 * The registry of all known permissioned wrapped Backed tokens.
 * All permissioned Backed tokens are considered ERC20Wrapper and automatically added to the erc20WrapperTokens registry.
 */
export const permissionedBackedTokens: Record<number, Set<`0x${string}`>> = {
  [ChainId.EthMainnet]: new Set([
    _addressesRegistry[ChainId.EthMainnet].wbIB01,
    _addressesRegistry[ChainId.EthMainnet].wbC3M,
  ]),
};

/**
 * The registry of all known permissioned wrapped tokens that require a Coinbase attestation.
 * All permissioned Coinbase tokens are considered PermissionedERC20Wrapper and automatically added to the permissionedWrapperTokens registry.
 */
export const permissionedCoinbaseTokens: Record<number, Set<`0x${string}`>> = {
  [ChainId.BaseMainnet]: new Set([
    _addressesRegistry[ChainId.BaseMainnet].verUsdc,
  ]),
};

/**
 * Returns the known Coinbase-attested wrapped tokens for a chain.
 *
 * @param chainId - The EIP-155 chain id.
 * @returns A set of permissioned wrapped token addresses, or an empty set when none are registered.
 * @example
 * ```ts
 * import { ChainId, getPermissionedCoinbaseTokens } from "@morpho-org/morpho-ts";
 *
 * const tokens = getPermissionedCoinbaseTokens(ChainId.BaseMainnet);
 * // tokens satisfies Set<`0x${string}`>
 * ```
 */
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
export const convexWrapperTokens: Record<number, Set<`0x${string}`>> = {
  [ChainId.EthMainnet]: new Set([
    _addressesRegistry[ChainId.EthMainnet]["stkcvxcrvUSDTWBTCWETH-morpho"],
    _addressesRegistry[ChainId.EthMainnet]["stkcvxcrvUSDCWBTCWETH-morpho"],
    _addressesRegistry[ChainId.EthMainnet]["stkcvxcrvCRVUSDTBTCWSTETH-morpho"],
    _addressesRegistry[ChainId.EthMainnet]["stkcvxTryLSD-morpho"],
    _addressesRegistry[ChainId.EthMainnet]["stkcvxcrvUSDETHCRV-morpho"],
    _addressesRegistry[ChainId.EthMainnet]["stkcvx2BTC-f-morpho"],
  ]),
};

/** Deep-frozen registry of known Morpho protocol addresses, keyed by chain id. */
export let addressesRegistry: AddressRegistry = deepFreeze(_addressesRegistry);
/** Alias of `addressesRegistry` keyed by numeric chain id. */
export let addresses = addressesRegistry;
/** Deep-frozen registry of deployment blocks, keyed by chain id. */
export let deployments: DeploymentRegistry = deepFreeze(_deployments);
/** Alias of `addressesRegistry` kept for Blue package compatibility. */
export let blueAddressRegistry = addressesRegistry;
/** Alias of `addressesRegistry` matching the previous Blue object-style export. */
export let blueAddresses = blueAddressRegistry;
/** Alias of `deployments` kept for Blue package compatibility. */
export let blueDeployments = deployments;
/** Deep-frozen registry of wrapped token to unwrapped token mappings. */
export let unwrappedTokensMapping = deepFreeze(_unwrappedTokensMapping);

type RegistryPrimitive = string | bigint | number | boolean;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null &&
  typeof value === "object" &&
  Object.getPrototypeOf(value) === Object.prototype;

const isRegistryPrimitive = (value: unknown): value is RegistryPrimitive =>
  ["string", "bigint", "number", "boolean"].includes(typeof value);

const cloneRegistryValue = <T>(value: T): T => {
  if (!isRecord(value)) return value;

  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    next[key] = cloneRegistryValue(child);
  }

  return next as T;
};

const areRegistryValuesEqual = ({
  base,
  patch,
  type,
}: {
  base: unknown;
  patch: unknown;
  type: string;
}) => {
  if (
    type === "address" &&
    typeof base === "string" &&
    typeof patch === "string"
  )
    return base.toLowerCase() === patch.toLowerCase();

  return base === patch;
};

const assertRequiredBlueRegistry = ({
  chainId,
  entry,
  type,
}: {
  chainId: number;
  entry: unknown;
  type: "address" | "deployment";
}) => {
  const requiredValueType = type === "address" ? "string" : "bigint";

  if (
    isRecord(entry) &&
    typeof entry.blue === requiredValueType &&
    typeof entry.adaptiveCurveIrm === requiredValueType
  )
    return;

  throw new IncompleteChainRegistryError({
    chainId,
    type,
  });
};

const mergeRegistry = <T>({
  base,
  patch,
  label,
  type,
}: {
  base: T;
  patch: unknown;
  label: string;
  type: string;
}): T => {
  if (patch === undefined) return base;

  if (isRecord(base) && isRecord(patch)) {
    const next: Record<string, unknown> = { ...base };

    for (const [key, value] of Object.entries(patch)) {
      const childLabel = label === "" ? key : `${label}.${key}`;
      next[key] = mergeRegistry({
        base: base[key],
        patch: value,
        label: childLabel,
        type,
      });
    }

    return next as T;
  }

  if (base !== undefined) {
    if (!areRegistryValuesEqual({ base, patch, type })) {
      if (!isRegistryPrimitive(base) || !isRegistryPrimitive(patch)) {
        throw new RegistryValueAlreadyRegisteredError({
          label,
          registeredValue: String(base),
          requestedValue: String(patch),
          type,
        });
      }

      throw new RegistryValueAlreadyRegisteredError({
        label,
        registeredValue: base,
        requestedValue: patch,
        type,
      });
    }

    return base;
  }

  return cloneRegistryValue(patch) as T;
};

const refreshAddressViews = () => {
  addresses = addressesRegistry;
  blueAddresses = blueAddressRegistry = addressesRegistry;
};

const refreshDeploymentViews = () => {
  blueDeployments = deployments;
};

/**
 * Registers custom addresses, deployment blocks, and unwrapped token mappings.
 *
 * Validation runs over every requested patch before any registry is committed; a thrown error leaves all registries unchanged.
 *
 * @param options - Optional configuration object
 * @param options.unwrappedTokens - A mapping of chain IDs to token address maps,
 *                                  where each entry maps wrapped tokens to their unwrapped equivalents.
 * @param options.addresses - Custom address entries to merge into the default registry.
 *                            Known-chain entries may be partial; custom-chain entries must include the required
 *                            Blue addresses and may add optional periphery addresses.
 * @param options.deployments - Custom deployment entries to merge into the default registry.
 *                              Known-chain entries may be partial; custom-chain entries must include the required
 *                              Blue deployments and may add optional periphery deployments.
 *
 * @throws RegistryValueAlreadyRegisteredError when registration attempts to override an existing value.
 * @throws IncompleteChainRegistryError when a custom-chain entry does not include the required Blue registry fields.
 * @returns Nothing.
 *
 * @example
 * ```ts
 * import { registerCustomAddresses } from "@morpho-org/morpho-ts";
 *
 * registerCustomAddresses({
 *   addresses: {
 *     31337: {
 *       blue: "0x0000000000000000000000000000000000000001",
 *       adaptiveCurveIrm: "0x0000000000000000000000000000000000000002",
 *       midnight: "0x0000000000000000000000000000000000000005",
 *       midnightBundles: "0x0000000000000000000000000000000000000006",
 *       midnightMempool: "0x0000000000000000000000000000000000000007",
 *       ecrecoverRatifier: "0x0000000000000000000000000000000000000008",
 *       ecrecoverAuthorizer: "0x0000000000000000000000000000000000000009",
 *       setterRatifier: "0x0000000000000000000000000000000000000010",
 *       permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
 *     },
 *   },
 *   unwrappedTokens: {
 *     31337: {
 *       "0x0000000000000000000000000000000000000005": "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
 *     },
 *   },
 * });
 * ```
 */
export function registerCustomAddresses<
  const TAddresses extends Record<number, unknown> = Record<never, never>,
  const TDeployments extends Record<number, unknown> = Record<never, never>,
>({
  unwrappedTokens,
  addresses: customAddresses,
  deployments: customDeployments,
}: {
  unwrappedTokens?: Record<number, Record<`0x${string}`, `0x${string}`>>;
  addresses?: RegistryInput<
    TAddresses,
    keyof typeof _addressesRegistry,
    ChainAddresses,
    ChainAddresses
  >;
  deployments?: RegistryInput<
    TDeployments,
    keyof typeof _deployments,
    ChainDeployments,
    ChainDeployments
  >;
} = {}) {
  let nextAddresses: AddressRegistry | undefined;
  let nextDeployments: DeploymentRegistry | undefined;
  let nextUnwrappedTokens: typeof unwrappedTokensMapping | undefined;

  if (customAddresses) {
    const nextRegistry: Record<number, ChainAddresses> = {
      ...addressesRegistry,
    };

    for (const [chainIdString, requestedAddresses] of Object.entries(
      customAddresses,
    )) {
      const chainId = Number(chainIdString);
      const registeredEntry = nextRegistry[chainId];
      const requestedEntry = cloneRegistryValue(requestedAddresses);

      if (registeredEntry == null) {
        assertRequiredBlueRegistry({
          chainId,
          entry: requestedEntry,
          type: "address",
        });
      }

      nextRegistry[chainId] =
        registeredEntry == null
          ? (requestedEntry as ChainAddresses)
          : mergeRegistry({
              base: registeredEntry,
              patch: requestedEntry,
              label: String(chainId),
              type: "address",
            });
    }

    nextAddresses = deepFreeze(nextRegistry) as AddressRegistry;
  }

  if (customDeployments) {
    const nextRegistry: Record<number, ChainDeployments> = {
      ...deployments,
    };

    for (const [chainIdString, requestedDeployments] of Object.entries(
      customDeployments,
    )) {
      const chainId = Number(chainIdString);
      const registeredEntry = nextRegistry[chainId];
      const requestedEntry = cloneRegistryValue(requestedDeployments);

      if (registeredEntry == null) {
        assertRequiredBlueRegistry({
          chainId,
          entry: requestedEntry,
          type: "deployment",
        });
      }

      nextRegistry[chainId] =
        registeredEntry == null
          ? (requestedEntry as ChainDeployments)
          : mergeRegistry({
              base: registeredEntry,
              patch: requestedEntry,
              label: String(chainId),
              type: "deployment",
            });
    }

    nextDeployments = deepFreeze(nextRegistry) as DeploymentRegistry;
  }

  if (unwrappedTokens) {
    // Patch keys that differ only by case from a registered key (or from an earlier key of the same
    // patch) are rewritten onto that key, and values that differ only by case from the registered
    // value are rewritten onto that value, so `mergeRegistry` compares the same token instead of
    // adding a duplicate entry. Casing variants within one patch must agree on the unwrapped token.
    const alignedUnwrappedTokens = fromEntries(
      entries(unwrappedTokens).map(([chainIdString, tokens]) => {
        const registered = unwrappedTokensMapping[Number(chainIdString)] ?? {};
        const registeredKeys = keys(registered);
        const aligned: Record<`0x${string}`, `0x${string}`> = {};

        for (const [wrapped, unwrapped] of entries(tokens)) {
          const key =
            [...registeredKeys, ...keys(aligned)].find((candidate) =>
              isHexEqual(candidate, wrapped),
            ) ?? wrapped;
          const previous = aligned[key] ?? registered[key];

          if (previous !== undefined && !isHexEqual(previous, unwrapped))
            throw new RegistryValueAlreadyRegisteredError({
              label: `unwrappedTokens.${chainIdString}.${key}`,
              registeredValue: previous,
              requestedValue: unwrapped,
              type: "unwrapped token",
            });

          aligned[key] = previous ?? unwrapped;
        }

        return [chainIdString, aligned] as const;
      }),
    );

    nextUnwrappedTokens = deepFreeze(
      mergeRegistry({
        base: unwrappedTokensMapping,
        patch: alignedUnwrappedTokens,
        label: "unwrappedTokens",
        type: "unwrapped token",
      }),
    );
  }

  if (nextAddresses) {
    addressesRegistry = nextAddresses;
    refreshAddressViews();
  }

  if (nextDeployments) {
    deployments = nextDeployments;
    refreshDeploymentViews();
  }

  if (nextUnwrappedTokens) unwrappedTokensMapping = nextUnwrappedTokens;
}
