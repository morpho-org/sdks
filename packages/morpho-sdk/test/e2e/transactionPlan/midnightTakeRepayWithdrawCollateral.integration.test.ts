import { ORACLE_PRICE_SCALE } from "@morpho-org/blue-sdk";
import {
  fetchAccrualPosition,
  MAX_TICK,
  type MarketParams,
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
  maxUint128,
  maxUint256,
  parseEther,
  zeroAddress,
} from "viem";
import { base } from "viem/chains";
import { assert, expect } from "vitest";
import {
  buildTransactions,
  parseTransactionPlan,
  prepareMidnightTakeRepayWithdrawCollateral,
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
const { A: borrower, B: lender, C: maker, D: receiver } = E2E_MIDNIGHT_WALLETS;
const midnight = getChainAddress(chainId, "midnight");
const bundle = getChainAddress(chainId, "midnightBundlesV2");
const ratifier = getChainAddress(chainId, "setterRatifier");
const initialDebt = parseEther("0.1");
const repayment = parseEther("0.06");
const collateral = parseEther("10");
const partialWithdrawal = parseEther("1");

type Client = AnvilTestClient<Chain>;

async function postOffer(
  client: Client,
  {
    market,
    account,
    buy,
    units,
  }: { market: MarketParams; account: Address; buy: boolean; units: bigint },
) {
  const { timestamp } = await client.getBlock();
  const tree = Tree.create([
    Offer.create({
      market,
      maker: account,
      buy,
      start: timestamp,
      expiry: timestamp + 1_200n,
      tick: MAX_TICK,
      ratifier,
      maxUnits: units,
      continuousFeeCap: maxUint256,
    }),
  ]);
  await postE2eSetterTree(client, { chainId, maker: account, tree });
  const [fill] = getE2eTakeableOffers({ tree, units });
  assert(fill);
  return fill;
}

async function setup(client: Client) {
  const { params } = await createE2eMidnightMarket(client, chainId);
  await fundE2eMidnightWallets(client, {
    market: params,
    wallets: {
      A: { collateralAssets: collateral },
      B: { loanAssets: initialDebt },
      C: { collateralAssets: collateral },
      D: { collateralAssets: collateral },
    },
    approve: midnight,
  });
  for (const account of [borrower, maker, receiver]) {
    await client.writeContract({
      account,
      address: midnight,
      abi: midnightAbi,
      functionName: "supplyCollateral",
      args: [MarketUtils.toStruct(params), 0n, collateral, account],
    });
  }
  const seed = await postOffer(client, {
    market: params,
    account: lender,
    buy: true,
    units: initialDebt,
  });
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
  return params;
}

test.for(["assets", "units"] as const)(
  "executes a restored %s-target repayment from the borrower",
  { timeout: 120_000 },
  async (mode, { client }) => {
    const full = mode === "units";
    const params = await setup(client);
    const marketId = MarketUtils.toId(params);
    const filled = full ? repayment / 2n : repayment;
    const offer = await postOffer(client, {
      market: params,
      account: maker,
      buy: false,
      units: full ? filled : initialDebt,
    });
    const cancelled = full
      ? await postOffer(client, {
          market: params,
          account: receiver,
          buy: false,
          units: initialDebt,
        })
      : undefined;
    const block = await client.getBlock();
    const positionData = await fetchAccrualPosition(client, {
      marketId,
      user: borrower,
      blockNumber: block.number,
    });
    const nativeAmount = full ? initialDebt + repayment : undefined;
    const plan = await prepareMidnightTakeRepayWithdrawCollateral(client, {
      chainId,
      account: borrower,
      marketData: positionData.market,
      positionData,
      collateralPrices: [ORACLE_PRICE_SCALE],
      now: block.timestamp,
      takeableOffers: cancelled ? [cancelled, offer] : [offer],
      target: full
        ? {
            type: "units",
            units: maxUint256,
            maxBuyerAssets: initialDebt + repayment,
          }
        : { type: "assets", assets: repayment, minUnits: repayment },
      collateralReceiver: receiver,
      collateralWithdrawals: [
        { collateralIndex: 0n, assets: full ? maxUint256 : partialWithdrawal },
      ],
      repayEnabled: full,
      maxContinuousFee: maxUint256,
      nativeAmount,
    });
    if (cancelled) {
      await client.writeContract({
        account: receiver,
        address: midnight,
        abi: midnightAbi,
        functionName: "setConsumed",
        args: [cancelled.offer.group, maxUint128, receiver],
      });
    }
    const restored = parseTransactionPlan(serializeTransactionPlan(plan));
    expect(restored.account).toBe(borrower);
    expect(restored.signatureRequests).toEqual([]);
    expect(restored.steps.map(({ action }) => action.type)).toEqual([
      "erc20Approval",
      "midnightAuthorization",
      "midnightTakeRepayWithdrawCollateral",
    ]);
    const transactions = buildTransactions(restored);
    expect(transactions).toEqual(buildTransactions(plan));

    const collateralToken = MarketUtils.getCollateralByIndex(params, 0n).token;
    const balance = (token: Address, owner: Address) =>
      client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [owner],
      });
    const debt = (account: Address) =>
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "debt",
        args: [marketId, account],
      });
    const balances = () =>
      Promise.all([
        balance(params.loanToken, borrower),
        balance(params.loanToken, maker),
        balance(params.loanToken, receiver),
        balance(params.loanToken, midnight),
        balance(params.loanToken, bundle),
        balance(collateralToken, receiver),
        balance(collateralToken, midnight),
      ]);
    const before = await balances();
    expect(positionData.debt).toBe(initialDebt);
    expect(positionData.collateral[0]).toBe(collateral);
    for (const { to, data, value } of transactions) {
      const hash = await client.sendTransaction({
        account: restored.account,
        to,
        data,
        value,
      });
      expect((await client.waitForTransactionReceipt({ hash })).status).toBe(
        "success",
      );
    }
    const paid = full ? initialDebt : repayment;
    const withdrawn = full ? collateral : partialWithdrawal;
    expect(await debt(borrower)).toBe(initialDebt - paid);
    expect(await debt(maker)).toBe(filled);
    expect(await debt(receiver)).toBe(0n);
    await expect(
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "collateral",
        args: [marketId, borrower, 0n],
      }),
    ).resolves.toBe(collateral - withdrawn);
    const after = await balances();
    expect(after.map((amount, index) => amount - before[index]!)).toEqual([
      (nativeAmount ?? 0n) - paid,
      filled,
      0n,
      paid - filled,
      0n,
      withdrawn,
      -withdrawn,
    ]);
  },
);
