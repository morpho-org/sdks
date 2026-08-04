import { MarketParams } from "@morpho-org/blue-sdk";
import { erc2612Abi, vaultV2Abi } from "@morpho-org/blue-sdk-viem";
import { createMockClient } from "@morpho-org/test/mock";
import { erc20Abi, maxUint256 } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  encodeReadResult,
  IN_KIND_BUNDLER,
  IN_KIND_USER,
  IN_KIND_VAULT,
  inKindMarketParams,
  inKindVaultV2Data,
  mockMulticallResults,
} from "../../../test/fixtures/inKindRedeem.js";
import { morphoViemExtension } from "../../client/index.js";
import {
  AdapterNotPartOfVaultError,
  CannotReceiveAssetsForInKindRedeemError,
  CannotSendSharesForInKindRedeemError,
  ChainIdMismatchError,
  EmptyMarketParamsListError,
  ExpiredDeadlineError,
  InKindRedemptionCoverageError,
  InKindRedemptionRequiresSingleAdapterError,
  InsufficientBlueBalanceForInKindRedeemError,
  MarketNotInAdapterError,
  NonPositiveInputError,
  UnsupportedInKindAdapterError,
  VaultAddressMismatchError,
} from "../../types/index.js";

const mockV2Requirements = (
  handle: ReturnType<typeof createMockClient>,
  params: {
    allowance?: bigint;
    blueBalance?: bigint;
    canSendShares?: boolean;
    bundlerCanReceiveAssets?: boolean;
    vaultCanReceiveAssets?: boolean;
  } = {},
) => {
  mockMulticallResults(handle, [
    encodeReadResult({
      abi: erc20Abi,
      functionName: "allowance",
      result: params.allowance ?? 0n,
    }),
    encodeReadResult({
      abi: erc2612Abi,
      functionName: "nonces",
      result: 9n,
    }),
    encodeReadResult({
      abi: erc20Abi,
      functionName: "balanceOf",
      result: params.blueBalance ?? 1_000n,
    }),
    encodeReadResult({
      abi: vaultV2Abi,
      functionName: "canSendShares",
      result: params.canSendShares ?? true,
    }),
    encodeReadResult({
      abi: vaultV2Abi,
      functionName: "canReceiveAssets",
      result: params.bundlerCanReceiveAssets ?? true,
    }),
    encodeReadResult({
      abi: vaultV2Abi,
      functionName: "canReceiveAssets",
      result: params.vaultCanReceiveAssets ?? true,
    }),
  ]);
};

