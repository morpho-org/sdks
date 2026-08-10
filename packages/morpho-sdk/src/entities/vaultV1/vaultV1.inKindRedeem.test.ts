import { addressesRegistry, MarketParams } from "@morpho-org/blue-sdk";
import { blueAbi, erc2612Abi, metaMorphoAbi } from "@morpho-org/blue-sdk-viem";
import { createMockClient } from "@morpho-org/test/mock";
import { type Address, erc20Abi, maxUint256 } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  encodeReadResult,
  IN_KIND_BUNDLER,
  IN_KIND_USER,
  IN_KIND_VAULT,
  inKindMarketParams,
  inKindVaultV1Data,
  mockMulticallResults,
} from "../../../test/fixtures/inKindRedeem.js";
import { morphoViemExtension } from "../../client/index.js";
import {
  ChainIdMismatchError,
  EmptyMarketParamsListError,
  ExpiredDeadlineError,
  InKindRedemptionCoverageError,
  InsufficientBlueBalanceForInKindRedeemError,
  NonPositiveInputError,
  VaultAddressMismatchError,
  VaultIsBlueFeeRecipientError,
  VaultMorphoMismatchError,
} from "../../types/index.js";

const blue = addressesRegistry[mainnet.id].blue;

const mockV1Requirements = (
  handle: ReturnType<typeof createMockClient>,
  params: {
    allowance: bigint;
    blueBalance?: bigint;
    morpho?: Address;
    blueFeeRecipient?: Address;
  },
) => {
  mockMulticallResults(handle, [
    encodeReadResult({
      abi: erc20Abi,
      functionName: "allowance",
      result: params.allowance,
    }),
    encodeReadResult({
      abi: erc2612Abi,
      functionName: "nonces",
      result: 7n,
    }),
    encodeReadResult({
      abi: erc20Abi,
      functionName: "balanceOf",
      result: params.blueBalance ?? 1_000n,
    }),
    encodeReadResult({
      abi: metaMorphoAbi,
      functionName: "MORPHO",
      result: params.morpho ?? blue,
    }),
    encodeReadResult({
      abi: blueAbi,
      functionName: "feeRecipient",
      result: params.blueFeeRecipient ?? IN_KIND_USER,
    }),
  ]);
};

