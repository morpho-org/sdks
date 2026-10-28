import {
  midnightSupplyCollateral,
  midnightTakeBorrow,
  midnightTakeLend,
  morphoViemExtension,
} from "@morpho-org/morpho-sdk";
import { midnightAbi } from "@morpho-org/morpho-sdk/abis";
import { setterRatifierAbi } from "@morpho-org/morpho-sdk/midnight/abis";
import {
  Market,
  MarketParams,
  Offer,
  Tree,
} from "@morpho-org/morpho-sdk/midnight/entities";
import {
  MarketUtils,
  OfferUtils,
  SetterRatifierUtils,
} from "@morpho-org/morpho-sdk/midnight/utils";
import { ChainId, getChainAddress, Time } from "@morpho-org/morpho-ts";
import { type AnvilTestClient, getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  concatHex,
  encodeFunctionData,
  erc20Abi,
  isAddressEqual,
  maxUint256,
  padHex,
  parseEther,
  toHex,
  zeroAddress,
} from "viem";
import { base } from "viem/chains";
import { describe, expect } from "vitest";
import {
  ConsumerLimitViolationError,
  simulate,
  toSimulationLimits,
} from "../../src/index.js";

const test = createViemTest(base, {
  forkUrl: getErpcForkUrl(base.id, process.env.ERPC_SECRET),
  chainId: base.id,
  forkBlockNumber: 52_252_000n,
}).extend<{ client: AnvilTestClient<typeof base> }>({
  client: async ({ client }, use) => {
    await client.setCode({ address: client.account.address, bytecode: "0x" });
    await use(client);
  },
});

const midnight = getChainAddress(ChainId.BaseMainnet, "midnight");
const midnightBundlesV2 = getChainAddress(
  ChainId.BaseMainnet,
  "midnightBundlesV2",
);
const setterRatifier = getChainAddress(ChainId.BaseMainnet, "setterRatifier");
const usdc = getChainAddress(ChainId.BaseMainnet, "usdc");
const wNative = getChainAddress(ChainId.BaseMainnet, "wNative");
const oracle: Address = "0x0000000000000000000000000000000000080000";
const offerMaker: Address = "0x9000000000000000000000000000000000000000";
const offerBuyer: Address = "0x8000000000000000000000000000000000000000";
const OTHER: Address = "0x00000000000000000000000000000000000d0e57";
const LENT = 1_234_567n;
const WAD = 10n ** 18n;
const REFERRAL_FEE = 37n * 10n ** 14n;

const makeMarketData = (loanToken: Address, collateralToken: Address) =>
  new Market({
    params: new MarketParams({
      chainId: base.id,
      midnight,
      loanToken,
      collateralParams: [
        {
          token: collateralToken,
          lltv: 770000000000000000n,
          liquidationCursor: 300000000000000000n,
          oracle,
        },
      ],
      maturity: 2_000_000_000n,
      rcfThreshold: 0n,
      enterGate: zeroAddress,
      liquidatorGate: zeroAddress,
    }),
    totalUnits: 0n,
    lossFactor: 0n,
    withdrawable: 0n,
    continuousFeeCredit: 0n,
    settlementFeeCbps: [0, 0, 0, 0, 0, 0, 0],
    continuousFee: 0,
    tickSpacing: 1,
  });
const marketData = makeMarketData(usdc, wNative);
const market = marketData.params;
const marketId = MarketUtils.toId(market);

const configFor = (client: { transport: { url?: string } }) => ({
  chains: new Map([[base.id, { simulateV1Url: client.transport.url! }]]),
});
const asTransaction = (
  from: Address,
  tx: {
    readonly to: Address;
    readonly data: `0x${string}`;
    readonly value: bigint;
  },
) => ({ from, to: tx.to, data: tx.data, value: tx.value });
const tokenDiff = (
  result: Awaited<ReturnType<typeof simulate>>,
  { account, token }: { readonly account: Address; readonly token: Address },
) =>
  result.assetChanges
    .find(({ account: changedAccount }) =>
      isAddressEqual(changedAccount, account),
    )
    ?.changes.find(({ token: changedToken }) =>
      isAddressEqual(changedToken, token),
    )?.diff;
