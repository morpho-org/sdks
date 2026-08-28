import { AccrualVaultV2MorphoMarketV1AdapterV2 } from "@morpho-org/blue-sdk";
import { vaultV2Abi } from "@morpho-org/blue-sdk-viem";
import type { AnvilTestClient } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import { type Address, erc20Abi, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import {
  isRequirementApproval,
  isRequirementSignature,
  morphoViemExtension,
  previewVaultV2ForceWithdraw,
  VaultV2ForceWithdrawCoverageError,
  vaultV2ForceWithdraw,
} from "../../../src/index.js";
import { CbbtcUsdcBlue, WbtcUsdcSourceMarket } from "../../fixtures/blue.js";
import { withChainTimestamp } from "../../helpers/time.js";
import { setUpSingleAdapterVaultV2 } from "../../helpers/vaultV2.js";

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const ONE_PERCENT = parseUnits("0.01", 18);
const TEN_PERCENT = parseUnits("0.1", 18);
const setupMarkets = [CbbtcUsdcBlue, WbtcUsdcSourceMarket] as const;

// VaultExitBundlesV1 is deployed at this block. Keep the newer fork local so the shared fork stays
// pinned to the historical state the rest of the Morpho SDK integration suite expects.
const test = createViemTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL,
  chainId: mainnet.id,
  forkBlockNumber: 25_720_868n,
});

const balances = async (client: AnvilTestClient, vault: Address) => {
  const [shares, assets] = await Promise.all([
    client.readContract({
      address: vault,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [client.account.address],
    }),
    client.readContract({
      address: USDC,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [client.account.address],
    }),
  ]);

  return { shares, assets };
};

