import { randomAddress } from "@morpho-org/test/fixtures";
import { describe, expect, test } from "vitest";
import {
  type ChainAddresses,
  ChainId,
  addresses,
  addressesRegistry,
  getChainAddresses,
  getUnwrappedToken,
  registerCustomAddresses,
} from "../../src/index.js";

describe("addresses", () => {
  test("should be extendable on existing chain (and revertable)", () => {
    const randomAddress1 = randomAddress();
    const randomAddress2 = randomAddress();
    const unwrappedToken = randomAddress();
    const wrappedToken = randomAddress();

    expect(
      getChainAddresses(ChainId.BaseMainnet).bundler3.aaveV2MigrationAdapter,
    ).toBeUndefined();
    expect(getChainAddresses(ChainId.BaseMainnet).stEth).toBeUndefined();
    expect(
      getUnwrappedToken(wrappedToken, ChainId.BaseMainnet),
    ).toBeUndefined();

    registerCustomAddresses({
      addresses: {
        [ChainId.BaseMainnet]: {
          bundler3: {
            aaveV2MigrationAdapter: randomAddress1,
          },
          stEth: randomAddress2,
        },
      },
      unwrappedTokens: {
        [ChainId.BaseMainnet]: {
          [wrappedToken]: unwrappedToken,
        },
      },
    });

    expect(
      getChainAddresses(ChainId.BaseMainnet).bundler3.aaveV2MigrationAdapter,
    ).toEqual(randomAddress1);
    expect(getChainAddresses(ChainId.BaseMainnet).stEth).toEqual(
      randomAddress2,
    );
    expect(getUnwrappedToken(wrappedToken, ChainId.BaseMainnet)).toEqual(
      unwrappedToken,
    );
  });

  test("should be extendable on custom chain (and revertable)", () => {
    const chainId = 11235813;
    const chainAddresses = {
      morpho: randomAddress(),
      bundler3: {
        bundler3: randomAddress(),
        generalAdapter1: randomAddress(),
      },
      adaptiveCurveIrm: randomAddress(),
      wstEth: randomAddress(),
      stEth: randomAddress(),
    } satisfies ChainAddresses;

    registerCustomAddresses({
      addresses: {
        [chainId]: chainAddresses,
      },
      unwrappedTokens: {
        [chainId]: {
          [chainAddresses.wstEth]: chainAddresses.stEth,
        },
      },
    });

    expect(addresses[chainId]).toEqual(chainAddresses);
    expect(getUnwrappedToken(chainAddresses.wstEth, chainId)).toEqual(
      chainAddresses.stEth,
    );
  });

  test("should throw when overriding existing address", () => {
    const randomAddress1 = randomAddress();

    expect(
      getChainAddresses(ChainId.EthMainnet).bundler3.bundler3,
    ).toBeDefined();

    expect(() =>
      registerCustomAddresses({
        addresses: {
          [ChainId.EthMainnet]: {
            bundler3: {
              bundler3: randomAddress1,
            },
          },
        },
      }),
    ).toThrow();

    expect(() =>
      registerCustomAddresses({
        unwrappedTokens: {
          [ChainId.EthMainnet]: {
            [addressesRegistry[ChainId.EthMainnet].wstEth]: randomAddress1,
          },
        },
      }),
    ).toThrow();
  });

  test("should throw if trying to modify custom address", () => {
    const randomAddress1 = randomAddress();

    registerCustomAddresses({
      addresses: {
        [ChainId.BaseMainnet]: {
          wstEth: randomAddress1,
        },
      },
    });
    expect(getChainAddresses(ChainId.BaseMainnet).wstEth).toEqual(
      randomAddress1,
    );

    /* Shouldn't throw since address is the same */
    expect(() =>
      registerCustomAddresses({
        addresses: {
          [ChainId.BaseMainnet]: {
            wstEth: randomAddress1,
          },
        },
      }),
    ).not.toThrow();

    /* Should throw since address is different */
    expect(() =>
      registerCustomAddresses({
        addresses: {
          [ChainId.BaseMainnet]: {
            wstEth: randomAddress(),
          },
        },
      }),
    ).toThrow();
  });

  test("should prevent manual overrides", () => {
    const chainAddresses = {
      morpho: randomAddress(),
      bundler3: {
        bundler3: randomAddress(),
        generalAdapter1: randomAddress(),
      },
      adaptiveCurveIrm: randomAddress(),
      wstEth: randomAddress(),
      stEth: randomAddress(),
    } satisfies ChainAddresses;

    expect(() => {
      addresses[ChainId.EthMainnet] = chainAddresses;
    }).toThrow();

    expect(() => {
      addresses[ChainId.EthMainnet]!.morpho = chainAddresses.morpho;
    }).toThrow();

    expect(() => {
      addresses[ChainId.EthMainnet]!.bundler3.bundler3 =
        chainAddresses.bundler3.bundler3;
    }).toThrow();
  });
});
