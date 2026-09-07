import { AccrualVault, MathLib } from "@morpho-org/blue-sdk";
import {
  type Address,
  createPublicClient,
  decodeFunctionData,
  http,
} from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { SteakhouseUsdcVaultV1 } from "../../../test/fixtures/vaultV1.js";
import { bundler3Abi, generalAdapter1Abi } from "../../abis.js";
import { morphoViemExtension } from "../../client/index.js";
import { ChainIdMismatchError } from "../../types/index.js";

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
      }),
    ).toThrow(ChainIdMismatchError);
    expect(() =>
      vault.redeem({
        shares: 1n,
        userAddress: SteakhouseUsdcVaultV1.address,
      }),
    ).toThrow(ChainIdMismatchError);
  });

  test("migrateToV2 derives the encoded V1 floor from fee-accrued full assets", () => {
    const publicClient = createPublicClient({
      chain: mainnet,
      transport: http("https://rpc.example"),
    });
    const vault = publicClient
      .extend(morphoViemExtension())
      .morpho.vaultV1(SteakhouseUsdcVaultV1.address, mainnet.id);
    const sourceVault = new AccrualVault(
      {
        address: SteakhouseUsdcVaultV1.address,
        name: "Source",
        symbol: "vUSDC",
        decimalsOffset: 0n,
        asset: SteakhouseUsdcVaultV1.asset,
        curator: SteakhouseUsdcVaultV1.address,
        owner: SteakhouseUsdcVaultV1.address,
        guardian: SteakhouseUsdcVaultV1.address,
        fee: 200_000_000_000_000_000n,
        feeRecipient: SteakhouseUsdcVaultV1.address,
        skimRecipient: SteakhouseUsdcVaultV1.address,
        pendingTimelock: { value: 0n, validAt: 0n },
        pendingGuardian: {
          value: SteakhouseUsdcVaultV1.address,
          validAt: 0n,
        },
        pendingOwner: SteakhouseUsdcVaultV1.address,
        timelock: 0n,
        supplyQueue: [],
        totalSupply: 100n,
        totalAssets: 150n,
        lastTotalAssets: 100n,
      },
      [],
    );
    const targetVault = {
      address: "0x1111111111111111111111111111111111111111" as Address,
      asset: SteakhouseUsdcVaultV1.asset,
      lastUpdate: 0n,
      accrueInterest: () => ({ vault: { toShares: () => 1n } }),
    } as never;
    const shares = 100n;
    const accruedSourceVault = sourceVault.accrueInterest();
    const expectedFloor = MathLib.mulDivDown(
      accruedSourceVault.toAssets(shares),
      MathLib.RAY,
      shares,
    );

    const tx = vault
      .migrateToV2({
        userAddress: SteakhouseUsdcVaultV1.address,
        sourceVault,
        targetVault,
        shares,
        slippageTolerance: 0n,
      })
      .buildTx();

    const bundle = decodeFunctionData({ abi: bundler3Abi, data: tx.data });
    if (bundle.functionName !== "multicall") {
      throw new Error("Expected a Bundler3 multicall");
    }
    const redeem = decodeFunctionData({
      abi: generalAdapter1Abi,
      data: bundle.args[0][1]!.data,
    });

    expect(redeem.functionName).toBe("erc4626Redeem");
    expect(redeem.args[2]).toBe(expectedFloor);
    expect(tx.action.args.minSharePriceVaultV1).toBe(expectedFloor);
    expect(expectedFloor).toBeGreaterThan(0n);
    expect(expectedFloor).toBeLessThan(
      MathLib.mulDivDown(sourceVault.toAssets(shares), MathLib.RAY, shares),
    );
  });
});
