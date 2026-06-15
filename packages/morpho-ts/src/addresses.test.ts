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
  setterRatifier: 5n,
  permit2: 6n,
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
  ])("behavior: exposes era-2 addresses for chain $chainId", ({
    chainId,
    morpho,
    wNative,
    morphoDeployment,
    wNativeDeployment,
  }) => {
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
