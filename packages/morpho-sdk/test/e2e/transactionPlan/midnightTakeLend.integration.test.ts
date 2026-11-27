import {
  fetchMarket,
  MAX_TICK,
  type MarketInput,
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
  isAddressEqual,
  maxUint128,
  maxUint256,
  parseEther,
} from "viem";
import { base } from "viem/chains";
import { assert, expect } from "vitest";
import {
  buildTransactions,
  getPendingSignatureRequests,
  type MidnightTakeLendPlanParams,
  parseTransactionPlan,
  prepareMidnightTakeLend,
  serializeTransactionPlan,
  type Transaction,
} from "../../../src/index.js";

const chain: Chain = base;
const test = createViemTest(chain, {
  forkUrl: getErpcForkUrl(base.id, process.env.ERPC_SECRET),
  forkBlockNumber: BASE_FORK_BLOCK,
  stepsTracing: false,
});
type Client = AnvilTestClient<Chain>;
const chainId = base.id;
const { A: lender, B: firstMaker, C: secondMaker } = E2E_MIDNIGHT_WALLETS;
const wNative = getChainAddress(chainId, "wNative");
const usdc = getChainAddress(chainId, "usdc");
const bundle = getChainAddress(chainId, "midnightBundlesV2");
const midnight = getChainAddress(chainId, "midnight");
const ratifier = getChainAddress(chainId, "setterRatifier");

async function setup(
  client: Client,
  { token, amount }: { token: Address; amount: bigint },
) {
  const { params } = await createE2eMidnightMarket(client, chainId);
  const market = new MarketParams({ ...params, loanToken: token });
  const collateralAssets = parseEther("10");
  await fundE2eMidnightWallets(client, {
    market,
    wallets: { A: {}, B: { collateralAssets }, C: { collateralAssets } },
    approve: midnight,
  });
  if (token === usdc) {
    await client.deal({ erc20: token, account: lender, amount: amount * 3n });
  }
  const now = (await client.getBlock()).timestamp;
  const takeableOffers = [];
  for (const maker of [firstMaker, secondMaker]) {
    await client.writeContract({
      account: maker,
      address: midnight,
      abi: midnightAbi,
      functionName: "supplyCollateral",
      args: [MarketUtils.toStruct(market), 0n, collateralAssets, maker],
    });
    const tree = Tree.create([
      Offer.create({
        market,
        buy: false,
        maker,
        start: now,
        expiry: now + 1_200n,
        tick: MAX_TICK,
        ratifier,
        reduceOnly: false,
        maxUnits: amount,
        continuousFeeCap: maxUint256,
      }),
    ]);
    await postE2eSetterTree(client, { chainId, maker, tree });
    takeableOffers.push(...getE2eTakeableOffers({ tree, units: amount }));
  }
  return {
    chainId,
    account: lender,
    marketData: await fetchMarket(client, {
      marketId: MarketUtils.toId(market),
    }),
    takeableOffers,
    maxContinuousFee: maxUint256,
    now,
    expiresAt: Number(now + 600n),
  } satisfies Omit<MidnightTakeLendPlanParams, "target">;
}

async function send(
  client: Client,
  { account, tx }: { account: Address; tx: Transaction },
) {
  const hash = await client.sendTransaction({
    account,
    to: tx.to,
    data: tx.data,
    value: tx.value,
  });
  return client.waitForTransactionReceipt({ hash });
}

const credit = (client: Client, market: MarketInput) =>
  client.readContract({
    address: midnight,
    abi: midnightAbi,
    functionName: "credit",
    args: [MarketUtils.toId(market), lender],
  });

