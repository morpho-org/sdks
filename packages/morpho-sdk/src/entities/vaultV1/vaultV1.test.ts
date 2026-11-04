import { MathLib } from "@morpho-org/blue-sdk";
import { createMockClient } from "@morpho-org/test/mock";
import { createPublicClient, http, maxUint256 } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  IN_KIND_USER,
  IN_KIND_VAULT,
  inKindVaultV1Data,
  inKindVaultV2Data,
} from "../../../test/fixtures/inKindRedeem.js";
import { SteakhouseUsdcVaultV1 } from "../../../test/fixtures/vaultV1.js";
import { withChainTimestamp } from "../../../test/helpers/time.js";
import { morphoViemExtension } from "../../client/index.js";
import { computeVaultMaxSharePrice } from "../../helpers/index.js";
import {
  ChainIdMismatchError,
  InputExceedsMaxError,
  NegativeInputError,
  ReferralFeePctExceededError,
  ReferralFeeRecipientMissingError,
} from "../../types/index.js";

describe("MorphoVaultV1 chain validation", () => {
  test("getData throws ChainIdMismatchError when client chain differs", async () => {
    const publicClient = createPublicClient({
      chain: mainnet,
      transport: http("https://rpc.example"),
    });
    const vault = publicClient
      .extend(morphoViemExtension())
      .morpho.vaultV1(SteakhouseUsdcVaultV1.address, mainnet.id + 1);

    await expect(vault.getData()).rejects.toThrow(ChainIdMismatchError);
  });

  test("[INV-05] error: ChainIdMismatchError when the RPC reports another chain via eth_chainId", async () => {
    const handle = createMockClient(mainnet);
    handle.request.mockImplementation(async ({ method }) => {
      if (method === "eth_chainId") return "0x2105";
      throw new Error(`unexpected ${method}`);
    });
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV1(SteakhouseUsdcVaultV1.address, mainnet.id);

    await expect(vault.getData()).rejects.toBeInstanceOf(ChainIdMismatchError);
    expect(handle.request.mock.calls.map(([{ method }]) => method)).toEqual([
      "eth_chainId",
    ]);
  });

  test("error: ChainIdMismatchError when the client has no chain", async () => {
    const publicClient = createPublicClient({
      transport: http("https://rpc.example"),
    });
    const vault = publicClient
      .extend(morphoViemExtension())
      .morpho.vaultV1(SteakhouseUsdcVaultV1.address, mainnet.id);

    await expect(vault.getData()).rejects.toThrow(ChainIdMismatchError);
  });

  test("deposit throws ChainIdMismatchError when client chain differs", () => {
    const publicClient = createPublicClient({
      chain: mainnet,
      transport: http("https://rpc.example"),
    });
    const vault = publicClient
      .extend(morphoViemExtension())
      .morpho.vaultV1(SteakhouseUsdcVaultV1.address, mainnet.id + 1);

    expect(() =>
      vault.deposit({
        amount: 1n,
        userAddress: SteakhouseUsdcVaultV1.address,
        vaultData: {} as never,
      }),
    ).toThrow(ChainIdMismatchError);
  });

  test("withdraw and redeem throw ChainIdMismatchError when client chain differs", () => {
    const publicClient = createPublicClient({
      chain: mainnet,
      transport: http("https://rpc.example"),
    });
    const vault = publicClient
      .extend(morphoViemExtension())
      .morpho.vaultV1(SteakhouseUsdcVaultV1.address, mainnet.id + 1);

    expect(() =>
      vault.withdraw({
        amount: 1n,
        userAddress: SteakhouseUsdcVaultV1.address,
        vaultData: {} as never,
      }),
    ).toThrow(ChainIdMismatchError);
    expect(() =>
      vault.redeem({
        shares: 1n,
        userAddress: SteakhouseUsdcVaultV1.address,
      }),
    ).toThrow(ChainIdMismatchError);
  });

  test("deposit builds from a vault snapshot with no dead shares", () => {
    const { client } = createMockClient(mainnet);
    const vault = client
      .extend(morphoViemExtension())
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
    const now = 1_800_000_000n;
    const vaultData = withChainTimestamp(now, () =>
      inKindVaultV1Data({ deadShares: 0n }),
    );

    const tx = withChainTimestamp(now, () =>
      vault.deposit({
        amount: 1n,
        userAddress: IN_KIND_USER,
        vaultData,
        deadline: now + 7_200n,
      }),
    ).buildTx();

    expect(tx).toBeDefined();
  });

  test("migrateToV2 uses the source vault's fee-accrued share price", () => {
    const publicClient = createPublicClient({
      chain: mainnet,
      transport: http("https://rpc.example"),
    });
    const vault = publicClient
      .extend(morphoViemExtension())
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
    const now = 1_800_000_000n;
    const deadline = now + 7_200n;
    const sourceVault = withChainTimestamp(now, () =>
      inKindVaultV1Data({
        fee: MathLib.WAD / 5n,
        lastTotalAssets: 900n,
      }),
    );
    const shares = sourceVault.totalSupply;
    const targetVault = withChainTimestamp(now, () =>
      inKindVaultV2Data({
        address: "0x1111111111111111111111111111111111111111",
        totalSupply: 2_000n,
      }),
    );
    const expectedAssets = sourceVault
      .accrueInterest(now)
      .toAssets(shares, "Down");
    const expectedMaxSharePrice = computeVaultMaxSharePrice({
      vaultData: targetVault,
      deadline,
      assets: expectedAssets,
      slippageTolerance: 0n,
    });

    const tx = withChainTimestamp(now, () =>
      vault.migrateToV2({
        userAddress: IN_KIND_USER,
        sourceVault,
        targetVault,
        shares,
        deadline,
        slippageTolerance: 0n,
      }),
    ).buildTx();

    expect(tx.action.args.maxSharePriceVaultV2).toBe(expectedMaxSharePrice);
    expect(expectedMaxSharePrice).not.toBe(
      computeVaultMaxSharePrice({
        vaultData: targetVault,
        deadline,
        assets: sourceVault.toAssets(shares, "Down"),
        slippageTolerance: 0n,
      }),
    );
    expect(expectedAssets).toBeLessThan(sourceVault.toAssets(shares, "Down"));
  });

  test("migrateToV2 builds from a target snapshot with no dead shares", () => {
    const client = createPublicClient({
      chain: mainnet,
      transport: http("https://rpc.example"),
    }).extend(morphoViemExtension());
    const vault = client.morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
    const now = 1_800_000_000n;
    const sourceVault = withChainTimestamp(now, () => inKindVaultV1Data());
    const targetVault = withChainTimestamp(now, () =>
      inKindVaultV2Data({
        address: "0x1111111111111111111111111111111111111111",
        deadShares: 0n,
      }),
    );

    const tx = withChainTimestamp(now, () =>
      vault.migrateToV2({
        userAddress: IN_KIND_USER,
        sourceVault,
        targetVault,
        shares: sourceVault.totalSupply,
        deadline: now + 7_200n,
      }),
    ).buildTx();

    expect(tx).toBeDefined();
  });

  test.each([
    { input: { deadline: maxUint256 + 1n }, error: InputExceedsMaxError },
    { input: { referralFeePct: -1n }, error: NegativeInputError },
    {
      input: { referralFeePct: MathLib.WAD },
      error: ReferralFeePctExceededError,
    },
    { input: { referralFeePct: 1n }, error: ReferralFeeRecipientMissingError },
  ])(
    "migrateToV2 reports $error.name before building an invalid migration",
    ({ input, error }) => {
      const { client, request } = createMockClient(mainnet);
      const vault = client
        .extend(morphoViemExtension())
        .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
      const now = 1_800_000_000n;
      const sourceVault = withChainTimestamp(now, () => inKindVaultV1Data());
      const targetVault = withChainTimestamp(now, () =>
        inKindVaultV2Data({
          address: "0x1111111111111111111111111111111111111111",
        }),
      );

      expect(() =>
        withChainTimestamp(now, () =>
          vault.migrateToV2({
            userAddress: IN_KIND_USER,
            sourceVault,
            targetVault,
            shares: sourceVault.totalSupply,
            deadline: now + 7_200n,
            ...input,
          }),
        ),
      ).toThrow(error);
      expect(request).not.toHaveBeenCalled();
    },
  );
});
