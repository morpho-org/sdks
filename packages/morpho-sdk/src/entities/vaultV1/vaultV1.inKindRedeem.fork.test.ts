import { fetchAccrualPosition } from "@morpho-org/blue-sdk-viem";
import { erc20Abi, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import { SteakhouseUsdcVaultV1 } from "../../../test/fixtures/vaultV1.js";
import { deployVaultExitBundlesV1 } from "../../../test/helpers/vaultExitBundlesV1.js";
import { test } from "../../../test/setup.js";
import { isRequirementApproval, morphoViemExtension } from "../../index.js";

describe("InKindRedeem VaultV1", () => {
  test("exits vault shares into Morpho Blue supply positions", async ({
    client,
  }) => {
    await deployVaultExitBundlesV1(client);

    const vault = client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.vaultV1(SteakhouseUsdcVaultV1.address, mainnet.id);
    const vaultData = await vault.getData();
    const amount = parseUnits("1", 6);
    const marketParamsList = [...vaultData.allocations.values()]
      .filter(({ config, position }) => {
        return config.enabled && position.supplyShares > 0n;
      })
      .map(({ position }) => position.market.params);
    const userShares = vaultData.toShares(amount * 2n);

    await client.deal({
      erc20: SteakhouseUsdcVaultV1.address,
      amount: userShares,
    });
    const initialVaultShares = await client.readContract({
      address: SteakhouseUsdcVaultV1.address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [client.account.address],
    });
    const initialSupplyShares = await Promise.all(
      marketParamsList.map(async ({ id }) => {
        return (await fetchAccrualPosition(client.account.address, id, client))
          .supplyShares;
      }),
    );

    const exit = vault.inKindRedeem({
      amount,
      marketParamsList,
      vaultData,
      userAddress: client.account.address,
    });
    const [approval] = await exit.getRequirements();
    if (!isRequirementApproval(approval)) {
      throw new Error("VaultExitBundlesV1 approval requirement not found");
    }
    await client.sendTransaction(approval);
    await client.sendTransaction(exit.buildTx());

    const finalVaultShares = await client.readContract({
      address: SteakhouseUsdcVaultV1.address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [client.account.address],
    });
    const finalSupplyShares = await Promise.all(
      marketParamsList.map(async ({ id }) => {
        return (await fetchAccrualPosition(client.account.address, id, client))
          .supplyShares;
      }),
    );

    expect(finalVaultShares).toBeLessThan(initialVaultShares);
    expect(
      finalSupplyShares.reduce((total, shares) => total + shares, 0n),
    ).toBeGreaterThan(
      initialSupplyShares.reduce((total, shares) => total + shares, 0n),
    );
  });
});
