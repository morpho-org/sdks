import {
  fetchAccrualPosition,
  MAX_TICK,
  MarketUtils,
  midnightAbi,
  Offer,
  Tree,
} from "@morpho-org/midnight-sdk";
import {
  createE2eMidnightMarket,
  E2E_MIDNIGHT_WALLETS,
  fundE2eMidnightWallets,
  getE2eTakeableOffers,
  postE2eSetterTree,
} from "@morpho-org/morpho-test/midnight";
import { getChainAddress } from "@morpho-org/morpho-ts";
import {
  type AnvilTestClient,
  BASE_FORK_BLOCK,
  getErpcForkUrl,
} from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  type Chain,
  erc20Abi,
  maxUint256,
  parseEther,
  zeroAddress,
} from "viem";
import { base } from "viem/chains";
import { assert, expect } from "vitest";
import { blueOracleAbi } from "../../../src/abis.js";
import {
  buildTransactions,
  parseTransactionPlan,
  prepareMidnightTakeBorrow,
  serializeTransactionPlan,
} from "../../../src/index.js";

const chain: Chain = base;
const chainId = base.id;
const test = createViemTest(chain, {
  forkUrl: getErpcForkUrl(chainId, process.env.ERPC_SECRET),
  forkBlockNumber: BASE_FORK_BLOCK,
  stepsTracing: false,
});
const { A: borrower, B: lender, C: recipient } = E2E_MIDNIGHT_WALLETS;
const midnight = getChainAddress(chainId, "midnight");
const bundle = getChainAddress(chainId, "midnightBundlesV2");
const amount = parseEther("0.1");

async function setup(client: AnvilTestClient<Chain>) {
  const { params } = await createE2eMidnightMarket(client, chainId);
  const collateralAssets = parseEther("10");
  await fundE2eMidnightWallets(client, {
    market: params,
    wallets: { A: { collateralAssets }, B: { loanAssets: amount }, C: {} },
    approve: midnight,
  });
  await client.writeContract({
    account: borrower,
    address: midnight,
    abi: midnightAbi,
    functionName: "supplyCollateral",
    args: [MarketUtils.toStruct(params), 0n, collateralAssets, borrower],
  });
  const { timestamp } = await client.getBlock();
  const tree = Tree.create([
    Offer.create({
      market: params,
      buy: true,
      maker: lender,
      start: timestamp,
      expiry: timestamp + 1_200n,
      tick: MAX_TICK,
      ratifier: getChainAddress(chainId, "setterRatifier"),
      maxUnits: amount,
      continuousFeeCap: maxUint256,
    }),
  ]);
  await postE2eSetterTree(client, { chainId, maker: lender, tree });
  return {
    params,
    takeableOffers: getE2eTakeableOffers({ tree, units: amount }),
  };
}

test.for([
  { mode: "assets", preauthorized: false, receiver: undefined },
  { mode: "units", preauthorized: true, receiver: recipient },
] as const)(
  "executes restored Midnight borrow with $mode target",
  { timeout: 120_000 },
  async ({ mode, preauthorized, receiver }, { client }) => {
    const { params, takeableOffers } = await setup(client);
    const marketId = MarketUtils.toId(params);
    if (preauthorized) {
      await client.writeContract({
        account: borrower,
        address: midnight,
        abi: midnightAbi,
        functionName: "setIsAuthorized",
        args: [bundle, true, borrower],
      });
    }
    const block = await client.getBlock();
    const positionData = await fetchAccrualPosition(client, {
      marketId,
      user: borrower,
      blockNumber: block.number,
    });
    const collateralPrices = await Promise.all(
      params.collateralParams.map(({ oracle }) =>
        client.readContract({
          address: oracle,
          abi: blueOracleAbi,
          functionName: "price",
          blockNumber: block.number,
        }),
      ),
    );
    const plan = await prepareMidnightTakeBorrow(client, {
      chainId,
      account: borrower,
      marketData: positionData.market,
      positionData,
      collateralPrices,
      takeableOffers,
      target:
        mode === "assets"
          ? { type: "assets", assets: amount, maxUnits: amount }
          : { type: "units", units: amount, minSellerAssets: amount },
      receiver,
      now: block.timestamp,
    });
    const restored = parseTransactionPlan(serializeTransactionPlan(plan));
    expect(restored.steps.map(({ action }) => action.type)).toEqual(
      preauthorized
        ? ["midnightTakeBorrow"]
        : ["midnightAuthorization", "midnightTakeBorrow"],
    );
    expect(restored.signatureRequests).toEqual([]);
    expect(restored.account).toBe(borrower);
    const transactions = buildTransactions(restored);
    expect(transactions).toEqual(buildTransactions(plan));

    const balanceOf = (account: Address) =>
      client.readContract({
        address: params.loanToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account],
      });
    const debtOf = (account: Address) =>
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "debt",
        args: [marketId, account],
      });
    const payee = receiver ?? borrower;
    const [payeeBefore, borrowerBefore, lenderBefore] = await Promise.all([
      balanceOf(payee),
      balanceOf(borrower),
      balanceOf(lender),
    ]);
    expect(positionData.debt).toBe(0n);
    for (const { to, data, value } of transactions) {
      const hash = await client.sendTransaction({
        account: restored.account,
        to,
        data,
        value,
      });
      const receipt = await client.waitForTransactionReceipt({ hash });
      expect(receipt.status).toBe("success");
    }
    const [
      payeeAfter,
      borrowerAfter,
      lenderAfter,
      borrowerDebt,
      recipientDebt,
    ] = await Promise.all([
      balanceOf(payee),
      balanceOf(borrower),
      balanceOf(lender),
      debtOf(borrower),
      debtOf(recipient),
    ]);
    expect(payeeAfter - payeeBefore).toBe(amount);
    expect(borrowerAfter - borrowerBefore).toBe(receiver ? 0n : amount);
    expect(lenderBefore - lenderAfter).toBe(amount);
    expect(borrowerDebt).toBe(amount);
    expect(recipientDebt).toBe(0n);
  },
);

