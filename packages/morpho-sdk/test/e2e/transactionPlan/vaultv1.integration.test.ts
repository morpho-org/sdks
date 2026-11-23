import { getChainAddress, Time } from "@morpho-org/morpho-ts";
import type { AnvilTestClient } from "@morpho-org/test";
import {
  erc20Abi,
  erc4626Abi,
  maxUint256,
  parseEther,
  parseEventLogs,
  parseUnits,
} from "viem";
import { signTypedData } from "viem/actions";
import { mainnet } from "viem/chains";
import { assert, describe, expect } from "vitest";
import { fetchAccrualVault } from "../../../src/fetch.js";
import {
  applySignatures,
  buildTransactions,
  getPendingSignatureRequests,
  morphoViemExtension,
  parseTransactionPlan,
  prepareVaultV1Deposit,
  prepareVaultV1Withdraw,
  serializeTransactionPlan,
  type TransactionPlan,
} from "../../../src/index.js";
import {
  GauntletWethVaultV1,
  SteakhouseUSDTVaultV1,
  SteakhouseUsdcVaultV1,
} from "../../fixtures/vaultV1.js";
import { testInvariants } from "../../helpers/invariants.js";
import { vaultBundlesV1Test as test } from "../../helpers/vaultBundlesV1.js";

const vaultBundlesV1 = getChainAddress(mainnet.id, "bundles.vaultBundlesV1");

/** Every approval and permit goes straight to VaultBundlesV1; no Permit2 step or request exists. */
function expectNoPermit2(plan: TransactionPlan) {
  for (const { action } of plan.steps) {
    expect(["erc20Approval", "vaultV1Deposit"]).toContain(action.type);
    if (action.type === "erc20Approval") {
      expect(action.inputs.spender).toBe(vaultBundlesV1);
    }
  }
  for (const request of plan.signatureRequests) {
    expect(request.kind).toBe("permit");
    assert(request.kind === "permit");
    expect(request.args.spender).toBe(vaultBundlesV1);
  }
}

async function signPlan(
  client: AnvilTestClient<typeof mainnet>,
  plan: TransactionPlan,
) {
  const signatures = await Promise.all(
    getPendingSignatureRequests(plan).map(async ({ id, typedData }) => ({
      id,
      signature: await signTypedData(client, {
        ...typedData,
        account: client.account,
      }),
    })),
  );
  return applySignatures(plan, signatures);
}

async function send(
  client: AnvilTestClient<typeof mainnet>,
  plan: TransactionPlan,
) {
  for (const transaction of buildTransactions(plan)) {
    const hash = await client.sendTransaction(transaction);
    await client.waitForTransactionReceipt({ hash });
  }
}

