import { MathLib } from "@morpho-org/blue-sdk";
import { markets } from "@morpho-org/morpho-test";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  decodeFunctionData,
  encodeFunctionData,
  getAddress,
  parseSignature,
  zeroAddress,
  zeroHash,
} from "viem";
import { signTypedData } from "viem/actions";
import { mainnet } from "viem/chains";
import { assert, describe, expect } from "vitest";
import { blueBundlesV1Abi } from "../../../src/abis.js";
import { blueAbi } from "../../../src/blue/abis.js";
import { fetchAccrualPosition } from "../../../src/blue/fetch.js";
import {
  applySignatures,
  buildTransactions,
  DEFAULT_LLTV_BUFFER,
  getPendingSignatureRequests,
  parseTransactionPlan,
  prepareBlueWithdrawCollateral,
  serializeTransactionPlan,
  WithdrawMakesPositionUnhealthyError,
} from "../../../src/index.js";
import { supplyCollateral } from "../../helpers/blue.js";

const test = createViemTest(mainnet, {
  forkUrl:
    process.env.MAINNET_RPC_URL ??
    getErpcForkUrl(mainnet.id, process.env.ERPC_SECRET),
  forkBlockNumber: 25_832_676n,
  chainId: mainnet.id,
});
const market = markets[mainnet.id].usdc_wbtc;
const collateralAssets = 100_000_000n;
const withdrawal = 10_000_000n;
const spender = getChainAddress(mainnet.id, "bundles.blueBundlesV1");
const morpho = getChainAddress(mainnet.id, "blue");