const readDebt = (client: AnvilTestClient<typeof base>, owner: Address) =>
  client.readContract({
    address: midnight,
    abi: midnightAbi,
    functionName: "debt",
    args: [marketId, owner],
  });

const readCredit = (client: AnvilTestClient<typeof base>, owner: Address) =>
  client.readContract({
    address: midnight,
    abi: midnightAbi,
    functionName: "credit",
    args: [marketId, owner],
  });

const setUp = async (client: AnvilTestClient<typeof base>) => {
  const user = client.account.address;
  await client.setCode({
    address: oracle,
    bytecode: concatHex([
      "0x7f",
      padHex(toHex(10n ** 36n), { size: 32 }),
      "0x60005260206000f3",
    ]),
  });
  await client.setBalance({ address: user, value: parseEther("10") });
  await client.setBalance({ address: offerMaker, value: parseEther("2") });
  await client.writeContract({
    account: offerMaker,
    address: midnight,
    abi: midnightAbi,
    functionName: "setIsAuthorized",
    args: [setterRatifier, true, offerMaker],
  });
  const entity = client.extend(morphoViemExtension()).morpho.midnight(base.id);

  await client.deal({
    erc20: wNative,
    account: offerMaker,
    amount: parseEther("10"),
  });
  await client.writeContract({
    account: offerMaker,
    address: wNative,
    abi: erc20Abi,
    functionName: "approve",
    args: [midnight, maxUint256],
  });
  await client.sendTransaction({
    ...entity
      .supplyCollateral({
        marketData,
        accountAddress: offerMaker,
        collateralAssets: parseEther("10"),
        reservedCollateralAssets: 0n,
      })
      .buildTx(),
    account: offerMaker,
  });

  await client.deal({
    erc20: wNative,
    account: user,
    amount: parseEther("10"),
  });
  await client.writeContract({
    account: user,
    address: wNative,
    abi: erc20Abi,
    functionName: "approve",
    args: [midnight, maxUint256],
  });
  await client.sendTransaction({
    ...entity
      .supplyCollateral({
        marketData,
        accountAddress: user,
        collateralAssets: parseEther("10"),
        reservedCollateralAssets: 0n,
      })
      .buildTx(),
    account: user,
  });
  await client.writeContract({
    account: user,
    address: midnight,
    abi: midnightAbi,
    functionName: "setIsAuthorized",
    args: [midnightBundlesV2, true, user],
  });
  await client.deal({ erc20: usdc, account: user, amount: 20n * LENT });
  await client.writeContract({
    account: user,
    address: usdc,
    abi: erc20Abi,
    functionName: "approve",
    args: [midnightBundlesV2, maxUint256],
  });
  return { user, entity };
};

const setUpFirstUse = async (client: AnvilTestClient<typeof base>) => {
  const user = client.account.address;
  await client.setCode({
    address: oracle,
    bytecode: concatHex([
      "0x7f",
      padHex(toHex(10n ** 36n), { size: 32 }),
      "0x60005260206000f3",
    ]),
  });
  await client.setBalance({ address: user, value: parseEther("10") });
  await client.setBalance({ address: offerMaker, value: parseEther("2") });
  await client.writeContract({
    account: offerMaker,
    address: midnight,
    abi: midnightAbi,
    functionName: "setIsAuthorized",
    args: [setterRatifier, true, offerMaker],
  });
  await client.writeContract({
    account: offerMaker,
    address: midnight,
    abi: midnightAbi,
    functionName: "setIsAuthorized",
    args: [user, true, offerMaker],
  });
  await client.deal({
    erc20: wNative,
    account: user,
    amount: parseEther("10"),
  });
  await client.writeContract({
    account: user,
    address: wNative,
    abi: erc20Abi,
    functionName: "approve",
    args: [midnight, maxUint256],
  });
  await client.writeContract({
    account: user,
    address: midnight,
    abi: midnightAbi,
    functionName: "setIsAuthorized",
    args: [midnightBundlesV2, true, user],
  });
  await client.deal({ erc20: usdc, account: user, amount: 20n * LENT });
  await client.writeContract({
    account: user,
    address: usdc,
    abi: erc20Abi,
    functionName: "approve",
    args: [midnightBundlesV2, maxUint256],
  });
  return {
    user,
    seed: midnightSupplyCollateral({
      chainId: base.id,
      market,
      collateralIndex: 0n,
      assets: parseEther("10"),
      onBehalf: offerMaker,
    }),
  };
};