describe("TransactionPlan Vault V1 deposit on a pinned mainnet fork", () => {
  test("permit: signs an exact-amount permit, restores the plan and deposits from the parsed copy", async ({
    client,
  }) => {
    const amount = parseUnits("1000", 6);
    await client.deal({ erc20: SteakhouseUsdcVaultV1.asset, amount });
    const {
      vaults: {
        SteakhouseUsdcVaultV1: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: { vaults: { SteakhouseUsdcVaultV1 } },
      actionFn: async () => {
        const plan = await prepareVaultV1Deposit(client, {
          chainId: mainnet.id,
          account: client.account.address,
          assets: amount,
          supportSignature: true,
          calldataOrigin: "0xcafe",
          vault: await fetchAccrualVault(SteakhouseUsdcVaultV1.address, client),
        });
        expectNoPermit2(plan);
        expect(plan.steps.map(({ id }) => id)).toEqual(["vaultV1Deposit"]);
        expect(
          plan.signatureRequests.map(({ id, kind }) => [id, kind]),
        ).toEqual([["vaultV1Deposit:tokenPermit", "permit"]]);
        expect(plan.signatureRequests[0]).toMatchObject({
          args: { amount },
          typedData: { message: { value: amount } },
        });

        const signed = await signPlan(client, plan);
        // Build from the parsed copy only: nothing from preparation or signing is shared.
        const restored = parseTransactionPlan(serializeTransactionPlan(signed));
        const transactions = buildTransactions(restored);
        expect(transactions).toEqual(buildTransactions(signed));
        expect(transactions.map(({ action }) => action.type)).toEqual([
          "vaultV1Deposit",
        ]);
        expect(transactions[0]?.data.endsWith("cafe")).toBe(true);
        await send(client, restored);
      },
    });
    expect(finalState.userAssetBalance).toBe(
      initialState.userAssetBalance - amount,
    );
    expect(finalState.morphoAssetBalance).toBe(
      initialState.morphoAssetBalance + amount,
    );
    expect(finalState.userSharesBalance).toBeGreaterThan(
      initialState.userSharesBalance,
    );
    expect(finalState.userSharesBalanceInAssets).toBe(amount - 1n);
  });

  test("approval: the default approves VaultBundlesV1 for maxUint256 and matches the handle's buildTx", async ({
    client,
  }) => {
    const amount = parseUnits("1000", 6);
    await client.deal({ erc20: SteakhouseUsdcVaultV1.asset, amount });
    const vaultData = await fetchAccrualVault(
      SteakhouseUsdcVaultV1.address,
      client,
    );
    const plan = await prepareVaultV1Deposit(client, {
      chainId: mainnet.id,
      account: client.account.address,
      assets: amount,
      vault: vaultData,
    });
    expectNoPermit2(plan);
    expect(plan.signatureRequests).toEqual([]);
    expect(plan.steps.map(({ id, action }) => [id, action.type])).toEqual([
      ["vaultV1Deposit:approval", "erc20Approval"],
      ["vaultV1Deposit", "vaultV1Deposit"],
    ]);
    expect(plan.steps[0]?.action.inputs).toEqual({
      token: SteakhouseUsdcVaultV1.asset,
      spender: vaultBundlesV1,
      assets: maxUint256,
      chainId: mainnet.id,
      account: client.account.address,
    });

    const handleTx = client
      .extend(morphoViemExtension())
      .morpho.vaultV1(SteakhouseUsdcVaultV1.address, mainnet.id)
      .deposit({
        userAddress: client.account.address,
        amount,
        vaultData,
        deadline: BigInt(plan.expiresAt),
      })
      .buildTx();
    expect(buildTransactions(plan)[1]).toMatchObject({
      to: handleTx.to,
      data: handleTx.data,
      value: handleTx.value,
      action: handleTx.action,
    });

    await send(client, plan);
    expect(await client.balanceOf({ erc20: SteakhouseUsdcVaultV1.asset })).toBe(
      0n,
    );
    expect(
      await client.balanceOf({ erc20: SteakhouseUsdcVaultV1.address }),
    ).toBeGreaterThan(0n);
  });

  test("allowance already enough: no approval step and no signature request", async ({
    client,
  }) => {
    const amount = parseUnits("1000", 6);
    await client.deal({ erc20: SteakhouseUsdcVaultV1.asset, amount });
    await client.approve({
      address: SteakhouseUsdcVaultV1.asset,
      args: [vaultBundlesV1, amount],
    });
    const plan = await prepareVaultV1Deposit(client, {
      chainId: mainnet.id,
      account: client.account.address,
      assets: amount,
      supportSignature: true,
      vault: await fetchAccrualVault(SteakhouseUsdcVaultV1.address, client),
    });
    expect(plan.steps.map(({ id }) => id)).toEqual(["vaultV1Deposit"]);
    expect(plan.signatureRequests).toEqual([]);
    await send(client, plan);
    expect(await client.balanceOf({ erc20: SteakhouseUsdcVaultV1.asset })).toBe(
      0n,
    );
    expect(
      await client.balanceOf({ erc20: SteakhouseUsdcVaultV1.address }),
    ).toBeGreaterThan(0n);
  });

  test("no ERC-2612: signature support falls back to a direct approval", async ({
    client,
  }) => {
    const plan = await prepareVaultV1Deposit(client, {
      chainId: mainnet.id,
      account: client.account.address,
      assets: parseUnits("1000", 6),
      supportSignature: true,
      vault: await fetchAccrualVault(SteakhouseUSDTVaultV1.address, client),
    });
    expectNoPermit2(plan);
    expect(plan.signatureRequests).toEqual([]);
    expect(plan.steps.map(({ action }) => action.type)).toEqual([
      "erc20Approval",
      "vaultV1Deposit",
    ]);
  });

  test("native: wraps ETH into the WETH vault with no prerequisite and matches the handle's buildTx", async ({
    client,
  }) => {
    const amount = parseEther("1");
    const vaultData = await fetchAccrualVault(
      GauntletWethVaultV1.address,
      client,
    );
    const {
      vaults: {
        GauntletWethVaultV1: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: { vaults: { GauntletWethVaultV1 } },
      actionFn: async () => {
        const plan = await prepareVaultV1Deposit(client, {
          chainId: mainnet.id,
          account: client.account.address,
          assets: amount,
          funding: { type: "native" },
          supportSignature: true,
          vault: vaultData,
        });
        expect(plan.steps.map(({ id }) => id)).toEqual(["vaultV1Deposit"]);
        expect(plan.signatureRequests).toEqual([]);
        const handleTx = client
          .extend(morphoViemExtension())
          .morpho.vaultV1(GauntletWethVaultV1.address, mainnet.id)
          .deposit({
            userAddress: client.account.address,
            nativeAmount: amount,
            vaultData,
            deadline: BigInt(plan.expiresAt),
          })
          .buildTx();
        expect(buildTransactions(plan)[0]).toMatchObject({
          to: handleTx.to,
          data: handleTx.data,
          value: amount,
          action: handleTx.action,
        });
        await send(client, plan);
      },
    });
    expect(finalState.morphoAssetBalance).toBe(
      initialState.morphoAssetBalance + amount,
    );
    expect(finalState.userSharesBalance).toBeGreaterThan(
      initialState.userSharesBalance,
    );
  });
});

