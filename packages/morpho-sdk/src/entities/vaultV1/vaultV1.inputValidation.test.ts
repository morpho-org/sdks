import { getChainAddress } from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import {
  createPublicClient,
  createWalletClient,
  erc20Abi,
  http,
  maxUint256,
} from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test, vi } from "vitest";
import { SteakhouseUsdcVaultV1 } from "../../../test/fixtures/vaultV1.js";
import { morphoViemExtension } from "../../client/index.js";
import {
  BundlesPermitMismatchError,
  type Erc2612RequirementSignature,
  NonPositiveInputError,
} from "../../types/index.js";

describe("MorphoVaultV1 deposit input validation", () => {
  test("error: NonPositiveInputError for zero total assets", () => {
    const client = createPublicClient({
      chain: mainnet,
      transport: http("https://rpc.example"),
    }).extend(morphoViemExtension());
    const vault = client.morpho.vaultV1(
      SteakhouseUsdcVaultV1.address,
      mainnet.id,
    );

    let error: unknown;
    try {
      vault.deposit({
        amount: 0n,
        userAddress: SteakhouseUsdcVaultV1.address,
        vaultData: { address: SteakhouseUsdcVaultV1.address } as never,
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(NonPositiveInputError);
    expect(error).toMatchObject({ field: "amount", value: 0n });
  });

  test("behavior: a connected builder can prepare for a different submitter", () => {
    const builder = "0x0000000000000000000000000000000000000001";
    const submitter = "0x0000000000000000000000000000000000000002";
    const client = createWalletClient({
      account: builder,
      chain: mainnet,
      transport: http("https://rpc.example"),
    }).extend(morphoViemExtension());
    const vault = client.morpho.vaultV1(
      SteakhouseUsdcVaultV1.address,
      mainnet.id,
    );

    const action = vault.deposit({
      amount: 1n,
      userAddress: submitter,
      vaultData: {
        address: SteakhouseUsdcVaultV1.address,
        asset: SteakhouseUsdcVaultV1.asset,
        accrueInterest: () => ({ toShares: () => 1n }),
      } as never,
    });

    expect(action).toBeDefined();
  });
});

describe("MorphoVaultV1 asset exit permit validation", () => {
  const owner = "0x0000000000000000000000000000000000000001" as const;
  const targetVault = "0x0000000000000000000000000000000000000002" as const;
  const spender = getChainAddress(mainnet.id, "bundles.vaultBundlesV1");

  test("error: BundlesPermitMismatchError for a withdrawal permit above the resolved share cap", async () => {
    const handle = createMockClient(mainnet);
    const vault = handle.client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.vaultV1(SteakhouseUsdcVaultV1.address, mainnet.id);
    const vaultData = {
      address: SteakhouseUsdcVaultV1.address,
      asset: SteakhouseUsdcVaultV1.asset,
      toShares: () => 10n,
      accrueInterest: () => ({ toShares: () => 10n }),
    } as never;
    const getData = vi.spyOn(vault, "getData").mockResolvedValue(vaultData);
    mockRead(handle, {
      address: SteakhouseUsdcVaultV1.address,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });
    const withdrawal = vault.withdraw({
      amount: 100n,
      userAddress: owner,
      slippageTolerance: 0n,
      deadline: maxUint256,
    });
    const oversizedPermit = {
      args: {
        owner,
        asset: SteakhouseUsdcVaultV1.address,
        amount: 11n,
        nonce: 0n,
        deadline: maxUint256,
        signature: "0x",
      },
      action: {
        type: "permit",
        args: { spender, amount: 11n, deadline: maxUint256 },
      },
    } satisfies Erc2612RequirementSignature;

    const requirements = await withdrawal.getRequirements();

    expect(await withdrawal.getRequirements()).toBe(requirements);
    expect(getData).toHaveBeenCalledOnce();

    expect(() => withdrawal.buildTx([oversizedPermit])).toThrow(
      BundlesPermitMismatchError,
    );
  });

  test("error: BundlesPermitMismatchError for an asset migration permit above the computed share cap", () => {
    const vault = createMockClient(mainnet)
      .client.extend(morphoViemExtension())
      .morpho.vaultV1(SteakhouseUsdcVaultV1.address, mainnet.id);
    const sourceVault = {
      address: SteakhouseUsdcVaultV1.address,
      asset: SteakhouseUsdcVaultV1.asset,
      toShares: () => 10n,
      accrueInterest: () => ({ toShares: () => 10n }),
    } as never;
    const destinationVault = {
      address: targetVault,
      asset: SteakhouseUsdcVaultV1.asset,
      accrueInterest: () => ({ toShares: () => 100n }),
    } as never;
    const migration = vault.migrateToV2({
      assets: 100n,
      userAddress: owner,
      sourceVault,
      targetVault: destinationVault,
      slippageTolerance: 0n,
      deadline: maxUint256,
    });
    const oversizedPermit = {
      args: {
        owner,
        asset: SteakhouseUsdcVaultV1.address,
        amount: 11n,
        nonce: 0n,
        deadline: maxUint256,
        signature: "0x",
      },
      action: {
        type: "permit",
        args: { spender, amount: 11n, deadline: maxUint256 },
      },
    } satisfies Erc2612RequirementSignature;

    expect(() => migration.buildTx([oversizedPermit])).toThrow(
      BundlesPermitMismatchError,
    );
  });
});