describe("MorphoVaultV2.inKindRedeem", () => {
  test("default", () => {
    const handle = createMockClient(mainnet);
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);
    const exit = vault.inKindRedeem({
      amount: 500n,
      marketParamsList: [inKindMarketParams],
      vaultData: inKindVaultV2Data({ penalty: 20_000_000_000_000_000n }),
      userAddress: IN_KIND_USER,
    });

    expect(exit.buildTx().action.type).toBe("vaultV2InKindRedeem");
  });

  test("error: duplicate markets do not double-count coverage", () => {
    const handle = createMockClient(mainnet);
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);

    expect(() =>
      vault.inKindRedeem({
        amount: 1_500n,
        marketParamsList: [inKindMarketParams, inKindMarketParams],
        vaultData: inKindVaultV2Data(),
        userAddress: IN_KIND_USER,
      }),
    ).toThrow(InKindRedemptionCoverageError);
  });

  test("error: InKindRedemptionRequiresSingleAdapterError", () => {
    const handle = createMockClient(mainnet);
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);

    expect(() =>
      vault.inKindRedeem({
        amount: 1n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV2Data({ adapters: "empty" }),
        userAddress: IN_KIND_USER,
      }),
    ).toThrow(InKindRedemptionRequiresSingleAdapterError);
  });

  test("error: validates chain and vault snapshot address", () => {
    const handle = createMockClient(mainnet);
    const wrongChainVault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV2(IN_KIND_VAULT, mainnet.id + 1);
    expect(() =>
      wrongChainVault.inKindRedeem({
        amount: 1n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV2Data(),
        userAddress: IN_KIND_USER,
      }),
    ).toThrow(ChainIdMismatchError);

    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);
    expect(() =>
      vault.inKindRedeem({
        amount: 1n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV2Data({
          address: "0x0000000000000000000000000000000000001999",
        }),
        userAddress: IN_KIND_USER,
      }),
    ).toThrow(VaultAddressMismatchError);
  });

  test("error: validates amount, market list, and deadline", () => {
    const handle = createMockClient(mainnet);
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);
    expect(() =>
      vault.inKindRedeem({
        amount: 0n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV2Data(),
        userAddress: IN_KIND_USER,
      }),
    ).toThrow(NonPositiveInputError);
    expect(() =>
      vault.inKindRedeem({
        amount: 1n,
        marketParamsList: [],
        vaultData: inKindVaultV2Data(),
        userAddress: IN_KIND_USER,
      }),
    ).toThrow(EmptyMarketParamsListError);
    expect(() =>
      vault.inKindRedeem({
        amount: 1n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV2Data(),
        userAddress: IN_KIND_USER,
        deadline: 1n,
      }),
    ).toThrow(ExpiredDeadlineError);
    expect(() =>
      vault.inKindRedeem({
        amount: 1n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV2Data({
          penalty: 20_000_000_000_000_000n,
        }),
        userAddress: IN_KIND_USER,
      }),
    ).toThrow(NonPositiveInputError);
  });

  test("error: validates the adapter override and implementation", () => {
    const handle = createMockClient(mainnet);
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);
    expect(() =>
      vault.inKindRedeem({
        amount: 1n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV2Data(),
        userAddress: IN_KIND_USER,
        adapter: "0x0000000000000000000000000000000000001999",
      }),
    ).toThrow(AdapterNotPartOfVaultError);
    expect(() =>
      vault.inKindRedeem({
        amount: 1n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV2Data({ adapters: "legacy" }),
        userAddress: IN_KIND_USER,
      }),
    ).toThrow(UnsupportedInKindAdapterError);
  });

  test("error: MarketNotInAdapterError", () => {
    const handle = createMockClient(mainnet);
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);
    const unknownMarket = new MarketParams({
      ...inKindMarketParams,
      collateralToken: "0x0000000000000000000000000000000000001999",
    });

    expect(() =>
      vault.inKindRedeem({
        amount: 1n,
        marketParamsList: [unknownMarket],
        vaultData: inKindVaultV2Data(),
        userAddress: IN_KIND_USER,
      }),
    ).toThrow(MarketNotInAdapterError);
  });

  test("behavior: default approve path requires maxUint256", async () => {
    const handle = createMockClient(mainnet);
    mockV2Requirements(handle);
    const vault = handle.client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);
    const [approval] = await vault
      .inKindRedeem({
        amount: 500n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV2Data(),
        userAddress: IN_KIND_USER,
      })
      .getRequirements();

    expect(approval?.action).toEqual({
      type: "erc20Approval",
      args: { spender: IN_KIND_BUNDLER, amount: maxUint256 },
    });
  });

  test("behavior: signature path emits a max-value V2 permit", async () => {
    const handle = createMockClient(mainnet);
    mockV2Requirements(handle);
    const vault = handle.client
      .extend(morphoViemExtension({ supportSignature: true }))
      .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);
    const [requirement] = await vault
      .inKindRedeem({
        amount: 500n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV2Data(),
        userAddress: IN_KIND_USER,
      })
      .getRequirements();

    expect(requirement?.action).toMatchObject({
      type: "permit",
      args: { spender: IN_KIND_BUNDLER, amount: maxUint256 },
    });
  });

  test.each([
    {
      error: InsufficientBlueBalanceForInKindRedeemError,
      overrides: { blueBalance: 499n },
    },
    {
      error: CannotSendSharesForInKindRedeemError,
      overrides: { canSendShares: false },
    },
    {
      error: CannotReceiveAssetsForInKindRedeemError,
      overrides: { bundlerCanReceiveAssets: false },
    },
    {
      error: CannotReceiveAssetsForInKindRedeemError,
      overrides: { vaultCanReceiveAssets: false },
    },
  ])("error: $error.name", async ({ error, overrides }) => {
    const handle = createMockClient(mainnet);
    mockV2Requirements(handle, overrides);
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);
    const requirements = vault
      .inKindRedeem({
        amount: 500n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV2Data(),
        userAddress: IN_KIND_USER,
      })
      .getRequirements();

    await expect(requirements).rejects.toBeInstanceOf(error);
  });

  test("behavior: exact max allowance returns no authorization", async () => {
    const handle = createMockClient(mainnet);
    mockV2Requirements(handle, { allowance: maxUint256 });
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);
    const requirements = await vault
      .inKindRedeem({
        amount: 500n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV2Data(),
        userAddress: IN_KIND_USER,
      })
      .getRequirements();

    expect(requirements).toEqual([]);
  });
});
