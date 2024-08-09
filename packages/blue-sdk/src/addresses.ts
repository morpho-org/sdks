import { entries } from "@morpho-org/morpho-ts";

import { ChainId } from "./chain";
import { UnsupportedChainIdError } from "./errors";
import { Address } from "./types";

/** Address used to replicate an erc20-behaviour for native token.
 *
 * NB: data might differ from expected onchain native token data
 */
export const NATIVE_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

export const addresses = {
  [ChainId.EthGoerliTestnet]: {
    morpho: "0x64c7044050Ba0431252df24fEd4d9635a275CB41" as const,
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const,
    bundler: "0xCFFbEEAFCD79Fd68FD56Dbc31A419f290A2Fe9e0" as const,

    wNative: "0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6" as const,
    stEth: "0x1643E812aE58766192Cf7D2Cf9567dF2C37e9B7F" as const,
    wstEth: "0x6320cD32aA674d2898A68ec82e869385Fc5f7E2f" as const,
    dai: "0x11fE4B6AE13d2a6055C8D9cF65c55bac32B5d844" as const,
    usdc: "0x62bD2A599664D421132d7C54AB4DbE3233f4f0Ae" as const,
  },
  [ChainId.EthMainnet]: {
    morpho: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb" as const,
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const,
    bundler: "0x4095F064B8d3c3548A3bebfd0Bbfd04750E30077" as const,
    aaveV3OptimizerBundler:
      "0x16F38d2E764E7BeBF625a8E995b34968226D2F9c" as const,
    aaveV2Bundler: "0xb3dCc75DB379925edFd3007511A8CE0cB4aa8e76" as const,
    aaveV3Bundler: "0x98ccB155E86bb478d514a827d16f58c6912f9BDC" as const,
    compoundV3Bundler: "0x3a0e2E9FB9c95fBc843daF166276C90B6C479558" as const,
    compoundV2Bundler: "0x26bf52a84360ad3d01d7cdc28fc2ddc04d8c8647" as const,
    adaptiveCurveIrm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC" as const,
    publicAllocator: "0xfd32fA2ca22c76dD6E550706Ad913FC6CE91c75D" as const,

    wNative: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as const,
    morphoToken: "0x9994E35Db50125E0DF82e4c2dde62496CE330999" as const,
    dai: "0x6B175474E89094C44Da98b954EedeAC495271d0F" as const,
    sDai: "0x83F20F44975D03b1b09e64809B757c47f942BEeA" as const,
    mkr: "0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2" as const,
    stEth: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84" as const,
    wstEth: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0" as const,
    osEth: "0xf1C9acDc66974dFB6dEcB12aA385b9cD01190E38" as const,
    bIB01: "0xCA30c93B02514f86d5C86a6e375E3A330B435Fb5" as const,
    // If we want to change the wbIB01 address, we have to check if the new one has simple permit or not.
    // Currently, wbIB01 is considered to have simple permit.
    wbIB01: "0xcA2A7068e551d5C4482eb34880b194E4b945712F" as const,
    bC3M: "0x2F123cF3F37CE3328CC9B5b8415f9EC5109b45e7" as const,
    // If we want to change the wbC3M address, we have to check if the new one has simple permit or not.
    // Currently, wbC3M is considered to have simple permit.
    wbC3M: "0x95D7337d43340E2721960Dc402D9b9117f0d81a2" as const,
    usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as const,
    crvUsd: "0xf939E0A03FB07F59A73314E73794Be0E57ac1b4E" as const,

    "stkcvxcrvUSDTWBTCWETH-morpho":
      "0xb0Ce26C88e4e7DCa51968b6047f44646f5064278" as const,
    crvUSDTWBTCWETH: "0xf5f5B97624542D72A9E06f04804Bf81baA15e2B4" as const,
    "stkcvxcrvUSDCWBTCWETH-morpho":
      "0x0ea1a65A2c255f24Ee8D81eA6AaC54Decd9d269e" as const,
    crvUSDCWBTCWETH: "0x7F86Bf177Dd4F3494b841a37e810A34dD56c829B" as const,
    "stkcvxcrvCRVUSDTBTCWSTETH-morpho":
      "0x3ce8Ec9f3d89aD0A2DdbCC3FDB8991BD241Fc82E" as const,
    crvCRVUSDTBTCWSTETH: "0x2889302a794dA87fBF1D6Db415C1492194663D13" as const,
    "stkcvxTryLSD-morpho":
      "0x6BA072F0d22806F2C52e9792AF47f2D59103BEBE" as const,
    tryLSD: "0x2570f1bD5D2735314FC102eb12Fc1aFe9e6E7193" as const,
    "stkcvxcrvUSDETHCRV-morpho":
      "0xAc904BAfBb5FB04Deb2b6198FdCEedE75a78Ce5a" as const,
    crvUSDETHCRV: "0x4eBdF703948ddCEA3B11f675B4D1Fba9d2414A14" as const,
    "stkcvx2BTC-f-morpho":
      "0x385E12cf4040543Bc8C18e05C1298Be5B04f3f5e" as const,
    "2BTC-f": "0xB7ECB2AA52AA64a717180E030241bC75Cd946726" as const,
  },
  [ChainId.BaseMainnet]: {
    morpho: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb" as const,
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const,
    bundler: "0x23055618898e202386e6c13955a58D3C68200BFB" as const,
    compoundV2Bundler: "0x123f3167a416cA19365dE03a65e0AF3532af7223" as const,
    aaveV3Bundler: "0xcAe2929baBc60Be34818EaA5F40bF69265677108" as const,
    compoundV3Bundler: "0x1f8076e2EB6f10b12e6886f30D4909A91969F7dA" as const,
    adaptiveCurveIrm: "0x46415998764C29aB2a25CbeA6254146D50D22687" as const,
    publicAllocator: "0xA090dD1a701408Df1d4d0B85b716c87565f90467" as const,

    wNative: "0x4200000000000000000000000000000000000006" as const,
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const,
    verUsdc: "0x59aaF835D34b1E3dF2170e4872B785f11E2a964b" as const,
    testUsdc: "0xBC77067f829979812d795d516E523C4033b66409" as const,
  },
};

