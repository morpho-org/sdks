import { getChainAddresses, type MarketParams } from "@morpho-org/blue-sdk";
import type { E2eScenario } from "@morpho-org/morpho-test";
import type { AnvilTestClient } from "@morpho-org/test";
import {
  type Address,
  type Chain,
  erc4626Abi,
  maxUint256,
  parseEther,
  zeroHash,
} from "viem";
import { expect } from "vitest";
import { metaMorphoAbi, metaMorphoFactoryAbi } from "../../src/blue/abis.js";
import { isRequirementApproval, morphoViemExtension } from "../../src/index.js";
import { satisfyBlueBundlesV1Requirements } from "../helpers/blueBundlesV1.js";
import { createE2eMarket, describeE2e, wrapE2eNative } from "./setup.js";

const scenario: E2eScenario = {
  name: "vaultV1",
  requires: [
    "blue",
    "adaptiveCurveIrm",
    "metaMorphoFactory",
    "bundles.vaultBundlesV1",
  ],
};

const depositAssets = parseEther("10");

/**
 * Deploys a zero-timelock MetaMorpho vault owned by the test account and supplying into a fresh
 * market. With `seed`, the account also deposits `depositAssets` directly into it.
 */
const setUpVault = async (
  client: AnvilTestClient<Chain>,
  params: { readonly chainId: number; readonly seed: boolean },
) => {
  const market = await createE2eMarket(client, params.chainId);
  const { metaMorphoFactory } = getChainAddresses(params.chainId);
  if (metaMorphoFactory == null)
    throw new Error(`metaMorphoFactory is not registered on ${params.chainId}`);
  const { result: vault, request } = await client.simulateContract({
    address: metaMorphoFactory,
    abi: metaMorphoFactoryAbi,
    functionName: "createMetaMorpho",
    args: [
      client.account.address,
      0n,
      market.loanToken,
      "E2E Vault V1",
      "e2eV1",
      zeroHash,
    ],
  });
  await client.writeContract(request);
  // A zero timelock lets the owner accept the cap in the same block it is submitted.
  await client.writeContract({
    address: vault,
    abi: metaMorphoAbi,
    functionName: "submitCap",
    args: [market, depositAssets * 10n],
  });
  await client.writeContract({
    address: vault,
    abi: metaMorphoAbi,
    functionName: "acceptCap",
    args: [market],
  });
  await client.writeContract({
    address: vault,
    abi: metaMorphoAbi,
    functionName: "setSupplyQueue",
    args: [[market.id]],
  });
  if (params.seed) {
    await wrapE2eNative(client, {
      wNative: market.loanToken,
      amount: depositAssets,
    });
    await client.approve({
      address: market.loanToken,
      args: [vault, maxUint256],
    });
    await client.writeContract({
      address: vault,
      abi: erc4626Abi,
      functionName: "deposit",
      args: [depositAssets, client.account.address],
    });
  }

  return { market, vault };
};

const getState = async (
  client: AnvilTestClient<Chain>,
  params: { readonly vault: Address; readonly market: MarketParams },
) => ({
  userAssets: await client.balanceOf({ erc20: params.market.loanToken }),
  userShares: await client.balanceOf({ erc20: params.vault }),
  totalAssets: await client.readContract({
    address: params.vault,
    abi: erc4626Abi,
    functionName: "totalAssets",
  }),
});

describeE2e(scenario, (test, { chainId }) => {
  test("deposit: approves the market asset and supplies it through the supply queue", async ({
    client,
  }) => {
    const { market, vault } = await setUpVault(client, {
      chainId,
      seed: false,
    });
    await wrapE2eNative(client, {
      wNative: market.loanToken,
      amount: depositAssets,
    });
    const vaultV1 = client
      .extend(morphoViemExtension())
      .morpho.vaultV1(vault, chainId);

    const deposit = vaultV1.deposit({
      amount: depositAssets,
      userAddress: client.account.address,
      vaultData: await vaultV1.getData(),
    });
    const requirements = await deposit.getRequirements();
    expect(requirements.map(isRequirementApproval)).toStrictEqual([true]);
    await satisfyBlueBundlesV1Requirements(client, { requirements });
    const previewedShares = await client.readContract({
      address: vault,
      abi: erc4626Abi,
      functionName: "previewDeposit",
      args: [depositAssets],
    });
    await client.sendTransaction(deposit.buildTx());

    const after = await getState(client, { vault, market });
    expect(after.userAssets).toBe(0n);
    expect(after.totalAssets).toBe(depositAssets);
    expect(after.userShares).toBe(previewedShares);
  });

  test("withdraw: approves vault shares and withdraws assets from the market", async ({
    client,
  }) => {
    const { market, vault } = await setUpVault(client, { chainId, seed: true });
    const assets = parseEther("4");
    const vaultV1 = client
      .extend(morphoViemExtension())
      .morpho.vaultV1(vault, chainId);
    const before = await getState(client, { vault, market });

    const withdraw = vaultV1.withdraw({
      amount: assets,
      userAddress: client.account.address,
      vaultData: await vaultV1.getData(),
    });
    const requirements = await withdraw.getRequirements();
    expect(requirements.map(isRequirementApproval)).toStrictEqual([true]);
    await satisfyBlueBundlesV1Requirements(client, { requirements });
    const previewedShares = await client.readContract({
      address: vault,
      abi: erc4626Abi,
      functionName: "previewWithdraw",
      args: [assets],
    });
    await client.sendTransaction(withdraw.buildTx());

    const after = await getState(client, { vault, market });
    expect(after.userAssets).toBe(before.userAssets + assets);
    expect(after.totalAssets).toBe(before.totalAssets - assets);
    expect(after.userShares).toBe(before.userShares - previewedShares);
  });

  test("redeem: approves vault shares and redeems all of them", async ({
    client,
  }) => {
    const { market, vault } = await setUpVault(client, { chainId, seed: true });
    const vaultV1 = client
      .extend(morphoViemExtension())
      .morpho.vaultV1(vault, chainId);
    const before = await getState(client, { vault, market });

    const redeem = vaultV1.redeem({
      shares: before.userShares,
      userAddress: client.account.address,
    });
    const requirements = await redeem.getRequirements();
    expect(requirements.map(isRequirementApproval)).toStrictEqual([true]);
    await satisfyBlueBundlesV1Requirements(client, { requirements });
    await client.sendTransaction(redeem.buildTx());

    const after = await getState(client, { vault, market });
    expect(after.userShares).toBe(0n);
    expect(after.userAssets).toBe(before.userAssets + depositAssets);
    expect(after.totalAssets).toBe(0n);
  });
});
