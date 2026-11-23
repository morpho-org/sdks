import {
  fetchAccrualPosition,
  fetchMarket,
  fetchPosition,
} from "@morpho-org/blue-sdk-viem";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { type AnvilTestClient, getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import { erc20Abi, maxUint256, parseEther, parseUnits } from "viem";
import { signTypedData } from "viem/actions";
import { mainnet } from "viem/chains";
import { assert, describe, expect } from "vitest";
import { blueRepay } from "../src/actions/blue/repay.js";
import {
  applySignatures,
  buildTransactions,
  getPendingSignatureRequests,
  NativeAmountOnNonWNativeAssetError,
  parseTransactionPlan,
  prepareBlueRepay,
  serializeTransactionPlan,
  validateBlueMarketSnapshot,
} from "../src/index.js";
import { getVaultPermit } from "../src/transactionPlan/permit.js";
import { CbbtcUsdcBlue, WstethWethBlue } from "./fixtures/blue.js";
import { borrow, supplyCollateral, supplyLoan } from "./helpers/blue.js";

const test = createViemTest(mainnet, {
  forkUrl:
    process.env.MAINNET_RPC_URL ??
    getErpcForkUrl(mainnet.id, process.env.ERPC_SECRET),
  chainId: mainnet.id,
  forkBlockNumber: 25_832_676n,
}).extend<{ client: AnvilTestClient<typeof mainnet> }>({
  client: async ({ client }, use) => {
    await client.setCode({ address: client.account.address, bytecode: "0x" });
    await use(client);
  },
});

describe("Blue repay TransactionPlan at mainnet block 25832676", () => {
  test.for([
    { mode: "assets", funding: "covered" },
    { mode: "shares", funding: "approval" },
    { mode: "full", funding: "permit" },
    { mode: "full", funding: "native" },
  ] as const)(
    "$mode repayment with $funding funding",
    async ({ mode, funding }, { client }) => {
      const marketParams =
        funding === "native" ? WstethWethBlue : CbbtcUsdcBlue;
      const borrowed =
        funding === "native" ? parseEther("1") : parseUnits("100", 6);
      const collateral =
        funding === "native" ? parseEther("10") : parseUnits("1", 8);
      const chainId = client.chain.id;
      const account = client.account.address;
      await supplyLoan({
        client,
        chainId,
        market: marketParams,
        supplyAmount: borrowed * 10n,
      });
      await supplyCollateral({
        client,
        chainId,
        market: marketParams,
        collateralAmount: collateral,
      });
      await borrow({
        client,
        chainId,
        market: marketParams,
        borrowAmount: borrowed,
      });
      const position = await fetchAccrualPosition(
        account,
        marketParams.id,
        client,
      );
      const market = await fetchMarket(marketParams.id, client);
      validateBlueMarketSnapshot(
        { chainId, market },
        { chainId, marketId: marketParams.id },
      );
      const now = (await client.getBlock()).timestamp;
      const expiresAt = Number(now + 3600n);
      const spender = getChainAddress(chainId, "bundles.blueBundlesV1");
      await client.approve({
        address: marketParams.loanToken,
        args: [spender, funding === "covered" ? maxUint256 : 0n],
      });
      await client.deal({
        erc20: marketParams.loanToken,
        amount: borrowed * 2n,
      });
      const selectedMode =
        mode === "assets"
          ? ({ type: "assets", amount: borrowed / 3n } as const)
          : mode === "shares"
            ? ({ type: "shares", amount: position.borrowShares / 3n } as const)
            : ({ type: "full" } as const);
      let plan = await prepareBlueRepay(client, {
        chainId,
        account,
        marketId: market.id,
        marketData: { chainId, market },
        positionData: { chainId, position },
        now,
        expiresAt,
        mode: selectedMode,
        funding: { type: funding === "native" ? "native" : "erc20" },
        supportSignature: funding === "permit" || funding === "covered",
        deployless: false,
      });
      expect(plan.steps.map(({ action }) => action.type)).toEqual(
        funding === "approval" ? ["erc20Approval", "blueRepay"] : ["blueRepay"],
      );
      expect(plan.signatureRequests.map(({ kind }) => kind)).toEqual(
        funding === "permit" ? ["permit"] : [],
      );
      for (const step of plan.steps) {
        if (step.action.type === "erc20Approval") {
          expect(step.action.inputs).toMatchObject({
            spender,
            assets: maxUint256,
          });
        }
      }
      for (const request of plan.signatureRequests) {
        expect(request.typedData.message?.spender).toBe(spender);
      }
      const pending = getPendingSignatureRequests(plan);
      plan = applySignatures(
        plan,
        await Promise.all(
          pending.map(async ({ id, typedData }) => ({
            id,
            signature: await signTypedData(client, {
              ...typedData,
              account: client.account,
            }),
          })),
        ),
      );
      const restored = parseTransactionPlan(serializeTransactionPlan(plan));
      const transactions = buildTransactions(restored);
      expect(transactions).toEqual(buildTransactions(plan));
      const tx = transactions.at(-1);
      assert(tx?.action.type === "blueRepay");
      const step = restored.steps.at(-1);
      assert(step?.action.type === "blueRepay");
      const permit = getVaultPermit(restored.signatureRequests, {
        id: step.action.signatureRequestIds.tokenPermit,
        asset: marketParams.loanToken,
        owner: account,
      });
      const expectedAssets =
        selectedMode.type === "assets"
          ? selectedMode.amount
          : position
              .accrueInterest(BigInt(expiresAt))
              .market.toBorrowAssets(
                selectedMode.type === "full"
                  ? position.borrowShares
                  : selectedMode.amount,
                "Up",
              );
      const expectedTransaction = blueRepay({
        market: { chainId, marketParams },
        args: {
          userAddress: account,
          repayAssets:
            selectedMode.type === "assets" ? selectedMode.amount : 0n,
          repayShares:
            selectedMode.type === "assets"
              ? 0n
              : selectedMode.type === "full"
                ? maxUint256
                : selectedMode.amount,
          maxRepayAssets: expectedAssets,
          nativeAmount: funding === "native" ? expectedAssets : undefined,
          deadline: BigInt(expiresAt),
          requirementSignature: permit,
        },
      });
      expect(tx.to).toBe(spender);
      expect(tx.data).toBe(expectedTransaction.data);
      expect(tx.value).toBe(expectedTransaction.value);
      if (mode === "full") {
        const expected = position
          .accrueInterest(BigInt(expiresAt))
          .market.toBorrowAssets(position.borrowShares, "Up");
        expect(tx.action.args.maxRepayAssets).toBe(expected);
        const roundedDown = position
          .accrueInterest(BigInt(expiresAt))
          .market.toBorrowAssets(position.borrowShares, "Down");
        expect(expected - roundedDown).toBe(1n);
      }
      const balanceBefore = await client.balanceOf({
        erc20: marketParams.loanToken,
      });
      const nativeBefore = await client.getBalance({ address: account });
      let gasSpent = 0n;
      let executionTimestamp = now;
      for (const transaction of transactions) {
        const hash = await client.sendTransaction(transaction);
        const receipt = await client.waitForTransactionReceipt({ hash });
        expect(receipt.status).toBe("success");
        gasSpent += receipt.gasUsed * receipt.effectiveGasPrice;
        executionTimestamp = (
          await client.getBlock({ blockNumber: receipt.blockNumber })
        ).timestamp;
      }
      const executionMarket =
        position.market.accrueInterest(executionTimestamp);
      const after = await fetchPosition(account, marketParams.id, client);
      const balanceAfter = await client.balanceOf({
        erc20: marketParams.loanToken,
      });
      expect(after.collateral).toBe(position.collateral);
      expect(after.supplyShares).toBe(position.supplyShares);
      if (selectedMode.type === "full") {
        expect(after.borrowShares).toBe(0n);
      } else if (selectedMode.type === "shares") {
        expect(after.borrowShares).toBe(
          position.borrowShares - selectedMode.amount,
        );
      } else {
        expect(after.borrowShares).toBe(
          position.borrowShares -
            executionMarket.toBorrowShares(selectedMode.amount, "Down"),
        );
      }
      const paid =
        selectedMode.type === "assets"
          ? selectedMode.amount
          : executionMarket.toBorrowAssets(
              selectedMode.type === "full"
                ? position.borrowShares
                : selectedMode.amount,
              "Up",
            );
      if (funding === "native") {
        expect(balanceAfter).toBe(balanceBefore);
        expect(
          nativeBefore -
            (await client.getBalance({ address: account })) -
            gasSpent,
        ).toBe(paid);
      } else {
        expect(balanceBefore - balanceAfter).toBe(paid);
      }
      expect(
        await client.balanceOf({
          erc20: marketParams.loanToken,
          owner: spender,
        }),
      ).toBe(0n);
      if (funding === "approval") {
        expect(
          await client.readContract({
            address: marketParams.loanToken,
            abi: erc20Abi,
            functionName: "allowance",
            args: [account, spender],
          }),
        ).toBe(maxUint256 - step.action.inputs.maxRepayAssets);
      }
    },
  );

  test("native funding rejects a non-wNative loan token", async ({
    client,
  }) => {
    await supplyCollateral({
      client,
      chainId: 1,
      market: CbbtcUsdcBlue,
      collateralAmount: parseUnits("1", 8),
    });
    await borrow({
      client,
      chainId: 1,
      market: CbbtcUsdcBlue,
      borrowAmount: 100n,
    });
    const position = await fetchAccrualPosition(
      client.account.address,
      CbbtcUsdcBlue.id,
      client,
    );
    await expect(
      prepareBlueRepay(client, {
        chainId: 1,
        account: client.account.address,
        marketId: CbbtcUsdcBlue.id,
        marketData: { chainId: 1, market: position.market },
        positionData: { chainId: 1, position },
        now: (await client.getBlock()).timestamp,
        mode: { type: "assets", amount: 10n },
        funding: { type: "native" },
      }),
    ).rejects.toBeInstanceOf(NativeAmountOnNonWNativeAssetError);
  });
});
