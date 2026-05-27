import { randomAddress } from "@morpho-org/test/fixtures";
import { describe, expect, test } from "vitest";
import {
  addresses,
  addressesRegistry,
  type ChainAddresses,
  type ChainDeployments,
  ChainId,
  deployments,
  getChainAddresses,
  getPermissionedCoinbaseTokens,
  getUnwrappedToken,
  NATIVE_ADDRESS,
  registerCustomAddresses,
  UnsupportedChainIdError,
} from "./index.js";

describe("addresses helpers", () => {
  test("getChainAddresses returns known chain addresses", () => {
    const chainAddresses = getChainAddresses(ChainId.BaseMainnet);

    expect(chainAddresses.morpho).toBe(
      "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
    );
  });

  test("getChainAddresses throws for unsupported chains", () => {
    expect(() => getChainAddresses(999_999_999)).toThrow(
      UnsupportedChainIdError,
    );
  });

  test("getUnwrappedToken resolves known wrapped native tokens", () => {
    const chainAddresses = getChainAddresses(ChainId.BaseMainnet);
    const wrappedNative = chainAddresses.wNative;

    if (wrappedNative == null) throw new Error("Missing wrapped native token");

    expect(getUnwrappedToken(wrappedNative, ChainId.BaseMainnet)).toBe(
      NATIVE_ADDRESS,
    );
  });

  test("getPermissionedCoinbaseTokens returns a new empty set for unknown chains", () => {
    const first = getPermissionedCoinbaseTokens(999_999_998);
    const second = getPermissionedCoinbaseTokens(999_999_998);

    expect(first.size).toBe(0);
    expect(second.size).toBe(0);
    expect(first).not.toBe(second);
  });

  test("registerCustomAddresses extends deployment metadata", () => {
    const chainId = 888_000_001;
    registerCustomAddresses({
      deployments: {
        [chainId]: {
          morpho: 1n,
          permit2: 2n,
          bundler3: {
            bundler3: 3n,
            generalAdapter1: 4n,
          },
          adaptiveCurveIrm: 5n,
          vaultV2Factory: 6n,
          morphoMarketV1AdapterV2Factory: 7n,
          registryList: 8n,
          chainlinkOracleFactory: 9n,
          preLiquidationFactory: 10n,
          wNative: 11n,
        },
      },
    });

    expect(
      (deployments as Record<number, ChainDeployments>)[chainId]
        ?.vaultV2Factory,
    ).toBe(6n);
  });

  test("registerCustomAddresses extends an existing chain without changing existing entries", () => {
    const aaveV2MigrationAdapter = randomAddress();
    const stEth = randomAddress();
    const wrappedToken = randomAddress();
    const unwrappedToken = randomAddress();

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
            aaveV2MigrationAdapter,
          },
          stEth,
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
    ).toBe(aaveV2MigrationAdapter);
    expect(getChainAddresses(ChainId.BaseMainnet).stEth).toBe(stEth);
    expect(getUnwrappedToken(wrappedToken, ChainId.BaseMainnet)).toBe(
      unwrappedToken,
    );
  });

  test("registerCustomAddresses extends address metadata", () => {
    const chainId = 888_000_002;
    const chainAddresses = {
      morpho: "0x0000000000000000000000000000000000000001",
      bundler3: {
        bundler3: "0x0000000000000000000000000000000000000002",
        generalAdapter1: "0x0000000000000000000000000000000000000003",
      },
      adaptiveCurveIrm: "0x0000000000000000000000000000000000000004",
      wNative: "0x0000000000000000000000000000000000000005",
    } satisfies ChainAddresses;

    registerCustomAddresses({
      addresses: {
        [chainId]: chainAddresses,
      },
    });

    expect(getChainAddresses(chainId)).toStrictEqual(chainAddresses);
  });

  test("registerCustomAddresses extends a custom chain and unwrapped token mapping together", () => {
    const chainId = 888_000_004;
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

    expect(addresses[chainId]).toStrictEqual(chainAddresses);
    expect(getUnwrappedToken(chainAddresses.wstEth, chainId)).toBe(
      chainAddresses.stEth,
    );
  });

  test("registerCustomAddresses extends unwrapped token metadata", () => {
    const chainId = 888_000_003;
    const wrappedToken = "0x0000000000000000000000000000000000000006";
    const unwrappedToken = "0x0000000000000000000000000000000000000007";

    registerCustomAddresses({
      unwrappedTokens: {
        [chainId]: {
          [wrappedToken]: unwrappedToken,
        },
      },
    });

    expect(getUnwrappedToken(wrappedToken, chainId)).toBe(unwrappedToken);
  });

  test("registerCustomAddresses rejects overriding an existing deployment", () => {
    expect(() =>
      registerCustomAddresses({
        deployments: {
          [ChainId.EthMainnet]: {
            morpho: 999n,
          },
        },
      }),
    ).toThrow("Cannot override existing deployment: morpho");
  });

  test.each([
    {
      chainId: 685_689,
      morpho: "0x8c45B34999883FF4B47cD3be095D585682cd9227",
      wNative: "0x4200000000000000000000000000000000000006",
      morphoDeployment: 7_520_470n,
      wNativeDeployment: 0n,
    },
    {
      chainId: 1_672,
      morpho: "0x18573fA18fd17dDfD790B4a5B5b2977aad3b4Efb",
      wNative: "0x52C48d4213107b20bC583832b0d951FB9CA8F0B0",
      morphoDeployment: 4_202_147n,
      wNativeDeployment: 1_617_294n,
    },
    {
      chainId: 714,
      morpho: "0xF050a2BB0468FF23cF2964AC182196C94D6815C3",
      wNative: "0x00000000000000000000000000000000ce1E571a",
      morphoDeployment: 53_363_569n,
      wNativeDeployment: 0n,
    },
    {
      chainId: 14,
      morpho: "0xF4346F5132e810f80a28487a79c7559d9797E8B0",
      wNative: "0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d",
      morphoDeployment: 52_378_788n,
      wNativeDeployment: 39n,
    },
    {
      chainId: 50,
      morpho: "0xEa49B0fE898aF913A3826F9f462eE2cDcb854fD9",
      wNative: "0x951857744785E80e2De051c32EE7b25f9c458C42",
      morphoDeployment: 101_757_515n,
      wNativeDeployment: 42_776_215n,
    },
    {
      chainId: 8_217,
      morpho: "0xA8BEebdca34d83C697c302A0594f3c41f3994cd2",
      wNative: "0x19Aac5f612f524B754CA7e7c41cbFa2E981A4432",
      morphoDeployment: 208_021_118n,
      wNativeDeployment: 104_802_159n,
    },
    {
      chainId: 5_042,
      morpho: "0x34CD04070dD72b14E241112F6d83812Df5Af7fCD",
      wNative: "0x0000000000000000000000000000000000000001",
      morphoDeployment: 1_208_685n,
      wNativeDeployment: 0n,
    },
  ])("exposes era-2 addresses and deployments for chain $chainId", ({
    chainId,
    morpho,
    wNative,
    morphoDeployment,
    wNativeDeployment,
  }) => {
    expect(getChainAddresses(chainId)).toMatchObject({ morpho, wNative });
    expect(
      (deployments as Record<number, ChainDeployments>)[chainId],
    ).toMatchObject({
      morpho: morphoDeployment,
      wNative: wNativeDeployment,
    });
    expect(getUnwrappedToken(wNative as `0x${string}`, chainId)).toBe(
      NATIVE_ADDRESS,
    );
  });

  test("registerCustomAddresses rejects overriding existing addresses and unwrapped tokens", () => {
    const address = randomAddress();

    expect(
      getChainAddresses(ChainId.EthMainnet).bundler3.bundler3,
    ).toBeDefined();

    expect(() =>
      registerCustomAddresses({
        addresses: {
          [ChainId.EthMainnet]: {
            bundler3: {
              bundler3: address,
            },
          },
        },
      }),
    ).toThrow();

    expect(() =>
      registerCustomAddresses({
        unwrappedTokens: {
          [ChainId.EthMainnet]: {
            [addressesRegistry[ChainId.EthMainnet].wstEth]: address,
          },
        },
      }),
    ).toThrow();
  });

  test("registerCustomAddresses accepts identical custom addresses and rejects later changes", () => {
    const chainId = 888_000_005;
    const address = randomAddress();

    registerCustomAddresses({
      addresses: {
        [chainId]: {
          wNative: address,
        },
      },
    });

    expect(getChainAddresses(chainId).wNative).toBe(address);

    expect(() =>
      registerCustomAddresses({
        addresses: {
          [chainId]: {
            wNative: address,
          },
        },
      }),
    ).not.toThrow();

    expect(() =>
      registerCustomAddresses({
        addresses: {
          [chainId]: {
            wNative: randomAddress(),
          },
        },
      }),
    ).toThrow();
  });

  test("addresses registry prevents manual overrides", () => {
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
