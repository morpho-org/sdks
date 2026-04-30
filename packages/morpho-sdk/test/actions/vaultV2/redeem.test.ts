import { parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import { MorphoClient, vaultV2Redeem } from "../../../src/index.js";
import { KeyrockUsdcVaultV2 } from "../../fixtures/vaultV2.js";
import { testInvariants } from "../../helpers/invariants.js";
import { test } from "../../setup.js";

describe("Redeem VaultV2", () => {
  test("should create redeem transaction", async ({ client }) => {
    const morpho = new MorphoClient(client);

    const redeem = morpho
      .vaultV2(KeyrockUsdcVaultV2.address, mainnet.id)
      .redeem({
        userAddress: client.account.address,
        shares: 1000000000000000000n,
      });
    const tx_1 = redeem.buildTx();

    const tx_2 = vaultV2Redeem({
      vault: {
        address: KeyrockUsdcVaultV2.address,
      },
      args: {
        shares: 1000000000000000000n,
        recipient: client.account.address,
        onBehalf: client.account.address,
      },
    });

    expect(redeem).toBeDefined();
    expect(tx_1).toStrictEqual(tx_2);
  });

  test("should redeem 1K USDC in vaultV2", async ({ client }) => {
    const shares = parseUnits("1000", 18);
    await client.deal({
      erc20: KeyrockUsdcVaultV2.address,
      amount: shares,
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
        const redeem = vaultV2.redeem({
          userAddress: client.account.address,
          shares,
        });
        const tx = redeem.buildTx();

        await client.sendTransaction(tx);
      },
    });

    expect(finalState.userSharesBalance).toEqual(
      initialState.userSharesBalance - shares,
    );
    expect(finalState.userAssetBalance).toBeGreaterThan(
      initialState.userAssetBalance,
    );
    expect(finalState.userAssetBalance).toEqual(1030480367n);
    expect(finalState.morphoAssetBalance).toBeLessThan(
      initialState.morphoAssetBalance,
    );
  });
});
