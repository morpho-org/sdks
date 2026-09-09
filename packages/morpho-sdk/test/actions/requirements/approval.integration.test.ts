import { getChainAddress } from "@morpho-org/morpho-ts";
import { parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import {
  isRequirementApproval,
  morphoViemExtension,
} from "../../../src/index.js";
import { Re7UsdtVaultV2 } from "../../fixtures/vaultV2.js";
import { testInvariants } from "../../helpers/invariants.js";
import { vaultBundlesV1Test as test } from "../../helpers/vaultBundlesV1.js";

describe("Approval", () => {
  test("should approve once for USDT vaultV2 with allowance 0", async ({
    client,
  }) => {
    const morpho = client.extend(morphoViemExtension()).morpho;

    const amount = parseUnits("1000", 18);
    await client.deal({
      erc20: Re7UsdtVaultV2.asset,
      amount: amount,
    });

    const vaultBundlesV1 = getChainAddress(
      mainnet.id,
      "bundles.vaultBundlesV1",
    );

    await testInvariants({
      client,
      params: {
        vaults: { Re7UsdtVaultV2 },
      },
      actionFn: async () => {
        const vault = morpho.vaultV2(Re7UsdtVaultV2.address, mainnet.id);
        const vaultData = await vault.getData();
        const deposit = vault.deposit({
          userAddress: client.account.address,
          amount: amount,
          vaultData,
        });

        const requirements = await deposit.getRequirements();

        expect(requirements.length).toBe(1);

        if (!isRequirementApproval(requirements[0])) {
          throw new Error("Approve transaction is not an approval transaction");
        }

        expect(requirements[0].action.args.spender).toBe(vaultBundlesV1);
        expect(requirements[0].action.args.amount).toBe(amount);

        await client.sendTransaction(requirements[0]);

        const tx = deposit.buildTx();

        await client.sendTransaction(tx);
      },
    });
  });

  test("should reset approval before approving for USDT flow", async ({
    client,
  }) => {
    const morpho = client.extend(morphoViemExtension()).morpho;

    const amount = parseUnits("1000", 18);
    await client.deal({
      erc20: Re7UsdtVaultV2.asset,
      amount: amount,
    });

    const vaultBundlesV1 = getChainAddress(
      mainnet.id,
      "bundles.vaultBundlesV1",
    );

    await client.approve({
      address: Re7UsdtVaultV2.asset,
      args: [vaultBundlesV1, 1n],
    });

    await testInvariants({
      client,
      params: {
        vaults: { Re7UsdtVaultV2 },
      },
      actionFn: async () => {
        const vault = morpho.vaultV2(Re7UsdtVaultV2.address, mainnet.id);
        const vaultData = await vault.getData();
        const deposit = vault.deposit({
          userAddress: client.account.address,
          amount: amount,
          vaultData,
        });

        const requirements = await deposit.getRequirements();

        expect(requirements.length).toBe(2);

        if (
          !isRequirementApproval(requirements[0]) ||
          !isRequirementApproval(requirements[1])
        ) {
          throw new Error("Approve transaction is not an approval transaction");
        }

        expect(requirements[0].action.args.spender).toBe(vaultBundlesV1);
        expect(requirements[0].action.args.amount).toBe(0n);
        expect(requirements[1].action.args.spender).toBe(vaultBundlesV1);
        expect(requirements[1].action.args.amount).toBe(amount);

        await client.sendTransaction(requirements[0]);
        await client.sendTransaction(requirements[1]);

        const tx = deposit.buildTx();

        await client.sendTransaction(tx);
      },
    });
  });
});
