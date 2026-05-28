import { parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import { KeyrockUsdcVaultV2 } from "../../../test/fixtures/vaultV2.js";
import { testInvariants } from "../../../test/helpers/invariants.js";
import { test } from "../../../test/setup.js";
import { MorphoClient } from "../../index.js";

describe("Redeem VaultV2", () => {
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
