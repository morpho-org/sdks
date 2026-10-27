import {
  midnightRepayWithdrawCollateral,
  midnightTakeBorrow,
  midnightTakeLend,
  midnightTakeRepayWithdrawCollateral,
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
  erc20Abi,
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

const takeRepayViolation = (field: string) => (error: unknown) =>
  error instanceof ConsumerLimitViolationError &&
  error.message.includes(
    "Limit operation 0 (midnightTakeRepayWithdrawCollateral",
  ) &&
  error.message.includes(field);

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
const wNativeOracle: Address = "0x0000000000000000000000000000000000080001";
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
const wNativeMarketData = new Market({
  params: new MarketParams({
    chainId: base.id,
    midnight,
    loanToken: wNative,
    collateralParams: [
      {
        token: usdc,
        lltv: 770000000000000000n,
        liquidationCursor: 300000000000000000n,
        oracle: wNativeOracle,
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
const wNativeMarket = wNativeMarketData.params;
const wNativeMarketId = MarketUtils.toId(wNativeMarket);

const baseFixture = {
  marketData,
  market,
  marketId,
  loanToken: usdc,
  collateralToken: wNative,
  oracleAddress: oracle,
  oraclePrice: 10n ** 36n,
  lent: LENT,
  collateralAssets: parseEther("10"),
};
const wNativeLoanFixture = {
  marketData: wNativeMarketData,
  market: wNativeMarket,
  marketId: wNativeMarketId,
  loanToken: wNative,
  collateralToken: usdc,
  oracleAddress: wNativeOracle,
  oraclePrice: 10n ** 48n,
  lent: parseEther("1"),
  collateralAssets: 1_000_000_000n,
};
type MarketFixture = typeof baseFixture;

const configFor = (client: { transport: { url?: string } }) => ({
  chains: new Map([[base.id, { simulateV1Url: client.transport.url! }]]),
});

const readDebtAt = (
  client: AnvilTestClient<typeof base>,
  { user, id }: { user: Address; id: typeof marketId },
) =>
  client.readContract({
    address: midnight,
    abi: midnightAbi,
    functionName: "debt",
    args: [id, user],
  });

const readCollateralAt = (
  client: AnvilTestClient<typeof base>,
  { user, id }: { user: Address; id: typeof marketId },
) =>
  client.readContract({
    address: midnight,
    abi: midnightAbi,
    functionName: "collateral",
    args: [id, user, 0n],
  });

const readCollateral = (client: AnvilTestClient<typeof base>, user: Address) =>
  readCollateralAt(client, { user, id: marketId });

const readCreditAt = (
  client: AnvilTestClient<typeof base>,
  { user, id }: { user: Address; id: typeof marketId },
) =>
  client.readContract({
    address: midnight,
    abi: midnightAbi,
    functionName: "credit",
    args: [id, user],
  });

const setUp = async (
  client: AnvilTestClient<typeof base>,
  fixture: MarketFixture = baseFixture,
) => {
  const {
    marketData: fixtureMarketData,
    market: fixtureMarket,
    marketId: fixtureMarketId,
    loanToken,
    collateralToken,
    oracleAddress,
    oraclePrice,
    lent,
    collateralAssets,
  } = fixture;
  const user = client.account.address;
  await client.setCode({
    address: oracleAddress,
    bytecode: concatHex([
      "0x7f",
      padHex(toHex(oraclePrice), { size: 32 }),
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
    erc20: collateralToken,
    account: offerMaker,
    amount: collateralAssets,
  });
  await client.writeContract({
    account: offerMaker,
    address: collateralToken,
    abi: erc20Abi,
    functionName: "approve",
    args: [midnight, maxUint256],
  });
  const entity = client.extend(morphoViemExtension()).morpho.midnight(base.id);
  await client.sendTransaction({
    ...entity
      .supplyCollateral({
        marketData: fixtureMarketData,
        accountAddress: offerMaker,
        collateralAssets,
        reservedCollateralAssets: 0n,
      })
      .buildTx(),
    account: offerMaker,
  });
  await client.deal({
    erc20: collateralToken,
    account: user,
    amount: collateralAssets,
  });
  await client.writeContract({
    account: user,
    address: collateralToken,
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
  await client.sendTransaction({
    ...entity
      .supplyCollateral({
        marketData: fixtureMarketData,
        accountAddress: user,
        collateralAssets,
        reservedCollateralAssets: 0n,
      })
      .buildTx(),
    account: user,
  });
  const tree = Tree.create([
    Offer.create({
      market: fixtureMarket,
      buy: false,
      maker: offerMaker,
      expiry: fixtureMarket.maturity,
      tick: 5_000n,
      ratifier: setterRatifier,
      maxUnits: 4n * lent,
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
  await client.deal({ erc20: loanToken, amount: lent });
  const lend = entity.takeLend({
    marketData: fixtureMarketData,
    accountAddress: user,
    target: { type: "units", units: lent, maxBuyerAssets: lent },
    takeableOffers: [
      {
        units: 2n * lent,
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
  await client.deal({ erc20: loanToken, account: offerMaker, amount: lent });
  await client.writeContract({
    account: offerMaker,
    address: loanToken,
    abi: erc20Abi,
    functionName: "approve",
    args: [midnight, lent],
  });
  await client.writeContract({
    account: offerMaker,
    address: midnight,
    abi: midnightAbi,
    functionName: "repay",
    args: [
      MarketUtils.toStruct(fixtureMarket),
      lent,
      offerMaker,
      zeroAddress,
      "0x",
    ],
  });
  await expect(
    readCreditAt(client, { user, id: fixtureMarketId }),
  ).resolves.toBe(lent);
  return {
    user,
    sellOffers: [
      {
        units: 4n * lent,
        offer: OfferUtils.toStruct({ offer: item.offer }),
        ratifierData: item.ratifierData,
      },
    ] as const,
  };
};

const prepareBuyOffer = async (
  client: AnvilTestClient<typeof base>,
  fixture: MarketFixture = baseFixture,
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
    erc20: fixture.loanToken,
    account: offerBuyer,
    amount: 10n * fixture.lent,
  });
  await client.writeContract({
    account: offerBuyer,
    address: fixture.loanToken,
    abi: erc20Abi,
    functionName: "approve",
    args: [midnight, maxUint256],
  });
  const tree = Tree.create([
    Offer.create({
      market: fixture.market,
      buy: true,
      maker: offerBuyer,
      expiry: fixture.market.maturity,
      tick: 5_000n,
      ratifier: setterRatifier,
      maxUnits: 10n * fixture.lent,
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
      units: 10n * fixture.lent,
      offer: OfferUtils.toStruct({ offer: item.offer }),
      ratifierData: item.ratifierData,
    },
  ] as const;
};

const createDebt = async (
  client: AnvilTestClient<typeof base>,
  { user, fixture = baseFixture }: { user: Address; fixture?: MarketFixture },
) => {
  const offers = await prepareBuyOffer(client, fixture);
  const borrow = midnightTakeBorrow({
    chainId: base.id,
    market: fixture.market,
    target: {
      type: "units",
      units: fixture.lent + 100_000n,
      minSellerAssets: 100_000n,
    },
    receiver: user,
    takeableOffers: offers,
    deadline: Time.timestamp() + 600n,
  });
  await client.sendTransaction({
    to: borrow.to,
    data: borrow.data,
    value: borrow.value,
    account: user,
  });
  await client.writeContract({
    account: user,
    address: fixture.loanToken,
    abi: erc20Abi,
    functionName: "approve",
    args: [midnightBundlesV2, maxUint256],
  });
  return {
    offers,
    debt: await readDebtAt(client, { user, id: fixture.marketId }),
  };
};

const asTransaction = (
  from: Address,
  tx: {
    readonly to: Address;
    readonly data: `0x${string}`;
    readonly value: bigint;
  },
) => ({ from, to: tx.to, data: tx.data, value: tx.value });

describe.sequential("Midnight repay-withdraw limits — Base fork", () => {
  test("partial repayment passes and an overquoted debt reduction fails", async ({
    client,
  }) => {
    const { user } = await setUp(client);
    const { debt } = await createDebt(client, { user });
    const amount = debt / 2n;
    const tx = midnightRepayWithdrawCollateral({
      chainId: base.id,
      market,
      repay: { type: "assets", assets: amount },
      collateralWithdrawals: [],
      collateralReceiver: user,
      deadline: Time.timestamp() + 600n,
    });
    const limits = toSimulationLimits(tx.action, { owner: user });
    const result = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(user, tx)],
      limits,
    });
    expect(
      result.verification.operations[0]?.checkedLimits.quote,
    ).toMatchObject({
      assetsPaid: amount,
      debtRepaid: amount,
    });

    await expect(
      simulate(configFor(client), {
        chainId: base.id,
        transactions: [asTransaction(user, tx)],
        limits: toSimulationLimits(tx.action, {
          owner: user,
          expected: { debtRepaid: amount + 1n },
          slippageTolerance: 0n,
        }),
      }),
    ).rejects.toBeInstanceOf(ConsumerLimitViolationError);
  });

  test("full repayment closes debt and final bounds reject a later debt increase", async ({
    client,
  }) => {
    const { user } = await setUp(client);
    const { debt, offers } = await createDebt(client, { user });
    const repay = midnightRepayWithdrawCollateral({
      chainId: base.id,
      market,
      repay: { type: "full", maxBuyerAssets: debt },
      collateralWithdrawals: [],
      collateralReceiver: user,
      deadline: Time.timestamp() + 600n,
    });
    const limits = toSimulationLimits(repay.action, { owner: user });
    const result = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(user, repay)],
      limits,
    });
    expect(result.verification.operations[0]?.checkedLimits.position).toEqual({
      maxDebt: 0n,
    });

    const laterBorrow = midnightTakeBorrow({
      chainId: base.id,
      market,
      target: { type: "units", units: 1_000n, minSellerAssets: 1n },
      receiver: OTHER,
      takeableOffers: offers,
      deadline: Time.timestamp() + 600n,
    });
    const error = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [
        asTransaction(user, repay),
        asTransaction(user, laterBorrow),
      ],
      limits,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConsumerLimitViolationError);
    expect((error as Error).message).toContain("position.maxDebt");
  });

  test("withdraw-all delivers to an external receiver and a wrong limit receiver fails", async ({
    client,
  }) => {
    const { user } = await setUp(client);
    const collateral = await readCollateral(client, user);
    const tx = midnightRepayWithdrawCollateral({
      chainId: base.id,
      market,
      repay: { type: "assets", assets: 0n },
      collateralWithdrawals: [{ collateralIndex: 0n, assets: maxUint256 }],
      collateralReceiver: RECEIVER,
      deadline: Time.timestamp() + 600n,
    });
    const limits = toSimulationLimits(tx.action, {
      owner: user,
      receiver: RECEIVER,
      expected: {
        collateralWithdrawals: [{ collateralIndex: 0n, assets: collateral }],
      },
    });
    await expect(
      simulate(configFor(client), {
        chainId: base.id,
        transactions: [asTransaction(user, tx)],
        limits,
      }),
    ).resolves.toBeDefined();

    const wrongReceiverLimits = {
      ...limits,
      operations: limits.operations.map((operation) =>
        operation.type === "midnightRepayWithdrawCollateral"
          ? { ...operation, receiver: OTHER }
          : operation,
      ),
    };
    await expect(
      simulate(configFor(client), {
        chainId: base.id,
        transactions: [asTransaction(user, tx)],
        limits: wrongReceiverLimits,
      }),
    ).rejects.toBeInstanceOf(ConsumerLimitViolationError);
  });

  test("repeated finite-index withdrawals aggregate with repayment", async ({
    client,
  }) => {
    const { user } = await setUp(client);
    const { debt } = await createDebt(client, { user });
    const amount = debt / 2n;
    const tx = midnightRepayWithdrawCollateral({
      chainId: base.id,
      market,
      repay: { type: "assets", assets: amount },
      collateralWithdrawals: [
        { collateralIndex: 0n, assets: parseEther("1") },
        { collateralIndex: 0n, assets: parseEther("2") },
      ],
      collateralReceiver: user,
      deadline: Time.timestamp() + 600n,
    });
    const result = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(user, tx)],
      limits: toSimulationLimits(tx.action, { owner: user }),
    });
    expect(
      result.verification.operations[0]?.checkedLimits.quote,
    ).toMatchObject({
      assetsPaid: amount,
      debtRepaid: amount,
      collateralWithdrawals: [{ collateralIndex: 0n, assets: parseEther("3") }],
    });
  });

  test("native-funded assets repayment passes with derived limits on a wNative loan", async ({
    client,
  }) => {
    const { user } = await setUp(client, wNativeLoanFixture);
    const { debt } = await createDebt(client, {
      user,
      fixture: wNativeLoanFixture,
    });
    const amount = debt / 2n;
    const tx = midnightRepayWithdrawCollateral({
      chainId: base.id,
      market: wNativeMarket,
      repay: { type: "assets", assets: amount },
      collateralWithdrawals: [],
      collateralReceiver: user,
      nativeAmount: amount,
      deadline: Time.timestamp() + 600n,
    });
    const result = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(user, tx)],
      limits: toSimulationLimits(tx.action, { owner: user }),
    });

    expect(
      result.verification.operations[0]?.checkedLimits.quote,
    ).toMatchObject({
      assetsPaid: amount,
      debtRepaid: amount,
    });
  });

  test("native-funded full repayment allows excess funding and closes debt", async ({
    client,
  }) => {
    const { user } = await setUp(client, wNativeLoanFixture);
    const { debt } = await createDebt(client, {
      user,
      fixture: wNativeLoanFixture,
    });
    const maxBuyerAssets = debt + 1_000n;
    const tx = midnightRepayWithdrawCollateral({
      chainId: base.id,
      market: wNativeMarket,
      repay: { type: "full", maxBuyerAssets },
      collateralWithdrawals: [],
      collateralReceiver: user,
      nativeAmount: maxBuyerAssets,
      deadline: Time.timestamp() + 600n,
    });
    const result = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(user, tx)],
      limits: toSimulationLimits(tx.action, { owner: user }),
    });

    expect(result.verification.operations[0]?.checkedLimits.position).toEqual({
      maxDebt: 0n,
    });
  });

  test("native-funded repayment rejects a payment quote one wei too low", async ({
    client,
  }) => {
    const { user } = await setUp(client, wNativeLoanFixture);
    const { debt } = await createDebt(client, {
      user,
      fixture: wNativeLoanFixture,
    });
    const amount = debt / 2n;
    const tx = midnightRepayWithdrawCollateral({
      chainId: base.id,
      market: wNativeMarket,
      repay: { type: "assets", assets: amount },
      collateralWithdrawals: [],
      collateralReceiver: user,
      nativeAmount: amount,
      deadline: Time.timestamp() + 600n,
    });

    await expect(
      simulate(configFor(client), {
        chainId: base.id,
        transactions: [asTransaction(user, tx)],
        limits: toSimulationLimits(tx.action, {
          owner: user,
          expected: { assetsPaid: amount - 1n },
          slippageTolerance: 0n,
        }),
      }),
    ).rejects.toBeInstanceOf(ConsumerLimitViolationError);
  });
});

describe.sequential("Midnight take-repay-withdraw limits — Base fork", () => {
  test("offer-only finite repayment passes; overquoted repayment and excessive spend fail", async ({
    client,
  }) => {
    const { user, sellOffers } = await setUp(client);
    const { debt } = await createDebt(client, { user });
    const units = debt / 4n;
    const tx = midnightTakeRepayWithdrawCollateral({
      chainId: base.id,
      market,
      target: { type: "units", units, maxBuyerAssets: units },
      repayEnabled: false,
      takeableOffers: sellOffers,
      maxContinuousFee: 0n,
      collateralWithdrawals: [],
      collateralReceiver: user,
      deadline: Time.timestamp() + 600n,
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
      result.verification.operations[0]?.checkedLimits.quote,
    ).toMatchObject({ assetsPaid: units, debtRepaid: units });

    await expect(
      simulate(configFor(client), {
        chainId: base.id,
        transactions: [asTransaction(user, tx)],
        limits: toSimulationLimits(tx.action, {
          owner: user,
          expected: { debtRepaid: units + 1n },
          slippageTolerance: 0n,
        }),
      }),
    ).rejects.toSatisfy(takeRepayViolation('"debtRepaid"'));
    await expect(
      simulate(configFor(client), {
        chainId: base.id,
        transactions: [asTransaction(user, tx)],
        limits: toSimulationLimits(tx.action, {
          owner: user,
          // Offers price units below par, so paying 1 wei cannot cover them.
          expected: { assetsPaid: 1n },
          slippageTolerance: 0n,
        }),
      }),
    ).rejects.toSatisfy(takeRepayViolation('"assetsPaid"'));
  });

  test("assets target spends exactly the target and repays at least minUnits", async ({
    client,
  }) => {
    const { user, sellOffers } = await setUp(client);
    const { debt } = await createDebt(client, { user });
    const assets = debt / 4n;
    const tx = midnightTakeRepayWithdrawCollateral({
      chainId: base.id,
      market,
      target: { type: "assets", assets, minUnits: assets },
      repayEnabled: false,
      takeableOffers: sellOffers,
      maxContinuousFee: 0n,
      collateralWithdrawals: [],
      collateralReceiver: user,
      deadline: Time.timestamp() + 600n,
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
      result.verification.operations[0]?.checkedLimits.quote,
    ).toMatchObject({ assetsPaid: assets, debtRepaid: assets });

    await expect(
      simulate(configFor(client), {
        chainId: base.id,
        transactions: [asTransaction(user, tx)],
        limits: toSimulationLimits(tx.action, {
          owner: user,
          expected: { assetsPaid: assets - 1n },
          slippageTolerance: 0n,
        }),
      }),
    ).rejects.toSatisfy(takeRepayViolation('"assetsPaid"'));
  });

  test("full debt through offers and direct fallback withdraws all collateral; residual debt fails", async ({
    client,
  }) => {
    const { user, sellOffers } = await setUp(client);
    const { debt, offers } = await createDebt(client, { user });
    const collateral = await readCollateral(client, user);
    const tx = midnightTakeRepayWithdrawCollateral({
      chainId: base.id,
      market,
      target: { type: "units", units: maxUint256, maxBuyerAssets: debt },
      repayEnabled: true,
      takeableOffers: [{ ...sellOffers[0], units: debt / 2n }],
      maxContinuousFee: 0n,
      collateralWithdrawals: [{ collateralIndex: 0n, assets: maxUint256 }],
      collateralReceiver: RECEIVER,
      deadline: Time.timestamp() + 600n,
    });
    const limits = toSimulationLimits(tx.action, {
      owner: user,
      receiver: RECEIVER,
      expected: {
        collateralWithdrawals: [{ collateralIndex: 0n, assets: collateral }],
      },
      slippageTolerance: 0n,
    });
    const result = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(user, tx)],
      limits,
    });
    expect(result.verification.operations[0]?.checkedLimits.position).toEqual({
      maxDebt: 0n,
      maxCollateral: [{ collateralIndex: 0n, assets: 0n }],
    });
    await expect(
      simulate(configFor(client), {
        chainId: base.id,
        transactions: [asTransaction(user, tx)],
        limits: toSimulationLimits(tx.action, {
          owner: user,
          receiver: RECEIVER,
          expected: {
            debtRepaid: debt,
            assetsPaid: debt - 1n,
            collateralWithdrawals: [
              { collateralIndex: 0n, assets: collateral },
            ],
          },
          slippageTolerance: 0n,
        }),
      }),
    ).resolves.toBeDefined();

    // Keep collateral so the later borrow is healthy and only the final debt bound fails.
    const repayOnly = midnightTakeRepayWithdrawCollateral({
      chainId: base.id,
      market,
      target: { type: "units", units: maxUint256, maxBuyerAssets: debt },
      repayEnabled: true,
      takeableOffers: [{ ...sellOffers[0], units: debt / 2n }],
      maxContinuousFee: 0n,
      collateralWithdrawals: [],
      collateralReceiver: user,
      deadline: Time.timestamp() + 600n,
    });
    const laterBorrow = midnightTakeBorrow({
      chainId: base.id,
      market,
      target: { type: "units", units: 1_000n, minSellerAssets: 1n },
      receiver: OTHER,
      takeableOffers: offers,
      deadline: Time.timestamp() + 600n,
    });
    const error = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [
        asTransaction(user, repayOnly),
        asTransaction(user, laterBorrow),
      ],
      limits: toSimulationLimits(repayOnly.action, { owner: user }),
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConsumerLimitViolationError);
    expect((error as Error).message).toContain("position.maxDebt");
  });

  test("stale offers fall back to direct repayment; short collateral delivery fails", async ({
    client,
  }) => {
    const { user, sellOffers } = await setUp(client);
    const { debt } = await createDebt(client, { user });
    // Fill the offer's remaining capacity so the quoted offer is stale.
    const remaining = 3n * LENT;
    await client.setBalance({ address: OTHER, value: parseEther("1") });
    await client.writeContract({
      account: OTHER,
      address: midnight,
      abi: midnightAbi,
      functionName: "setIsAuthorized",
      args: [midnightBundlesV2, true, OTHER],
    });
    await client.deal({ erc20: usdc, account: OTHER, amount: remaining });
    await client.writeContract({
      account: OTHER,
      address: usdc,
      abi: erc20Abi,
      functionName: "approve",
      args: [midnightBundlesV2, maxUint256],
    });
    const drain = midnightTakeLend({
      chainId: base.id,
      market,
      target: { type: "units", units: remaining, maxBuyerAssets: remaining },
      takeableOffers: sellOffers,
      maxContinuousFee: maxUint256,
      deadline: Time.timestamp() + 600n,
    });
    await client.sendTransaction({ ...drain, account: OTHER });
    const units = debt / 2n;
    const withdrawn = 1_000n;
    const tx = midnightTakeRepayWithdrawCollateral({
      chainId: base.id,
      market,
      target: { type: "units", units, maxBuyerAssets: units },
      repayEnabled: true,
      takeableOffers: sellOffers,
      maxContinuousFee: 0n,
      collateralWithdrawals: [
        { collateralIndex: 0n, assets: withdrawn },
        { collateralIndex: 0n, assets: withdrawn },
      ],
      collateralReceiver: user,
      deadline: Time.timestamp() + 600n,
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
      result.verification.operations[0]?.checkedLimits.quote,
    ).toMatchObject({
      assetsPaid: units,
      debtRepaid: units,
      collateralWithdrawals: [{ collateralIndex: 0n, assets: 2n * withdrawn }],
    });
    // Direct repayment is 1:1, so the fallback spends every quoted asset.
    await expect(
      simulate(configFor(client), {
        chainId: base.id,
        transactions: [asTransaction(user, tx)],
        limits: toSimulationLimits(tx.action, {
          owner: user,
          expected: { assetsPaid: units - 1n },
          slippageTolerance: 0n,
        }),
      }),
    ).rejects.toSatisfy(takeRepayViolation('"assetsPaid"'));

    await expect(
      simulate(configFor(client), {
        chainId: base.id,
        transactions: [asTransaction(user, tx)],
        limits: toSimulationLimits(tx.action, {
          owner: user,
          expected: {
            collateralWithdrawals: [
              { collateralIndex: 0n, assets: 2n * withdrawn + 1n },
            ],
          },
          slippageTolerance: 0n,
        }),
      }),
    ).rejects.toSatisfy(takeRepayViolation("collateral index"));
  });

  test("credit created later in the bundle fails the reduce-only check", async ({
    client,
  }) => {
    const { user, sellOffers } = await setUp(client);
    const { debt } = await createDebt(client, { user });
    const repay = midnightTakeRepayWithdrawCollateral({
      chainId: base.id,
      market,
      target: { type: "units", units: maxUint256, maxBuyerAssets: debt },
      repayEnabled: true,
      takeableOffers: sellOffers,
      maxContinuousFee: 0n,
      collateralWithdrawals: [],
      collateralReceiver: user,
      deadline: Time.timestamp() + 600n,
    });
    const lend = midnightTakeLend({
      chainId: base.id,
      market,
      target: { type: "units", units: 1_000n, maxBuyerAssets: 1_000n },
      takeableOffers: sellOffers,
      maxContinuousFee: maxUint256,
      deadline: Time.timestamp() + 600n,
    });
    const error = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(user, repay), asTransaction(user, lend)],
      limits: toSimulationLimits(repay.action, { owner: user }),
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConsumerLimitViolationError);
    expect((error as Error).message).toContain("credit changed");
  });

  test("native-funded offer repayment passes with derived limits on a wNative loan", async ({
    client,
  }) => {
    const { user, sellOffers } = await setUp(client, wNativeLoanFixture);
    const { debt } = await createDebt(client, {
      user,
      fixture: wNativeLoanFixture,
    });
    const units = debt / 4n;
    const tx = midnightTakeRepayWithdrawCollateral({
      chainId: base.id,
      market: wNativeMarket,
      target: { type: "units", units, maxBuyerAssets: units },
      repayEnabled: false,
      takeableOffers: sellOffers,
      maxContinuousFee: 0n,
      collateralWithdrawals: [],
      collateralReceiver: user,
      nativeAmount: units,
      deadline: Time.timestamp() + 600n,
    });
    const result = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(user, tx)],
      limits: toSimulationLimits(tx.action, { owner: user }),
    });
    expect(
      result.verification.operations[0]?.checkedLimits.quote,
    ).toMatchObject({ assetsPaid: units, debtRepaid: units });
  });
});
