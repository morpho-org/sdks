import { getChainAddresses } from "@morpho-org/blue-sdk";
import { blueAbi, fetchAccrualPosition } from "@morpho-org/blue-sdk-viem";
import { Time } from "@morpho-org/morpho-ts";
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

  test("exits when the caller's clock lags a freshly accrued market", async ({
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
    const amount = parseUnits("1", 6);
    const { morpho } = getChainAddresses(mainnet.id);
    if (morpho == null) {
      throw new Error("Morpho Blue address not found");
    }

    // The clock we will feed the SDK, captured before warping the fork forward.
    const laggingClock = await client.timestamp();
    const marketParamsList = [...(await vault.getData()).allocations.values()]
      .filter(({ config, position }) => {
        return config.enabled && position.supplyShares > 0n;
      })
      .map(({ position }) => position.market.params);

    // Accrue each vault market an hour ahead of `laggingClock` so their `lastUpdate` leads the
    // clock. This reproduces the reported skew: a bare `accrueInterest(now)` throws
    // `InvalidInterestAccrual`, and only the forward clamp lets the handle build and execute.
    await client.setNextBlockTimestamp({
      timestamp: laggingClock + Time.s.from.h(1n),
    });
    for (const params of marketParamsList) {
      await client.writeContract({
        address: morpho,
        abi: blueAbi,
        functionName: "accrueInterest",
        args: [params],
      });
    }

    const vaultData = await vault.getData();
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

    const exit = withChainTimestamp(laggingClock, () =>
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
    await client.sendTransaction(exit.buildTx([permit]));

    const finalVaultShares = await client.readContract({
      address: SteakhouseUsdcVaultV1.address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [client.account.address],
    });

    expect(finalVaultShares).toBeLessThan(initialVaultShares);
  });
});
