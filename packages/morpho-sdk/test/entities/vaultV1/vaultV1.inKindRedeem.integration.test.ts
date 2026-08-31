import { fetchAccrualPosition } from "@morpho-org/blue-sdk-viem";
import { createViemTest } from "@morpho-org/test/vitest";
import { erc20Abi, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import {
  isRequirementApproval,
  isRequirementSignature,
  morphoViemExtension,
} from "../../../src/index.js";
import { SteakhouseUsdcVaultV1 } from "../../fixtures/vaultV1.js";
import { testInvariants } from "../../helpers/invariants.js";
import { withChainTimestamp } from "../../helpers/time.js";

// VaultExitBundlesV1 is deployed at this block. Keep the newer fork local so the shared fork
// remains pinned to the historical state expected by the existing Morpho SDK integration suite.
const test = createViemTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL,
  chainId: mainnet.id,
  forkBlockNumber: 25_720_868n,
});

describe("MorphoVaultV1.inKindRedeem integration", () => {
  test("exits vault shares into Morpho Blue supply positions", async ({
    client,
  }) => {
    // Clear the test account's mainnet EIP-7702 delegation before exercising the bundle.
    await client.setCode({
      address: client.account.address,
      bytecode: "0x",
    });
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

    const exit = withChainTimestamp(await client.timestamp(), () =>
      vault.inKindRedeem({
        amount,
        marketParamsList,
        vaultData,
        userAddress: client.account.address,
      }),
    );
    const [approval] = await withChainTimestamp(await client.timestamp(), () =>
      exit.getRequirements(),
    );
    if (!isRequirementApproval(approval)) {
      throw new Error("VaultExitBundlesV1 approval requirement not found");
    }
    await client.sendTransaction(approval);
    // Snapshot the exit around the transaction that routes through
    // VaultExitBundlesV1: testInvariants asserts that no bundler or bundle
    // periphery contract strands the vault asset/shares or the underlying market
    // tokens, so its return value is unused here.
    await testInvariants({
      client,
      params: {
        markets: Object.fromEntries(
          marketParamsList.map((params, index) => [`market${index}`, params]),
        ),
        vaults: { SteakhouseUsdcVaultV1 },
      },
      actionFn: async () => {
        await client.sendTransaction(exit.buildTx());
      },
    });

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

  test("accepts a Vault V1 shares permit and exits", async ({ client }) => {
    // Clear the test account's mainnet EIP-7702 delegation so permit validation uses ECDSA.
    await client.setCode({
      address: client.account.address,
      bytecode: "0x",
    });
    const vault = client
      .extend(morphoViemExtension({ supportSignature: true }))
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

    const exit = withChainTimestamp(await client.timestamp(), () =>
      vault.inKindRedeem({
        amount,
        marketParamsList,
        vaultData,
        userAddress: client.account.address,
      }),
    );
    const [permitRequirement] = await withChainTimestamp(
      await client.timestamp(),
      () => exit.getRequirements(),
    );
    if (!isRequirementSignature(permitRequirement)) {
      throw new Error("VaultExitBundlesV1 permit requirement not found");
    }
    const permit = await permitRequirement.sign(client, client.account.address);
    // See the approval-path test: testInvariants asserts the bundle periphery
    // strands nothing across the VaultExitBundlesV1 transaction.
    await testInvariants({
      client,
      params: {
        markets: Object.fromEntries(
          marketParamsList.map((params, index) => [`market${index}`, params]),
        ),
        vaults: { SteakhouseUsdcVaultV1 },
      },
      actionFn: async () => {
        await client.sendTransaction(exit.buildTx([permit]));
      },
    });

    const finalVaultShares = await client.readContract({
      address: SteakhouseUsdcVaultV1.address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [client.account.address],
    });

    expect(finalVaultShares).toBeLessThan(initialVaultShares);
  });
});