const prepareLendOffers = async (
  client: AnvilTestClient<typeof base>,
  lendMarket: MarketParams,
) => {
  const maxUnits = 10n * LENT;
  const tree = Tree.create([
    Offer.create({
      market: lendMarket,
      buy: false,
      maker: offerMaker,
      expiry: lendMarket.maturity,
      tick: 5_000n,
      ratifier: setterRatifier,
      maxUnits,
      continuousFeeCap: 0n,
    }),
  ]);
  await client.writeContract({
    account: offerMaker,
    address: setterRatifier,
    abi: setterRatifierAbi,
    functionName: "setIsRootRatified",
    args: [offerMaker, tree.root, true],
  });
  const item = SetterRatifierUtils.ratify({ tree })[0]!;
  return [
    {
      units: maxUnits,
      offer: OfferUtils.toStruct({ offer: item.offer }),
      ratifierData: item.ratifierData,
    },
  ] as const;
};

const prepareBorrowOffers = async (
  client: AnvilTestClient<typeof base>,
  borrowMarket: MarketParams,
) => {
  await client.setBalance({ address: offerBuyer, value: parseEther("1") });
  await client.writeContract({
    account: offerBuyer,
    address: midnight,
    abi: midnightAbi,
    functionName: "setIsAuthorized",
    args: [setterRatifier, true, offerBuyer],
  });
  await client.deal({
    erc20: usdc,
    account: offerBuyer,
    amount: 10n * LENT,
  });
  await client.writeContract({
    account: offerBuyer,
    address: usdc,
    abi: erc20Abi,
    functionName: "approve",
    args: [midnight, maxUint256],
  });
  const maxUnits = 10n * LENT;
  const tree = Tree.create([
    Offer.create({
      market: borrowMarket,
      buy: true,
      maker: offerBuyer,
      expiry: borrowMarket.maturity,
      tick: 5_000n,
      ratifier: setterRatifier,
      maxUnits,
      continuousFeeCap: 0n,
    }),
  ]);
  await client.writeContract({
    account: offerBuyer,
    address: setterRatifier,
    abi: setterRatifierAbi,
    functionName: "setIsRootRatified",
    args: [offerBuyer, tree.root, true],
  });
  const item = SetterRatifierUtils.ratify({ tree })[0]!;
  return [
    {
      units: maxUnits,
      offer: OfferUtils.toStruct({ offer: item.offer }),
      ratifierData: item.ratifierData,
    },
  ] as const;
};

type LendTarget = Parameters<typeof midnightTakeLend>[0]["target"];
type LendOffers = Awaited<ReturnType<typeof prepareLendOffers>>;
const lend = ({
  market: lendMarket,
  target,
  takeableOffers,
  nativeAmount,
  referralFeePct = 0n,
  referralFeeRecipient = zeroAddress,
}: {
  readonly market: MarketParams;
  readonly target: LendTarget;
  readonly takeableOffers: LendOffers;
  readonly nativeAmount?: bigint;
  readonly referralFeePct?: bigint;
  readonly referralFeeRecipient?: Address;
}) =>
  midnightTakeLend({
    chainId: base.id,
    market: lendMarket,
    target,
    takeableOffers,
    maxContinuousFee: maxUint256,
    deadline: Time.timestamp() + 600n,
    referralFeePct,
    referralFeeRecipient,
    ...(nativeAmount !== undefined ? { nativeAmount } : {}),
  });

