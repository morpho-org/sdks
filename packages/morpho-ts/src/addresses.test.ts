import { describe, expect, test } from "vitest";

import {
  addresses,
  addressesRegistry,
  deployments,
  getChainAddress,
  registerCustomAddresses,
} from "./addresses.js";
import { ChainId } from "./chain.js";
import {
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

const createMidnightDeployments = () => ({
  midnight: 1n,
  midnightBundles: 2n,
  midnightMempool: 3n,
  ecrecoverRatifier: 4n,
  setterRatifier: 5n,
  permit2: 6n,
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
    const midnight = randomAddress();

    registerCustomAddresses({
      addresses: {
        [chainId]: {
          midnight,
        },
      },
    });

    expect(getChainAddress(chainId, "midnight")).toBe(midnight);
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
    const chainAddresses = createMidnightAddresses();

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
    const chainAddresses = createMidnightAddresses();
    const registeredMidnight = chainAddresses.midnight;

    registerCustomAddresses({
      addresses: {
        [chainId]: chainAddresses,
      },
    });

    Object.assign(chainAddresses, { midnight: randomAddress() });

    expect(getChainAddress(chainId, "midnight")).toBe(registeredMidnight);
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
    const chainAddresses = createMidnightAddresses();

    registerCustomAddresses({
      addresses: {
        [chainId]: chainAddresses,
      },
    });

    expect(addressesRegistry[chainId]).toMatchObject(chainAddresses);
  });

  test("behavior: accepts repeated registration of the same value", () => {
    const chainId = 31_337_006;
    const chainAddresses = createMidnightAddresses();

    registerCustomAddresses({
      addresses: {
        [chainId]: chainAddresses,
      },
    });

    expect(() =>
      registerCustomAddresses({
        addresses: {
          [chainId]: {
            midnight: chainAddresses.midnight,
          },
        },
      }),
    ).not.toThrow();

    expect(getChainAddress(chainId, "midnight")).toBe(chainAddresses.midnight);
  });

  test("behavior: accepts repeated registration of the same address with different casing", () => {
    const chainId = 31_337_007;
    const chainAddresses = createMidnightAddresses();
    const lowercasedMidnight =
      chainAddresses.midnight.toLowerCase() as typeof chainAddresses.midnight;

    registerCustomAddresses({
      addresses: {
        [chainId]: chainAddresses,
      },
    });

    expect(() =>
      registerCustomAddresses({
        addresses: {
          [chainId]: {
            midnight: lowercasedMidnight,
          },
        },
      }),
    ).not.toThrow();
  });

  test("behavior: accepts partial Midnight address entries", () => {
    const chainId = 31_337_008;
    const midnight = randomAddress();

    registerCustomAddresses({
      addresses: {
        [chainId]: {
          midnight,
        },
      },
    });

    expect(getChainAddress(chainId, "midnight")).toBe(midnight);
    expect(() => getChainAddress(chainId, "midnightBundles")).toThrow(
      UnknownAddressError,
    );
  });

  test("error: RegistryValueAlreadyRegisteredError for addresses", () => {
    const chainId = 31_337_009;
    const chainAddresses = createMidnightAddresses();

    registerCustomAddresses({
      addresses: {
        [chainId]: chainAddresses,
      },
    });

    expect(() =>
      registerCustomAddresses({
        addresses: {
          [chainId]: {
            midnight: randomAddress(),
          },
        },
      }),
    ).toThrow(RegistryValueAlreadyRegisteredError);

    expect(getChainAddress(chainId, "midnight")).toBe(chainAddresses.midnight);
  });

  test("behavior: accepts partial Midnight deployment entries", () => {
    const chainId = 31_337_103;

    registerCustomAddresses({
      deployments: {
        [chainId]: {
          midnight: 1n,
        },
      },
    });

    expect(deployments[chainId]?.midnight).toBe(1n);
  });

  test("error: RegistryValueAlreadyRegisteredError for deployments", () => {
    const chainId = 31_337_104;
    const chainDeployments = createMidnightDeployments();

    registerCustomAddresses({
      deployments: {
        [chainId]: chainDeployments,
      },
    });

    expect(() =>
      registerCustomAddresses({
        deployments: {
          [chainId]: {
            midnight: chainDeployments.midnight + 1n,
          },
        },
      }),
    ).toThrow(RegistryValueAlreadyRegisteredError);

    expect(deployments[chainId]?.midnight).toBe(chainDeployments.midnight);
  });
});