export interface ChainAddresses {
  morpho: Address;
  permit2: Address;
  bundler: Address;
  aaveV3OptimizerBundler?: Address;
  aaveV2Bundler?: Address;
  aaveV3Bundler?: Address;
  compoundV3Bundler?: Address;
  compoundV2Bundler?: Address;
  adaptiveCurveIrm?: Address;
  publicAllocator?: Address;

  wNative: Address;
  morphoToken?: Address;
  dai?: Address;
  mkr?: Address;
  usdc?: Address;
  stEth?: Address;
  wstEth?: Address;
}

export type AddressLabel = keyof (typeof addresses)[ChainId];

export default addresses as {
  [n in ChainId]: ChainAddresses;
};

export const getChainAddresses = (chainId: number): ChainAddresses => {
  const chainAddresses = addresses[chainId as ChainId];

  if (!chainAddresses) throw new UnsupportedChainIdError(chainId);

  return chainAddresses;
};

/**
 * Assumptions:
 * - unwrapped token has same number of decimals than wrapped tokens.
 */
export const unwrappedTokensMapping: Record<
  ChainId,
  Record<Address, Address>
> = {
  [ChainId.EthGoerliTestnet]: {
    [addresses[ChainId.EthGoerliTestnet].wNative]: NATIVE_ADDRESS,
    [addresses[ChainId.EthGoerliTestnet].wstEth]:
      addresses[ChainId.EthGoerliTestnet].stEth,
  },
  [ChainId.EthMainnet]: {
    [addresses[ChainId.EthMainnet].wbIB01]: addresses[ChainId.EthMainnet].bIB01,
    [addresses[ChainId.EthMainnet].wbC3M]: addresses[ChainId.EthMainnet].bC3M,
    [addresses[ChainId.EthMainnet].wNative]: NATIVE_ADDRESS,
    [addresses[ChainId.EthMainnet].stEth]: NATIVE_ADDRESS,
    [addresses[ChainId.EthMainnet].wstEth]: addresses[ChainId.EthMainnet].stEth,
    [addresses[ChainId.EthMainnet]["stkcvxcrvUSDTWBTCWETH-morpho"]]:
      addresses[ChainId.EthMainnet].crvUSDTWBTCWETH,
    [addresses[ChainId.EthMainnet]["stkcvxcrvUSDCWBTCWETH-morpho"]]:
      addresses[ChainId.EthMainnet].crvUSDCWBTCWETH,
    [addresses[ChainId.EthMainnet]["stkcvxcrvCRVUSDTBTCWSTETH-morpho"]]:
      addresses[ChainId.EthMainnet].crvCRVUSDTBTCWSTETH,
    [addresses[ChainId.EthMainnet]["stkcvxTryLSD-morpho"]]:
      addresses[ChainId.EthMainnet].tryLSD,
    [addresses[ChainId.EthMainnet]["stkcvxcrvUSDETHCRV-morpho"]]:
      addresses[ChainId.EthMainnet].crvUSDETHCRV,

    [addresses[ChainId.EthMainnet]["stkcvx2BTC-f-morpho"]]:
      addresses[ChainId.EthMainnet]["2BTC-f"],
  },
  [ChainId.BaseMainnet]: {
    [addresses[ChainId.BaseMainnet].wNative]: NATIVE_ADDRESS,
    [addresses[ChainId.BaseMainnet].verUsdc]:
      addresses[ChainId.BaseMainnet].usdc,
    [addresses[ChainId.BaseMainnet].testUsdc]:
      addresses[ChainId.BaseMainnet].usdc,
  },
};