describe("MorphoVaultV2.forceWithdraw integration", () => {
  test("delivers the penalty-adjusted assets across two markets", async ({
    client,
  }) => {
    const {
      vault: vaultAddress,
      adapter,
      depositAndAllocate,
    } = await setUpSingleAdapterVaultV2(client, {
      asset: USDC,
      markets: setupMarkets,
      forceDeallocatePenalty: ONE_PERCENT,
    });
    const deposit = parseUnits("1000", 6);
    await depositAndAllocate({
      assets: deposit,
      perMarket: [
        { market: CbbtcUsdcBlue, assets: parseUnits("600", 6) },
        { market: WbtcUsdcSourceMarket, assets: parseUnits("400", 6) },
      ],
    });

    const vault = client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.vaultV2(vaultAddress, mainnet.id);
    const vaultData = await vault.getData();
    expect(vaultData.forceDeallocatePenalties[adapter]).toBe(ONE_PERCENT);
    expect(vaultData.assetBalance).toBe(0n);

    const exitAssets = parseUnits("900", 6);
    const preview = previewVaultV2ForceWithdraw(vaultData, {
      requestedExitAssets: exitAssets,
      timestamp: await client.timestamp(),
    });
    if (preview == null) throw new Error("Expected an exitable vault");
    // The penalty is charged on the deallocated leg, so the payout is below `exitAssets`.
    expect(preview.exitAssets).toBe(exitAssets);
    expect(preview.netAssets).toBeLessThan(exitAssets);
    expect(preview.assetsToWithdraw).toBe(0n);

    const initial = await balances(client, vaultAddress);
    const exit = withChainTimestamp(await client.timestamp(), () =>
      vault.forceWithdraw({
        exitAssets,
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

    const final = await balances(client, vaultAddress);
    expect(final.assets - initial.assets).toBe(preview.netAssets);
    expect(final.shares).toBeLessThan(initial.shares);
    // Nothing is left stranded in the periphery.
    await expect(
      client.readContract({
        address: USDC,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [exit.buildTx().to],
      }),
    ).resolves.toBe(0n);
  });

  test("behavior: pays no penalty on idle and liquidity-adapter assets", async ({
    client,
  }) => {
    const { vault: vaultAddress, depositAndAllocate } =
      await setUpSingleAdapterVaultV2(client, {
        asset: USDC,
        markets: setupMarkets,
        forceDeallocatePenalty: TEN_PERCENT,
        liquidityMarket: CbbtcUsdcBlue,
      });
    const deposit = parseUnits("1000", 6);
    await depositAndAllocate({
      assets: deposit,
      perMarket: [{ market: CbbtcUsdcBlue, assets: parseUnits("600", 6) }],
    });

    const vault = client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.vaultV2(vaultAddress, mainnet.id);
    const vaultData = await vault.getData();
    // 400 idle plus the liquidity market's 600, all reachable without a penalty.
    expect(vaultData.assetBalance).toBe(parseUnits("400", 6));

    const exitAssets = parseUnits("900", 6);
    const preview = previewVaultV2ForceWithdraw(vaultData, {
      requestedExitAssets: exitAssets,
      timestamp: await client.timestamp(),
    });
    if (preview == null) throw new Error("Expected an exitable vault");
    expect(preview.assetsToWithdraw).toBe(exitAssets);
    expect(preview.penaltyAssets).toBe(0n);
    expect(preview.netAssets).toBe(exitAssets);

    const initial = await balances(client, vaultAddress);
    const exit = withChainTimestamp(await client.timestamp(), () =>
      vault.forceWithdraw({
        exitAssets,
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

    const final = await balances(client, vaultAddress);
    expect(final.assets - initial.assets).toBe(exitAssets);
  });

  test("behavior: accepts the two-field-domain permit end to end", async ({
    client,
  }) => {
    // Clear the test account's mainnet EIP-7702 delegation so permit validation uses ECDSA.
    await client.setCode({ address: client.account.address, bytecode: "0x" });
    const { vault: vaultAddress, depositAndAllocate } =
      await setUpSingleAdapterVaultV2(client, {
        asset: USDC,
        markets: setupMarkets,
        forceDeallocatePenalty: ONE_PERCENT,
      });
    const deposit = parseUnits("500", 6);
    await depositAndAllocate({
      assets: deposit,
      perMarket: [{ market: CbbtcUsdcBlue, assets: deposit }],
    });

    const vault = client
      .extend(morphoViemExtension({ supportSignature: true }))
      .morpho.vaultV2(vaultAddress, mainnet.id);
    const vaultData = await vault.getData();
    const exitAssets = parseUnits("400", 6);
    const preview = previewVaultV2ForceWithdraw(vaultData, {
      requestedExitAssets: exitAssets,
      timestamp: await client.timestamp(),
    });
    if (preview == null) throw new Error("Expected an exitable vault");

    const initial = await balances(client, vaultAddress);
    const exit = withChainTimestamp(await client.timestamp(), () =>
      vault.forceWithdraw({
        exitAssets,
        vaultData,
        userAddress: client.account.address,
      }),
    );
    const [permitRequirement] = await withChainTimestamp(
      await client.timestamp(),
      () => exit.getRequirements(),
    );
    if (!isRequirementSignature(permitRequirement)) {
      throw new Error("Vault V2 shares permit requirement not found");
    }
    const permit = await permitRequirement.sign(client, client.account.address);
    await client.sendTransaction(exit.buildTx([permit]));

    const final = await balances(client, vaultAddress);
    expect(final.assets - initial.assets).toBe(preview.netAssets);
  });

  test("behavior: routes the referral fee to its recipient", async ({
    client,
  }) => {
    const referralFeeRecipient =
      "0x000000000000000000000000000000000000dEaD" as const;
    const { vault: vaultAddress, depositAndAllocate } =
      await setUpSingleAdapterVaultV2(client, {
        asset: USDC,
        markets: setupMarkets,
        forceDeallocatePenalty: ONE_PERCENT,
      });
    const deposit = parseUnits("500", 6);
    await depositAndAllocate({
      assets: deposit,
      perMarket: [{ market: CbbtcUsdcBlue, assets: deposit }],
    });

    const vault = client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.vaultV2(vaultAddress, mainnet.id);
    const vaultData = await vault.getData();
    const exitAssets = parseUnits("400", 6);
    const preview = previewVaultV2ForceWithdraw(vaultData, {
      requestedExitAssets: exitAssets,
      timestamp: await client.timestamp(),
      referralFeePct: TEN_PERCENT,
    });
    if (preview == null) throw new Error("Expected an exitable vault");
    expect(preview.referralFeeAssets).toBeGreaterThan(0n);

    const initial = await balances(client, vaultAddress);
    const exit = withChainTimestamp(await client.timestamp(), () =>
      vault.forceWithdraw({
        exitAssets,
        vaultData,
        userAddress: client.account.address,
        referralFeePct: TEN_PERCENT,
        referralFeeRecipient,
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

    const final = await balances(client, vaultAddress);
    expect(final.assets - initial.assets).toBe(preview.netAssets);
    await expect(
      client.readContract({
        address: USDC,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [referralFeeRecipient],
      }),
    ).resolves.toBe(preview.referralFeeAssets);
  });

  test("behavior: the derived minSharePriceE27 does not reject a faithful exit", async ({
    client,
  }) => {
    const { vault: vaultAddress, depositAndAllocate } =
      await setUpSingleAdapterVaultV2(client, {
        asset: USDC,
        markets: setupMarkets,
        forceDeallocatePenalty: TEN_PERCENT,
      });
    const deposit = parseUnits("500", 6);
    await depositAndAllocate({
      assets: deposit,
      perMarket: [{ market: CbbtcUsdcBlue, assets: deposit }],
    });

    const vault = client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.vaultV2(vaultAddress, mainnet.id);
    const vaultData = await vault.getData();
    // Nearly the whole position, at the largest penalty the protocol allows.
    const exitAssets = parseUnits("495", 6);
    const exit = withChainTimestamp(await client.timestamp(), () =>
      vault.forceWithdraw({
        exitAssets,
        vaultData,
        userAddress: client.account.address,
      }),
    );
    const tx = exit.buildTx();
    expect(tx.action.args.minSharePriceE27).toBeGreaterThan(0n);

    const [approval] = await withChainTimestamp(await client.timestamp(), () =>
      exit.getRequirements(),
    );
    if (!isRequirementApproval(approval)) {
      throw new Error("VaultExitBundlesV1 approval requirement not found");
    }
    await client.sendTransaction(approval);

    await expect(client.sendTransaction(tx)).resolves.toBeDefined();
  });

  test("error: SlippageExceeded when minSharePriceE27 is set above the realized price", async ({
    client,
  }) => {
    const {
      vault: vaultAddress,
      adapter,
      depositAndAllocate,
    } = await setUpSingleAdapterVaultV2(client, {
      asset: USDC,
      markets: setupMarkets,
      forceDeallocatePenalty: ONE_PERCENT,
    });
    const deposit = parseUnits("500", 6);
    await depositAndAllocate({
      assets: deposit,
      perMarket: [{ market: CbbtcUsdcBlue, assets: deposit }],
    });

    const vault = client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.vaultV2(vaultAddress, mainnet.id);
    const vaultData = await vault.getData();
    const exitAssets = parseUnits("400", 6);
    const exit = withChainTimestamp(await client.timestamp(), () =>
      vault.forceWithdraw({
        exitAssets,
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

    // Doubling the bound is unreachable: the realized price cannot exceed the vault share price.
    const derived = exit.buildTx().action.args.minSharePriceE27;
    await expect(
      client.sendTransaction(
        vaultV2ForceWithdraw({
          vault: { chainId: mainnet.id, address: vaultAddress },
          args: {
            adapter,
            exitAssets,
            minSharePriceE27: derived * 2n,
            userAddress: client.account.address,
            deadline: (await client.timestamp()) + 3_600n,
          },
        }),
      ),
    ).rejects.toThrow();
  });

  test("error: VaultV2ForceWithdrawCoverageError instead of an on-chain panic", async ({
    client,
  }) => {
    const {
      vault: vaultAddress,
      adapter,
      depositAndAllocate,
    } = await setUpSingleAdapterVaultV2(client, {
      asset: USDC,
      markets: setupMarkets,
      forceDeallocatePenalty: ONE_PERCENT,
    });
    const deposit = parseUnits("500", 6);
    await depositAndAllocate({
      assets: deposit,
      perMarket: [{ market: CbbtcUsdcBlue, assets: deposit }],
    });

    const vault = client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.vaultV2(vaultAddress, mainnet.id);
    const vaultData = await vault.getData();
    const [accrualAdapter] = vaultData.accrualAdapters;
    if (!(accrualAdapter instanceof AccrualVaultV2MorphoMarketV1AdapterV2)) {
      throw new Error("Expected a MorphoMarketV1AdapterV2 snapshot");
    }

    // Twice the vault's whole position: unreachable however the loop walks the markets.
    const exitAssets = parseUnits("1000", 6);
    expect(() =>
      withChainTimestamp(0n, () =>
        vault.forceWithdraw({
          exitAssets,
          vaultData,
          userAddress: client.account.address,
          deadline: 1n,
        }),
      ),
    ).toThrow(VaultV2ForceWithdrawCoverageError);

    // The same call, forced past the SDK guard, dies on-chain with an undecodable panic.
    await client.approve({
      address: vaultAddress,
      args: [
        vaultV2ForceWithdraw({
          vault: { chainId: mainnet.id, address: vaultAddress },
          args: {
            adapter,
            exitAssets,
            minSharePriceE27: 0n,
            userAddress: client.account.address,
            deadline: (await client.timestamp()) + 3_600n,
          },
        }).to,
        await client.readContract({
          address: vaultAddress,
          abi: vaultV2Abi,
          functionName: "balanceOf",
          args: [client.account.address],
        }),
      ],
    });
    await expect(
      client.sendTransaction(
        vaultV2ForceWithdraw({
          vault: { chainId: mainnet.id, address: vaultAddress },
          args: {
            adapter,
            exitAssets,
            minSharePriceE27: 0n,
            userAddress: client.account.address,
            deadline: (await client.timestamp()) + 3_600n,
          },
        }),
      ),
    ).rejects.toThrow();
  });
});
