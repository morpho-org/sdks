import {
  MAX_TICK,
  MarketUtils,
  midnightAbi,
  Offer,
  priceRatifierV1Abi,
  Tree,
} from "@morpho-org/midnight-sdk";
import {
  buildTransactions,
  getPendingSignatureRequests,
} from "@morpho-org/morpho-sdk";
import {
  createE2eMidnightMarket,
  E2E_MIDNIGHT_WALLETS,
  fundE2eMidnightWallets,
} from "@morpho-org/morpho-test/midnight";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { BASE_FORK_BLOCK, getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  type Chain,
  createWalletClient,
  http,
  isAddressEqual,
  maxUint128,
  padHex,
  parseEther,
} from "viem";
import { base } from "viem/chains";
import { assert, expect } from "vitest";
import {
  prepareMidnightLifecycle,
  storeAndBuildMidnightPlan,
} from "../../../examples/midnight-position-lifecycle.js";

const chain: Chain = base;
const chainId = base.id;
const test = createViemTest(chain, {
  forkUrl:
    process.env.BASE_RPC_URL ??
    getErpcForkUrl(chainId, process.env.ERPC_SECRET),
  forkBlockNumber: BASE_FORK_BLOCK,
  stepsTracing: false,
});

test("completes a maker and taker lifecycle using only restored plans", {
  timeout: 120_000,
}, async ({ client }) => {
  const midnight = getChainAddress(chainId, "midnight");
  const ratifier = getChainAddress(chainId, "priceRatifierV1");
  const { A: maker, B: taker } = E2E_MIDNIGHT_WALLETS;
  const wallet = (account: Address) =>
    createWalletClient({
      account,
      chain: base,
      transport: http(client.transport.url),
    });
  const makerClient = wallet(maker);
  const takerClient = wallet(taker);
  const { timestamp: now } = await client.getBlock({
    blockNumber: BASE_FORK_BLOCK,
  });
  const { params: market } = await createE2eMidnightMarket(client, chainId, {
    maturity: (now / 86_400n + 30n) * 86_400n + 54_000n,
  });
  const marketId = MarketUtils.toId(market);
  const collateralToken = MarketUtils.getCollateralByIndex(market, 0n).token;
  const collateralAssets = parseEther("10");
  const units = parseEther("1");
  const maxUnits = 2n * units;
  const group = padHex("0xab", { size: 32 });
  await fundE2eMidnightWallets(client, {
    market,
    wallets: { A: { collateralAssets }, B: { loanAssets: units } },
  });
  const offers = Tree.create({
    type: "priceV1",
    entries: [group, padHex("0xAB", { size: 32 })].map((offerGroup, index) => ({
      offer: Offer.create({
        market,
        maker,
        ratifier,
        group: offerGroup,
        buy: false,
        start: now,
        expiry: now + 1800n + BigInt(index),
        tick: MAX_TICK,
        maxUnits,
      }),
    })),
  });

  const marketAmount = (functionName: "totalUnits" | "withdrawable") =>
    client.readContract({
      address: midnight,
      abi: midnightAbi,
      functionName,
      args: [marketId],
    });
  const debt = () =>
    client.readContract({
      address: midnight,
      abi: midnightAbi,
      functionName: "debt",
      args: [marketId, maker],
    });
  const credit = () =>
    client.readContract({
      address: midnight,
      abi: midnightAbi,
      functionName: "credit",
      args: [marketId, taker],
    });
  const collateral = () =>
    client.readContract({
      address: midnight,
      abi: midnightAbi,
      functionName: "collateral",
      args: [marketId, maker, 0n],
    });
  const consumed = () =>
    client.readContract({
      address: midnight,
      abi: midnightAbi,
      functionName: "consumed",
      args: [maker, group],
    });
  const ratified = () =>
    client.readContract({
      address: ratifier,
      abi: priceRatifierV1Abi,
      functionName: "isRootRatified",
      args: [maker, offers.root],
    });
  const loanBalance = (owner: Address) =>
    client.balanceOf({ erc20: market.loanToken, owner });
  const collateralBalance = () =>
    client.balanceOf({ erc20: collateralToken, owner: maker });
  const makerLoanBefore = await loanBalance(maker);
  const takerLoanBefore = await loanBalance(taker);
  const collateralBefore = await collateralBalance();
  await expect(ratified()).resolves.toBe(false);
  await expect(consumed()).resolves.toBe(0n);
  const storedPlans = new Map<string, string>();
  const operations: string[] = [];
  let { timestamp } = await client.getBlock();

  for await (const plan of prepareMidnightLifecycle({
    maker: makerClient,
    taker: takerClient,
    supply: { chainId, account: maker, market, collateralAssets },
    borrow: { offers, validation: false },
    maxRepayAssets: units,
    lend: {
      account: taker,
      fillUnits: units,
      target: { type: "units", units, maxBuyerAssets: units },
      maxContinuousFee: 0n,
    },
  })) {
    const operation = plan.steps.at(-1)?.action.type;
    assert(operation);
    operations.push(operation);
    const { restored, transactions } = await storeAndBuildMidnightPlan(
      plan,
      async (json) => {
        storedPlans.set(operation, json);
        const saved = storedPlans.get(operation);
        assert(saved);
        return saved;
      },
    );
    expect(restored.steps.map(({ id }) => id)).toEqual(
      plan.steps.map(({ id }) => id),
    );
    expect(restored.signatureRequests).toEqual([]);
    expect(getPendingSignatureRequests(restored)).toEqual([]);
    expect(transactions).toEqual(buildTransactions(plan));
    const sender =
      operation === "midnightTakeLend" || operation === "midnightRedeem"
        ? takerClient
        : makerClient;
    expect(isAddressEqual(restored.account, sender.account.address)).toBe(true);
    expect(restored.chainId).toBe(chainId);
    for (const { to, data, value } of transactions) {
      await client.setNextBlockTimestamp({ timestamp: ++timestamp });
      const hash = await sender.sendTransaction({ to, data, value });
      const receipt = await client.waitForTransactionReceipt({ hash });
      expect(receipt.status).toBe("success");
      expect(isAddressEqual(receipt.from, sender.account.address)).toBe(true);
    }

    switch (operation) {
      case "midnightSupplyCollateral":
        await expect(collateral()).resolves.toBe(collateralAssets);
        await expect(collateralBalance()).resolves.toBe(
          collateralBefore - collateralAssets,
        );
        break;
      case "midnightMakeBorrow":
        await expect(ratified()).resolves.toBe(true);
        await expect(debt()).resolves.toBe(0n);
        break;
      case "midnightTakeLend":
        await expect(consumed()).resolves.toBe(units);
        expect(units).toBeLessThan(maxUnits);
        await expect(marketAmount("totalUnits")).resolves.toBe(units);
        await expect(debt()).resolves.toBe(units);
        await expect(credit()).resolves.toBe(units);
        await expect(loanBalance(maker)).resolves.toBe(makerLoanBefore + units);
        await expect(loanBalance(taker)).resolves.toBe(takerLoanBefore - units);
        break;
      case "midnightCancelOffers":
        await expect(consumed()).resolves.toBe(maxUint128);
        await expect(ratified()).resolves.toBe(true);
        await expect(debt()).resolves.toBe(units);
        break;
      case "midnightRepayWithdrawCollateral":
        await expect(debt()).resolves.toBe(0n);
        await expect(credit()).resolves.toBe(units);
        await expect(marketAmount("withdrawable")).resolves.toBe(units);
        await expect(loanBalance(maker)).resolves.toBe(makerLoanBefore);
        await expect(collateral()).resolves.toBe(0n);
        await expect(collateralBalance()).resolves.toBe(collateralBefore);
        break;
      case "midnightRedeem":
        await expect(credit()).resolves.toBe(0n);
        await expect(marketAmount("totalUnits")).resolves.toBe(0n);
        await expect(marketAmount("withdrawable")).resolves.toBe(0n);
        await expect(loanBalance(taker)).resolves.toBe(takerLoanBefore);
        break;
    }
  }
  expect(operations).toEqual([
    "midnightSupplyCollateral",
    "midnightMakeBorrow",
    "midnightTakeLend",
    "midnightCancelOffers",
    "midnightRepayWithdrawCollateral",
    "midnightRedeem",
  ]);
});
