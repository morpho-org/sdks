import { isHex, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import { MorphoClient, isRequirementSignature } from "../../../src/index.js";
import { KeyrockUsdcVaultV2 } from "../../fixtures/vaultV2.js";
import { testInvariants } from "../../helpers/invariants.js";
import { test } from "../../setup.js";

describe("Permit", () => {
  test("should deposit USDC with permit version 2", async ({ client }) => {
    const amount = parseUnits("10", 6);

    await client.deal({
      erc20: KeyrockUsdcVaultV2.asset,
      amount,
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
        const morpho = new MorphoClient(client, { supportSignature: true });

        const vault = morpho.vaultV2(KeyrockUsdcVaultV2.address, mainnet.id);
        const accrualVault = await vault.getData();
        const deposit = vault.deposit({
          userAddress: client.account.address,
          amount: amount,
          accrualVault,
        });
        const requirements_1 = await deposit.getRequirements({
          useSimplePermit: true,
        });

        if (!isRequirementSignature(requirements_1[0])) {
          throw new Error("Requirement is not a signature requirement");
        }

        const requirementSignature = await requirements_1[0].sign(
          client,
          client.account.address,
        );

        expect(requirementSignature.args.owner).toEqual(client.account.address);
        expect(isHex(requirementSignature.args.signature)).toBe(true);
        expect(requirementSignature.args.signature.length).toBe(132);
        expect(requirementSignature.args.deadline).toBeGreaterThan(
          BigInt(Math.floor(Date.now() / 1000)),
        );

        const tx_1 = deposit.buildTx(requirementSignature);

        await client.sendTransaction(tx_1);
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
