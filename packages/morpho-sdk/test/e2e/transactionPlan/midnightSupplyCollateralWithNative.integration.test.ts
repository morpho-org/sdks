import {
  fetchAccrualPosition,
  MarketParams,
  MarketUtils,
  midnightBundlesV2Abi,
} from "@morpho-org/midnight-sdk";
import { wrapE2eNative } from "@morpho-org/morpho-test";
import {
  createE2eMidnightMarket,
  E2E_MIDNIGHT_WALLETS,
} from "@morpho-org/morpho-test/midnight";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { BASE_FORK_BLOCK, getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import { type Chain, decodeFunctionData, erc20Abi, parseEther } from "viem";
import { base } from "viem/chains";
import { assert, expect } from "vitest";
import {
  buildTransactions,
  parseTransactionPlan,
  prepareMidnightSupplyCollateralWithNative,
  serializeTransactionPlan,
} from "../../../src/index.js";

const chain: Chain = base;
const chainId = base.id;
const test = createViemTest(chain, {
  forkUrl:
    process.env.BASE_RPC_URL ??
    getErpcForkUrl(chainId, process.env.ERPC_SECRET),
  forkBlockNumber: BASE_FORK_BLOCK,
  stepsTracing: false,
});
const { A: account } = E2E_MIDNIGHT_WALLETS;
const wNative = getChainAddress(chainId, "wNative");
const bundle = getChainAddress(chainId, "midnightBundlesV2");
const collateralAssets = parseEther("2");

test.for([
  { mode: "fully native", nativeAmount: collateralAssets },
  { mode: "partly wrapped", nativeAmount: collateralAssets / 4n },
] as const)(
  "executes a restored Midnight native collateral supply: $mode",
  { timeout: 120_000 },
  async ({ nativeAmount }, { client }) => {
    const { params } = await createE2eMidnightMarket(client, chainId);
    const market = new MarketParams({
      ...params,
      collateralParams: params.collateralParams.map((collateral) => ({
        ...collateral,
        token: wNative,
      })),
    });
    await client.setBalance({ address: account, value: parseEther("10") });
    if (nativeAmount < collateralAssets) {
      await wrapE2eNative(client, {
        wNative,
        account,
        amount: collateralAssets - nativeAmount,
      });
    }
    const block = await client.getBlock();

    const plan = await prepareMidnightSupplyCollateralWithNative(client, {
      chainId,
      account,
      market,
      collateralIndex: 0n,
      collateralAssets,
      nativeAmount,
      now: block.timestamp,
      expiresAt: Number(block.timestamp + 600n),
    });
    const restored = parseTransactionPlan(serializeTransactionPlan(plan));
    expect(restored.steps.map(({ action }) => action.type)).toEqual([
      "erc20Approval",
      "midnightAuthorization",
      "midnightSupplyCollateralWithNative",
    ]);
    expect(restored.signatureRequests).toEqual([]);
    const transactions = buildTransactions(restored);
    expect(transactions).toEqual(buildTransactions(plan));
    const supply = transactions.at(-1);
    assert(supply);
    expect(supply).toMatchObject({ to: bundle, value: nativeAmount });
    expect(
      decodeFunctionData({ abi: midnightBundlesV2Abi, data: supply.data })
        .functionName,
    ).toBe("midnightBundlesV2CancelAndMake");

    const wNativeBefore = await client.readContract({
      address: wNative,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account],
    });
    for (const tx of transactions) {
      const hash = await client.sendTransaction({
        account: restored.account,
        to: tx.to,
        data: tx.data,
        value: tx.value,
      });
      const receipt = await client.waitForTransactionReceipt({ hash });
      expect(receipt.status).toBe("success");
    }
    const position = await fetchAccrualPosition(client, {
      marketId: MarketUtils.toId(market),
      user: account,
    });
    expect(position.collateral[0]).toBe(collateralAssets);
    expect(position.debt).toBe(0n);
    await expect(
      client.readContract({
        address: wNative,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account],
      }),
    ).resolves.toBe(wNativeBefore - (collateralAssets - nativeAmount));
  },
);
