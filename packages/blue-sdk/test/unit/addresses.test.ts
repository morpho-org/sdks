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
    {
      chainId: 14,
      expectedAddresses: {
        morpho: "0xF4346F5132e810f80a28487a79c7559d9797E8B0",
        permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
        bundler3: {
          bundler3: "0xb371CFee69984D1F3447D49217889C7388bA2027",
          generalAdapter1: "0x43F4861c9E7f584cFDc9B6BA3F0c2462895BDd67",
        },
        adaptiveCurveIrm: "0xE5B5627C5973AfAE1928a6b8e5c1D6AABFEC8a7a",
        vaultV2Factory: "0x6FC83ECc0e8142635D77200e5052be8A0a9D2f42",
        morphoMarketV1AdapterV2Factory:
          "0xd8237ea1b5974c83C6b0c8942dc2a16F42f789dd",
        registryList: "0x9730d0B30d9145B66a8e09D26295e36cb84F64a9",
        chainlinkOracleFactory: "0x95cB3625598F9abf6cb8B874AA1EfEEbE7822642",
        preLiquidationFactory: "0xf215D05a04b97f98Bb1bF4E0E5Cb97Ef38fa8895",
        wNative: "0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d",
      },
      expectedDeployments: {
        morpho: 52378788n,
        permit2: 58377404n,
        bundler3: {
          bundler3: 52378788n,
          generalAdapter1: 52378788n,
        },
        adaptiveCurveIrm: 52378788n,
        vaultV2Factory: 52383002n,
        morphoMarketV1AdapterV2Factory: 52383110n,
        registryList: 52383110n,
        chainlinkOracleFactory: 52378931n,
        preLiquidationFactory: 52378931n,
        wNative: 39n,
      },
    },
    {
      chainId: 50,
      expectedAddresses: {
        morpho: "0xEa49B0fE898aF913A3826F9f462eE2cDcb854fD9",
        permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
        bundler3: {
          bundler3: "0xed9bdc3E6081db528b6D5CDDf47EcB05337c62A7",
          generalAdapter1: "0xAB2Ab6A8bb1082C5d8400D6206c6A13cE413e0c0",
        },
        adaptiveCurveIrm: "0x15c7312B0f26aa0AA70B24a0D2AF87B9e7D614A0",
        vaultV2Factory: "0x227544d6989cD15c05AAB6dde4F29523dcfdbe2B",
        morphoMarketV1AdapterV2Factory:
          "0x5C00c99F2235439725417E9f037B7D38FfF35d31",
        registryList: "0x79A8C4e9E502C1867cAf2E7202f0C6b89aaCd5c1",
        chainlinkOracleFactory: "0x6Ad93a3aA829514473D3DF67382894A76c7283B4",
        preLiquidationFactory: "0xe3845262d726a827817C7196143CDa9a4404218d",
        wNative: "0x951857744785E80e2De051c32EE7b25f9c458C42",
      },
      expectedDeployments: {
        morpho: 101757515n,
        permit2: 92945178n,
        bundler3: {
          bundler3: 101757515n,
          generalAdapter1: 101757515n,
        },
        adaptiveCurveIrm: 101757515n,
        vaultV2Factory: 101757669n,
        morphoMarketV1AdapterV2Factory: 101757823n,
        registryList: 101757823n,
        chainlinkOracleFactory: 101757578n,
        preLiquidationFactory: 101757578n,
        wNative: 42776215n,
      },
    },
    {
      chainId: 8217,
      expectedAddresses: {
        morpho: "0xA8BEebdca34d83C697c302A0594f3c41f3994cd2",
        permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
        bundler3: {
          bundler3: "0x27880B18ae04a05F1D603B87AEb2a27491FfaBA9",
          generalAdapter1: "0x8e36C2c6d7771820BF14a75f725f3cf0374a7823",
        },
        adaptiveCurveIrm: "0xA4E2bA20Fc64D721D95BD5a28FF71844C5bb5cF2",
        vaultV2Factory: "0xf2Aecd4a4d4C21d08770e34F392C4C271aBD9144",
        morphoMarketV1AdapterV2Factory:
          "0x4d04C39ca604b560c50F4045c558378FD9AEBCF4",
        registryList: "0xfCA12228DA5fba6E9c0B57a8e8322d0eBaCa03Bc",
        chainlinkOracleFactory: "0x3e89C1071814b2c4170c90260Fcb60B903AD4602",
        preLiquidationFactory: "0xe8eCe452F04117e5Fe1Ea4403097215443225440",
        wNative: "0x19Aac5f612f524B754CA7e7c41cbFa2E981A4432",
      },
      expectedDeployments: {
        morpho: 208021118n,
        permit2: 188994815n,
        bundler3: {
          bundler3: 208021118n,
          generalAdapter1: 208021118n,
        },
        adaptiveCurveIrm: 208021118n,
        vaultV2Factory: 213463014n,
        morphoMarketV1AdapterV2Factory: 213463079n,
        registryList: 213463079n,
        chainlinkOracleFactory: 213462907n,
        preLiquidationFactory: 213462907n,
        wNative: 104802159n,
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