describe("TransactionPlan Vault V1 on a pinned mainnet fork", () => {
  for (const mode of ["allowed", "approval", "permit"] as const) {
    test(`withdraws with ${mode} share authorization and matches the lazy handle`, async ({
      client,
    }) => {
      const shares = parseUnits("1000", 18);
      const amount = parseUnits("5", 6);
      const spender = getChainAddress(
        client.chain.id,
        "bundles.vaultBundlesV1",
      );
      await client.deal({
        erc20: SteakhouseUsdcVaultV1.address,
        amount: shares,
      });
      const initialAssets = await client.balanceOf({
        erc20: SteakhouseUsdcVaultV1.asset,
      });
      const hash = await client.writeContract({
        address: SteakhouseUsdcVaultV1.address,
        abi: erc20Abi,
        functionName: "approve",
        args: [spender, mode === "allowed" ? maxUint256 : 0n],
      });
      await client.waitForTransactionReceipt({ hash });
      const vaultData = await fetchAccrualVault(
        SteakhouseUsdcVaultV1.address,
        client,
      );
      const expiresAt = Number(Time.timestamp() + 7200n);
      let plan = await prepareVaultV1Withdraw(client, {
        vault: vaultData,
        assets: amount,
        chainId: client.chain.id,
        account: client.account.address,
        expiresAt,
        supportSignature: mode !== "approval",
      });
      expect(plan.steps.map(({ action }) => action.type)).toEqual(
        mode === "approval"
          ? ["erc20Approval", "vaultV1Withdraw"]
          : ["vaultV1Withdraw"],
      );
      expect(plan.signatureRequests.map(({ kind }) => kind)).toEqual(
        mode === "permit" ? ["permit"] : [],
      );
      if (mode === "approval") {
        expect(plan.steps[0]?.action).toMatchObject({
          inputs: {
            token: SteakhouseUsdcVaultV1.address,
            spender,
            shares: maxUint256,
          },
        });
      }
      if (mode === "permit") {
        expect(plan.signatureRequests[0]).toMatchObject({
          args: { amount: maxUint256 },
          typedData: { message: { value: maxUint256 } },
        });
      }
      const signatures = await Promise.all(
        getPendingSignatureRequests(plan).map(async ({ id, typedData }) => ({
          id,
          signature: await signTypedData(client, {
            ...typedData,
            account: client.account,
          }),
        })),
      );
      plan = applySignatures(plan, signatures);
      const restored = parseTransactionPlan(serializeTransactionPlan(plan));
      const transactions = buildTransactions(restored);
      expect(transactions).toEqual(buildTransactions(plan));
      const fresh = client.extend(
        morphoViemExtension({ supportSignature: true }),
      );
      const firstRequest = restored.signatureRequests[0];
      const request =
        firstRequest?.kind === "permit" ? firstRequest : undefined;
      expect(request).toBe(firstRequest);
      const expected = fresh.morpho
        .vaultV1(SteakhouseUsdcVaultV1.address, client.chain.id)
        .withdraw({
          vaultData,
          amount,
          userAddress: client.account.address,
          deadline: BigInt(expiresAt),
        })
        .buildTx(
          request
            ? [
                {
                  action: {
                    type: "permit",
                    args: request.args,
                    typedData: request.typedData,
                  },
                  args: {
                    ...request.args,
                    owner: client.account.address,
                    asset: SteakhouseUsdcVaultV1.address,
                    signature: request.signature!,
                  },
                },
              ]
            : [],
        );
      expect(transactions.at(-1)?.to).toBe(expected.to);
      expect(transactions.at(-1)?.data).toBe(expected.data);
      let burnedShares = 0n;
      for (const transaction of transactions) {
        expect(transaction).not.toHaveProperty("id");
        expect(transaction).not.toHaveProperty("kind");
        const txHash = await client.sendTransaction(transaction);
        const receipt = await client.waitForTransactionReceipt({
          hash: txHash,
        });
        expect(receipt.status).toBe("success");
        if (transaction.action.type === "vaultV1Withdraw") {
          const [withdrawal] = parseEventLogs({
            abi: erc4626Abi,
            eventName: "Withdraw",
            logs: receipt.logs.filter(
              (log) =>
                log.address.toLowerCase() ===
                SteakhouseUsdcVaultV1.address.toLowerCase(),
            ),
          });
          expect(withdrawal?.args.assets).toBe(amount);
          expect(withdrawal?.args.owner).toBe(client.account.address);
          burnedShares = withdrawal!.args.shares;
        }
      }
      expect(burnedShares).toBeGreaterThan(0n);
      expect(
        await client.balanceOf({ erc20: SteakhouseUsdcVaultV1.asset }),
      ).toBe(initialAssets + amount);
      expect(
        await client.balanceOf({ erc20: SteakhouseUsdcVaultV1.address }),
      ).toBe(shares - burnedShares);
    });
  }
});
