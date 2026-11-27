import { ORACLE_PRICE_SCALE } from "@morpho-org/blue-sdk";
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
  type MidnightRepayWithdrawCollateralPlanParams,
  parseTransactionPlan,
  prepareMidnightRepayWithdrawCollateral,
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
const { A: borrower, B: lender, D: recipient } = E2E_MIDNIGHT_WALLETS;
const midnight = getChainAddress(chainId, "midnight");
const bundle = getChainAddress(chainId, "midnightBundlesV2");
const initialDebt = parseEther("0.1");
const collateralAssets = parseEther("10");
const partialRepay = parseEther("0.04");
const partialWithdrawal = parseEther("1");

async function openPosition(client: AnvilTestClient<Chain>) {
  const { params } = await createE2eMidnightMarket(client, chainId);
  const market = MarketUtils.toStruct(params);
  await fundE2eMidnightWallets(client, {
    market: params,
    wallets: {
      A: { collateralAssets },
      B: { loanAssets: initialDebt },
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
  const tree = Tree.create([
    Offer.create({
      market: params,
      buy: true,
      maker: lender,
      start: timestamp,
      expiry: timestamp + 7_200n,
      tick: MAX_TICK,
      ratifier: getChainAddress(chainId, "setterRatifier"),
      maxUnits: initialDebt,
      continuousFeeCap: maxUint256,
    }),
  ]);
  await postE2eSetterTree(client, { chainId, maker: lender, tree });
  const [seed] = getE2eTakeableOffers({ tree, units: initialDebt });
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
  const collateral = params.collateralParams[0];
  assert(collateral);
  return {
    marketId: MarketUtils.toId(params),
    loanToken: params.loanToken,
    collateralToken: collateral.token,
  };
}

test.for([
  {
    mode: "assets",
    repay: { type: "assets", assets: partialRepay },
    withdrawn: partialWithdrawal,
    paid: partialRepay,
    nativeAmount: undefined,
    prerequisites: ["erc20Approval", "midnightAuthorization"],
  },
  {
    mode: "withdrawal only",
    repay: { type: "assets", assets: 0n },
    withdrawn: partialWithdrawal,
    paid: 0n,
    nativeAmount: undefined,
    prerequisites: ["midnightAuthorization"],
  },
  {
    mode: "full with native",
    repay: { type: "full", maxBuyerAssets: initialDebt + partialRepay },
    withdrawn: collateralAssets,
    paid: initialDebt,
    nativeAmount: initialDebt + partialRepay,
    prerequisites: ["erc20Approval", "midnightAuthorization"],
  },
] as const satisfies readonly {
  mode: string;
  repay: MidnightRepayWithdrawCollateralPlanParams["repay"];
  withdrawn: bigint;
  paid: bigint;
  nativeAmount?: bigint;
  prerequisites: readonly string[];
}[])(
  "executes a restored Midnight repayment plan: $mode",
  { timeout: 120_000 },
  async (
    { repay, withdrawn, paid, nativeAmount, prerequisites },
    { client },
  ) => {
    const { marketId, loanToken, collateralToken } = await openPosition(client);
    const balance = (token: Address, owner: Address) =>
      client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [owner],
      });
    if (nativeAmount !== undefined) {
      expect(loanToken.toLowerCase()).toBe(
        getChainAddress(chainId, "wNative").toLowerCase(),
      );
      const borrowed = await balance(loanToken, borrower);
      const hash = await client.writeContract({
        account: borrower,
        address: loanToken,
        abi: erc20Abi,
        functionName: "transfer",
        args: [lender, borrowed],
      });
      await client.waitForTransactionReceipt({ hash });
      await expect(balance(loanToken, borrower)).resolves.toBe(0n);
    }
    const block = await client.getBlock();
    const position = (blockNumber?: bigint) =>
      fetchAccrualPosition(client, {
        marketId,
        user: borrower,
        blockNumber,
      });
    const positionData = await position(block.number);
    expect(positionData.debt).toBe(initialDebt);
    expect(positionData.collateral[0]).toBe(collateralAssets);
    const plan = await prepareMidnightRepayWithdrawCollateral(client, {
      chainId,
      account: borrower,
      marketData: positionData.market,
      positionData,
      collateralPrices: [ORACLE_PRICE_SCALE],
      repay,
      nativeAmount,
      collateralWithdrawals: [
        {
          collateralIndex: 0n,
          assets: repay.type === "full" ? maxUint256 : withdrawn,
        },
      ],
      collateralReceiver: recipient,
      now: block.timestamp,
    });
    const restored = parseTransactionPlan(serializeTransactionPlan(plan));
    expect(restored.account).toBe(borrower);
    expect(restored.steps.map(({ action }) => action.type)).toEqual([
      ...prerequisites,
      "midnightRepayWithdrawCollateral",
    ]);
    expect(restored.signatureRequests).toEqual([]);
    const transactions = buildTransactions(restored);
    expect(transactions).toEqual(buildTransactions(plan));
    expect(transactions.at(-1)).toMatchObject({
      to: bundle,
      value: nativeAmount ?? 0n,
    });

    const [borrowerBefore, recipientBefore] = await Promise.all([
      balance(loanToken, borrower),
      balance(collateralToken, recipient),
    ]);
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
    const remaining = await position();
    expect(remaining.debt).toBe(initialDebt - paid);
    expect(remaining.collateral[0]).toBe(collateralAssets - withdrawn);
    await expect(balance(loanToken, borrower)).resolves.toBe(
      borrowerBefore + (nativeAmount ?? 0n) - paid,
    );
    await expect(balance(collateralToken, recipient)).resolves.toBe(
      recipientBefore + withdrawn,
    );
  },
);
