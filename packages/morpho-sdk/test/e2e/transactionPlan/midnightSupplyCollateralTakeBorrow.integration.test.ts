import {
  fetchAccrualPosition,
  MAX_TICK,
  MarketParams,
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
import { BASE_FORK_BLOCK, getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  type Chain,
  erc20Abi,
  maxUint256,
  parseEther,
} from "viem";
import { base } from "viem/chains";
import { expect } from "vitest";
import { blueOracleAbi } from "../../../src/abis.js";
import {
  BorrowExceedsSafeLtvError,
  buildTransactions,
  parseTransactionPlan,
  prepareMidnightSupplyCollateralTakeBorrow,
  prepareMidnightTakeBorrow,
  serializeTransactionPlan,
} from "../../../src/index.js";

const chainId = base.id;
const chain: Chain = base;
const test = createViemTest(chain, {
  forkUrl: getErpcForkUrl(chainId, process.env.ERPC_SECRET),
  forkBlockNumber: BASE_FORK_BLOCK,
  redactForkUrl: true,
  stepsTracing: false,
});
const {
  A: borrower,
  B: lender,
  C: receiver,
  D: feeRecipient,
} = E2E_MIDNIGHT_WALLETS;
const midnight = getChainAddress(chainId, "midnight");
const bundle = getChainAddress(chainId, "midnightBundlesV2");
const wNative = getChainAddress(chainId, "wNative");
const units = parseEther("0.1");
const fee = units / 100n;
const collateralAssets = parseEther("0.4");
const nativeAmount = parseEther("0.3");

test("restores a native-funded collateral supply and borrow from a pre-supply position", {
  timeout: 120_000,
}, async ({ client }) => {
  const initial = await createE2eMidnightMarket(client, chainId);
  const params = new MarketParams({
    ...initial.params,
    loanToken: initial.params.collateralParams[0]!.token,
    collateralParams: initial.params.collateralParams.map((collateral) => ({
      ...collateral,
      token: wNative,
    })),
  });
  const marketId = MarketUtils.toId(params);
  await fundE2eMidnightWallets(client, {
    market: params,
    wallets: {
      A: { collateralAssets: collateralAssets - nativeAmount },
      B: { loanAssets: units },
      C: {},
      D: {},
    },
    approve: midnight,
  });
  await client.writeContract({
    account: lender,
    address: midnight,
    abi: midnightAbi,
    functionName: "touchMarket",
    args: [MarketUtils.toStruct(params)],
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
      maxUnits: 2n * units,
      continuousFeeCap: maxUint256,
    }),
  ]);
  await postE2eSetterTree(client, { chainId, maker: lender, tree });
  const takeableOffers = getE2eTakeableOffers({ tree, units: 2n * units });
  const block = await client.getBlock();
  const [positionData, collateralPrices] = await Promise.all([
    fetchAccrualPosition(client, {
      marketId,
      user: borrower,
      blockNumber: block.number,
    }),
    Promise.all(
      params.collateralParams.map(({ oracle }) =>
        client.readContract({
          address: oracle,
          abi: blueOracleAbi,
          functionName: "price",
          blockNumber: block.number,
        }),
      ),
    ),
  ]);
  const preSupplyCollateral = positionData.collateral.slice();
  expect(positionData.collateralBitmap).toBe(0n);
  expect(positionData.collateral[0]).toBe(0n);
  expect(positionData.debt).toBe(0n);
  expect(positionData.credit).toBe(0n);
  const borrow = {
    chainId,
    account: borrower,
    marketData: positionData.market,
    positionData,
    collateralPrices,
    takeableOffers,
    target: { type: "units", units, minSellerAssets: units - fee },
    receiver,
    now: block.timestamp,
    referralFee: { bps: 100, recipient: feeRecipient },
  } as const;
  await expect(
    prepareMidnightTakeBorrow(client, borrow),
  ).rejects.toBeInstanceOf(BorrowExceedsSafeLtvError);
  const plan = await prepareMidnightSupplyCollateralTakeBorrow(client, {
    ...borrow,
    collateralSupplies: [{ collateralIndex: 0n, assets: collateralAssets }],
    nativeAmount,
  });
  expect(positionData.collateral).toEqual(preSupplyCollateral);
  const restored = parseTransactionPlan(serializeTransactionPlan(plan));
  expect(restored.steps.map(({ action }) => action.type)).toEqual([
    "erc20Approval",
    "midnightAuthorization",
    "midnightSupplyCollateralTakeBorrow",
  ]);
  expect(restored.signatureRequests).toEqual([]);
  expect(restored.account).toBe(borrower);
  const transactions = buildTransactions(restored);
  expect(transactions).toEqual(buildTransactions(plan));
  expect(transactions.at(-1)).toMatchObject({
    to: bundle,
    value: nativeAmount,
  });

  const balanceOf = (address: Address, account: Address) =>
    client.readContract({
      address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account],
    });
  const group = takeableOffers[0]!.offer.group;
  const state = async () => {
    const [
      receiverLoan,
      feeLoan,
      lenderLoan,
      borrowerLoan,
      borrowerWrapped,
      consumed,
    ] = await Promise.all([
      balanceOf(params.loanToken, receiver),
      balanceOf(params.loanToken, feeRecipient),
      balanceOf(params.loanToken, lender),
      balanceOf(params.loanToken, borrower),
      balanceOf(wNative, borrower),
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "consumed",
        args: [lender, group],
      }),
    ]);
    return {
      receiverLoan,
      feeLoan,
      lenderLoan,
      borrowerLoan,
      borrowerWrapped,
      consumed,
    };
  };
  const before = await state();
  for (const { to, data, value } of transactions) {
    const hash = await client.sendTransaction({
      account: restored.account,
      to,
      data,
      value,
    });
    const receipt = await client.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");
    const mined = await client.getTransaction({ hash });
    expect(mined.from.toLowerCase()).toBe(borrower.toLowerCase());
    expect(mined.value).toBe(value);
  }
  const [after, positionAfter] = await Promise.all([
    state(),
    fetchAccrualPosition(client, { marketId, user: borrower }),
  ]);
  expect(positionAfter.collateralBitmap).toBe(1n);
  expect(positionAfter.collateral[0]).toBe(collateralAssets);
  expect(positionAfter.debt).toBe(units);
  expect(after).toEqual({
    receiverLoan: before.receiverLoan + units - fee,
    feeLoan: before.feeLoan + fee,
    lenderLoan: before.lenderLoan - units,
    borrowerLoan: before.borrowerLoan,
    borrowerWrapped: before.borrowerWrapped - (collateralAssets - nativeAmount),
    consumed: before.consumed + units,
  });
});
