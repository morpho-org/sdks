import { describe, expect, test } from "vitest";
import {
  addressesRegistry,
  deployments,
  getMidnightAddresses,
  getMidnightDeployments,
  getUnwrappedToken,
  type MidnightAddresses,
  type MidnightDeployments,
  midnightAddresses,
  midnightAddressRegistry,
  midnightDeploymentRegistry,
  midnightDeployments,
  NATIVE_ADDRESS,
  registerCustomMidnightAddresses,
} from "./addresses.js";
import { ChainId } from "./chain.js";
import {
  IncompleteMidnightAddressesError,
  IncompleteMidnightDeploymentsError,
  MidnightAddressAlreadyRegisteredError,
  MidnightDeploymentAlreadyRegisteredError,
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

const createMidnightAddresses = (): MidnightAddresses => ({
  midnight: randomAddress(),
  midnightBundles: randomAddress(),
  midnightMempool: randomAddress(),
  ecrecoverRatifier: randomAddress(),
  setterRatifier: randomAddress(),
  permit2: randomAddress(),
});

const createMidnightDeployments = (): MidnightDeployments => ({
  midnight: 1n,
  midnightBundles: 2n,
  midnightMempool: 3n,
  ecrecoverRatifier: 4n,
  setterRatifier: 5n,
  permit2: 6n,
});

describe("getMidnightAddresses", () => {
  test("error: UnsupportedChainIdError", () => {
    expect(() => getMidnightAddresses(1)).toThrow(UnsupportedChainIdError);
  });

  test("default", () => {
    const chainId = 31_337_001;
    const chainAddresses = createMidnightAddresses();

    registerCustomMidnightAddresses({
      addresses: {
        [chainId]: chainAddresses,
      },
    });

    expect(getMidnightAddresses(chainId)).toEqual(chainAddresses);
  });
});

describe("getMidnightDeployments", () => {
  test("error: UnsupportedChainIdError", () => {
    expect(() => getMidnightDeployments(1)).toThrow(UnsupportedChainIdError);
  });

  test("default", () => {
    const chainId = 31_337_101;
    const chainDeployments = createMidnightDeployments();

    registerCustomMidnightAddresses({
      deployments: {
        [chainId]: chainDeployments,
      },
    });

    expect(getMidnightDeployments(chainId)).toEqual(chainDeployments);
  });
});

describe("midnightAddressRegistry", () => {
  test("default", () => {
    expect(midnightAddressRegistry[1]).toBeUndefined();
  });

  test("behavior: exposes object-style registry aliases", () => {
    const chainId = 31_337_002;
    const chainAddresses = createMidnightAddresses();

    registerCustomMidnightAddresses({
      addresses: {
        [chainId]: chainAddresses,
      },
    });

    expect(midnightAddressRegistry[chainId]).toEqual(chainAddresses);
    expect(midnightAddresses[chainId]).toEqual(chainAddresses);
  });

  test("behavior: copies registered entries", () => {
    const chainId = 31_337_003;
    const chainAddresses = createMidnightAddresses();
    const registeredMidnight = chainAddresses.midnight;

    registerCustomMidnightAddresses({
      addresses: {
        [chainId]: chainAddresses,
      },
    });

    Object.assign(chainAddresses, { midnight: randomAddress() });

    expect(getMidnightAddresses(chainId).midnight).toBe(registeredMidnight);
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

describe("midnightDeploymentRegistry", () => {
  test("default", () => {
    expect(midnightDeploymentRegistry[1]).toBeUndefined();
  });

  test("behavior: exposes object-style registry aliases", () => {
    const chainId = 31_337_102;
    const chainDeployments = createMidnightDeployments();

    registerCustomMidnightAddresses({
      deployments: {
        [chainId]: chainDeployments,
      },
    });

    expect(midnightDeploymentRegistry[chainId]).toEqual(chainDeployments);
    expect(midnightDeployments[chainId]).toEqual(chainDeployments);
  });
});

describe("registerCustomMidnightAddresses", () => {
  test("default", () => {
    const chainId = 31_337_004;
    const chainAddresses = createMidnightAddresses();

    registerCustomMidnightAddresses({
      addresses: {
        [chainId]: chainAddresses,
      },
    });

    expect(getMidnightAddresses(chainId)).toEqual(chainAddresses);
  });

  test("behavior: accepts repeated registration of the same value", () => {
    const chainId = 31_337_005;
    const chainAddresses = createMidnightAddresses();

    registerCustomMidnightAddresses({
      addresses: {
        [chainId]: chainAddresses,
      },
    });

    expect(() =>
      registerCustomMidnightAddresses({
        addresses: {
          [chainId]: {
            midnight: chainAddresses.midnight,
          },
        },
      }),
    ).not.toThrow();
  });

  test("behavior: accepts repeated registration of the same address with different casing", () => {
    const chainId = 31_337_008;
    const chainAddresses = createMidnightAddresses();
    const lowercasedMidnight =
      chainAddresses.midnight.toLowerCase() as MidnightAddresses["midnight"];

    registerCustomMidnightAddresses({
      addresses: {
        [chainId]: chainAddresses,
      },
    });

    expect(() =>
      registerCustomMidnightAddresses({
        addresses: {
          [chainId]: {
            midnight: lowercasedMidnight,
          },
        },
      }),
    ).not.toThrow();
  });

  test("error: IncompleteMidnightAddressesError", () => {
    expect(() =>
      registerCustomMidnightAddresses({
        addresses: {
          31337006: {
            midnight: randomAddress(),
          },
        },
      }),
    ).toThrow(IncompleteMidnightAddressesError);
  });

  test("error: MidnightAddressAlreadyRegisteredError", () => {
    const chainId = 31_337_007;
    const chainAddresses = createMidnightAddresses();

    registerCustomMidnightAddresses({
      addresses: {
        [chainId]: chainAddresses,
      },
    });

    expect(() =>
      registerCustomMidnightAddresses({
        addresses: {
          [chainId]: {
            midnight: randomAddress(),
          },
        },
      }),
    ).toThrow(MidnightAddressAlreadyRegisteredError);

    expect(getMidnightAddresses(chainId).midnight).toBe(
      chainAddresses.midnight,
    );
  });

  test("error: IncompleteMidnightDeploymentsError", () => {
    expect(() =>
      registerCustomMidnightAddresses({
        deployments: {
          31337103: {
            midnight: 1n,
          },
        },
      }),
    ).toThrow(IncompleteMidnightDeploymentsError);
  });

  test("error: MidnightDeploymentAlreadyRegisteredError", () => {
    const chainId = 31_337_104;
    const chainDeployments = createMidnightDeployments();

    registerCustomMidnightAddresses({
      deployments: {
        [chainId]: chainDeployments,
      },
    });

    expect(() =>
      registerCustomMidnightAddresses({
        deployments: {
          [chainId]: {
            midnight: chainDeployments.midnight + 1n,
          },
        },
      }),
    ).toThrow(MidnightDeploymentAlreadyRegisteredError);

    expect(getMidnightDeployments(chainId).midnight).toBe(
      chainDeployments.midnight,
    );
  });
});
