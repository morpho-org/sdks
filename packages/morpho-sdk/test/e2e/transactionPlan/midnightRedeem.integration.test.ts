import {
  fetchAccrualPosition,
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
  type Chain,
  decodeFunctionData,
  isAddressEqual,
  parseEther,
  zeroAddress,
} from "viem";
import { base } from "viem/chains";
import { assert, expect } from "vitest";
import {
  buildTransactions,
  getPendingSignatureRequests,
  MidnightRedeemExceedsCreditError,
  parseTransactionPlan,
  prepareMidnightRedeem,
  serializeTransactionPlan,
} from "../../../src/index.js";

const test = createViemTest<Chain>(base, {
  forkUrl: getErpcForkUrl(base.id, process.env.ERPC_SECRET),
  forkBlockNumber: BASE_FORK_BLOCK,
  stepsTracing: false,
});
const midnight = getChainAddress(base.id, "midnight");
const { A: lender, B: borrower, C: recipient } = E2E_MIDNIGHT_WALLETS;
const suppliedUnits = parseEther("1");
const day = 86_400n;

async function seedRepaidPosition(client: AnvilTestClient<Chain>) {
  const { timestamp } = await client.getBlock();
  const { params } = await createE2eMidnightMarket(client, base.id, {
    maturity: (timestamp / day + 30n) * day + 54_000n,
  });
  const fee = 10n ** 16n / 31_536_000n; // 1% annualized
  const feeSetter = await client.readContract({
    address: midnight,
    abi: midnightAbi,
    functionName: "feeSetter",
  });
  await client.setBalance({ address: feeSetter, value: parseEther("1") });
  await client.writeContract({
    account: feeSetter,
    address: midnight,
    abi: midnightAbi,
    functionName: "setDefaultContinuousFee",
    args: [params.loanToken, fee],
  });

  const collateralAssets = parseEther("10");
  await fundE2eMidnightWallets(client, {
    market: params,
    wallets: {
      A: { loanAssets: suppliedUnits },
      B: { collateralAssets, loanAssets: suppliedUnits },
    },
    approve: midnight,
  });
  const market = MarketUtils.toStruct(params);
  await client.writeContract({
    account: borrower,
    address: midnight,
    abi: midnightAbi,
    functionName: "supplyCollateral",
    args: [market, 0n, collateralAssets, borrower],
  });
  const tree = Tree.create([
    Offer.create({
      market,
      buy: false,
      maker: borrower,
      expiry: market.maturity,
      tick: 5_000n,
      maxUnits: suppliedUnits,
      continuousFeeCap: fee,
      ratifier: getChainAddress(base.id, "setterRatifier"),
    }),
  ]);
  await postE2eSetterTree(client, { chainId: base.id, maker: borrower, tree });
  const [take] = getE2eTakeableOffers({ tree, units: suppliedUnits });
  assert(take);
  await client.writeContract({
    account: lender,
    address: midnight,
    abi: midnightAbi,
    functionName: "take",
    args: [
      take.offer,
      take.ratifierData,
      take.units,
      lender,
      zeroAddress,
      zeroAddress,
      "0x",
    ],
  });
  await client.writeContract({
    account: borrower,
    address: midnight,
    abi: midnightAbi,
    functionName: "repay",
    args: [market, suppliedUnits, borrower, zeroAddress, "0x"],
  });
  const repaidBlock = await client.getBlock();
  await client.setNextBlockTimestamp({
    timestamp: repaidBlock.timestamp + day,
  });
  await client.mine({ blocks: 1 });
  return params;
}

test.for([
  {
    name: "specified units to a distinct receiver",
    units: parseEther("0.25"),
    receiver: recipient,
  },
  {
    name: "default face value to the position owner",
    units: undefined,
    receiver: undefined,
  },
])(
  "Midnight redeem: $name",
  { timeout: 120_000 },
  async ({ units, receiver }, { client }) => {
    const market = await seedRepaidPosition(client);
    const marketId = MarketUtils.toId(market);
    const block = await client.getBlock();
    const positionData = await fetchAccrualPosition(client, {
      marketId,
      user: lender,
      blockNumber: block.number,
    });
    const intent = {
      chainId: base.id,
      account: lender,
      positionData,
      now: block.timestamp,
    };
    expect(positionData.credit).toBe(suppliedUnits);
    expect(positionData.pendingFee).toBeGreaterThan(0n);
    await expect(
      prepareMidnightRedeem(client, { ...intent, units: positionData.credit }),
    ).rejects.toBeInstanceOf(MidnightRedeemExceedsCreditError);

    const plan = await prepareMidnightRedeem(client, {
      ...intent,
      units,
      receiver,
    });
    const restored = parseTransactionPlan(serializeTransactionPlan(plan));
    expect(restored.signatureRequests).toEqual([]);
    expect(getPendingSignatureRequests(restored)).toEqual([]);
    const transactions = buildTransactions(restored);
    expect(transactions).toEqual(buildTransactions(plan));
    expect(transactions).toHaveLength(1);
    const [tx] = transactions;
    assert(tx);
    const redeemed = units ?? positionData.credit - positionData.pendingFee;
    const owner = receiver ?? lender;
    expect(tx.to).toBe(midnight);
    expect(decodeFunctionData({ abi: midnightAbi, data: tx.data })).toEqual({
      functionName: "withdraw",
      args: [MarketUtils.toStruct(market), redeemed, lender, owner],
    });

    const assetsBefore = await client.balanceOf({
      erc20: market.loanToken,
      owner,
    });
    const hash = await client.sendTransaction({ ...tx, account: lender });
    const receipt = await client.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");
    expect(isAddressEqual(receipt.from, lender)).toBe(true);
    expect(await client.balanceOf({ erc20: market.loanToken, owner })).toBe(
      assetsBefore + redeemed,
    );

    const { timestamp } = await client.getBlock({
      blockNumber: receipt.blockNumber,
    });
    expect(timestamp).toBeLessThan(market.maturity);
    const fee =
      (positionData.pendingFee * (timestamp - positionData.lastAccrual)) /
      (market.maturity - positionData.lastAccrual);
    expect(fee).toBeGreaterThan(0n);
    expect(
      await client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "credit",
        args: [marketId, lender],
      }),
    ).toBe(positionData.credit - fee - redeemed);
  },
);
