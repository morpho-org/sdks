import { getChainAddress, Time } from "@morpho-org/morpho-ts";
import { erc20Abi, maxUint256, parseUnits } from "viem";
import { describe, expect } from "vitest";
import { computeVaultV1MigrateToV2Quote } from "../../../src/entities/vaultV1/migrateToV2Quote.js";
import { fetchAccrualVault, fetchAccrualVaultV2 } from "../../../src/fetch.js";
import {
  applySignatures,
  buildTransactions,
  getPendingSignatureRequests,
  parseTransactionPlan,
  prepareVaultV1MigrateToV2,
  serializeTransactionPlan,
  vaultV1MigrateToV2,
} from "../../../src/index.js";
import { getVaultPermit } from "../../../src/transactionPlan/permit.js";
import { SteakhouseUsdcVaultV1 } from "../../fixtures/vaultV1.js";
import { KeyrockUsdcVaultV2 } from "../../fixtures/vaultV2.js";
import { withChainTimestamp } from "../../helpers/time.js";
import { vaultBundlesV1Test as test } from "../../helpers/vaultBundlesV1.js";

describe("TransactionPlan Vault V1 migration on a pinned mainnet fork", () => {
  for (const mode of ["allowance", "approval", "permit"] as const) {
    test(`migrates with ${mode}, matches the action builder and never uses Permit2`, async ({
      client,
    }) => {
      const sourceVault = SteakhouseUsdcVaultV1.address;
      const targetVault = KeyrockUsdcVaultV2.address;
      const spender = getChainAddress(
        client.chain.id,
        "bundles.vaultBundlesV1",
      );
      const shares = parseUnits("1000", 18);
      await client.deal({ erc20: sourceVault, amount: shares });
      if (mode === "allowance") {
        const hash = await client.writeContract({
          address: sourceVault,
          abi: erc20Abi,
          functionName: "approve",
          args: [spender, maxUint256],
        });
        await client.waitForTransactionReceipt({ hash });
      }
      const sourceVaultData = await fetchAccrualVault(sourceVault, client);
      const targetVaultData = await fetchAccrualVaultV2(targetVault, client);
      const timestamp = await client.timestamp();
      const deadline = Time.timestamp() + 7200n;
      const referralFee = {
        bps: 100,
        recipient: "0x0000000000000000000000000000000000000001",
      } as const;
      const slippageTolerance = 20_000_000_000_000_000n;
      const amount =
        mode === "approval" ? { assets: parseUnits("10", 6) } : { shares };
      let plan = await withChainTimestamp(timestamp, () =>
        prepareVaultV1MigrateToV2(client, {
          sourceVault: sourceVaultData,
          targetVault: targetVaultData,
          ...amount,
          chainId: client.chain.id,
          account: client.account.address,
          ...(mode === "permit" && { supportSignature: true }),
          referralFee,
          slippageTolerance,
          expiresAt: Number(deadline),
        }),
      );
      expect(plan.steps.map(({ action }) => action.type)).toEqual(
        mode === "approval"
          ? ["erc20Approval", "vaultV1MigrateToV2"]
          : ["vaultV1MigrateToV2"],
      );
      expect(plan.signatureRequests.map(({ kind }) => kind)).toEqual(
        mode === "permit" ? ["permit"] : [],
      );
      for (const step of plan.steps) {
        if (step.action.type === "erc20Approval") {
          expect(step.action.inputs).toEqual({
            token: sourceVault,
            spender,
            shares: maxUint256,
            chainId: client.chain.id,
            account: client.account.address,
          });
        }
      }
      const signatures = await Promise.all(
        getPendingSignatureRequests(plan).map(async ({ id, typedData }) => ({
          id,
          signature: await client.signTypedData(typedData),
        })),
      );
      plan = applySignatures(plan, signatures);
      const firstRequest = plan.signatureRequests[0];
      const request =
        firstRequest?.kind === "permit" ? firstRequest : undefined;
      expect(request).toBe(firstRequest);
      if (mode === "permit") {
        expect(request?.args.amount).toBe(maxUint256);
      }
      const restored = parseTransactionPlan(serializeTransactionPlan(plan));
      const transactions = buildTransactions(restored);
      expect(transactions).toEqual(buildTransactions(plan));
      const expected = vaultV1MigrateToV2({
        vault: {
          address: sourceVault,
          chainId: client.chain.id,
          asset: sourceVaultData.asset,
        },
        args: {
          ...amount,
          targetVault,
          targetAsset: targetVaultData.asset,
          userAddress: client.account.address,
          deadline,
          referralFeePct: 10_000_000_000_000_000n,
          referralFeeRecipient: referralFee.recipient,
          maxSharePriceVaultV2: computeVaultV1MigrateToV2Quote({
            sourceVault: sourceVaultData,
            targetVault: targetVaultData,
            ...amount,
            referralFeePct: 10_000_000_000_000_000n,
            slippageTolerance,
            deadline,
            now: timestamp,
          }).maxSharePriceVaultV2,
          requirementSignature: getVaultPermit(plan.signatureRequests, {
            id: request?.id,
            asset: sourceVault,
            owner: plan.account,
          }),
        },
      });
      const migration = transactions.at(-1)!;
      expect(migration).not.toHaveProperty("id");
      expect(migration).not.toHaveProperty("kind");
      expect(migration.to).toBe(spender);
      expect(migration.to).toBe(expected.to);
      expect(migration.data).toBe(expected.data);
      const beforeTarget = await client.balanceOf({ erc20: targetVault });
      const beforeAssets = await client.balanceOf({
        erc20: SteakhouseUsdcVaultV1.asset,
      });
      for (const transaction of transactions) {
        const hash = await client.sendTransaction(transaction);
        const receipt = await client.waitForTransactionReceipt({ hash });
        expect(receipt.status).toBe("success");
      }
      const remaining = await client.balanceOf({ erc20: sourceVault });
      expect(remaining).toBeLessThan(shares);
      if (mode !== "approval") {
        expect(remaining).toBe(0n);
      } else {
        expect(remaining).toBeGreaterThan(0n);
      }
      expect(await client.balanceOf({ erc20: targetVault })).toBeGreaterThan(
        beforeTarget,
      );
      expect(
        await client.balanceOf({ erc20: SteakhouseUsdcVaultV1.asset }),
      ).toBe(beforeAssets);
    });
  }
});
