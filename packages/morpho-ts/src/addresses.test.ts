import { describe, expect, test } from "vitest";

import {
  addresses,
  addressesRegistry,
  type ChainAddresses,
  type ChainDeployments,
  deployments,
  getChainAddress,
  getUnwrappedToken,
  NATIVE_ADDRESS,
  registerCustomAddresses,
} from "./addresses.js";
import { ChainId } from "./chain.js";
import {
  IncompleteChainRegistryError,
  RegistryValueAlreadyRegisteredError,
  UnknownAddressError,
  UnsupportedChainIdError,
} from "./errors.js";

let nextAddressIndex = 1n;

const randomAddress = (): `0x${string}` => {
  const address =
    `0x${nextAddressIndex.toString(16).padStart(40, "0")}` as `0x${string}`;
  nextAddressIndex += 1n;

  return address;
};

const createMidnightAddresses = () => ({
  midnight: randomAddress(),
  midnightBundles: randomAddress(),
  midnightMempool: randomAddress(),
  ecrecoverRatifier: randomAddress(),
  ecrecoverAuthorizer: randomAddress(),
  setterRatifier: randomAddress(),
  permit2: randomAddress(),
});

const createBlueAddresses = () =>
  ({
    morpho: randomAddress(),
    bundler3: {
      bundler3: randomAddress(),
      generalAdapter1: randomAddress(),
    },
    adaptiveCurveIrm: randomAddress(),
  }) satisfies ChainAddresses;

const createChainAddresses = () => ({
  ...createBlueAddresses(),
  ...createMidnightAddresses(),
});

const createMidnightDeployments = () => ({
  midnight: 1n,
  midnightBundles: 2n,
  midnightMempool: 3n,
  ecrecoverRatifier: 4n,
  ecrecoverAuthorizer: 5n,
  setterRatifier: 6n,
  permit2: 7n,
});

const createBlueDeployments = () =>
  ({
    morpho: 7n,
    bundler3: {
      bundler3: 8n,
      generalAdapter1: 9n,
    },
    adaptiveCurveIrm: 10n,
  }) satisfies ChainDeployments;

const createChainDeployments = () => ({
  ...createBlueDeployments(),
  ...createMidnightDeployments(),
});

