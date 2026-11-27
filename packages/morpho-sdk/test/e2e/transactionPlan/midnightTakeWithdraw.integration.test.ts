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
import {
  buildTransactions,
  parseTransactionPlan,
  prepareMidnightTakeWithdraw,
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
const {
  A: borrower,
  B: creditor,
  C: lender,
  D: recipient,
} = E2E_MIDNIGHT_WALLETS;
const midnight = getChainAddress(chainId, "midnight");
const bundle = getChainAddress(chainId, "midnightBundlesV2");
const credit = parseEther("0.1");
const repayUnits = parseEther("0.01");
const fillCap = parseEther("0.08");
const exitUnits = parseEther("0.05");

async function setup(client: AnvilTestClient<Chain>) {
  const { params } = await createE2eMidnightMarket(client, chainId);
  const market = MarketUtils.toStruct(params);
  const marketId = MarketUtils.toId(params);
  const collateralAssets = parseEther("10");
  await fundE2eMidnightWallets(client, {
    market: params,
    wallets: {
      A: { collateralAssets, loanAssets: repayUnits },
      B: { loanAssets: credit },
      C: { loanAssets: fillCap },
      D: {},
    },
    approve: midnight,
  });
  await client.writeContract({
    account: borrower,
    address: midnight,
    abi: midnightAbi,
    functionName: "supplyCollateral",
    args: [market, 0n, collateralAssets, borrower],
  });
  const { timestamp } = await client.getBlock();
  const postLendOffer = async (maker: Address, units: bigint) => {
    const tree = Tree.create([
      Offer.create({
        market: params,
        buy: true,
        maker,
        start: timestamp,
        expiry: timestamp + 7_200n,
        tick: MAX_TICK,
        ratifier: getChainAddress(chainId, "setterRatifier"),
        maxUnits: units,
        continuousFeeCap: maxUint256,
      }),
    ]);
    await postE2eSetterTree(client, { chainId, maker, tree });
    return getE2eTakeableOffers({ tree, units });
  };
  const [seed] = await postLendOffer(creditor, credit);
  assert(seed);
  await client.writeContract({
    account: borrower,
    address: midnight,
    abi: midnightAbi,
    functionName: "take",
    args: [
      seed.offer,
      seed.ratifierData,
      seed.units,
      borrower,
      borrower,
      zeroAddress,
      "0x",
    ],
  });
  await client.writeContract({
    account: borrower,
    address: midnight,
    abi: midnightAbi,
    functionName: "repay",
    args: [market, repayUnits, borrower, zeroAddress, "0x"],
  });
  return {
    marketId,
    loanToken: params.loanToken,
    takeableOffers: await postLendOffer(lender, fillCap),
  };
}

test.for([
  { mode: "assets", preauthorized: false, receiver: undefined },
  { mode: "units", preauthorized: true, receiver: recipient },
] as const)(
  "executes restored reduce-only Midnight withdrawal with $mode target",
  { timeout: 120_000 },
  async ({ mode, preauthorized, receiver }, { client }) => {
    const { marketId, loanToken, takeableOffers } = await setup(client);
    if (preauthorized) {
      await client.writeContract({
        account: creditor,
        address: midnight,
        abi: midnightAbi,
        functionName: "setIsAuthorized",
        args: [bundle, true, creditor],
      });
    }
    const block = await client.getBlock();
    const positionData = await fetchAccrualPosition(client, {
      marketId,
      user: creditor,
      blockNumber: block.number,
    });
    expect(positionData.credit).toBe(credit);
    expect(positionData.debt).toBe(0n);
    expect(positionData.market.withdrawable).toBe(repayUnits);
    const plan = await prepareMidnightTakeWithdraw(client, {
      chainId,
      account: creditor,
      marketData: positionData.market,
      positionData,
      takeableOffers,
      target:
        mode === "assets"
          ? { type: "assets", assets: exitUnits, maxUnits: exitUnits }
          : { type: "units", units: exitUnits, minSellerAssets: exitUnits },
      receiver,
      now: block.timestamp,
    });
    const restored = parseTransactionPlan(serializeTransactionPlan(plan));
    expect(restored.steps.map(({ action }) => action.type)).toEqual(
      preauthorized
        ? ["midnightTakeWithdraw"]
        : ["midnightAuthorization", "midnightTakeWithdraw"],
    );
    expect(restored.signatureRequests).toEqual([]);
    const transactions = buildTransactions(restored);
    expect(transactions).toEqual(buildTransactions(plan));
    const payee = receiver ?? creditor;
    const balance = (account: Address) =>
      client.readContract({
        address: loanToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account],
      });
    const payeeBefore = await balance(payee);
    const creditorBefore = await balance(creditor);
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
    const remaining = await fetchAccrualPosition(client, {
      marketId,
      user: creditor,
    });
    const buyer = await fetchAccrualPosition(client, {
      marketId,
      user: lender,
    });
    expect(remaining.credit).toBe(credit - exitUnits);
    expect(remaining.debt).toBe(0n);
    expect(remaining.market.withdrawable).toBe(0n);
    expect(buyer.credit).toBe(exitUnits - repayUnits);
    expect(await balance(payee)).toBe(payeeBefore + exitUnits);
    if (receiver) {
      expect(await balance(creditor)).toBe(creditorBefore);
    }
  },
);
