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

const getMainnetBlueAddresses = () => {
  const blueAddresses = addressesRegistry[ChainId.EthMainnet];

  return blueAddresses;
};

const getMainnetBlueDeployments = () => {
  const blueDeployments = deployments[ChainId.EthMainnet];

  return blueDeployments;
};

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
      getChainAddress(ChainId.EthMainnet, "midnight");
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(UnknownAddressError);
    expect(error).toMatchObject({
      chainId: ChainId.EthMainnet,
      label: "midnight",
    });
  });
});

describe("addressesRegistry", () => {
  test("default", () => {
    expect("midnight" in addressesRegistry[1]).toBe(false);
  });

  test.each([
    [ChainId.EthMainnet, "0x00b8e1509398ED692C3F326CbAf1694F9A881e27"],
    [ChainId.BaseMainnet, "0xAED282B8aD9257BB1272e93aE63A32A53621e412"],
    [ChainId.ArbitrumMainnet, "0x85b66Fe31e6788E5a6825EAe689f4c6c38AF3704"],
    [ChainId.OptimismMainnet, "0xc6945A915Bb7e2A365469f120A33D2FA42951cF3"],
    [ChainId.PolygonMainnet, "0xAb06a92cd253Bc12Dec8f719a693a6b472CCDfF4"],
    [ChainId.WorldChainMainnet, "0x5Fe47f63ACd84f8A69b97E0a5122fCBff08Df48F"],
    [ChainId.Unichain, "0x2b7Bf2f2027bcfE3A1F6Bc93EA80220a883a6851"],
    [ChainId.HyperliquidMainnet, "0x056dd7D4B373ED26c788190085CC6C52B8e7479d"],
    [ChainId.KatanaMainnet, "0xd952175e940D97775cBC5a523977a6f091D0d702"],
    [ChainId.MonadMainnet, "0x0A503aB026EFACBC0F7feE7795F34B80b5B9a662"],
    [ChainId.StableMainnet, "0x5C884d4B1510EAd302EC50A2AB4DE9c0b9E407ce"],
    [ChainId.TempoMainnet, "0xDC9693CE6488640faEf173Ec2635ff99fdC25a07"],
    [ChainId.RobinhoodMainnet, "0xCe5c1aFa115fF8b1D6913509bfc79D9AE08CC857"],
  ] as const)(
    "behavior: exposes BluePublicAllocator on chain %i",
    (chainId, bluePublicAllocator) => {
      expect(addressesRegistry[chainId].bluePublicAllocator).toBe(
        bluePublicAllocator,
      );
      expect(getChainAddress(chainId, "bluePublicAllocator")).toBe(
        bluePublicAllocator,
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
    const blueAddresses = getMainnetBlueAddresses();
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
    expect("midnight" in deployments[1]).toBe(false);
  });

  test("behavior: registers Blue and Midnight deployments alongside each other", () => {
    const chainId = 31_337_102;
    const blueDeployments = getMainnetBlueDeployments();
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
