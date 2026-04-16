import { randomAddress } from "@morpho-org/test/fixtures";
import { describe, expect, test } from "vitest";
import {
  type ChainAddresses,
  ChainId,
  NATIVE_ADDRESS,
  addresses,
  addressesRegistry,
  deployments,
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

  test.each([
    {
      chainId: 685689,
      expectedAddresses: {
        morpho: "0x8c45B34999883FF4B47cD3be095D585682cd9227",
        permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
        bundler3: {
          bundler3: "0xE09314FE5Fc41FEc8f3e6042085dD3CeE24c877c",
          generalAdapter1: "0x79e6825ccb881d276f988a5dA8125e1c6BEa07Ae",
        },
        adaptiveCurveIrm: "0x549EFFAE58F9Db253AAF60fbCeC8B4cB74a952A8",
        vaultV2Factory: "0xe2558155AEcEF57cAADB98e39b0538ab0ae95693",
        morphoMarketV1AdapterV2Factory:
          "0x155134544AE2Ec3AB23034BF620538482C5E3c40",
        registryList: "0xdaE77f687883D656Aa4dc7fF89c0c891510C61A5",
        chainlinkOracleFactory: "0xf9b22d1652ce918CfC5d102269801AFbfEFa85F9",
        preLiquidationFactory: "0x57C88ACAbd4Fa19257104ECCF64ccA34e5eB8961",
        wNative: "0x4200000000000000000000000000000000000006",
      },
      expectedDeployments: {
        morpho: 7520470n,
        permit2: 0n,
        bundler3: {
          bundler3: 7520470n,
          generalAdapter1: 7520470n,
        },
        adaptiveCurveIrm: 7520470n,
        vaultV2Factory: 7520624n,
        morphoMarketV1AdapterV2Factory: 7520701n,
        registryList: 7520701n,
        chainlinkOracleFactory: 7520548n,
        preLiquidationFactory: 7520548n,
        wNative: 0n,
      },
    },
    {
      chainId: 1672,
      expectedAddresses: {
        morpho: "0x18573fA18fd17dDfD790B4a5B5b2977aad3b4Efb",
        permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
        bundler3: {
          bundler3: "0x3c90c09F8c5d927a117F681fB924952DbbD99120",
          generalAdapter1: "0x0A5819708bCAD9C716dFD58ecB58cF91399A53f8",
        },
        adaptiveCurveIrm: "0xD5E02889C13230458506CC842347c4E62F8cDF3a",
        vaultV2Factory: "0x8E01ed1E1A41029b3137FcE9Aa880c0A54827498",
        morphoMarketV1AdapterV2Factory:
          "0xe510e1fcC429943cA3455A7bfBD79f0307Cd8403",
        registryList: "0xbe858d729548eB49BbFA05Acd3674ca8cdaAdD4b",
        chainlinkOracleFactory: "0xb8118256d8Aa950ec0B26a0b8Be7C6c1a858f6a3",
        preLiquidationFactory: "0x37511F85B0Eff260d429f693247339dC91C76f90",
        wNative: "0x52C48d4213107b20bC583832b0d951FB9CA8F0B0",
      },
      expectedDeployments: {
        morpho: 4202147n,
        permit2: 0n,
        bundler3: {
          bundler3: 4202147n,
          generalAdapter1: 4202147n,
        },
        adaptiveCurveIrm: 4202147n,
        vaultV2Factory: 4240410n,
        morphoMarketV1AdapterV2Factory: 4240521n,
        registryList: 4240521n,
        chainlinkOracleFactory: 4202252n,
        preLiquidationFactory: 4202252n,
        wNative: 1617294n,
      },
    },
    {
      chainId: 714,
      expectedAddresses: {
        morpho: "0xF050a2BB0468FF23cF2964AC182196C94D6815C3",
        permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
        bundler3: {
          bundler3: "0x4D403d6a3D25A865Ed57caef884f076E0fa00eCa",
          generalAdapter1: "0x9B05CCA3299E3558a324f72aaB4D404625557B3D",
        },
        adaptiveCurveIrm: "0x08A7b3a39E5425d616Cc9c046cf96B5eF21a139f",
        vaultV2Factory: "0x9aaCAA01F5e6BC876D07f023744E3E0A456a64cf",
        morphoMarketV1AdapterV2Factory:
          "0x59e8C53D383F22b6371b5833504dfAa4136aE6f7",
        registryList: "0xB78BA19a8Bf3202DA7036ec1830222FDC5e0297e",
        chainlinkOracleFactory: "0xD6202eFF2e869dc473EB13c38Cc787835Bf8B6df",
        preLiquidationFactory: "0x83346d9fc31a239Ae1739672AD84A567C7beF529",
        wNative: "0x00000000000000000000000000000000ce1E571a",
      },
      expectedDeployments: {
        morpho: 53363569n,
        permit2: 52269150n,
        bundler3: {
          bundler3: 53363569n,
          generalAdapter1: 53363569n,
        },
        adaptiveCurveIrm: 53363569n,
        vaultV2Factory: 53366326n,
        morphoMarketV1AdapterV2Factory: 53367797n,
        registryList: 53367797n,
        chainlinkOracleFactory: 53364880n,
        preLiquidationFactory: 53364880n,
        wNative: 0n,
      },
    },
  ])(
    "should expose era-2 addresses for chain $chainId",
    ({ chainId, expectedAddresses, expectedDeployments }) => {
      expect(getChainAddresses(chainId)).toMatchObject(expectedAddresses);
      expect((deployments as Record<number, unknown>)[chainId]).toMatchObject(
        expectedDeployments,
      );
      expect(
        getUnwrappedToken(expectedAddresses.wNative as `0x${string}`, chainId),
      ).toEqual(NATIVE_ADDRESS);
    },
  );

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