for (const type of ["assets", "units"] as const) {
  test(`executes a restored ${type}-target plan from the lender using multiple fills`, async ({
    client,
  }) => {
    const native = type === "units";
    const token = native ? wNative : usdc;
    const amount = native ? parseEther("0.1") : 1_000_000n;
    const total = 2n * amount;
    const prepared = await setup(client, { token, amount });
    const params = {
      ...prepared,
      target:
        type === "assets"
          ? { type, assets: total, minUnits: total }
          : { type, units: total, maxBuyerAssets: total },
      ...(native && { nativeAmount: total }),
    } satisfies MidnightTakeLendPlanParams;
    if (native) {
      // One wei below the pull is insufficient even when all input is native.
      await client.writeContract({
        account: lender,
        address: wNative,
        abi: erc20Abi,
        functionName: "approve",
        args: [bundle, total - 1n],
      });
    }
    const plan = await prepareMidnightTakeLend(client, params);
    expect(plan.steps.map(({ action }) => action.type)).toEqual([
      "erc20Approval",
      "midnightAuthorization",
      "midnightTakeLend",
    ]);
    expect(getPendingSignatureRequests(plan)).toEqual([]);
    const restored = parseTransactionPlan(serializeTransactionPlan(plan));
    const txs = buildTransactions(restored);
    expect(txs).toEqual(buildTransactions(plan));
    expect(txs.at(-1)?.value).toBe(native ? total : 0n);
    const lenderBefore = await client.balanceOf({
      erc20: token,
      owner: lender,
    });
    const firstBefore = await client.balanceOf({
      erc20: token,
      owner: firstMaker,
    });
    const secondBefore = await client.balanceOf({
      erc20: token,
      owner: secondMaker,
    });
    expect(await credit(client, prepared.marketData)).toBe(0n);
    let execution = txs;
    if (native) {
      const [approval, authorization, lend] = txs;
      assert(approval && authorization && lend);
      expect(
        (await send(client, { account: lender, tx: authorization })).status,
      ).toBe("success");
      await expect(
        client.sendTransaction({
          account: lender,
          to: lend.to,
          data: lend.data,
          value: lend.value,
          gas: 3_000_000n,
        }),
      ).rejects.toThrow(/execution reverted/i);
      expect(
        (await send(client, { account: lender, tx: approval })).status,
      ).toBe("success");
      expect(
        await client.readContract({
          address: wNative,
          abi: erc20Abi,
          functionName: "allowance",
          args: [lender, bundle],
        }),
      ).toBe(maxUint256);
      execution = [lend];
    }
    for (const tx of execution) {
      const receipt = await send(client, { account: restored.account, tx });
      expect(receipt.status).toBe("success");
      expect(isAddressEqual(receipt.from, lender)).toBe(true);
    }
    expect(await credit(client, prepared.marketData)).toBe(total);
    expect(await client.balanceOf({ erc20: token, owner: lender })).toBe(
      lenderBefore - (native ? 0n : total),
    );
    expect(await client.balanceOf({ erc20: token, owner: firstMaker })).toBe(
      firstBefore + amount,
    );
    expect(await client.balanceOf({ erc20: token, owner: secondMaker })).toBe(
      secondBefore + amount,
    );
    const nextPlan = await prepareMidnightTakeLend(client, params);
    expect(nextPlan.steps.map(({ action }) => action.type)).toEqual([
      "midnightTakeLend",
    ]);
  });
}

test("a native lend succeeds with a wNative allowance of exactly the pull", async ({
  client,
}) => {
  const amount = parseEther("0.1");
  const total = 2n * amount;
  const prepared = await setup(client, { token: wNative, amount });
  await client.writeContract({
    account: lender,
    address: wNative,
    abi: erc20Abi,
    functionName: "approve",
    args: [bundle, total],
  });
  const plan = await prepareMidnightTakeLend(client, {
    ...prepared,
    target: { type: "units", units: total, maxBuyerAssets: total },
    nativeAmount: total,
  });
  expect(plan.steps.map(({ action }) => action.type)).toEqual([
    "midnightAuthorization",
    "midnightTakeLend",
  ]);
  for (const tx of buildTransactions(
    parseTransactionPlan(serializeTransactionPlan(plan)),
  )) {
    expect((await send(client, { account: lender, tx })).status).toBe(
      "success",
    );
  }
  expect(await credit(client, prepared.marketData)).toBe(total);
  expect(
    await client.readContract({
      address: wNative,
      abi: erc20Abi,
      functionName: "allowance",
      args: [lender, bundle],
    }),
  ).toBe(0n);
});

for (const scenario of ["cancelled", "stale"] as const) {
  test(`a ${scenario} fill cannot execute the stored quote`, async ({
    client,
  }) => {
    const amount = 1_000_000n;
    const params = await setup(client, { token: usdc, amount });
    const [fill] = params.takeableOffers;
    assert(fill);
    const plan = await prepareMidnightTakeLend(client, {
      ...params,
      target: { type: "units", units: amount, maxBuyerAssets: amount },
      takeableOffers: [fill],
    });
    const txs = buildTransactions(
      parseTransactionPlan(serializeTransactionPlan(plan)),
    );
    const lend = txs.at(-1);
    assert(lend);
    for (const tx of txs.slice(0, -1)) {
      expect((await send(client, { account: lender, tx })).status).toBe(
        "success",
      );
    }
    if (scenario === "cancelled") {
      await client.writeContract({
        account: firstMaker,
        address: midnight,
        abi: midnightAbi,
        functionName: "setConsumed",
        args: [fill.offer.group, maxUint128, firstMaker],
      });
    } else {
      // Another lender consumes the same fixed quote before this stored plan executes.
      await client.deal({ erc20: usdc, account: secondMaker, amount });
      const competing = await prepareMidnightTakeLend(client, {
        ...params,
        account: secondMaker,
        target: { type: "units", units: amount, maxBuyerAssets: amount },
        takeableOffers: [fill],
      });
      for (const tx of buildTransactions(competing)) {
        expect((await send(client, { account: secondMaker, tx })).status).toBe(
          "success",
        );
      }
    }
    const balance = await client.balanceOf({ erc20: usdc, owner: lender });
    await expect(
      client.estimateGas({
        account: lender,
        to: lend.to,
        data: lend.data,
        value: lend.value,
      }),
    ).rejects.toThrow(/revert/i);
    expect(await credit(client, params.marketData)).toBe(0n);
    expect(await client.balanceOf({ erc20: usdc, owner: lender })).toBe(
      balance,
    );
  });
}