describe("Blue collateral withdrawal TransactionPlan on mainnet block 25832676", () => {
  for (const mode of ["authorized", "transaction", "signature"] as const) {
    test(`fetch → prepare → sign → build → execute: ${mode}`, async ({
      client,
    }) => {
      await client.setCode({ address: client.account.address, bytecode: "0x" });
      await supplyCollateral({
        client,
        chainId: mainnet.id,
        market,
        collateralAmount: collateralAssets,
      });
      if (mode === "authorized") {
        await client.sendTransaction({
          to: morpho,
          data: encodeFunctionData({
            abi: blueAbi,
            functionName: "borrow",
            args: [
              market,
              1_000_000n,
              0n,
              client.account.address,
              client.account.address,
            ],
          }),
        });
      }
      const authorized = await client.readContract({
        address: morpho,
        abi: blueAbi,
        functionName: "isAuthorized",
        args: [client.account.address, spender],
      });
      if (authorized !== (mode === "authorized")) {
        await client.sendTransaction({
          to: morpho,
          data: encodeFunctionData({
            abi: blueAbi,
            functionName: "setAuthorization",
            args: [spender, mode === "authorized"],
          }),
        });
      }
      // Neither a loan-token nor collateral-token allowance to BlueBundlesV1 is needed.
      for (const token of [market.loanToken, market.collateralToken]) {
        await client.approve({ address: token, args: [spender, 0n] });
      }
      const position = await fetchAccrualPosition(
        client.account.address,
        market.id,
        client,
      );
      if (mode === "authorized") {
        expect(position.borrowShares).toBeGreaterThan(0n);
      }
      const now = (await client.getBlock()).timestamp;
      const balance = await client.balanceOf({ erc20: market.collateralToken });
      const params = {
        chainId: mainnet.id,
        account: client.account.address,
        now,
        marketId: market.id,
        marketData: { chainId: mainnet.id, market: position.market },
        positionData: { chainId: mainnet.id, position },
        collateralAssets: withdrawal,
        supportSignature: mode === "signature",
      };
      let plan = await prepareBlueWithdrawCollateral(client, params);
      expect(plan.steps.map(({ action }) => action.type)).toEqual(
        mode !== "transaction"
          ? ["blueWithdrawCollateral"]
          : ["morphoAuthorization", "blueWithdrawCollateral"],
      );
      expect(plan.signatureRequests.map(({ kind }) => kind)).toEqual(
        mode === "signature" ? ["morphoAuthorization"] : [],
      );
      plan = applySignatures(
        plan,
        await Promise.all(
          getPendingSignatureRequests(plan).map(async ({ id, typedData }) => ({
            id,
            signature: await signTypedData(client, {
              ...typedData,
              account: client.account,
            }),
          })),
        ),
      );
      const transactions = buildTransactions(
        parseTransactionPlan(serializeTransactionPlan(plan)),
      );
      const tx = transactions.at(-1);
      assert(tx);
      const authorization = plan.signatureRequests.find(
        ({ kind }) => kind === "morphoAuthorization",
      );
      expect(tx.to).toBe(spender);
      expect(tx.value).toBe(0n);
      const decoded = decodeFunctionData({
        abi: blueBundlesV1Abi,
        data: tx.data,
      });
      assert(
        decoded.functionName === "blueBundlesV1RepayAndWithdrawCollateral",
      );
      const [
        tuple,
        repayAssets,
        repayShares,
        maxRepayAssets,
        amount,
        maxLtv,
        loanTokenPermit,
        signedAuthorization,
        fee,
        recipient,
        deadline,
      ] = decoded.args;
      expect(loanTokenPermit).toEqual({ kind: 0, data: "0x" });
      expect(tuple).toEqual({
        loanToken: getAddress(market.loanToken),
        collateralToken: getAddress(market.collateralToken),
        oracle: getAddress(market.oracle),
        irm: getAddress(market.irm),
        lltv: market.lltv,
      });
      expect([
        repayAssets,
        repayShares,
        maxRepayAssets,
        amount,
        maxLtv,
        fee,
        recipient,
        deadline,
      ]).toEqual([
        0n,
        0n,
        0n,
        withdrawal,
        market.lltv - DEFAULT_LLTV_BUFFER,
        0n,
        zeroAddress,
        BigInt(plan.expiresAt),
      ]);
      if (mode === "signature") {
        assert(
          authorization?.kind === "morphoAuthorization" &&
            authorization.signature,
        );
        const signature = parseSignature(authorization.signature);
        expect(signedAuthorization).toEqual({
          nonce: authorization.args.nonce,
          deadline: BigInt(plan.expiresAt),
          signature: { r: signature.r, s: signature.s, v: Number(signature.v) },
        });
        expect(authorization.typedData.message).toEqual({
          authorizer: client.account.address,
          authorized: spender,
          isAuthorized: true,
          nonce: authorization.args.nonce,
          deadline: BigInt(plan.expiresAt),
        });
      } else {
        expect(signedAuthorization).toEqual({
          nonce: 0n,
          deadline: 0n,
          signature: { v: 0, r: zeroHash, s: zeroHash },
        });
      }
      for (const transaction of transactions) {
        const hash = await client.sendTransaction(transaction);
        expect((await client.waitForTransactionReceipt({ hash })).status).toBe(
          "success",
        );
      }
      const after = await fetchAccrualPosition(
        client.account.address,
        market.id,
        client,
      );
      expect(after.collateral).toBe(collateralAssets - withdrawal);
      expect(after.borrowShares).toBe(position.borrowShares);
      expect(await client.balanceOf({ erc20: market.collateralToken })).toBe(
        balance + withdrawal,
      );
    });
  }

  test("[INV-03] rejects a withdrawal breaching LLTV minus buffer at preparation", async ({
    client,
  }) => {
    await client.setCode({ address: client.account.address, bytecode: "0x" });
    await supplyCollateral({
      client,
      chainId: mainnet.id,
      market,
      collateralAmount: collateralAssets,
    });
    await client.sendTransaction({
      to: morpho,
      data: encodeFunctionData({
        abi: blueAbi,
        functionName: "borrow",
        args: [
          market,
          1_000_000_000n,
          0n,
          client.account.address,
          client.account.address,
        ],
      }),
    });
    const position = await fetchAccrualPosition(
      client.account.address,
      market.id,
      client,
    );
    const now = (await client.getBlock()).timestamp;
    const accrued = position.accrueInterest(
      MathLib.max(now, position.market.lastUpdate) + 7200n,
    );
    assert(accrued.market.price);
    const remaining = MathLib.mulDivUp(
      accrued.borrowAssets,
      10n ** 54n,
      accrued.market.price * market.lltv,
    );
    const collateralValue = MathLib.mulDivDown(
      remaining,
      accrued.market.price,
      10n ** 36n,
    );
    expect(accrued.borrowAssets).toBeLessThanOrEqual(
      MathLib.wMulDown(collateralValue, market.lltv),
    );
    expect(accrued.borrowAssets).toBeGreaterThan(
      MathLib.wMulDown(collateralValue, market.lltv - DEFAULT_LLTV_BUFFER),
    );
    await expect(
      prepareBlueWithdrawCollateral(client, {
        chainId: mainnet.id,
        account: client.account.address,
        now,
        marketId: market.id,
        marketData: { chainId: mainnet.id, market: position.market },
        positionData: { chainId: mainnet.id, position },
        collateralAssets: collateralAssets - remaining,
      }),
    ).rejects.toBeInstanceOf(WithdrawMakesPositionUnhealthyError);
  });
});