const setUpNativeMarket = async (client: AnvilTestClient<typeof base>) => {
  const { user, entity } = await setUp(client);
  const nativeMarketData = makeMarketData(wNative, usdc);
  const nativeMarket = nativeMarketData.params;
  for (const account of [offerMaker, user]) {
    await client.deal({ erc20: usdc, account, amount: 10n * LENT });
    await client.writeContract({
      account,
      address: usdc,
      abi: erc20Abi,
      functionName: "approve",
      args: [midnight, maxUint256],
    });
    await client.sendTransaction({
      ...entity
        .supplyCollateral({
          marketData: nativeMarketData,
          accountAddress: account,
          collateralAssets: 10n * LENT,
          reservedCollateralAssets: 0n,
        })
        .buildTx(),
      account,
    });
  }
  await client.deal({ erc20: wNative, account: user, amount: 10n * LENT });
  await client.writeContract({
    account: user,
    address: wNative,
    abi: erc20Abi,
    functionName: "approve",
    args: [midnightBundlesV2, maxUint256],
  });
  return {
    user,
    nativeMarket,
    offers: await prepareLendOffers(client, nativeMarket),
  };
};

describe.sequential("Midnight takeLend limits — Base fork", () => {
  test("first takeLend resolves the market created by an earlier bundle supply", async ({
    client,
  }) => {
    const { user, seed } = await setUpFirstUse(client);
    const offers = await prepareLendOffers(client, market);
    const tx = lend({
      market,
      target: { type: "units", units: 123_457n, maxBuyerAssets: 500_000n },
      takeableOffers: offers,
    });
    const result = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(user, seed), asTransaction(user, tx)],
      limits: toSimulationLimits(tx.action, {
        owner: user,
        market: MarketUtils.toStruct(market),
        slippageTolerance: 0n,
      }),
    });
    expect(result.verification.operations[0]).toMatchObject({
      operation: "midnightTakeLend",
      marketId,
      checkedLimits: {
        quote: { assetsPaid: 500_000n, unitsBought: 123_457n },
        slippageTolerance: 0n,
      },
    });
  });

  test("first takeLend rejects a violated quote while resolving the supplied market", async ({
    client,
  }) => {
    const { user, seed } = await setUpFirstUse(client);
    const offers = await prepareLendOffers(client, market);
    const tx = lend({
      market,
      target: { type: "units", units: 123_457n, maxBuyerAssets: 500_000n },
      takeableOffers: offers,
    });
    const error = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(user, seed), asTransaction(user, tx)],
      limits: toSimulationLimits(tx.action, {
        owner: user,
        market: MarketUtils.toStruct(market),
        slippageTolerance: 0n,
        expected: { assetsPaid: 1n },
      }),
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConsumerLimitViolationError);
    expect((error as Error).message).toContain("midnightTakeLend");
    expect((error as Error).message).toContain("assetsPaid");
  });

  test("assets target passes with the encoded minimum net units", async ({
    client,
  }) => {
    const { user } = await setUp(client);
    const offers = await prepareLendOffers(client, market);
    const tx = lend({
      market,
      target: { type: "assets", assets: 120_003n, minUnits: 1n },
      takeableOffers: offers,
    });
    const result = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(user, tx)],
      limits: toSimulationLimits(tx.action, {
        owner: user,
        slippageTolerance: 0n,
      }),
    });
    expect(result.verification.operations[0]).toMatchObject({
      operation: "midnightTakeLend",
      account: user,
      marketId,
      checkedLimits: {
        quote: { assetsPaid: 120_003n, unitsBought: 1n },
        slippageTolerance: 0n,
      },
    });
  });

  test("units target passes and refunds the unused loan-token cap", async ({
    client,
  }) => {
    const { user } = await setUp(client);
    const offers = await prepareLendOffers(client, market);
    const cap = 1_000_000n;
    const tx = lend({
      market,
      target: { type: "units", units: 123_457n, maxBuyerAssets: cap },
      takeableOffers: offers,
    });
    const result = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(user, tx)],
      limits: toSimulationLimits(tx.action, {
        owner: user,
        slippageTolerance: 0n,
      }),
    });
    const paid = tokenDiff(result, { account: user, token: usdc });
    expect(paid).toBeLessThan(0n);
    expect(-paid!).toBeLessThan(cap);
    expect(result.verification.operations[0]).toMatchObject({
      operation: "midnightTakeLend",
      checkedLimits: {
        quote: { assetsPaid: cap, unitsBought: 123_457n },
        slippageTolerance: 0n,
      },
    });
  });

  test("pre-existing credit does not replace the take's net-position increase", async ({
    client,
  }) => {
    const { user } = await setUp(client);
    const offers = await prepareLendOffers(client, market);
    const seededUnits = 200_003n;
    const seed = lend({
      market,
      target: {
        type: "units",
        units: seededUnits,
        maxBuyerAssets: 500_000n,
      },
      takeableOffers: offers,
    });
    await client.sendTransaction({
      ...asTransaction(user, seed),
      account: user,
    });
    const creditBefore = await readCredit(client, user);
    expect(creditBefore).toBeGreaterThan(0n);

    const units = 123_457n;
    expect(creditBefore).toBeGreaterThan(units);
    const tx = lend({
      market,
      target: { type: "units", units, maxBuyerAssets: 500_000n },
      takeableOffers: offers,
    });
    const result = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(user, tx)],
      limits: toSimulationLimits(tx.action, {
        owner: user,
        slippageTolerance: 0n,
      }),
    });
    expect(result.verification.operations[0]).toMatchObject({
      operation: "midnightTakeLend",
      marketId,
      checkedLimits: {
        quote: { assetsPaid: 500_000n, unitsBought: units },
        slippageTolerance: 0n,
      },
    });
  });

  test("third-party referral fee is covered at zero tolerance", async ({
    client,
  }) => {
    const { user } = await setUp(client);
    const offers = await prepareLendOffers(client, market);
    const assets = 120_003n;
    const tx = lend({
      market,
      target: { type: "assets", assets, minUnits: 1n },
      takeableOffers: offers,
      referralFeePct: REFERRAL_FEE,
      referralFeeRecipient: OTHER,
    });
    expect(tx.action.args.referralFeePct).toBe(37n * 10n ** 14n);
    const result = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(user, tx)],
      limits: toSimulationLimits(tx.action, {
        owner: user,
        slippageTolerance: 0n,
      }),
    });
    expect(tokenDiff(result, { account: OTHER, token: usdc })).toBe(
      (assets * REFERRAL_FEE) / WAD,
    );
    expect(result.verification.operations[0]?.operation).toBe(
      "midnightTakeLend",
    );
  });

  test("self-referral is netted into the owner's loan-token debit", async ({
    client,
  }) => {
    const { user } = await setUp(client);
    const offers = await prepareLendOffers(client, market);
    const assets = 120_003n;
    const tx = lend({
      market,
      target: { type: "assets", assets, minUnits: 1n },
      takeableOffers: offers,
      referralFeePct: REFERRAL_FEE,
      referralFeeRecipient: user,
    });
    const result = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(user, tx)],
      limits: toSimulationLimits(tx.action, {
        owner: user,
        slippageTolerance: 0n,
      }),
    });
    const paid = tokenDiff(result, { account: user, token: usdc });
    expect(paid).toBeLessThan(0n);
    expect(-paid!).toBeLessThan(assets);
    expect(result.verification.operations[0]?.operation).toBe(
      "midnightTakeLend",
    );
  });

  test("buying while in debt is measured as a net-position increase", async ({
    client,
  }) => {
    const { user } = await setUp(client);
    const borrowOffers = await prepareBorrowOffers(client, market);
    const borrowTx = midnightTakeBorrow({
      chainId: base.id,
      market,
      target: { type: "units", units: 123_457n, minSellerAssets: 1n },
      receiver: user,
      takeableOffers: borrowOffers,
      deadline: Time.timestamp() + 600n,
      referralFeePct: 0n,
      referralFeeRecipient: user,
    });
    await client.sendTransaction({
      to: borrowTx.to,
      data: borrowTx.data,
      value: borrowTx.value,
      account: user,
    });
    const debt = await readDebt(client, user);
    expect(debt).toBeGreaterThan(0n);
    await expect(readCredit(client, user)).resolves.toBe(0n);

    const lendOffers = await prepareLendOffers(client, market);
    const units = debt + 1n;
    const tx = lend({
      market,
      target: { type: "units", units, maxBuyerAssets: 500_000n },
      takeableOffers: lendOffers,
    });
    const result = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(user, tx)],
      limits: toSimulationLimits(tx.action, {
        owner: user,
        slippageTolerance: 0n,
      }),
    });
    expect(result.verification.operations[0]).toMatchObject({
      operation: "midnightTakeLend",
      marketId,
      checkedLimits: {
        quote: { assetsPaid: 500_000n, unitsBought: units },
        slippageTolerance: 0n,
      },
    });
    expect(units).toBeGreaterThan(debt);
  });

  test("a later same-market sell violates the takeLend net-position minimum", async ({
    client,
  }) => {
    const { user } = await setUp(client);
    const buyUnits = 123_457n;
    const buyOffers = await prepareLendOffers(client, market);
    const buyTx = lend({
      market,
      target: {
        type: "units",
        units: buyUnits,
        maxBuyerAssets: 500_000n,
      },
      takeableOffers: buyOffers,
    });
    const sellOffers = await prepareBorrowOffers(client, market);
    const sellTx = midnightTakeBorrow({
      chainId: base.id,
      market,
      target: {
        type: "units",
        units: buyUnits + 1n,
        minSellerAssets: 1n,
      },
      receiver: user,
      takeableOffers: sellOffers,
      deadline: Time.timestamp() + 600n,
      referralFeePct: 0n,
      referralFeeRecipient: user,
    });
    const limits = toSimulationLimits(buyTx.action, {
      owner: user,
      slippageTolerance: 0n,
    });
    expect(limits.operations[0]).toMatchObject({
      type: "midnightTakeLend",
      marketId,
    });

    let failure: unknown;
    try {
      await simulate(configFor(client), {
        chainId: base.id,
        transactions: [asTransaction(user, buyTx), asTransaction(user, sellTx)],
        limits,
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(ConsumerLimitViolationError);
    expect((failure as Error).message).toContain(
      "Limit operation 0 (midnightTakeLend)",
    );
    expect((failure as Error).message).toContain("unitsBought");
  });

  test("two takes use one aggregate market quote", async ({ client }) => {
    const { user } = await setUp(client);
    const offers = await prepareLendOffers(client, market);
    const first = lend({
      market,
      target: { type: "assets", assets: 100_003n, minUnits: 1n },
      takeableOffers: offers,
    });
    const second = lend({
      market,
      target: { type: "assets", assets: 90_007n, minUnits: 1n },
      takeableOffers: offers,
    });
    const limits = toSimulationLimits(first.action, {
      owner: user,
      expected: { assetsPaid: 190_010n, unitsBought: 2n },
      slippageTolerance: 0n,
    });
    const result = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(user, first), asTransaction(user, second)],
      limits,
    });
    expect(result.verification.operations).toHaveLength(1);
    expect(result.verification.operations[0]).toMatchObject({
      operation: "midnightTakeLend",
      marketId,
      checkedLimits: {
        quote: { assetsPaid: 190_010n, unitsBought: 2n },
        slippageTolerance: 0n,
      },
    });
  });

  test("an unrelated loan-token transfer violates the buy limit subject", async ({
    client,
  }) => {
    const { user } = await setUp(client);
    const offers = await prepareLendOffers(client, market);
    const tx = lend({
      market,
      target: { type: "assets", assets: 120_003n, minUnits: 1n },
      takeableOffers: offers,
    });
    const limits = toSimulationLimits(tx.action, {
      owner: user,
      slippageTolerance: 0n,
    });
    expect(limits.operations[0]).toMatchObject({
      type: "midnightTakeLend",
      marketId,
    });
    const transfer = {
      to: usdc,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [OTHER, 1n],
      }),
      value: 0n,
    };
    let failure: unknown;
    try {
      await simulate(configFor(client), {
        chainId: base.id,
        transactions: [asTransaction(user, tx), asTransaction(user, transfer)],
        limits,
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(ConsumerLimitViolationError);
    expect((failure as Error).message).toContain("midnightTakeLend");
    expect((failure as Error).message).toContain("assetsPaid");
  });

  test("partial native funding measures ETH and net wNative against the full cap", async ({
    client,
  }) => {
    const { user, nativeMarket, offers } = await setUpNativeMarket(client);
    const cap = 200_003n;
    const nativeAmount = 100_001n;
    const tx = lend({
      market: nativeMarket,
      target: { type: "assets", assets: cap, minUnits: 1n },
      takeableOffers: offers,
      nativeAmount,
    });
    const result = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(user, tx)],
      limits: toSimulationLimits(tx.action, {
        owner: user,
        slippageTolerance: 0n,
      }),
    });
    expect(result.verification.operations[0]).toMatchObject({
      operation: "midnightTakeLend",
      checkedLimits: {
        quote: { assetsPaid: cap, unitsBought: 1n },
        slippageTolerance: 0n,
      },
    });
  });

  test("partial native funding bounds ETH sent above the builder value", async ({
    client,
  }) => {
    const { user, nativeMarket, offers } = await setUpNativeMarket(client);
    const cap = 200_003n;
    const nativeAmount = 100_001n;
    const tx = lend({
      market: nativeMarket,
      target: { type: "assets", assets: cap, minUnits: 1n },
      takeableOffers: offers,
      nativeAmount,
    });
    const transaction = asTransaction(user, tx);
    expect(transaction.value).toBe(nativeAmount);
    const result = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [{ ...transaction, value: nativeAmount + 1n }],
      limits: toSimulationLimits(tx.action, {
        owner: user,
        slippageTolerance: 0n,
      }),
    });
    expect(result.verification.operations[0]).toMatchObject({
      operation: "midnightTakeLend",
      checkedLimits: {
        quote: { assetsPaid: cap, unitsBought: 1n },
        slippageTolerance: 0n,
      },
    });
  });

  test("fully native assets target uses native ETH measurement", async ({
    client,
  }) => {
    const { user, nativeMarket, offers } = await setUpNativeMarket(client);
    const cap = 200_003n;
    const tx = lend({
      market: nativeMarket,
      target: { type: "assets", assets: cap, minUnits: 1n },
      takeableOffers: offers,
      nativeAmount: cap,
    });
    const result = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(user, tx)],
      limits: toSimulationLimits(tx.action, {
        owner: user,
        slippageTolerance: 0n,
      }),
    });
    expect(result.verification.operations[0]).toMatchObject({
      operation: "midnightTakeLend",
      checkedLimits: {
        quote: { assetsPaid: cap, unitsBought: 1n },
        slippageTolerance: 0n,
      },
    });
  });

  test("native take plus later wNative transfer violates the spend cap", async ({
    client,
  }) => {
    const { user, nativeMarket, offers } = await setUpNativeMarket(client);
    const cap = 200_003n;
    const tx = lend({
      market: nativeMarket,
      target: { type: "assets", assets: cap, minUnits: 1n },
      takeableOffers: offers,
      nativeAmount: cap,
    });
    const limits = toSimulationLimits(tx.action, {
      owner: user,
      slippageTolerance: 0n,
    });
    expect(limits.operations[0]).toMatchObject({
      type: "midnightTakeLend",
      marketId: MarketUtils.toId(nativeMarket),
    });
    const transfer = {
      to: wNative,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [OTHER, 1n],
      }),
      value: 0n,
    };

    let failure: unknown;
    try {
      await simulate(configFor(client), {
        chainId: base.id,
        transactions: [asTransaction(user, tx), asTransaction(user, transfer)],
        limits,
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(ConsumerLimitViolationError);
    expect((failure as Error).message).toContain("midnightTakeLend");
    expect((failure as Error).message).toContain("assetsPaid");
  });

  test("fully native units target refunds unused wNative", async ({
    client,
  }) => {
    const { user, nativeMarket, offers } = await setUpNativeMarket(client);
    const cap = 1_000_000n;
    const units = 100_003n;
    const tx = lend({
      market: nativeMarket,
      target: { type: "units", units, maxBuyerAssets: cap },
      takeableOffers: offers,
      nativeAmount: cap,
    });
    const result = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(user, tx)],
      limits: toSimulationLimits(tx.action, {
        owner: user,
        slippageTolerance: 0n,
      }),
    });
    expect(
      tokenDiff(result, { account: user, token: wNative }),
    ).toBeGreaterThan(0n);
    expect(result.verification.operations[0]).toMatchObject({
      operation: "midnightTakeLend",
      checkedLimits: {
        quote: { assetsPaid: cap, unitsBought: units },
        slippageTolerance: 0n,
      },
    });
  });
});
