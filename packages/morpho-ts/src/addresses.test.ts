import { describe, expect, test } from "vitest";
import {
  addresses,
  addressesRegistry,
  type ChainAddresses,
  type ChainDeployments,
  deployments,
  getChainAddress,
  getChainAddresses,
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
import type { Address } from "./types.js";

let nextAddressIndex = 1n;

const randomAddress = (): Address => {
  const address =
    `0x${nextAddressIndex.toString(16).padStart(40, "0")}` as Address;
  nextAddressIndex += 1n;

  return address;
};

const createChainAddresses = (): ChainAddresses => {
  const blue = randomAddress();

  return {
    blue,
    morpho: blue,
    bundler3: {
      bundler3: randomAddress(),
      generalAdapter1: randomAddress(),
    },
    adaptiveCurveIrm: randomAddress(),
    midnight: randomAddress(),
    midnightBundles: randomAddress(),
    midnightMempool: randomAddress(),
    ecrecoverRatifier: randomAddress(),
    setterRatifier: randomAddress(),
    permit2: randomAddress(),
  };
};

const createChainDeployments = (): ChainDeployments => ({
  blue: 1n,
  morpho: 1n,
  bundler3: {
    bundler3: 2n,
    generalAdapter1: 3n,
  },
  adaptiveCurveIrm: 4n,
  midnight: 5n,
  midnightBundles: 6n,
  midnightMempool: 7n,
  ecrecoverRatifier: 8n,
  setterRatifier: 9n,
  permit2: 10n,
});

describe("getChainAddresses", () => {
  test("default", () => {
    const chainAddresses = getChainAddresses(ChainId.EthMainnet);

    expect(chainAddresses.blue).toBe(chainAddresses.morpho);
  });

  test("error: UnsupportedChainIdError", () => {
    expect(() => getChainAddresses(999_999_999)).toThrow(
      UnsupportedChainIdError,
    );
  });
});

describe("getChainAddress", () => {
  test("default", () => {
    const chainId = 31_337_001;
    const chainAddresses = createChainAddresses();

    registerCustomAddresses({
      addresses: {
        [chainId]: chainAddresses,
      },
    });

    expect(getChainAddress(chainId, "midnight")).toBe(chainAddresses.midnight);
  });

  test("error: UnknownAddressError", () => {
    expect(() => getChainAddress(ChainId.EthMainnet, "midnight")).toThrow(
      UnknownAddressError,
    );
  });
});

describe("addressesRegistry", () => {
  test("default", () => {
    expect(addresses).toBe(addressesRegistry);
  });

  test("behavior: copies registered entries", () => {
    const chainId = 31_337_002;
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
});

describe("deployments", () => {
  test("default", () => {
    const chainId = 31_337_101;
    const chainDeployments = createChainDeployments();

    registerCustomAddresses({
      deployments: {
        [chainId]: chainDeployments,
      },
    });

    expect(deployments[chainId]).toEqual(chainDeployments);
  });
});

describe("registerCustomAddresses", () => {
  test("default", () => {
    const chainId = 31_337_003;
    const chainAddresses = createChainAddresses();

    registerCustomAddresses({
      addresses: {
        [chainId]: chainAddresses,
      },
    });

    expect(getChainAddresses(chainId)).toEqual(chainAddresses);
    expect(addressesRegistry[chainId]).toEqual(chainAddresses);
  });

  test("behavior: accepts repeated registration of the same address with different casing", () => {
    const chainId = 31_337_004;
    const chainAddresses = createChainAddresses();
    const lowercasedMidnight =
      chainAddresses.midnight?.toLowerCase() as Address;

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

  test("error: IncompleteChainRegistryError", () => {
    expect(() =>
      registerCustomAddresses({
        addresses: {
          31337005: {
            midnight: randomAddress(),
          },
        },
      }),
    ).toThrow(IncompleteChainRegistryError);
  });

  test("error: RegistryValueAlreadyRegisteredError", () => {
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
          [chainId]: {
            midnight: randomAddress(),
          },
        },
      }),
    ).toThrow(RegistryValueAlreadyRegisteredError);

    expect(getChainAddress(chainId, "midnight")).toBe(chainAddresses.midnight);
  });
});