export function getUnwrappedToken(wrappedToken: Address, chainId: ChainId) {
  return unwrappedTokensMapping[chainId][wrappedToken];
}

/**
 * The registry of all known ERC20Wrapper tokens.
 */
export const erc20WrapperTokens: Record<ChainId, Set<Address>> = {
  [ChainId.EthMainnet]: new Set(),
  [ChainId.EthGoerliTestnet]: new Set(),
  [ChainId.BaseMainnet]: new Set(),
};

/**
 * The registry of all known PermissionedERC20Wrapper with a `hasPermission` getter.
 * All permissioned wrapper tokens are considered ERC20Wrapper and automatically added to the erc20WrapperTokens registry.
 */
export const permissionedWrapperTokens: Record<ChainId, Set<Address>> = {
  [ChainId.EthMainnet]: new Set(),
  [ChainId.EthGoerliTestnet]: new Set(),
  [ChainId.BaseMainnet]: new Set([addresses[ChainId.BaseMainnet].testUsdc]),
};

/**
 * The registry of all known permissioned wrapped Backed tokens.
 * All permissioned Backed tokens are considered ERC20Wrapper and automatically added to the erc20WrapperTokens registry.
 */
export const permissionedBackedTokens: Record<ChainId, Set<Address>> = {
  [ChainId.EthMainnet]: new Set([
    addresses[ChainId.EthMainnet].wbIB01,
    addresses[ChainId.EthMainnet].wbC3M,
  ]),
  [ChainId.EthGoerliTestnet]: new Set(),
  [ChainId.BaseMainnet]: new Set(),
};

/**
 * The registry of all known permissioned wrapped tokens that require a Coinbase attestation.
 * All permissioned Coinbase tokens are considered PermissionedERC20Wrapper and automatically added to the permissionedWrapperTokens registry.
 */
export const permissionedCoinbaseTokens: Record<ChainId, Set<Address>> = {
  [ChainId.EthMainnet]: new Set(),
  [ChainId.EthGoerliTestnet]: new Set(),
  [ChainId.BaseMainnet]: new Set([addresses[ChainId.BaseMainnet].verUsdc]),
};

entries(permissionedBackedTokens).forEach(([chainId, tokens]) => {
  tokens.forEach((token) => erc20WrapperTokens[chainId].add(token));
});

entries(permissionedCoinbaseTokens).forEach(([chainId, tokens]) => {
  tokens.forEach((token) => permissionedWrapperTokens[chainId].add(token));
});

entries(permissionedWrapperTokens).forEach(([chainId, tokens]) => {
  tokens.forEach((token) => erc20WrapperTokens[chainId].add(token));
});

/** /!\  These tokens can not be listed in `erc20WrapperTokens` because the following specs are different:
 * - calling `depositFor` supplies on blue instead of minting wrapped token to the user
 */
export const convexWrapperTokens: Record<ChainId, Set<Address>> = {
  [ChainId.EthMainnet]: new Set([
    addresses[ChainId.EthMainnet]["stkcvxcrvUSDTWBTCWETH-morpho"],
    addresses[ChainId.EthMainnet]["stkcvxcrvUSDCWBTCWETH-morpho"],
    addresses[ChainId.EthMainnet]["stkcvxcrvCRVUSDTBTCWSTETH-morpho"],
    addresses[ChainId.EthMainnet]["stkcvxTryLSD-morpho"],
    addresses[ChainId.EthMainnet]["stkcvxcrvUSDETHCRV-morpho"],
    addresses[ChainId.EthMainnet]["stkcvx2BTC-f-morpho"],
  ]),
  [ChainId.EthGoerliTestnet]: new Set(),
  [ChainId.BaseMainnet]: new Set(),
};
