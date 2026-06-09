import { describe, expect, test } from "vitest";
import {
  getMidnightAddresses,
  getMidnightDeployments,
  type MidnightAddresses,
  type MidnightDeployments,
  midnightAddresses,
  midnightAddressRegistry,
  midnightDeploymentRegistry,
  midnightDeployments,
  registerCustomMidnightAddresses,
} from "./addresses.js";
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
