import { UnsupportedChainIdError } from "@morpho-org/morpho-ts";
import { randomAddress } from "@morpho-org/test/fixtures";
import { describe, expect, test } from "vitest";
import {
  getMidnightAddresses,
  IncompleteMidnightAddressesError,
  MidnightAddressAlreadyRegisteredError,
  type MidnightAddresses,
  midnightAddresses,
  midnightAddressRegistry,
  registerCustomMidnightAddresses,
} from "./index.js";

const createMidnightAddresses = (): MidnightAddresses => ({
  midnight: randomAddress(),
  midnightBundles: randomAddress(),
  midnightMempool: randomAddress(),
  ecrecoverRatifier: randomAddress(),
  setterRatifier: randomAddress(),
  permit2: randomAddress(),
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
});