test("executes restored Midnight borrow funded first by existing credit", {
  timeout: 120_000,
}, async ({ client }) => {
  const { params } = await createE2eMidnightMarket(client, chainId);
  const marketId = MarketUtils.toId(params);
  const market = MarketUtils.toStruct(params);
  const credit = amount / 4n;
  const collateralAssets = parseEther("10");
  await fundE2eMidnightWallets(client, {
    market: params,
    wallets: {
      A: { collateralAssets, loanAssets: credit },
      B: { loanAssets: amount },
      C: { collateralAssets, loanAssets: credit },
    },
    approve: midnight,
  });
  for (const account of [borrower, recipient]) {
    await client.writeContract({
      account,
      address: midnight,
      abi: midnightAbi,
      functionName: "supplyCollateral",
      args: [market, 0n, collateralAssets, account],
    });
  }
  const { timestamp } = await client.getBlock();
  // The borrower lends to a third party that repays, leaving withdrawable credit.
  const borrowTree = Tree.create([
    Offer.create({
      market: params,
      buy: false,
      maker: recipient,
      start: timestamp,
      expiry: timestamp + 1_200n,
      tick: MAX_TICK,
      ratifier: getChainAddress(chainId, "setterRatifier"),
      maxUnits: credit,
      continuousFeeCap: maxUint256,
    }),
  ]);
  await postE2eSetterTree(client, {
    chainId,
    maker: recipient,
    tree: borrowTree,
  });
  const [lend] = getE2eTakeableOffers({ tree: borrowTree, units: credit });
  assert(lend);
  await client.writeContract({
    account: borrower,
    address: midnight,
    abi: midnightAbi,
    functionName: "take",
    args: [
      lend.offer,
      lend.ratifierData,
      lend.units,
      borrower,
      zeroAddress,
      zeroAddress,
      "0x",
    ],
  });
  await client.writeContract({
    account: recipient,
    address: midnight,
    abi: midnightAbi,
    functionName: "repay",
    args: [market, credit, recipient, zeroAddress, "0x"],
  });
  const lendTree = Tree.create([
    Offer.create({
      market: params,
      buy: true,
      maker: lender,
      start: timestamp,
      expiry: timestamp + 1_200n,
      tick: MAX_TICK,
      ratifier: getChainAddress(chainId, "setterRatifier"),
      maxUnits: amount,
      continuousFeeCap: maxUint256,
    }),
  ]);
  await postE2eSetterTree(client, { chainId, maker: lender, tree: lendTree });

  const block = await client.getBlock();
  const positionData = await fetchAccrualPosition(client, {
    marketId,
    user: borrower,
    blockNumber: block.number,
  });
  expect(positionData.credit).toBe(credit);
  const collateralPrices = await Promise.all(
    params.collateralParams.map(({ oracle }) =>
      client.readContract({
        address: oracle,
        abi: blueOracleAbi,
        functionName: "price",
        blockNumber: block.number,
      }),
    ),
  );
  const plan = await prepareMidnightTakeBorrow(client, {
    chainId,
    account: borrower,
    marketData: positionData.market,
    positionData,
    collateralPrices,
    takeableOffers: getE2eTakeableOffers({ tree: lendTree, units: amount }),
    target: { type: "assets", assets: amount, maxUnits: amount },
    now: block.timestamp,
  });
  const restored = parseTransactionPlan(serializeTransactionPlan(plan));
  const balanceOf = (account: Address) =>
    client.readContract({
      address: params.loanToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account],
    });
  const [borrowerBefore, lenderBefore] = await Promise.all([
    balanceOf(borrower),
    balanceOf(lender),
  ]);
  for (const { to, data, value } of buildTransactions(restored)) {
    const hash = await client.sendTransaction({
      account: restored.account,
      to,
      data,
      value,
    });
    const receipt = await client.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");
  }
  const after = await fetchAccrualPosition(client, {
    marketId,
    user: borrower,
  });
  const [borrowerAfter, lenderAfter] = await Promise.all([
    balanceOf(borrower),
    balanceOf(lender),
  ]);
  expect(borrowerAfter - borrowerBefore).toBe(amount);
  expect(lenderBefore - lenderAfter).toBe(amount - credit);
  expect(after.credit).toBe(0n);
  expect(after.debt).toBe(amount - credit);
});
