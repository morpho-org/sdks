import { getChainAddress } from "@morpho-org/morpho-ts";
import { decodeFunctionData, erc20Abi, maxUint256, parseUnits } from "viem";
import { signTypedData } from "viem/actions";
import { assert, describe, expect } from "vitest";
import { vaultBundlesV1Abi } from "../../../src/abis.js";
import { fetchAccrualVaultV2 } from "../../../src/fetch.js";
import {
  applySignatures,
  buildTransaction,
  buildTransactions,
  getPendingSignatureRequests,
  parseTransactionPlan,
  prepareVaultV2Deposit,
  prepareVaultV2Withdraw,
  serializeTransactionPlan,
} from "../../../src/index.js";
import { KeyrockUsdcVaultV2, Re7UsdtVaultV2 } from "../../fixtures/vaultV2.js";
import { vaultBundlesV1Test as test } from "../../helpers/vaultBundlesV1.js";

describe("TransactionPlan Vault V2 on a pinned mainnet fork", () => {
  test("requires a direct VaultBundlesV1 approval despite an existing Permit2 allowance", async ({
    client,
  }) => {
    const amount = parseUnits("10", 6);
    const permit2 = getChainAddress(client.chain.id, "permit2");
    const spender = getChainAddress(client.chain.id, "bundles.vaultBundlesV1");
    await client.deal({ erc20: KeyrockUsdcVaultV2.asset, amount });
    await client.approve({
      address: KeyrockUsdcVaultV2.asset,
      args: [permit2, maxUint256],
    });
    await client.approve({
      address: KeyrockUsdcVaultV2.asset,
      args: [spender, 0n],
    });
    const allowances = await Promise.all(
      [permit2, spender].map((target) =>
        client.readContract({
          address: KeyrockUsdcVaultV2.asset,
          abi: erc20Abi,
          functionName: "allowance",
          args: [client.account.address, target],
        }),
      ),
    );
    expect(allowances).toEqual([maxUint256, 0n]);

    const plan = await prepareVaultV2Deposit(client, {
      vault: KeyrockUsdcVaultV2.address,
      vaultData: await fetchAccrualVaultV2(KeyrockUsdcVaultV2.address, client),
      chainId: client.chain.id,
      account: client.account.address,
      amount,
      supportSignature: false,
    });
    expect(plan.steps.map(({ id, action }) => [id, action.type])).toEqual([
      ["vaultV2Deposit:approval", "erc20Approval"],
      ["vaultV2Deposit", "vaultV2Deposit"],
    ]);
    expect(plan.steps[0]?.action).toEqual({
      type: "erc20Approval",
      inputs: {
        token: KeyrockUsdcVaultV2.asset,
        spender,
        amount: maxUint256,
        chainId: client.chain.id,
        account: client.account.address,
      },
    });
    expect(plan.signatureRequests).toEqual([]);
  });

  test("deposits with an ERC-2612 permit and withdraws with a share permit through static plans", async ({
    client,
  }) => {
    const amount = parseUnits("10", 6);
    const withdrawal = parseUnits("5", 6);
    await client.deal({ erc20: KeyrockUsdcVaultV2.asset, amount });
    const intent = {
      vault: KeyrockUsdcVaultV2.address,
      chainId: client.chain.id,
      account: client.account.address,
      supportSignature: true,
      calldataOrigin: "0xcafe",
    } as const;

    // Fetch the snapshot, then prepare: USDC supports ERC-2612, so no approval step is needed.
    let depositPlan = await prepareVaultV2Deposit(client, {
      ...intent,
      amount,
      vaultData: await fetchAccrualVaultV2(KeyrockUsdcVaultV2.address, client),
    });
    expect(depositPlan.steps.map(({ id }) => id)).toEqual(["vaultV2Deposit"]);
    expect(
      depositPlan.signatureRequests.map(({ id, kind }) => [id, kind]),
    ).toEqual([["vaultV2Deposit:tokenPermit", "permit"]]);
    expect(depositPlan.signatureRequests[0]).toMatchObject({
      args: { amount },
      typedData: { message: { value: amount } },
    });

    // Sign, verify, then build: the quote was fixed at preparation.
    const depositSignatures = await Promise.all(
      getPendingSignatureRequests(depositPlan).map(
        async ({ id, typedData }) => ({
          id,
          signature: await signTypedData(client, {
            ...typedData,
            account: client.account,
          }),
        }),
      ),
    );
    depositPlan = applySignatures(depositPlan, depositSignatures);
    const transactions = buildTransactions(depositPlan);
    expect(transactions.map(({ action }) => action.type)).toEqual([
      "vaultV2Deposit",
    ]);
    expect(transactions[0]?.data.endsWith("cafe")).toBe(true);
    // A restored plan builds byte-identical transactions.
    expect(
      buildTransactions(
        parseTransactionPlan(serializeTransactionPlan(depositPlan)),
      ),
    ).toEqual(transactions);
    for (const transaction of transactions) {
      const hash = await client.sendTransaction(transaction);
      await client.waitForTransactionReceipt({ hash });
    }

    // Withdrawal preparation derives the share allowance from the snapshot to decide on the share permit.
    let withdrawalPlan = await prepareVaultV2Withdraw(client, {
      ...intent,
      amount: withdrawal,
      vaultData: await fetchAccrualVaultV2(KeyrockUsdcVaultV2.address, client),
    });
    expect(withdrawalPlan.steps.map(({ id }) => id)).toEqual([
      "vaultV2Withdraw",
    ]);
    expect(
      withdrawalPlan.signatureRequests.map(({ id, kind }) => [id, kind]),
    ).toEqual([["vaultV2Withdraw:tokenPermit", "permit"]]);
    expect(withdrawalPlan.signatureRequests[0]).toMatchObject({
      args: { amount: maxUint256 },
      typedData: { message: { value: maxUint256 } },
    });
    const withdrawalSignatures = await Promise.all(
      getPendingSignatureRequests(withdrawalPlan).map(
        async ({ id, typedData }) => ({
          id,
          signature: await signTypedData(client, {
            ...typedData,
            account: client.account,
          }),
        }),
      ),
    );
    withdrawalPlan = applySignatures(withdrawalPlan, withdrawalSignatures);
    for (const transaction of buildTransactions(withdrawalPlan)) {
      const decoded = decodeFunctionData({
        abi: vaultBundlesV1Abi,
        data: transaction.data,
      });
      assert(decoded.functionName === "vaultBundlesV1Withdraw");
      expect(decoded.args[3].value).toBe(maxUint256);
      const hash = await client.sendTransaction(transaction);
      await client.waitForTransactionReceipt({ hash });
    }

    const spender = getChainAddress(client.chain.id, "bundles.vaultBundlesV1");
    expect(
      await client.readContract({
        address: KeyrockUsdcVaultV2.address,
        abi: erc20Abi,
        functionName: "allowance",
        args: [client.account.address, spender],
      }),
    ).toBe(maxUint256);
    const nextWithdrawal = await prepareVaultV2Withdraw(client, {
      ...intent,
      amount: parseUnits("1", 6),
      vaultData: await fetchAccrualVaultV2(KeyrockUsdcVaultV2.address, client),
    });
    expect(nextWithdrawal.signatureRequests).toEqual([]);
    expect(nextWithdrawal.steps.map(({ action }) => action.type)).toEqual([
      "vaultV2Withdraw",
    ]);

    expect(await client.balanceOf({ erc20: KeyrockUsdcVaultV2.asset })).toBe(
      withdrawal,
    );
    expect(
      await client.balanceOf({ erc20: KeyrockUsdcVaultV2.address }),
    ).toBeGreaterThan(0n);
  });

  test("falls back to direct approval for a token without ERC-2612 despite enabled signature support", async ({
    client,
  }) => {
    const intent = {
      vault: Re7UsdtVaultV2.address,
      chainId: client.chain.id,
      account: client.account.address,
      amount: parseUnits("10", 6),
      vaultData: await fetchAccrualVaultV2(Re7UsdtVaultV2.address, client),
    } as const;
    const plan = await prepareVaultV2Deposit(client, {
      ...intent,
      supportSignature: true,
    });
    expect(plan.steps.map(({ id, action }) => [id, action.type])).toEqual([
      ["vaultV2Deposit:approval", "erc20Approval"],
      ["vaultV2Deposit", "vaultV2Deposit"],
    ]);
    expect(plan.signatureRequests).toEqual([]);
    // Both steps build without any signature: the quote is already on the deposit step.
    expect(buildTransaction(plan, plan.steps[0]!).action.type).toBe(
      "erc20Approval",
    );
    expect(buildTransactions(plan).map(({ action }) => action.type)).toEqual([
      "erc20Approval",
      "vaultV2Deposit",
    ]);
  });
});
