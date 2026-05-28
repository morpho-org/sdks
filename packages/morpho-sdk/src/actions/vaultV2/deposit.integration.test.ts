import { parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import { KeyrockUsdcVaultV2 } from "../../../test/fixtures/vaultV2.js";
import { testInvariants } from "../../../test/helpers/invariants.js";
import { test } from "../../../test/setup.js";
import { isRequirementApproval, MorphoClient } from "../../index.js";

describe("DepositVaultV2", () => {
  test("should deposit 1K USDC in vaultV2", async ({ client }) => {
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
        const morpho = new MorphoClient(client);
        const vaultV2 = morpho.vaultV2(KeyrockUsdcVaultV2.address, mainnet.id);
        const vaultData = await vaultV2.getData();
        const deposit = vaultV2.deposit({
          userAddress: client.account.address,
          amount: amount,
          vaultData,
        });

        const tx = deposit.buildTx();
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
    expect(finalState.userSharesBalance).toEqual(970421203423413218710n);
  });
});
