import { AccrualVaultV2MorphoMarketV1AdapterV2 } from "@morpho-org/blue-sdk";
import { Time } from "@morpho-org/morpho-ts";
import type { AnvilTestClient } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  BaseError,
  decodeErrorResult,
  erc20Abi,
  isHex,
  parseEventLogs,
  parseUnits,
  RpcRequestError,
  zeroAddress,
} from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import { vaultExitBundlesV1Abi } from "../../../src/abis.js";
import {
  computeVaultV2ForceWithdrawFeeSharesMinted,
  isRequirementApproval,
  isRequirementSignature,
  morphoViemExtension,
  previewVaultV2ForceWithdraw,
  VaultV2ForceWithdrawCoverageError,
  VaultV2ForceWithdrawFeeSharesExceedBurnError,
  vaultV2ForceWithdraw,
} from "../../../src/index.js";
import { CbbtcUsdcBlue, WbtcUsdcSourceMarket } from "../../fixtures/blue.js";
import { withChainTimestamp } from "../../helpers/time.js";
import { setUpSingleAdapterVaultV2 } from "../../helpers/vaultV2.js";

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const ONE_PERCENT = parseUnits("0.01", 18);
const TEN_PERCENT = parseUnits("0.1", 18);
/** Vault V2 rejects a `forceDeallocatePenalty` above 2%. */
const MAX_FORCE_DEALLOCATE_PENALTY = parseUnits("0.02", 18);
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
    // The approved amount is the SDK's derived upper bound on the burn, and it is the only
    // authorization the exit gets. A real burn above it would mean the bound under-counts what the
    // contract actually takes from the user's position.
    const sharesBurnt = initial.shares - final.shares;
    expect(sharesBurnt).toBeGreaterThan(0n);
    expect(sharesBurnt).toBeLessThanOrEqual(approval.action.args.amount);
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
        forceDeallocatePenalty: MAX_FORCE_DEALLOCATE_PENALTY,
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
    // `0x…dEaD` is a public burn address, so only the delta is this test's to assert.
    const initialRecipientAssets = await client.readContract({
      address: USDC,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [referralFeeRecipient],
    });
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
    const finalRecipientAssets = await client.readContract({
      address: USDC,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [referralFeeRecipient],
    });
    expect(finalRecipientAssets - initialRecipientAssets).toBe(
      preview.referralFeeAssets,
    );
  });

  test("behavior: a fee-recipient exit stays faithful to the on-chain fee mint", async ({
    client,
  }) => {
    const requestedExitAssets = parseUnits("900", 6);
    const managementFee = parseUnits("4", 16) / Time.s.from.y(1n);
    const { vault: vaultAddress, depositAndAllocate } =
      await setUpSingleAdapterVaultV2(client, {
        asset: USDC,
        markets: setupMarkets,
        forceDeallocatePenalty: ONE_PERCENT,
        managementFee,
      });
    await depositAndAllocate({
      assets: parseUnits("1000", 6),
      perMarket: [
        { market: CbbtcUsdcBlue, assets: parseUnits("600", 6) },
        { market: WbtcUsdcSourceMarket, assets: parseUnits("400", 6) },
      ],
    });

    await client.setNextBlockTimestamp({
      timestamp: (await client.timestamp()) + Time.s.from.d(30n),
    });
    await client.mine({ blocks: 1 });

    const vault = client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.vaultV2(vaultAddress, mainnet.id);
    const vaultData = await vault.getData();
    const now = (await client.timestamp()) + 60n;
    const deadline = now + 3_600n;
    const exit = withChainTimestamp(now, () =>
      vault.forceWithdraw({
        exitAssets: requestedExitAssets,
        vaultData,
        userAddress: client.account.address,
        deadline,
      }),
    );
    const preview = previewVaultV2ForceWithdraw(vaultData, {
      requestedExitAssets,
      timestamp: now,
      userAddress: client.account.address,
      feeProjectionTimestamp: deadline,
    });
    if (preview == null) throw new Error("Expected an exitable vault");
    const feeSharesNow = computeVaultV2ForceWithdrawFeeSharesMinted({
      vaultData,
      owner: client.account.address,
      timestamp: now,
    });
    expect(feeSharesNow).toBeGreaterThan(0n);

    const initial = await balances(client, vaultAddress);
    const [approval] = await withChainTimestamp(now, () =>
      exit.getRequirements(),
    );
    if (!isRequirementApproval(approval)) {
      throw new Error("VaultExitBundlesV1 approval requirement not found");
    }
    await client.sendTransaction(approval);
    await client.setNextBlockTimestamp({ timestamp: now });
    const receipt = await client.waitForTransactionReceipt({
      hash: await client.sendTransaction(exit.buildTx()),
    });

    const transfers = parseEventLogs({
      abi: erc20Abi,
      eventName: "Transfer",
      logs: receipt.logs.filter(
        (log) => log.address.toLowerCase() === vaultAddress.toLowerCase(),
      ),
    });
    const minted = transfers
      .filter(
        ({ args }) =>
          args.from === zeroAddress &&
          args.to.toLowerCase() === client.account.address.toLowerCase(),
      )
      .reduce((total, { args }) => total + args.value, 0n);
    const grossBurnt = transfers
      .filter(
        ({ args }) =>
          args.from.toLowerCase() === client.account.address.toLowerCase() &&
          args.to === zeroAddress,
      )
      .reduce((total, { args }) => total + args.value, 0n);

    const final = await balances(client, vaultAddress);
    expect(minted).toBe(feeSharesNow);
    const measured = initial.shares - final.shares;
    expect(measured).toBe(grossBurnt - minted);
    expect(measured).toBeGreaterThan(0n);
    expect(final.assets - initial.assets).toBe(preview.netAssets);
    expect(grossBurnt).toBeLessThanOrEqual(approval.action.args.amount);
    expect((preview.netAssets * 10n ** 27n) / measured).toBeGreaterThanOrEqual(
      exit.buildTx().action.args.minSharePriceE27,
    );
  });

  test("error: VaultV2ForceWithdrawFeeSharesExceedBurnError when the fee mint reaches the burn bound", async ({
    client,
  }) => {
    const requestedExitAssets = parseUnits("1", 6);
    const managementFee = parseUnits("4", 16) / Time.s.from.y(1n);
    const { vault: vaultAddress, depositAndAllocate } =
      await setUpSingleAdapterVaultV2(client, {
        asset: USDC,
        markets: setupMarkets,
        forceDeallocatePenalty: ONE_PERCENT,
        managementFee,
      });
    await depositAndAllocate({
      assets: parseUnits("1000", 6),
      perMarket: [
        { market: CbbtcUsdcBlue, assets: parseUnits("600", 6) },
        { market: WbtcUsdcSourceMarket, assets: parseUnits("400", 6) },
      ],
    });

    await client.setNextBlockTimestamp({
      timestamp: (await client.timestamp()) + Time.s.from.d(30n),
    });
    await client.mine({ blocks: 1 });

    const vault = client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.vaultV2(vaultAddress, mainnet.id);
    const vaultData = await vault.getData();
    const now = (await client.timestamp()) + 60n;
    const deadline = now + 3_600n;
    const preview = previewVaultV2ForceWithdraw(vaultData, {
      requestedExitAssets,
      timestamp: now,
      userAddress: client.account.address,
    });
    const nonRecipientPreview = previewVaultV2ForceWithdraw(vaultData, {
      requestedExitAssets,
      timestamp: now,
    });
    // Without the guard, the contract would measure `sharesBefore - balanceAfter` as zero or underflow.
    expect(preview).toBeUndefined();
    expect(nonRecipientPreview).toBeDefined();
    expect(() =>
      withChainTimestamp(now, () =>
        vault.forceWithdraw({
          exitAssets: requestedExitAssets,
          vaultData,
          userAddress: client.account.address,
          deadline,
        }),
      ),
    ).toThrow(VaultV2ForceWithdrawFeeSharesExceedBurnError);
  });

  test("behavior: the derived minSharePriceE27 does not reject a faithful exit", async ({
    client,
  }) => {
    const { vault: vaultAddress, depositAndAllocate } =
      await setUpSingleAdapterVaultV2(client, {
        asset: USDC,
        markets: setupMarkets,
        forceDeallocatePenalty: MAX_FORCE_DEALLOCATE_PENALTY,
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
    const thrown = await client
      .sendTransaction(
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
      )
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    // A bare rejection is also satisfied by a missing allowance, an expired deadline, or a wrong
    // ABI slot, so the revert payload is decoded back to VaultExitBundlesV1's own error set: this
    // is the only on-chain proof that the derived bound is what stops the exit.
    if (!(thrown instanceof BaseError)) {
      throw new Error(`Expected a reverting exit, got: ${String(thrown)}`);
    }
    const revert = thrown.walk((error) => error instanceof RpcRequestError);
    if (!(revert instanceof RpcRequestError) || !isHex(revert.data)) {
      throw new Error(`Expected revert data, got: ${thrown.shortMessage}`);
    }
    expect(
      decodeErrorResult({ abi: vaultExitBundlesV1Abi, data: revert.data })
        .errorName,
    ).toBe("SlippageExceeded");
  });

  test("error: VaultV2ForceWithdrawCoverageError when the markets cannot cover the exit", async ({
    client,
  }) => {
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
    // The matching on-chain `0x32` panic is deliberately not asserted here: an `exitAssets` above
    // the user's whole position reverts on shares/allowance long before the contract's unbounded
    // deallocation loop can overrun, and no fork assertion can tell the two failures apart.
  });
});