describe("getChainAddress", () => {
  test("default", () => {
    expect(
      getChainAddress(ChainId.EthMainnet, "bundler3.generalAdapter1"),
    ).toBe(addressesRegistry[ChainId.EthMainnet].bundler3.generalAdapter1);
  });

  test("behavior: reads a custom Midnight address", () => {
    const chainId = 31_337_001;
    const chainAddresses = {
      ...createBlueAddresses(),
      midnight: randomAddress(),
    };

    registerCustomAddresses({
      addresses: {
        [chainId]: chainAddresses,
      },
    });

    expect(getChainAddress(chainId, "midnight")).toBe(chainAddresses.midnight);
  });

  test("error: UnsupportedChainIdError", () => {
    expect(() => getChainAddress(999_999_999, "midnight")).toThrow(
      UnsupportedChainIdError,
    );
  });

  test("error: UnknownAddressError", () => {
    let error: unknown;

    try {
      getChainAddress(ChainId.ArcMainnet, "midnight");
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(UnknownAddressError);
    expect(error).toMatchObject({
      chainId: ChainId.ArcMainnet,
      label: "midnight",
    });
  });
});

describe("addressesRegistry", () => {
  test("default", () => {
    expect("midnight" in addressesRegistry[ChainId.EthMainnet]).toBe(true);
  });

  test("behavior: keeps the deprecated Vault V1 PublicAllocator alias", () => {
    const { publicAllocator, vaultV1PublicAllocator } =
      addressesRegistry[ChainId.EthMainnet];

    expect(publicAllocator).toBe(vaultV1PublicAllocator);
    expect(getChainAddress(ChainId.EthMainnet, "publicAllocator")).toBe(
      vaultV1PublicAllocator,
    );
  });

  test.each([
    [
      ChainId.EthMainnet,
      ["0x00b8e1509398ED692C3F326CbAf1694F9A881e27", 25770408n],
    ],
    [
      ChainId.BaseMainnet,
      ["0xAED282B8aD9257BB1272e93aE63A32A53621e412", 50063965n],
    ],
    [
      ChainId.ArbitrumMainnet,
      ["0x85b66Fe31e6788E5a6825EAe689f4c6c38AF3704", 495274087n],
    ],
    [
      ChainId.OptimismMainnet,
      ["0xc6945A915Bb7e2A365469f120A33D2FA42951cF3", 155659263n],
    ],
    [
      ChainId.PolygonMainnet,
      ["0xAb06a92cd253Bc12Dec8f719a693a6b472CCDfF4", 92141509n],
    ],
    [
      ChainId.WorldChainMainnet,
      ["0x5Fe47f63ACd84f8A69b97E0a5122fCBff08Df48F", 33790828n],
    ],
    [
      ChainId.Unichain,
      ["0x2b7Bf2f2027bcfE3A1F6Bc93EA80220a883a6851", 56168924n],
    ],
    [
      ChainId.HyperliquidMainnet,
      ["0x056dd7D4B373ED26c788190085CC6C52B8e7479d", 43372279n],
    ],
    [
      ChainId.KatanaMainnet,
      ["0xd952175e940D97775cBC5a523977a6f091D0d702", 40217302n],
    ],
    [
      ChainId.MonadMainnet,
      ["0x0A503aB026EFACBC0F7feE7795F34B80b5B9a662", 96602489n],
    ],
    [
      ChainId.StableMainnet,
      ["0x5C884d4B1510EAd302EC50A2AB4DE9c0b9E407ce", 35817019n],
    ],
    [
      ChainId.TempoMainnet,
      ["0xDC9693CE6488640faEf173Ec2635ff99fdC25a07", 35177253n],
    ],
    [
      ChainId.KaiaMainnet,
      ["0x3b369B37eba1655e8c44bC08E3A604D592c4a14F", 224866814n],
    ],
    [
      ChainId.MorphMainnet,
      ["0x20d990D9eBf8003Df8cAD3Aa36aeF4404e3Ccb86", 25455933n],
    ],
    [
      ChainId.MegaEthMainnet,
      ["0xB4A1B0EF18d169c19fC7617aCE898A06Dc495a7C", 24269516n],
    ],
    [
      ChainId.RobinhoodMainnet,
      ["0xCe5c1aFa115fF8b1D6913509bfc79D9AE08CC857", 38318973n],
    ],
  ] as const)(
    "behavior: exposes BluePublicAllocator on chain %i",
    (chainId, [vaultV2BluePublicAllocator, deploymentBlock]) => {
      expect(addressesRegistry[chainId].vaultV2BluePublicAllocator).toBe(
        vaultV2BluePublicAllocator,
      );
      expect(getChainAddress(chainId, "vaultV2BluePublicAllocator")).toBe(
        vaultV2BluePublicAllocator,
      );
      expect(deployments[chainId].vaultV2BluePublicAllocator).toBe(
        deploymentBlock,
      );
    },
  );

  test("behavior: exposes World Chain USDC permit v2 token", () => {
    const usdc = "0x79A02482A880bCE3F13e09Da970dC34db4CD24d1";

    expect(addressesRegistry[ChainId.WorldChainMainnet].usdc).toBe(usdc);
    expect(getChainAddress(ChainId.WorldChainMainnet, "usdc")).toBe(usdc);
  });

  test("behavior: exposes Base Midnight deployment addresses", () => {
    expect(getChainAddress(ChainId.BaseMainnet, "midnight")).toBe(
      "0xAdedD8ab6dE832766Fedf0FaC4992E5C4D3EA18A",
    );
    expect(getChainAddress(ChainId.BaseMainnet, "midnightBundles")).toBe(
      "0x091183d729BE9f808c212b475E387A12E67850A7",
    );
    expect(getChainAddress(ChainId.BaseMainnet, "midnightMempool")).toBe(
      "0xdD6DCE32e21f7b020898a8258dA37355b4017993",
    );
    expect(getChainAddress(ChainId.BaseMainnet, "ecrecoverRatifier")).toBe(
      "0xd6e70365C8E8DDa9a4ca662C07bbE663b017755E",
    );
    expect(getChainAddress(ChainId.BaseMainnet, "ecrecoverAuthorizer")).toBe(
      "0x292bEa9f1443d54E0E509120c919106765c6a493",
    );
    expect(getChainAddress(ChainId.BaseMainnet, "setterRatifier")).toBe(
      "0x800B5F12A61B8198a5a6EfD794Cac6699B294d63",
    );
  });

  test.each([
    [
      ChainId.EthMainnet,
      "0xaf85aF286637A033BE7d59ED8cC566afa3309B02",
      25_720_868n,
    ],
    [
      ChainId.BaseMainnet,
      "0xE52E169C342C096C4949ABb944DC9f30E3F5Ea84",
      49_765_458n,
    ],
    [
      ChainId.ArbitrumMainnet,
      "0x7B885a940164eD51A068725f577a12197b76109b",
      492_901_559n,
    ],
    [
      ChainId.OptimismMainnet,
      "0x80De0F063aC662a4ee86c2F4Db0b52746094ad62",
      155_360_936n,
    ],
    [
      ChainId.PolygonMainnet,
      "0x7Ae2B7012c82ea18a6BeE98ad09a684C88d6e36a",
      91_743_910n,
    ],
    [
      ChainId.WorldChainMainnet,
      "0xcf7b4a40f25A6b839A93b8A8b45297F2a5383E73",
      33_492_822n,
    ],
    [
      ChainId.Unichain,
      "0x0628B860947fA0c195988F65d53850546A489732",
      55_572_727n,
    ],
    [
      ChainId.HyperliquidMainnet,
      "0xC1749C8d50bc645D5116ccf4C858Bc45cB981Ac4",
      42_767_282n,
    ],
    [
      ChainId.KatanaMainnet,
      "0xa434ABcc7e945b804c87B4f3c0a76b20651d4863",
      39_579_123n,
    ],
    [
      ChainId.MonadMainnet,
      "0xB04b831893A6E2E02Be347cD259690c5Bc7D0675",
      94_631_561n,
    ],
    [
      ChainId.StableMainnet,
      "0x258d5c815CCE7017E24c63a7669F51ABcD0Dd4e5",
      34_970_501n,
    ],
    [
      ChainId.TempoMainnet,
      "0x8225192b8638bDe9D41a6d96aBb824F660Ef57E1",
      34_046_873n,
    ],
    [
      ChainId.RobinhoodMainnet,
      "0xCE29862924756584BBD0D75CA1249d22007E2813",
      32_383_480n,
    ],
  ] as const)(
    "behavior: exposes VaultExitBundlesV1 on chain %s",
    (...[chainId, address, deploymentBlock]) => {
      expect(getChainAddress(chainId, "bundles.vaultExitBundlesV1")).toBe(
        address,
      );
      expect(deployments[chainId].bundles.vaultExitBundlesV1).toBe(
        deploymentBlock,
      );
    },
  );

  test.each([
    [ChainId.EthMainnet, "0x02912516d49dE997db75B9D7858faAE59209650B"],
    [ChainId.BaseMainnet, "0x2B08A911f48dE25A7e305D910Afb5597aBE8ea7B"],
    [ChainId.ArbitrumMainnet, "0x5afAb0B2414E30c92a708234ea1b383Ce6317ED5"],
    [ChainId.OptimismMainnet, "0x112088363eE4CcF3F37EaBD98FDDeEd98F0Be485"],
    [ChainId.PolygonMainnet, "0x386ABE0188b7FADA897cE4dF9d72E8F57915B103"],
    [ChainId.WorldChainMainnet, "0x768BBD5F6c22b2498cC9C19832d3AEE08240755a"],
    [ChainId.Unichain, "0x40755e3e2513D71cB79DC3Eeefd8Eb848d9cd899"],
    [ChainId.HyperliquidMainnet, "0xB5173417e28482c61C14A4C2e217b158fF0db666"],
    [ChainId.KatanaMainnet, "0x2464F4d0a4481732e7cC90ADD5abF986A48A06Dd"],
    [ChainId.MonadMainnet, "0xcDDc5311A7ccDb2A7Bf97299149bE1D687F3C76e"],
    [ChainId.StableMainnet, "0x2b910f5368e4939A2906ADa85c21fc0e51C4A861"],
    [ChainId.TempoMainnet, "0xe8aA1d8f1Cb111B7f52957D662Ee310D6d2Ee9B9"],
    [ChainId.RobinhoodMainnet, "0xcC108538f36242D6E0d6B9255f6D9Ccd137D70Fe"],
  ] as const)(
    "behavior: exposes VaultBundlesV1 on chain %s",
    (...[chainId, address]) => {
      expect(getChainAddress(chainId, "bundles.vaultBundlesV1")).toBe(address);
    },
  );

  test.each([
    [ChainId.EthMainnet, "0x38B0C12AB81976e9417D4ebfe2A34DB6DF22e6AD"],
    [ChainId.BaseMainnet, "0x4D28D900e381eCE4B351302f1Abe588496793A2b"],
    [ChainId.ArbitrumMainnet, "0x30a388A64b99192702a83D2CA9B95D79702afbf2"],
    [ChainId.OptimismMainnet, "0x317ca3534f8Cf92Accb4b4366F48017E596bc34a"],
    [ChainId.PolygonMainnet, "0x93a1B342f3DF2c2bb5D0d8D5AF819450fFA4bE78"],
    [ChainId.WorldChainMainnet, "0xEd44094c917D891D68f46E8cc2fd50D790707a65"],
    [ChainId.Unichain, "0x2c4331BC5EC245da744F35832C8797456cFC8045"],
    [ChainId.HyperliquidMainnet, "0x84849171E1783630E1C4253b9C9d4b4208b0D86A"],
    [ChainId.KatanaMainnet, "0xCA52e5B901D9939013Fa8744dCbDeE0B6BdD5B39"],
    [ChainId.MonadMainnet, "0x9C76E91bf08E712a713e3baB2F5AE01f6ec8845A"],
    [ChainId.StableMainnet, "0xFB606389166c04828D6Dba36F77871489673CeA0"],
    [ChainId.TempoMainnet, "0xAE863452f44ADD237739A85eb6BB1989E2368362"],
    [ChainId.RobinhoodMainnet, "0x53A1eB6589861F686af7c531211E35Aefe30210f"],
  ] as const)(
    "behavior: exposes BlueBundlesV1 on chain %s",
    (...[chainId, address]) => {
      expect(getChainAddress(chainId, "bundles.blueBundlesV1")).toBe(address);
    },
  );

  test.each([
    [
      ChainId.EthMainnet,
      "midnight",
      "0x471686c42792F93528B000beF54bC10E3aa2045f",
      25_798_183n,
    ],
    [
      ChainId.EthMainnet,
      "midnightBundles",
      "0x7c00dBB2b6b6b9B28745332e550dC8782Fcf77EC",
      25_798_264n,
    ],
    [
      ChainId.EthMainnet,
      "midnightBlueBuyCallbackFactory",
      "0x172d1FdC5f79bFe1ED46448f18541E591E5c93a7",
      25_798_272n,
    ],
    [
      ChainId.BaseMainnet,
      "midnightBlueBuyCallbackFactory",
      "0x7337f119Eca028bD39E0e543cEf71631D2333425",
      49_544_552n,
    ],
    [
      ChainId.EthMainnet,
      "midnightMempool",
      "0xde2d62449301a09A51EbF9326EA60d2e8BF4A8F7",
      25_798_183n,
    ],
    [
      ChainId.EthMainnet,
      "ecrecoverRatifier",
      "0xAC439c81CAA6ef4C7B7E8F0110F8CE63A4b6D43e",
      25_798_183n,
    ],
    [
      ChainId.EthMainnet,
      "ecrecoverAuthorizer",
      "0xfC3303119E46AF831CacdBDB6e1A04C9C369ffF7",
      25_798_183n,
    ],
    [
      ChainId.EthMainnet,
      "setterRatifier",
      "0xb72c416382c8A6399D0765CebfB032F040B00B3c",
      25_798_183n,
    ],
    [
      ChainId.ScrollMainnet,
      "vaultV2Factory",
      "0x474cdCF6B3be2eb770065b88d2F7c57A9BC609E0",
      28_647_107n,
    ],
    [
      ChainId.ScrollMainnet,
      "morphoMarketV1AdapterV2Factory",
      "0x3199Ddb2aA394B175a814EB79BB654822Ee1100F",
      28_647_179n,
    ],
    [
      ChainId.ScrollMainnet,
      "registryList",
      "0x0ED73cc76a0ebd7C5a6a95397718D8F1dCC219b1",
      28_647_179n,
    ],
    [
      ChainId.FraxtalMainnet,
      "vaultV2Factory",
      "0x711bCE12269a3a496eFaABB8B9AD5A4485E08A24",
      31_182_482n,
    ],
    [
      ChainId.FraxtalMainnet,
      "morphoMarketV1AdapterV2Factory",
      "0xa036C78AE8e162feD4db4abbD41f79995F28bC4b",
      31_182_547n,
    ],
    [
      ChainId.FraxtalMainnet,
      "registryList",
      "0x50d4e8af118db0D5b301B18Ef37435F987Fe2D2B",
      31_182_547n,
    ],
    [
      ChainId.InkMainnet,
      "vaultV2Factory",
      "0x35587F8d98eA305FB762934a63F3c1564037F9C7",
      35_682_429n,
    ],
    [
      ChainId.InkMainnet,
      "morphoMarketV1AdapterV2Factory",
      "0x92A070b2b4Af436ba4a168451fb360e45b849355",
      35_682_573n,
    ],
    [
      ChainId.InkMainnet,
      "registryList",
      "0xe7D687a017B549fe723E78a6Bc1206216C701821",
      35_682_573n,
    ],
    [
      ChainId.SonicMainnet,
      "vaultV2Factory",
      "0xc8BE2FD6f65FB3ce25Dd6a50F21A9245B9E399d7",
      60_993_716n,
    ],
    [
      ChainId.SonicMainnet,
      "morphoMarketV1AdapterV2Factory",
      "0xc49224e28992E693aFaa778a6F54c329E5Ac9704",
      60_993_824n,
    ],
    [
      ChainId.SonicMainnet,
      "registryList",
      "0x1fbF65D5C905ac9144afbB2f410F4e12F69edF5D",
      60_993_824n,
    ],
    [
      ChainId.HemiMainnet,
      "vaultV2Factory",
      "0x3c75C433e7902193497617EaFCc8385A3D031836",
      3_609_553n,
    ],
    [
      ChainId.HemiMainnet,
      "morphoMarketV1AdapterV2Factory",
      "0x0d9E428075b8A691e12237984b8284E40ab9363A",
      3_609_563n,
    ],
    [
      ChainId.HemiMainnet,
      "registryList",
      "0xbd30B731C881149e2BA23C7fd375D5608208Ecb3",
      3_609_563n,
    ],
    [
      ChainId.ModeMainnet,
      "vaultV2Factory",
      "0x68DCEA6df0f07385946AA0cDA2648c27a050e26e",
      34_507_011n,
    ],
    [
      ChainId.ModeMainnet,
      "morphoMarketV1AdapterV2Factory",
      "0x97CF0f15bf580838900161F2a4D7CE9BC88E8d5D",
      34_507_081n,
    ],
    [
      ChainId.ModeMainnet,
      "registryList",
      "0x8dBDae88260aAE80f195c0CBFBa5b0917E8B3296",
      34_507_081n,
    ],
    [
      ChainId.TacMainnet,
      "vaultV2Factory",
      "0x0437C5B0CF1edFb8309613E4fEBE2a512D9a735d",
      13_304_185n,
    ],
    [
      ChainId.TacMainnet,
      "morphoMarketV1AdapterV2Factory",
      "0xabA00365C6284548F90480993fc46dbB7775FB96",
      13_304_411n,
    ],
    [
      ChainId.TacMainnet,
      "registryList",
      "0x784125737238e058B646FDB502F5B6d940713B95",
      13_304_411n,
    ],
    [
      ChainId.SoneiumMainnet,
      "vaultV2Factory",
      "0x783b4853Da42DBA4A86eFa4b94ABd48100c6D982",
      18_023_802n,
    ],
    [
      ChainId.SoneiumMainnet,
      "morphoMarketV1AdapterV2Factory",
      "0xd25Ae31a2480DF33b7E5F8CfEE4229248309d519",
      18_023_868n,
    ],
    [
      ChainId.SoneiumMainnet,
      "registryList",
      "0x01eD6405cDf9784022c5466eA1091c78f46B829f",
      18_023_868n,
    ],
    [
      ChainId.LiskMainnet,
      "vaultV2Factory",
      "0x8DB1483C64384FA8581D6e6e82C6F44812090c2d",
      27_226_961n,
    ],
    [
      ChainId.LiskMainnet,
      "morphoMarketV1AdapterV2Factory",
      "0x382d00918B744Bd91B906f38CAe54e67649E770C",
      27_227_042n,
    ],
    [
      ChainId.LiskMainnet,
      "registryList",
      "0x3f4A754Af683a1b9AD7E20608630bED3B459d230",
      27_227_042n,
    ],
    [
      ChainId.EtherlinkMainnet,
      "vaultV2Factory",
      "0xDa4C5e0f8830002750f788eA729891B4B38EC1c2",
      37_474_154n,
    ],
    [
      ChainId.EtherlinkMainnet,
      "morphoMarketV1AdapterV2Factory",
      "0x588737013F0302a2fa82Dc03DA06126a81B8be45",
      37_474_326n,
    ],
    [
      ChainId.EtherlinkMainnet,
      "registryList",
      "0xEe583Ac409a12cc6BD97DD5ca6d2c0ecC8fA86FF",
      37_474_326n,
    ],
    [
      ChainId.AbstractMainnet,
      "vaultV2Factory",
      "0xecCd168c7d8e40f7166Fe226B4cf2cA3Db7A9754",
      36_244_191n,
    ],
    [
      ChainId.AbstractMainnet,
      "morphoMarketV1AdapterV2Factory",
      "0xAA2D848d759d872A45e5658B55B02e589101D9C0",
      36_244_462n,
    ],
    [
      ChainId.AbstractMainnet,
      "registryList",
      "0x906A0E39C8329b73011d033A3441d2f013013a1A",
      36_244_462n,
    ],
    [
      ChainId.CeloMainnet,
      "vaultV2Factory",
      "0xB237fdB403992f4AAe0963F5304799242035E22d",
      57_278_683n,
    ],
    [
      ChainId.CeloMainnet,
      "morphoMarketV1AdapterV2Factory",
      "0x8F5C08671A3986b2B0261FF78f5c2F291208BceC",
      57_278_849n,
    ],
    [
      ChainId.CeloMainnet,
      "registryList",
      "0x448Babad091267362fe83588838Ed7b192C1dc5A",
      57_278_849n,
    ],
    [
      ChainId.BscMainnet,
      "bundler3.paraswapAdapter",
      "0xBb12B012Fa31f7FE418236cAf625713Edc852F82",
      54_346_558n,
    ],
    [
      ChainId.BscMainnet,
      "vaultV2Factory",
      "0x29955201601630f686beAF47b0B03be7b86d160F",
      76_966_373n,
    ],
    [
      ChainId.BscMainnet,
      "morphoMarketV1AdapterV2Factory",
      "0x18c1b03ac8007224FE86442a91fEE3135ba767CD",
      76_966_750n,
    ],
    [
      ChainId.BscMainnet,
      "registryList",
      "0x705A9Df14b294E6d4E673520369f289bd48C4cCB",
      76_966_750n,
    ],
    [
      ChainId.BitlayerMainnet,
      "vaultV2Factory",
      "0x20d7eAd4830b53fB29bb4C4e8a80FD5F1f7d7F2c",
      19_109_598n,
    ],
    [
      ChainId.BitlayerMainnet,
      "morphoMarketV1AdapterV2Factory",
      "0x626f8ea9b3B70C03F8cf9a29eFBb9F3b093d1599",
      19_109_904n,
    ],
    [
      ChainId.BitlayerMainnet,
      "registryList",
      "0x9d3ce545ffC4d00e372B9733343f001085b045D2",
      19_109_904n,
    ],
    [
      ChainId.SeiMainnet,
      "vaultV2Factory",
      "0x30f5b078C80bD06fEdc3B40b4a4441a96Dd9cf22",
      197_444_083n,
    ],
    [
      ChainId.SeiMainnet,
      "morphoMarketV1AdapterV2Factory",
      "0xbADd49F7db90f65fF5822681AA6B8548E8356a1D",
      197_444_447n,
    ],
    [
      ChainId.SeiMainnet,
      "registryList",
      "0x26abEaee65A878E9Fe8F99fEb31aec62fbA2624E",
      197_444_447n,
    ],
    [
      ChainId.ZeroGMainnet,
      "vaultV2Factory",
      "0x9c7E1f6fc953aED9C273D8D7B17A654e70721E80",
      7_527_933n,
    ],
    [
      ChainId.ZeroGMainnet,
      "morphoMarketV1AdapterFactory",
      "0xb76A46cC0c4E8B25Df7Df278371b3D78d95D0b2b",
      7_527_933n,
    ],
    [
      ChainId.ZeroGMainnet,
      "morphoMarketV1AdapterV2Factory",
      "0x2614BAEA6aE12117565668720aD92ca0149aBA03",
      16_385_508n,
    ],
    [
      ChainId.ZeroGMainnet,
      "morphoVaultV1AdapterFactory",
      "0x42a147a5af2A699b323168508A039e54f5078092",
      7_527_933n,
    ],
    [
      ChainId.ZeroGMainnet,
      "registryList",
      "0x9749cF858Ef950Eea7fA16a35f8C8817ca65066c",
      7_528_068n,
    ],
    [
      ChainId.LineaMainnet,
      "morphoMarketV1AdapterV2Factory",
      "0xcAB7C66F7191Ad3Ef1e7fEeb67F3137BC975F8cE",
      26_530_057n,
    ],
    [
      ChainId.ArcMainnet,
      "morphoVaultV1AdapterFactory",
      "0x77788033B22CEaB8D51Ec8F9dFD4a40E54F380B0",
      5_314_109n,
    ],
  ] as const)(
    "behavior: matches the deployments registry for %i %s",
    (...[chainId, label, address, deploymentBlock]) => {
      expect(getChainAddress(chainId, label)).toBe(address);
      const path = label.split(".");
      let deployment: unknown = deployments[chainId];
      for (const key of path) {
        deployment = (deployment as Record<string, unknown>)[key];
      }
      expect(deployment).toBe(deploymentBlock);
    },
  );

  test("behavior: exposes Midnight entries through the unified registry", () => {
    const chainId = 31_337_002;
    const chainAddresses = createChainAddresses();

    registerCustomAddresses({
      addresses: {
        [chainId]: chainAddresses,
      },
    });

    expect(getChainAddress(chainId, "midnight")).toBe(chainAddresses.midnight);
    expect(addressesRegistry[chainId]).toMatchObject(chainAddresses);
    expect(addresses[chainId]).toMatchObject(chainAddresses);
  });

  test("behavior: copies registered entries", () => {
    const chainId = 31_337_003;
    const chainAddresses = createChainAddresses();
    const registeredMidnight = chainAddresses.midnight;

    registerCustomAddresses({
      addresses: {
        [chainId]: chainAddresses,
      },
    });

    Object.assign(chainAddresses, { midnight: randomAddress() });

    expect(getChainAddress(chainId, "midnight")).toBe(registeredMidnight);
  });

  test.each([
    {
      chainId: ChainId.MorphMainnet,
      morpho: "0xAd10d07901Dc3195c3cb5e78E061F4EA8D9B4905",
      wNative: "0x5300000000000000000000000000000000000011",
      morphoDeployment: 23_180_020n,
      wNativeDeployment: 0n,
    },
    {
      chainId: ChainId.MegaEthMainnet,
      morpho: "0x18120312A7cf44DcfEc6dCe5632a431579ED9100",
      wNative: "0x4200000000000000000000000000000000000006",
      morphoDeployment: 16_408_957n,
      wNativeDeployment: 0n,
    },
    {
      chainId: ChainId.RobinhoodMainnet,
      morpho: "0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010",
      wNative: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
      morphoDeployment: 286n,
      wNativeDeployment: 2n,
    },
  ])(
    "behavior: exposes era-2 addresses for chain $chainId",
    ({ chainId, morpho, wNative, morphoDeployment, wNativeDeployment }) => {
      expect(addressesRegistry[chainId]).toMatchObject({
        blue: morpho,
        morpho,
        wNative,
      });
      expect(deployments[chainId]).toMatchObject({
        blue: morphoDeployment,
        morpho: morphoDeployment,
        wNative: wNativeDeployment,
      });
      expect(getUnwrappedToken(wNative as `0x${string}`, chainId)).toBe(
        NATIVE_ADDRESS,
      );
    },
  );

  test("behavior: exposes Robinhood deployment blocks", () => {
    expect(deployments[ChainId.RobinhoodMainnet]).toMatchObject({
      blue: 286n,
      morpho: 286n,
      permit2: 0n,
      bundler3: {
        bundler3: 286n,
        generalAdapter1: 286n,
      },
      adaptiveCurveIrm: 286n,
      vaultV2Factory: 288n,
      morphoMarketV1AdapterV2Factory: 289n,
      morphoVaultV1AdapterFactory: 58_781n,
      registryList: 289n,
      chainlinkOracleFactory: 287n,
      preLiquidationFactory: 287n,
      wNative: 2n,
    });
  });

  test("behavior: registers Blue and Midnight addresses alongside each other", () => {
    const chainId = 31_337_004;
    const blueAddresses = addressesRegistry[ChainId.ArcMainnet];
    const chainAddresses = {
      ...createMidnightAddresses(),
      permit2: blueAddresses.permit2,
    };

    registerCustomAddresses({
      addresses: {
        [chainId]: {
          ...blueAddresses,
          ...chainAddresses,
        },
      },
    });

    expect(addressesRegistry[chainId]).toMatchObject(blueAddresses);
    expect(addressesRegistry[chainId]).toMatchObject(chainAddresses);
  });

  test("behavior: duplicates blue to deprecated morpho for custom addresses", () => {
    const chainId = 31_337_010;
    const blue = randomAddress();

    registerCustomAddresses({
      addresses: {
        [chainId]: {
          blue,
          bundler3: {
            bundler3: randomAddress(),
            generalAdapter1: randomAddress(),
          },
          adaptiveCurveIrm: randomAddress(),
        },
      },
    });

    expect(addressesRegistry[chainId]?.blue).toBe(blue);
    expect(addressesRegistry[chainId]?.morpho).toBe(blue);
  });

  test("behavior: duplicates deprecated morpho to blue for custom addresses", () => {
    const chainId = 31_337_011;
    const morpho = randomAddress();

    registerCustomAddresses({
      addresses: {
        [chainId]: {
          morpho,
          bundler3: {
            bundler3: randomAddress(),
            generalAdapter1: randomAddress(),
          },
          adaptiveCurveIrm: randomAddress(),
        },
      },
    });

    expect(addressesRegistry[chainId]?.blue).toBe(morpho);
    expect(addressesRegistry[chainId]?.morpho).toBe(morpho);
  });
});

describe("deployments", () => {
  test("default", () => {
    expect("midnight" in deployments[ChainId.EthMainnet]).toBe(true);
  });

  test("behavior: registers Blue and Midnight deployments alongside each other", () => {
    const chainId = 31_337_102;
    const blueDeployments = deployments[ChainId.ArcMainnet];
    const chainDeployments = {
      ...createMidnightDeployments(),
      permit2: blueDeployments.permit2,
    };

    registerCustomAddresses({
      deployments: {
        [chainId]: {
          ...blueDeployments,
          ...chainDeployments,
        },
      },
    });

    expect(deployments[chainId]).toMatchObject(blueDeployments);
    expect(deployments[chainId]).toMatchObject(chainDeployments);
  });

  test("behavior: duplicates blue to deprecated morpho for custom deployments", () => {
    const chainId = 31_337_105;

    registerCustomAddresses({
      deployments: {
        [chainId]: {
          blue: 1n,
          bundler3: {
            bundler3: 2n,
            generalAdapter1: 3n,
          },
          adaptiveCurveIrm: 4n,
        },
      },
    });

    expect(deployments[chainId]?.blue).toBe(1n);
    expect(deployments[chainId]?.morpho).toBe(1n);
  });
});

describe("registerCustomAddresses", () => {
  test("default", () => {
    const chainId = 31_337_005;
    const chainAddresses = createChainAddresses();

    registerCustomAddresses({
      addresses: {
        [chainId]: chainAddresses,
      },
    });

    expect(addressesRegistry[chainId]).toMatchObject(chainAddresses);
  });

  test("behavior: accepts repeated registration of the same value", () => {
    const chainId = 31_337_006;
    const chainAddresses = createChainAddresses();

    registerCustomAddresses({
      addresses: {
        [chainId]: chainAddresses,
      },
    });

    expect(() =>
      registerCustomAddresses({
        addresses: {
          [chainId]: chainAddresses,
        },
      }),
    ).not.toThrow();

    expect(getChainAddress(chainId, "midnight")).toBe(chainAddresses.midnight);
  });

  test("behavior: accepts repeated registration of the same address with different casing", () => {
    const chainId = 31_337_007;
    const chainAddresses = createChainAddresses();
    const lowercasedMidnight =
      chainAddresses.midnight.toLowerCase() as typeof chainAddresses.midnight;
    const lowercasedChainAddresses = {
      ...chainAddresses,
      midnight: lowercasedMidnight,
    };

    registerCustomAddresses({
      addresses: {
        [chainId]: chainAddresses,
      },
    });

    expect(() =>
      registerCustomAddresses({
        addresses: {
          [chainId]: lowercasedChainAddresses,
        },
      }),
    ).not.toThrow();
  });

  test("behavior: accepts optional Midnight address entries", () => {
    const chainId = 31_337_008;
    const chainAddresses = {
      ...createBlueAddresses(),
      midnight: randomAddress(),
    };

    registerCustomAddresses({
      addresses: {
        [chainId]: chainAddresses,
      },
    });

    expect(getChainAddress(chainId, "midnight")).toBe(chainAddresses.midnight);
    expect(() => getChainAddress(chainId, "midnightBundles")).toThrow(
      UnknownAddressError,
    );
  });

  test("behavior: normalizes Vault V1 PublicAllocator aliases", () => {
    const chainId = 31_337_013;
    const publicAllocator = randomAddress();

    registerCustomAddresses({
      addresses: {
        [chainId]: { ...createBlueAddresses(), publicAllocator },
      },
      deployments: {
        [chainId]: { ...createBlueDeployments(), publicAllocator: 11n },
      },
    });

    expect(addressesRegistry[chainId]?.vaultV1PublicAllocator).toBe(
      publicAllocator,
    );
    expect(addressesRegistry[chainId]?.publicAllocator).toBe(publicAllocator);
    expect(deployments[chainId]?.vaultV1PublicAllocator).toBe(11n);
    expect(deployments[chainId]?.publicAllocator).toBe(11n);
  });

  test("behavior: backfills deprecated PublicAllocator aliases", () => {
    const chainId = 31_337_014;
    const vaultV1PublicAllocator = randomAddress();

    registerCustomAddresses({
      addresses: {
        [chainId]: { ...createBlueAddresses(), vaultV1PublicAllocator },
      },
      deployments: {
        [chainId]: { ...createBlueDeployments(), vaultV1PublicAllocator: 11n },
      },
    });

    expect(addressesRegistry[chainId]?.publicAllocator).toBe(
      vaultV1PublicAllocator,
    );
    expect(deployments[chainId]?.publicAllocator).toBe(11n);
  });

  test("error: RegistryValueAlreadyRegisteredError for addresses", () => {
    const chainId = 31_337_009;
    const chainAddresses = createChainAddresses();
    const conflictingChainAddresses = {
      ...chainAddresses,
      midnight: randomAddress(),
    };

    registerCustomAddresses({
      addresses: {
        [chainId]: chainAddresses,
      },
    });

    expect(() =>
      registerCustomAddresses({
        addresses: {
          [chainId]: conflictingChainAddresses,
        },
      }),
    ).toThrow(RegistryValueAlreadyRegisteredError);

    expect(getChainAddress(chainId, "midnight")).toBe(chainAddresses.midnight);
  });

  test("error: conflicting PublicAllocator addresses", () => {
    const chainId = 31_337_015;

    expect(() =>
      registerCustomAddresses({
        addresses: {
          [chainId]: {
            ...createBlueAddresses(),
            vaultV1PublicAllocator: randomAddress(),
            publicAllocator: randomAddress(),
          },
        },
      }),
    ).toThrow(RegistryValueAlreadyRegisteredError);
  });

  test("error: IncompleteChainRegistryError for custom-chain addresses", () => {
    const chainId = 31_337_012;
    const partialAddresses = createMidnightAddresses() as ChainAddresses;

    let error: unknown;

    try {
      registerCustomAddresses({
        addresses: {
          [chainId]: partialAddresses,
        },
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(IncompleteChainRegistryError);
    expect(error).toMatchObject({
      chainId,
      type: "address",
    });
    expect(() => getChainAddress(chainId, "midnight")).toThrow(
      UnsupportedChainIdError,
    );
  });

  test("behavior: accepts custom Midnight deployment entries", () => {
    const chainId = 31_337_103;
    const chainDeployments = createChainDeployments();

    registerCustomAddresses({
      deployments: {
        [chainId]: chainDeployments,
      },
    });

    expect(deployments[chainId]?.midnight).toBe(chainDeployments.midnight);
  });

  test("behavior: exposes Base Midnight deployment blocks", () => {
    expect(deployments[ChainId.BaseMainnet]?.midnight).toBe(48286884n);
    expect(deployments[ChainId.BaseMainnet]?.midnightBundles).toBe(48286997n);
    expect(deployments[ChainId.BaseMainnet]?.midnightMempool).toBe(48286884n);
    expect(deployments[ChainId.BaseMainnet]?.ecrecoverRatifier).toBe(48286884n);
    expect(deployments[ChainId.BaseMainnet]?.ecrecoverAuthorizer).toBe(
      48286884n,
    );
    expect(deployments[ChainId.BaseMainnet]?.setterRatifier).toBe(48286884n);
  });

  test("error: IncompleteChainRegistryError for custom-chain deployments", () => {
    const chainId = 31_337_107;
    const partialDeployments = createMidnightDeployments() as ChainDeployments;

    let error: unknown;

    try {
      registerCustomAddresses({
        deployments: {
          [chainId]: partialDeployments,
        },
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(IncompleteChainRegistryError);
    expect(error).toMatchObject({
      chainId,
      type: "deployment",
    });
    expect(deployments[chainId]).toBeUndefined();
  });

  test("error: RegistryValueAlreadyRegisteredError for deployments", () => {
    const chainId = 31_337_104;
    const chainDeployments = createChainDeployments();
    const conflictingChainDeployments = {
      ...chainDeployments,
      midnight: chainDeployments.midnight + 1n,
    };

    registerCustomAddresses({
      deployments: {
        [chainId]: chainDeployments,
      },
    });

    expect(() =>
      registerCustomAddresses({
        deployments: {
          [chainId]: conflictingChainDeployments,
        },
      }),
    ).toThrow(RegistryValueAlreadyRegisteredError);

    expect(deployments[chainId]?.midnight).toBe(chainDeployments.midnight);
  });

  test("error: conflicting PublicAllocator deployments", () => {
    const chainId = 31_337_108;

    expect(() =>
      registerCustomAddresses({
        deployments: {
          [chainId]: {
            ...createBlueDeployments(),
            vaultV1PublicAllocator: 11n,
            publicAllocator: 12n,
          },
        },
      }),
    ).toThrow(RegistryValueAlreadyRegisteredError);
  });

  test("behavior: does not freeze caller-owned nested inputs", () => {
    const chainId = 31_337_106;
    const chainAddresses = createChainAddresses();
    const registeredBundler = chainAddresses.bundler3.bundler3;
    const wrappedToken = randomAddress();
    const unwrappedToken = randomAddress();
    const unwrappedTokens = {
      [wrappedToken]: unwrappedToken,
    };

    registerCustomAddresses({
      addresses: {
        [chainId]: chainAddresses,
      },
      unwrappedTokens: {
        [chainId]: unwrappedTokens,
      },
    });

    expect(Object.isFrozen(chainAddresses)).toBe(false);
    expect(Object.isFrozen(chainAddresses.bundler3)).toBe(false);
    expect(Object.isFrozen(unwrappedTokens)).toBe(false);

    expect(() => {
      chainAddresses.bundler3.bundler3 = randomAddress();
      unwrappedTokens[wrappedToken] = randomAddress();
    }).not.toThrow();

    expect(addressesRegistry[chainId]?.bundler3.bundler3).toBe(
      registeredBundler,
    );
    expect(getUnwrappedToken(wrappedToken, chainId)).toBe(unwrappedToken);
  });
});
