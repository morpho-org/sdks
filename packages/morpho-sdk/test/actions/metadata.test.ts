import { Time } from "@morpho-org/morpho-ts";
import { parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import { MorphoClient, isRequirementApproval } from "../../src/index.js";
import { KeyrockUsdcVaultV2 } from "../fixtures/vaultV2.js";
import { testInvariants } from "../helpers/invariants.js";
import { test } from "../setup.js";

describe("Metadata", () => {
  test("should create deposit bundle with origin and timestamp metadata", async ({
    client,
  }) => {
    const amount = parseUnits("1000", 6);
    await client.deal({
      erc20: KeyrockUsdcVaultV2.asset,
      amount: amount,
    });

    const {
      vaults: {
        KeyrockUsdcVaultV2: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: {
        vaults: { KeyrockUsdcVaultV2 },
      },
      actionFn: async () => {
        const morpho = new MorphoClient(client, {
          metadata: {
            origin: "25AFEA44",
            timestamp: true,
          },
        });
        const vaultV2 = morpho.vaultV2(KeyrockUsdcVaultV2.address, mainnet.id);
        const accrualVault = await vaultV2.getData();
        const deposit = vaultV2.deposit({
          userAddress: client.account.address,
          amount: amount,
          accrualVault,
        });

        const tx_1 = deposit.buildTx();
        expect(tx_1.data).toContain("25AFEA44");
        const position = tx_1.data.indexOf("25AFEA44");
        expect(position).toBeGreaterThanOrEqual(8);

        const timestampHex = tx_1.data.slice(position - 8, position);
        expect(timestampHex).toMatch(/^[0-9a-fA-F]{8}$/);
        const timestampNumber = Number.parseInt(timestampHex, 16);
        expect(typeof timestampNumber).toBe("number");
        expect(timestampNumber).toBeLessThanOrEqual(Number(Time.timestamp()));

        const requirements = await deposit.getRequirements();

        const approveTx = requirements[0];
        if (!approveTx) {
          throw new Error("Approve transaction not found");
        }
        if (!isRequirementApproval(approveTx)) {
          throw new Error("Approve transaction is not an approval transaction");
        }

        const tx_2 = deposit.buildTx();
        await client.sendTransaction(approveTx);
        await client.sendTransaction(tx_2);
      },
    });

    expect(finalState.userAssetBalance).toEqual(
      initialState.userAssetBalance - amount,
    );
    expect(finalState.morphoAssetBalance).toEqual(
      initialState.morphoAssetBalance + amount,
    );
    expect(finalState.userSharesBalance).toBeGreaterThan(
      initialState.userSharesBalance,
    );
  });

  test("should not generate timestamp metadata if timestamp is not provided", async ({
    client,
  }) => {
    const amount = parseUnits("1000", 6);
    await client.deal({
      erc20: KeyrockUsdcVaultV2.asset,
      amount: amount,
    });

    const {
      vaults: {
        KeyrockUsdcVaultV2: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: {
        vaults: { KeyrockUsdcVaultV2 },
      },
      actionFn: async () => {
        const morpho = new MorphoClient(client, {
          metadata: {
            origin: "25AFEA44",
          },
        });
        const vaultV2 = morpho.vaultV2(KeyrockUsdcVaultV2.address, mainnet.id);
        const accrualVault = await vaultV2.getData();
        const deposit = vaultV2.deposit({
          userAddress: client.account.address,
          amount: amount,
          accrualVault,
        });

        const tx = deposit.buildTx();
        expect(tx.data).toContain("25AFEA44");
        const position = tx.data.indexOf("25AFEA44");
        expect(position).toBeGreaterThanOrEqual(8);

        const timestampHex = tx.data.slice(position - 8, position);
        expect(timestampHex).toBe("00000000");

        const requirements = await deposit.getRequirements();

        const approveTx = requirements[0];
        if (!approveTx) {
          throw new Error("Approve transaction not found");
        }
        if (!isRequirementApproval(approveTx)) {
          throw new Error("Approve transaction is not an approval transaction");
        }

        await client.sendTransaction(approveTx);
        await client.sendTransaction(tx);
      },
    });

    expect(finalState.userAssetBalance).toEqual(
      initialState.userAssetBalance - amount,
    );
    expect(finalState.morphoAssetBalance).toEqual(
      initialState.morphoAssetBalance + amount,
    );
    expect(finalState.userSharesBalance).toBeGreaterThan(
      initialState.userSharesBalance,
    );
  });
});
