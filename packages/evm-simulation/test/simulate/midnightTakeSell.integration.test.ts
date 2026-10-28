import {
  midnightRedeem,
  midnightSupplyCollateral,
  midnightTakeBorrow,
  midnightTakeWithdraw,
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
const RECEIVER: Address = "0x00000000000000000000000000000000000c0E57";
const OTHER: Address = "0x00000000000000000000000000000000000d0e57";

const marketData = new Market({
  params: new MarketParams({
    chainId: base.id,
    midnight,
    loanToken: usdc,
    collateralParams: [
      {
        token: wNative,
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
const market = marketData.params;
const marketId = MarketUtils.toId(market);
const LENT = 1_234_567n;
const REFERRAL_FEE = 10_000_000_000_000_000n;

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
const readCredit = (client: AnvilTestClient<typeof base>, user: Address) =>
  client.readContract({
    address: midnight,
    abi: midnightAbi,
    functionName: "credit",
    args: [marketId, user],
  });

const readWithdrawable = (client: AnvilTestClient<typeof base>) =>
  client.readContract({
    address: midnight,
    abi: midnightAbi,
    functionName: "withdrawable",
    args: [marketId],
  });

const setUp = async (
  client: AnvilTestClient<typeof base>,
  options: { readonly repayAmount?: bigint } = {},
) => {
  const repayAmount = options.repayAmount ?? LENT;
  const user = client.account.address;
  await client.setCode({
    address: oracle,
    bytecode: concatHex([
      "0x7f",
      padHex(toHex(10n ** 36n), { size: 32 }),
      "0x60005260206000f3",
    ]),
  });
  await client.setBalance({ address: offerMaker, value: parseEther("1") });
  await client.writeContract({
    account: offerMaker,
    address: midnight,
    abi: midnightAbi,
    functionName: "setIsAuthorized",
    args: [setterRatifier, true, offerMaker],
  });
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
  const entity = client.extend(morphoViemExtension()).morpho.midnight(base.id);
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
  const tree = Tree.create([
    Offer.create({
      market,
      buy: false,
      maker: offerMaker,
      expiry: market.maturity,
      tick: 5_000n,
      ratifier: setterRatifier,
      maxUnits: 2n * LENT,
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
  await client.deal({ erc20: usdc, amount: LENT });
  const lend = entity.takeLend({
    marketData,
    accountAddress: user,
    target: { type: "units", units: LENT, maxBuyerAssets: LENT },
    takeableOffers: [
      {
        units: 2n * LENT,
        offer: OfferUtils.toStruct({ offer: item.offer }),
        ratifierData: item.ratifierData,
      },
    ],
    maxContinuousFee: maxUint256,
    deadline: Time.timestamp() + 600n,
  });
  for (const requirement of await lend.getRequirements()) {
    if (!("to" in requirement)) throw new Error("expected an onchain call");
    await client.sendTransaction(
      requirement as Parameters<typeof client.sendTransaction>[0],
    );
  }
  await client.sendTransaction(lend.buildTx());
  await client.deal({ erc20: usdc, account: offerMaker, amount: LENT });
  await client.writeContract({
    account: offerMaker,
    address: usdc,
    abi: erc20Abi,
    functionName: "approve",
    args: [midnight, LENT],
  });
  await client.writeContract({
    account: offerMaker,
    address: midnight,
    abi: midnightAbi,
    functionName: "repay",
    args: [
      MarketUtils.toStruct(market),
      repayAmount,
      offerMaker,
      zeroAddress,
      "0x",
    ],
  });
  await expect(readCredit(client, user)).resolves.toBe(LENT);
  return { user, entity };
};

const prepareBuyOffer = async (client: AnvilTestClient<typeof base>) => {
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
  const tree = Tree.create([
    Offer.create({
      market,
      buy: true,
      maker: offerBuyer,
      expiry: market.maturity,
      tick: 5_000n,
      ratifier: setterRatifier,
      maxUnits: 10n * LENT,
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
      units: 10n * LENT,
      offer: OfferUtils.toStruct({ offer: item.offer }),
      ratifierData: item.ratifierData,
    },
  ] as const;
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
  return {
    user,
    seed: midnightSupplyCollateral({
      chainId: base.id,
      market,
      collateralIndex: 0n,
      assets: parseEther("10"),
      onBehalf: user,
    }),
    offers: await prepareBuyOffer(client),
  };
};

type SellTarget =
  | {
      readonly type: "assets";
      readonly assets: bigint;
      readonly maxUnits: bigint;
    }
  | {
      readonly type: "units";
      readonly units: bigint;
      readonly minSellerAssets: bigint;
    };
type SellActionOptions = {
  readonly target: SellTarget;
  readonly takeableOffers: Awaited<ReturnType<typeof prepareBuyOffer>>;
  readonly receiver?: Address;
  readonly referralFeeRecipient?: Address;
};

const borrow = ({
  target,
  takeableOffers,
  receiver = RECEIVER,
  referralFeeRecipient = receiver,
}: SellActionOptions) =>
  midnightTakeBorrow({
    chainId: base.id,
    market,
    target,
    receiver,
    takeableOffers,
    deadline: Time.timestamp() + 600n,
    referralFeePct: REFERRAL_FEE,
    referralFeeRecipient,
  });

const withdraw = ({
  target,
  takeableOffers,
  receiver = RECEIVER,
  referralFeeRecipient,
}: SellActionOptions) =>
  midnightTakeWithdraw({
    chainId: base.id,
    market,
    target,
    receiver,
    takeableOffers,
    deadline: Time.timestamp() + 600n,
    referralFeePct: REFERRAL_FEE,
    referralFeeRecipient: referralFeeRecipient ?? receiver,
  });

const clearCredit = async (
  client: AnvilTestClient<typeof base>,
  user: Address,
) => {
  const tx = midnightRedeem({
    chainId: base.id,
    market,
    units: LENT,
    onBehalf: user,
  });
  await client.sendTransaction({
    to: tx.to,
    data: tx.data,
    value: tx.value,
    account: user,
  });
};

describe.sequential("Midnight take sell limits — Base fork", () => {
  test("first takeBorrow resolves the market created by its collateral supply", async ({
    client,
  }) => {
    const { user, seed, offers } = await setUpFirstUse(client);
    const tx = borrow({
      target: { type: "units", units: 123_457n, minSellerAssets: 100_000n },
      takeableOffers: offers,
    });
    const result = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(user, seed), asTransaction(user, tx)],
      limits: toSimulationLimits(tx.action, {
        owner: user,
        receiver: RECEIVER,
        market: MarketUtils.toStruct(market),
        slippageTolerance: 0n,
      }),
    });
    expect(result.verification.operations[0]).toMatchObject({
      operation: "midnightTakeBorrow",
      marketId,
      receiver: RECEIVER,
      checkedLimits: {
        quote: { assetsReceived: 100_000n, unitsSold: 123_457n },
        slippageTolerance: 0n,
      },
    });
  });

  test("first takeBorrow rejects a violated quote while resolving the supplied market", async ({
    client,
  }) => {
    const { user, seed, offers } = await setUpFirstUse(client);
    const tx = borrow({
      target: { type: "units", units: 123_457n, minSellerAssets: 100_000n },
      takeableOffers: offers,
    });
    const error = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(user, seed), asTransaction(user, tx)],
      limits: toSimulationLimits(tx.action, {
        owner: user,
        receiver: RECEIVER,
        market: MarketUtils.toStruct(market),
        slippageTolerance: 0n,
        expected: { unitsSold: 1n },
      }),
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConsumerLimitViolationError);
    expect((error as Error).message).toContain("midnightTakeBorrow");
    expect((error as Error).message).toContain("unitsSold");
  });

  test("takeBorrow units target passes with accrued credit and receiver fee alias", async ({
    client,
  }) => {
    const { user } = await setUp(client);
    const offers = await prepareBuyOffer(client);
    const tx = borrow({
      target: { type: "units", units: 123_457n, minSellerAssets: 100_000n },
      takeableOffers: offers,
    });
    const result = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(user, tx)],
      limits: toSimulationLimits(tx.action, {
        owner: user,
        receiver: RECEIVER,
        slippageTolerance: 0n,
      }),
    });
    expect(result.verification.operations[0]).toMatchObject({
      operation: "midnightTakeBorrow",
      account: user,
      receiver: RECEIVER,
      checkedLimits: {
        quote: { assetsReceived: 100_000n, unitsSold: 123_457n },
        slippageTolerance: 0n,
      },
    });
  });

  test("takeBorrow assets target passes when existing credit covers the sale", async ({
    client,
  }) => {
    const { user } = await setUp(client);
    const offers = await prepareBuyOffer(client);
    const assets = 120_003n;
    const tx = borrow({
      target: { type: "assets", assets, maxUnits: 130_007n },
      takeableOffers: offers,
      referralFeeRecipient: OTHER,
    });
    expect(OTHER).not.toBe(RECEIVER);
    expect(OTHER).not.toBe(user);
    expect(tx.action.args.referralFeePct).toBeGreaterThan(0n);
    const result = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(user, tx)],
      limits: toSimulationLimits(tx.action, {
        owner: user,
        receiver: RECEIVER,
        slippageTolerance: 0n,
      }),
    });
    expect(result.verification.operations[0]).toMatchObject({
      operation: "midnightTakeBorrow",
      checkedLimits: {
        quote: {
          assetsReceived: assets,
          unitsSold: 130_007n,
        },
        slippageTolerance: 0n,
      },
    });
    const receiverUsdcChange = result.assetChanges
      .find(({ account }) => isAddressEqual(account, RECEIVER))
      ?.changes.find(({ token }) => isAddressEqual(token, usdc));
    const otherUsdcChange = result.assetChanges
      .find(({ account }) => isAddressEqual(account, OTHER))
      ?.changes.find(({ token }) => isAddressEqual(token, usdc));
    const referralFeeAssets =
      (assets * REFERRAL_FEE) / (10n ** 18n - REFERRAL_FEE);
    expect(receiverUsdcChange?.diff).toBe(assets);
    expect(otherUsdcChange?.diff).toBe(referralFeeAssets);
  });

  test("takeBorrow uses offers when the sender has no credit", async ({
    client,
  }) => {
    const { user } = await setUp(client);
    await clearCredit(client, user);
    await expect(readCredit(client, user)).resolves.toBe(0n);
    const offers = await prepareBuyOffer(client);
    const tx = borrow({
      target: { type: "units", units: 123_457n, minSellerAssets: 100_000n },
      takeableOffers: offers,
    });
    const result = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(user, tx)],
      limits: toSimulationLimits(tx.action, {
        owner: user,
        receiver: RECEIVER,
        slippageTolerance: 0n,
      }),
    });
    expect(result.verification.operations[0]?.operation).toBe(
      "midnightTakeBorrow",
    );
  });

  test("takeBorrow transitions from credit to debt when the target exceeds credit", async ({
    client,
  }) => {
    const { user } = await setUp(client);
    const offers = await prepareBuyOffer(client);
    const tx = borrow({
      target: {
        type: "units",
        units: LENT + 123_457n,
        minSellerAssets: 1_000_000n,
      },
      takeableOffers: offers,
    });
    const result = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(user, tx)],
      limits: toSimulationLimits(tx.action, {
        owner: user,
        receiver: RECEIVER,
        slippageTolerance: 0n,
      }),
    });
    expect(result.verification.operations[0]?.operation).toBe(
      "midnightTakeBorrow",
    );
  });

  test("takeBorrow rejects credit-to-debt growth above the unitsSold quote", async ({
    client,
  }) => {
    const { user } = await setUp(client);
    const offers = await prepareBuyOffer(client);
    const tx = borrow({
      target: {
        type: "units",
        units: LENT + 123_457n,
        minSellerAssets: 1_000_000n,
      },
      takeableOffers: offers,
    });
    const error = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(user, tx)],
      limits: toSimulationLimits(tx.action, {
        owner: user,
        receiver: RECEIVER,
        slippageTolerance: 0n,
        expected: { unitsSold: LENT },
      }),
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConsumerLimitViolationError);
    expect((error as Error).message).toContain("midnightTakeBorrow");
    expect((error as Error).message).toContain("unitsSold");
    expect((error as Error).message).not.toMatch(/transaction \d+/);
  });

  test("takeWithdraw units target is covered by withdrawable credit", async ({
    client,
  }) => {
    const { user } = await setUp(client);
    const offers = await prepareBuyOffer(client);
    const unitsTx = withdraw({
      target: { type: "units", units: 123_457n, minSellerAssets: 100_000n },
      takeableOffers: offers,
    });
    const unitsResult = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(user, unitsTx)],
      limits: toSimulationLimits(unitsTx.action, {
        owner: user,
        receiver: RECEIVER,
        slippageTolerance: 0n,
      }),
    });
    expect(unitsResult.verification.operations[0]?.operation).toBe(
      "midnightTakeWithdraw",
    );
  });

  test("takeWithdraw units target mixes withdrawable credit and offer fill", async ({
    client,
  }) => {
    const { user } = await setUp(client, {
      repayAmount: (2n * LENT) / 5n,
    });
    const withdrawableBefore = await readWithdrawable(client);
    const creditBefore = await readCredit(client, user);
    const units = 1_000_003n;
    expect(withdrawableBefore).toBeLessThan(units);
    expect(units).toBeLessThanOrEqual(creditBefore);

    const offers = await prepareBuyOffer(client);
    const unitsTx = withdraw({
      target: { type: "units", units, minSellerAssets: 100_003n },
      takeableOffers: offers,
      referralFeeRecipient: OTHER,
    });
    expect(unitsTx.action.args.referralFeePct).toBeGreaterThan(0n);

    const result = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(user, unitsTx)],
      limits: toSimulationLimits(unitsTx.action, {
        owner: user,
        receiver: RECEIVER,
        slippageTolerance: 0n,
      }),
    });
    expect(result.verification.operations[0]).toMatchObject({
      operation: "midnightTakeWithdraw",
      checkedLimits: {
        quote: { assetsReceived: 100_003n, creditRedeemed: units },
        slippageTolerance: 0n,
      },
    });
  });

  test("takeWithdraw assets target is covered by withdrawable credit", async ({
    client,
  }) => {
    const { user } = await setUp(client);
    const offers = await prepareBuyOffer(client);
    const assets = 120_003n;
    const assetsTx = withdraw({
      target: { type: "assets", assets, maxUnits: 130_007n },
      takeableOffers: offers,
      referralFeeRecipient: OTHER,
    });
    expect(OTHER).not.toBe(RECEIVER);
    expect(OTHER).not.toBe(user);
    expect(assetsTx.action.args.referralFeePct).toBeGreaterThan(0n);
    const assetsResult = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(user, assetsTx)],
      limits: toSimulationLimits(assetsTx.action, {
        owner: user,
        receiver: RECEIVER,
        slippageTolerance: 0n,
      }),
    });
    expect(assetsResult.verification.operations[0]).toMatchObject({
      operation: "midnightTakeWithdraw",
      checkedLimits: {
        quote: {
          assetsReceived: assets,
          creditRedeemed: 130_007n,
        },
        slippageTolerance: 0n,
      },
    });
    const receiverUsdcChange = assetsResult.assetChanges
      .find(({ account }) => isAddressEqual(account, RECEIVER))
      ?.changes.find(({ token }) => isAddressEqual(token, usdc));
    const otherUsdcChange = assetsResult.assetChanges
      .find(({ account }) => isAddressEqual(account, OTHER))
      ?.changes.find(({ token }) => isAddressEqual(token, usdc));
    const referralFeeAssets =
      (assets * REFERRAL_FEE) / (10n ** 18n - REFERRAL_FEE);
    expect(receiverUsdcChange?.diff).toBe(assets);
    expect(otherUsdcChange?.diff).toBe(referralFeeAssets);
  });

  test("takeWithdraw rejects an assets target below the credit reduction", async ({
    client,
  }) => {
    const { user } = await setUp(client);
    const offers = await prepareBuyOffer(client);
    const assetsTx = withdraw({
      target: { type: "assets", assets: 120_003n, maxUnits: 130_007n },
      takeableOffers: offers,
    });
    const error = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(user, assetsTx)],
      limits: toSimulationLimits(assetsTx.action, {
        owner: user,
        receiver: RECEIVER,
        slippageTolerance: 0n,
        expected: { creditRedeemed: 1n },
      }),
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConsumerLimitViolationError);
    expect((error as Error).message).toContain("midnightTakeWithdraw");
    expect((error as Error).message).toContain("creditRedeemed");
    expect((error as Error).message).not.toMatch(/transaction \d+/);
  });

  test("receiver proceeds account for a later transfer in the same bundle", async ({
    client,
  }) => {
    const { user } = await setUp(client);
    const offers = await prepareBuyOffer(client);
    const tx = borrow({
      target: { type: "assets", assets: 120_003n, maxUnits: 130_007n },
      takeableOffers: offers,
      receiver: user,
      referralFeeRecipient: OTHER,
    });
    const error = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [
        asTransaction(user, tx),
        {
          from: user,
          to: usdc,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "transfer",
            args: [OTHER, 101n],
          }),
          value: 0n,
        },
      ],
      limits: toSimulationLimits(tx.action, {
        owner: user,
        receiver: user,
      }),
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConsumerLimitViolationError);
    expect((error as Error).message).toContain("midnightTakeBorrow");
    expect((error as Error).message).toContain("assetsReceived");
    expect((error as Error).message).not.toMatch(/transaction \d+/);
  });

  test("takeBorrow rejects excessive net position reduction", async ({
    client,
  }) => {
    const { user } = await setUp(client);
    const offers = await prepareBuyOffer(client);
    const tx = borrow({
      target: { type: "units", units: 123_457n, minSellerAssets: 100_000n },
      takeableOffers: offers,
    });
    const error = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(user, tx)],
      limits: toSimulationLimits(tx.action, {
        owner: user,
        receiver: RECEIVER,
        slippageTolerance: 0n,
        expected: { unitsSold: 1n },
      }),
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConsumerLimitViolationError);
    expect((error as Error).message).toContain("midnightTakeBorrow");
    expect((error as Error).message).toContain("unitsSold");
    expect((error as Error).message).not.toMatch(/transaction \d+/);
  });

  test("takeWithdraw rejects debt changes elsewhere in the bundle", async ({
    client,
  }) => {
    const { user } = await setUp(client);
    const offers = await prepareBuyOffer(client);
    const reduce = withdraw({
      target: { type: "units", units: 123_457n, minSellerAssets: 100_000n },
      takeableOffers: offers,
    });
    const increase = borrow({
      target: {
        type: "units",
        units: 2n * LENT,
        minSellerAssets: 1_000_000n,
      },
      takeableOffers: offers,
      receiver: OTHER,
    });
    const error = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [
        asTransaction(user, reduce),
        asTransaction(user, increase),
      ],
      limits: toSimulationLimits(reduce.action, {
        owner: user,
        receiver: RECEIVER,
        slippageTolerance: 0n,
      }),
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConsumerLimitViolationError);
    expect((error as Error).message).toContain(
      "Limit operation 0 (midnightTakeWithdraw)",
    );
    expect((error as Error).message).toContain("debt changed");
    expect((error as Error).message).not.toMatch(/transaction \d+/);
  });
});
