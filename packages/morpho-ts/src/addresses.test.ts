import { describe, expect, test } from "vitest";

import {
  addresses,
  addressesRegistry,
  deployments,
  getMidnightAddresses,
  getMidnightDeployments,
  type MidnightAddresses,
  type MidnightDeployments,
  registerCustomAddresses,
} from "./addresses.js";
import { ChainId } from "./chain.js";
import {
  IncompleteRegistryEntryError,
  RegistryValueAlreadyRegisteredError,
  UnsupportedChainIdError,
} from "./errors.js";

let nextAddressIndex = 1n;

const randomAddress = (): `0x${string}` => {
  const address =
    `0x${nextAddressIndex.toString(16).padStart(40, "0")}` as `0x${string}`;
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

const getMainnetBlueAddresses = () => {
  const blueAddresses = addressesRegistry[ChainId.EthMainnet]?.blue;
  if (blueAddresses == null) throw new Error("missing mainnet Blue addresses");

  return blueAddresses;
};

const getMainnetBlueDeployments = () => {
  const blueDeployments = deployments[ChainId.EthMainnet]?.blue;
  if (blueDeployments == null)
    throw new Error("missing mainnet Blue deployments");

  return blueDeployments;
};

describe("getMidnightAddresses", () => {
  test("error: UnsupportedChainIdError", () => {
    expect(() => getMidnightAddresses(1)).toThrow(UnsupportedChainIdError);
  });

  test("default", () => {
    const chainId = 31_337_001;
    const chainAddresses = createMidnightAddresses();

    registerCustomAddresses({
      addresses: {
        [chainId]: {
          midnight: chainAddresses,
        },
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

    registerCustomAddresses({
      deployments: {
        [chainId]: {
          midnight: chainDeployments,
        },
      },
    });

    expect(getMidnightDeployments(chainId)).toEqual(chainDeployments);
  });
});

describe("addressesRegistry", () => {
  test("default", () => {
    expect(addressesRegistry[1]?.midnight).toBeUndefined();
  });

  test("behavior: exposes Midnight entries through the unified registry", () => {
    const chainId = 31_337_002;
    const chainAddresses = createMidnightAddresses();

    registerCustomAddresses({
      addresses: {
        [chainId]: {
          midnight: chainAddresses,
        },
      },
    });

    expect(addressesRegistry[chainId]?.midnight).toEqual(chainAddresses);
    expect(addresses[chainId]?.midnight).toEqual(chainAddresses);
  });

  test("behavior: copies registered entries", () => {
    const chainId = 31_337_003;
    const chainAddresses = createMidnightAddresses();
    const registeredMidnight = chainAddresses.midnight;

    registerCustomAddresses({
      addresses: {
        [chainId]: {
          midnight: chainAddresses,
        },
      },
    });

    Object.assign(chainAddresses, { midnight: randomAddress() });

    expect(getMidnightAddresses(chainId).midnight).toBe(registeredMidnight);
  });

  test("behavior: registers Blue and Midnight addresses alongside each other", () => {
    const chainId = 31_337_004;
    const blueAddresses = getMainnetBlueAddresses();
    const chainAddresses = createMidnightAddresses();

    registerCustomAddresses({
      addresses: {
        [chainId]: {
          blue: blueAddresses,
          midnight: chainAddresses,
        },
      },
    });

    expect(addressesRegistry[chainId]?.blue).toEqual(blueAddresses);
    expect(addressesRegistry[chainId]?.midnight).toEqual(chainAddresses);
  });
});

describe("deployments", () => {
  test("default", () => {
    expect(deployments[1]?.midnight).toBeUndefined();
  });

  test("behavior: registers Blue and Midnight deployments alongside each other", () => {
    const chainId = 31_337_102;
    const blueDeployments = getMainnetBlueDeployments();
    const chainDeployments = createMidnightDeployments();

    registerCustomAddresses({
      deployments: {
        [chainId]: {
          blue: blueDeployments,
          midnight: chainDeployments,
        },
      },
    });

    expect(deployments[chainId]?.blue).toEqual(blueDeployments);
    expect(deployments[chainId]?.midnight).toEqual(chainDeployments);
  });
});

describe("registerCustomAddresses", () => {
  test("default", () => {
    const chainId = 31_337_005;
    const chainAddresses = createMidnightAddresses();

    registerCustomAddresses({
      addresses: {
        [chainId]: {
          midnight: chainAddresses,
        },
      },
    });

    expect(getMidnightAddresses(chainId)).toEqual(chainAddresses);
  });

  test("behavior: accepts repeated registration of the same value", () => {
    const chainId = 31_337_006;
    const chainAddresses = createMidnightAddresses();

    registerCustomAddresses({
      addresses: {
        [chainId]: {
          midnight: chainAddresses,
        },
      },
    });

    expect(() =>
      registerCustomAddresses({
        addresses: {
          [chainId]: {
            midnight: {
              midnight: chainAddresses.midnight,
            },
          },
        },
      }),
    ).not.toThrow();

    expect(getMidnightAddresses(chainId).midnight).toBe(
      chainAddresses.midnight,
    );
  });

  test("behavior: accepts repeated registration of the same address with different casing", () => {
    const chainId = 31_337_007;
    const chainAddresses = createMidnightAddresses();
    const lowercasedMidnight =
      chainAddresses.midnight.toLowerCase() as MidnightAddresses["midnight"];

    registerCustomAddresses({
      addresses: {
        [chainId]: {
          midnight: chainAddresses,
        },
      },
    });

    expect(() =>
      registerCustomAddresses({
        addresses: {
          [chainId]: {
            midnight: {
              midnight: lowercasedMidnight,
            },
          },
        },
      }),
    ).not.toThrow();
  });

  test("error: IncompleteRegistryEntryError for addresses", () => {
    expect(() =>
      registerCustomAddresses({
        addresses: {
          31337008: {
            midnight: {
              midnight: randomAddress(),
            },
          },
        },
      }),
    ).toThrow(IncompleteRegistryEntryError);
  });

  test("error: RegistryValueAlreadyRegisteredError for addresses", () => {
    const chainId = 31_337_009;
    const chainAddresses = createMidnightAddresses();

    registerCustomAddresses({
      addresses: {
        [chainId]: {
          midnight: chainAddresses,
        },
      },
    });

    expect(() =>
      registerCustomAddresses({
        addresses: {
          [chainId]: {
            midnight: {
              midnight: randomAddress(),
            },
          },
        },
      }),
    ).toThrow(RegistryValueAlreadyRegisteredError);

    expect(getMidnightAddresses(chainId).midnight).toBe(
      chainAddresses.midnight,
    );
  });

  test("error: IncompleteRegistryEntryError for deployments", () => {
    expect(() =>
      registerCustomAddresses({
        deployments: {
          31337103: {
            midnight: {
              midnight: 1n,
            },
          },
        },
      }),
    ).toThrow(IncompleteRegistryEntryError);
  });

  test("error: RegistryValueAlreadyRegisteredError for deployments", () => {
    const chainId = 31_337_104;
    const chainDeployments = createMidnightDeployments();

    registerCustomAddresses({
      deployments: {
        [chainId]: {
          midnight: chainDeployments,
        },
      },
    });

    expect(() =>
      registerCustomAddresses({
        deployments: {
          [chainId]: {
            midnight: {
              midnight: chainDeployments.midnight + 1n,
            },
          },
        },
      }),
    ).toThrow(RegistryValueAlreadyRegisteredError);

    expect(getMidnightDeployments(chainId).midnight).toBe(
      chainDeployments.midnight,
    );
  });
});