describe("MorphoVaultV1.inKindRedeem", () => {
  test("default: accepts raw duplicate coverage and builds the V1 action", () => {
    const handle = createMockClient(mainnet);
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
    const exit = vault.inKindRedeem({
      amount: 1_500n,
      marketParamsList: [inKindMarketParams, inKindMarketParams],
      vaultData: inKindVaultV1Data(),
      userAddress: IN_KIND_USER,
    });

    expect(exit.buildTx().action.type).toBe("vaultV1InKindRedeem");
  });

  test("behavior: snapshots the ordered market params", () => {
    const handle = createMockClient(mainnet);
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
    const marketParams = new MarketParams(inKindMarketParams);
    const marketParamsList = [marketParams];
    const loanToken = marketParams.loanToken;
    const exit = vault.inKindRedeem({
      amount: 500n,
      marketParamsList,
      vaultData: inKindVaultV1Data(),
      userAddress: IN_KIND_USER,
    });
    (
      marketParams as unknown as {
        loanToken: Address;
      }
    ).loanToken = "0x0000000000000000000000000000000000001999";
    marketParamsList.length = 0;

    const tx = exit.buildTx();
    expect(tx.action.args.marketParamsList).toHaveLength(1);
    expect(tx.action.args.marketParamsList[0]?.loanToken).toBe(loanToken);
  });

  test("error: InKindRedemptionCoverageError prevents array exhaustion", () => {
    const handle = createMockClient(mainnet);
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);

    expect(() =>
      vault.inKindRedeem({
        amount: 1_001n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV1Data(),
        userAddress: IN_KIND_USER,
      }),
    ).toThrow(InKindRedemptionCoverageError);
    expect(() =>
      vault.inKindRedeem({
        amount: 1n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV1Data({ enabled: false }),
        userAddress: IN_KIND_USER,
      }),
    ).toThrow(InKindRedemptionCoverageError);
  });

  test("error: validates client chain and vault snapshot address", () => {
    const handle = createMockClient(mainnet);
    const wrongChainVault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id + 1);
    expect(() =>
      wrongChainVault.inKindRedeem({
        amount: 1n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV1Data(),
        userAddress: IN_KIND_USER,
      }),
    ).toThrow(ChainIdMismatchError);

    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
    expect(() =>
      vault.inKindRedeem({
        amount: 1n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV1Data({
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
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
    expect(() =>
      vault.inKindRedeem({
        amount: 0n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV1Data(),
        userAddress: IN_KIND_USER,
      }),
    ).toThrow(NonPositiveInputError);
    expect(() =>
      vault.inKindRedeem({
        amount: 1n,
        marketParamsList: [],
        vaultData: inKindVaultV1Data(),
        userAddress: IN_KIND_USER,
      }),
    ).toThrow(EmptyMarketParamsListError);
    expect(() =>
      vault.inKindRedeem({
        amount: 1n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV1Data(),
        userAddress: IN_KIND_USER,
        deadline: 1n,
      }),
    ).toThrow(ExpiredDeadlineError);
  });

  test("behavior: default approve path requires maxUint256", async () => {
    const handle = createMockClient(mainnet);
    mockV1Requirements(handle, { allowance: 0n });
    const vault = handle.client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
    const [approval] = await vault
      .inKindRedeem({
        amount: 500n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV1Data(),
        userAddress: IN_KIND_USER,
      })
      .getRequirements();

    expect(approval?.action).toEqual({
      type: "erc20Approval",
      args: { spender: IN_KIND_BUNDLER, amount: maxUint256 },
    });
  });

  test("behavior: signature path emits a max-value V1 permit", async () => {
    const handle = createMockClient(mainnet);
    mockV1Requirements(handle, { allowance: 0n });
    const vault = handle.client
      .extend(morphoViemExtension({ supportSignature: true }))
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
    const [requirement] = await vault
      .inKindRedeem({
        amount: 500n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV1Data(),
        userAddress: IN_KIND_USER,
      })
      .getRequirements();

    expect(requirement?.action).toMatchObject({
      type: "permit",
      args: { spender: IN_KIND_BUNDLER, amount: maxUint256 },
    });
  });

  test("behavior: an existing exact max allowance needs no authorization", async () => {
    const handle = createMockClient(mainnet);
    mockV1Requirements(handle, { allowance: maxUint256 });
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
    const requirements = await vault
      .inKindRedeem({
        amount: 500n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV1Data(),
        userAddress: IN_KIND_USER,
      })
      .getRequirements();

    expect(requirements).toEqual([]);
  });

  test("error: InsufficientBlueBalanceForInKindRedeemError", async () => {
    const handle = createMockClient(mainnet);
    mockV1Requirements(handle, { allowance: maxUint256, blueBalance: 499n });
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
    const requirements = vault
      .inKindRedeem({
        amount: 500n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV1Data(),
        userAddress: IN_KIND_USER,
      })
      .getRequirements();

    await expect(requirements).rejects.toBeInstanceOf(
      InsufficientBlueBalanceForInKindRedeemError,
    );
  });

  test("error: VaultMorphoMismatchError", async () => {
    const handle = createMockClient(mainnet);
    mockV1Requirements(handle, {
      allowance: maxUint256,
      morpho: "0x0000000000000000000000000000000000001999",
    });
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
    const requirements = vault
      .inKindRedeem({
        amount: 500n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV1Data(),
        userAddress: IN_KIND_USER,
      })
      .getRequirements();

    await expect(requirements).rejects.toBeInstanceOf(VaultMorphoMismatchError);
  });

  test("error: VaultIsBlueFeeRecipientError", async () => {
    const handle = createMockClient(mainnet);
    mockV1Requirements(handle, {
      allowance: maxUint256,
      blueFeeRecipient: IN_KIND_VAULT,
    });
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
    const requirements = vault
      .inKindRedeem({
        amount: 500n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV1Data(),
        userAddress: IN_KIND_USER,
      })
      .getRequirements();

    await expect(requirements).rejects.toBeInstanceOf(
      VaultIsBlueFeeRecipientError,
    );
  });
});
