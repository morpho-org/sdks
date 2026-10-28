import {
  midnightSupplyCollateralTakeBorrow,
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
const receiver: Address = "0x00000000000000000000000000000000000c0E57";
const OTHER: Address = "0x00000000000000000000000000000000000d0e57";
const LENT = 1_234_567n;
const SUPPLIED = parseEther("1");
const REFERRAL_FEE = 10_000_000_000_000_000n;
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

const seedUser = async (
  client: AnvilTestClient<typeof base>,
  options: { readonly fundCollateralPull?: boolean } = {},
) => {
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
  await client.writeContract({
    account: user,
    address: wNative,
    abi: erc20Abi,
    functionName: "approve",
    args: [midnightBundlesV2, maxUint256],
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
  if (options.fundCollateralPull ?? true)
    await client.deal({ erc20: wNative, account: user, amount: SUPPLIED });
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
    if (!("to" in requirement)) throw new TypeError("Expected an onchain call");
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
    args: [MarketUtils.toStruct(market), LENT, offerMaker, zeroAddress, "0x"],
  });
  return user;
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
  await client.deal({ erc20: wNative, account: user, amount: SUPPLIED });
  for (const spender of [midnight, midnightBundlesV2]) {
    await client.writeContract({
      account: user,
      address: wNative,
      abi: erc20Abi,
      functionName: "approve",
      args: [spender, maxUint256],
    });
  }
  await client.writeContract({
    account: user,
    address: midnight,
    abi: midnightAbi,
    functionName: "setIsAuthorized",
    args: [midnightBundlesV2, true, user],
  });
  return user;
};

const prepareBuyOffers = async (client: AnvilTestClient<typeof base>) => {
  await client.setBalance({ address: offerBuyer, value: parseEther("1") });
  await client.writeContract({
    account: offerBuyer,
    address: midnight,
    abi: midnightAbi,
    functionName: "setIsAuthorized",
    args: [setterRatifier, true, offerBuyer],
  });
  await client.deal({ erc20: usdc, account: offerBuyer, amount: 10n * LENT });
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

type SellTarget =
  | {
      readonly type: "units";
      readonly units: bigint;
      readonly minSellerAssets: bigint;
    }
  | {
      readonly type: "assets";
      readonly assets: bigint;
      readonly maxUnits: bigint;
    };

const build = (options: {
  readonly target: SellTarget;
  readonly takeableOffers: Awaited<ReturnType<typeof prepareBuyOffers>>;
  readonly nativeAmount?: bigint;
  readonly referralFeeRecipient?: Address;
}) =>
  midnightSupplyCollateralTakeBorrow({
    chainId: base.id,
    market,
    target: options.target,
    receiver,
    collateralSupplies: [{ collateralIndex: 0n, assets: SUPPLIED }],
    takeableOffers: options.takeableOffers,
    ...(options.nativeAmount === undefined
      ? {}
      : { nativeAmount: options.nativeAmount }),
    deadline: Time.timestamp() + 600n,
    referralFeePct: REFERRAL_FEE,
    referralFeeRecipient: options.referralFeeRecipient ?? receiver,
  });

describe.sequential("Midnight supplyCollateralTakeBorrow limits — Base fork", () => {
  test("first combined take resolves the market it creates", async ({
    client,
  }) => {
    const owner = await setUpFirstUse(client);
    const offers = await prepareBuyOffers(client);
    const tx = build({
      target: { type: "units", units: 123_457n, minSellerAssets: 100_000n },
      takeableOffers: offers,
    });
    const result = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(owner, tx)],
      limits: toSimulationLimits(tx.action, {
        owner,
        receiver,
        market: MarketUtils.toStruct(market),
        slippageTolerance: 0n,
      }),
    });
    expect(result.verification.operations[0]).toMatchObject({
      operation: "midnightSupplyCollateralTakeBorrow",
      marketId,
      receiver,
      checkedLimits: {
        quote: {
          unitsSold: 123_457n,
          collateralSupplies: [{ collateralIndex: 0n, assets: SUPPLIED }],
        },
        slippageTolerance: 0n,
      },
    });
  });

  test("first combined take rejects a violated quote while resolving the supplied market", async ({
    client,
  }) => {
    const owner = await setUpFirstUse(client);
    const offers = await prepareBuyOffers(client);
    const tx = build({
      target: { type: "units", units: 123_457n, minSellerAssets: 100_000n },
      takeableOffers: offers,
    });
    const error = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(owner, tx)],
      limits: toSimulationLimits(tx.action, {
        owner,
        receiver,
        market: MarketUtils.toStruct(market),
        slippageTolerance: 0n,
        expected: { unitsSold: 1n },
      }),
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConsumerLimitViolationError);
    expect((error as Error).message).toContain(
      "midnightSupplyCollateralTakeBorrow",
    );
    expect((error as Error).message).toContain("unitsSold");
  });

  test("passes with a units target", async ({ client }) => {
    const owner = await seedUser(client);
    const offers = await prepareBuyOffers(client);
    const tx = build({
      target: { type: "units", units: 123_457n, minSellerAssets: 100_000n },
      takeableOffers: offers,
    });
    const result = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(owner, tx)],
      limits: toSimulationLimits(tx.action, {
        owner,
        receiver,
        slippageTolerance: 0n,
      }),
    });
    expect(result.verification.operations[0]).toMatchObject({
      operation: "midnightSupplyCollateralTakeBorrow",
      account: owner,
      receiver,
      checkedLimits: {
        quote: {
          collateralSupplies: [{ collateralIndex: 0n, assets: SUPPLIED }],
        },
        slippageTolerance: 0n,
      },
    });
  });

  test("passes with an assets target", async ({ client }) => {
    const owner = await seedUser(client);
    const offers = await prepareBuyOffers(client);
    const tx = build({
      target: { type: "assets", assets: 120_003n, maxUnits: 130_007n },
      takeableOffers: offers,
    });
    const result = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(owner, tx)],
      limits: toSimulationLimits(tx.action, {
        owner,
        receiver,
        slippageTolerance: 0n,
      }),
    });
    expect(result.verification.operations[0]).toMatchObject({
      operation: "midnightSupplyCollateralTakeBorrow",
      checkedLimits: {
        quote: {
          collateralSupplies: [{ collateralIndex: 0n, assets: SUPPLIED }],
        },
      },
    });
  });

  test("passes with an assets target and third-party referral fee recipient", async ({
    client,
  }) => {
    const owner = await seedUser(client);
    const offers = await prepareBuyOffers(client);
    const tx = build({
      target: { type: "assets", assets: 120_003n, maxUnits: 130_007n },
      takeableOffers: offers,
      referralFeeRecipient: OTHER,
    });
    expect(OTHER).not.toBe(receiver);
    expect(OTHER).not.toBe(owner);
    expect(tx.action.args.referralFeePct).toBeGreaterThan(0n);

    const result = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(owner, tx)],
      limits: toSimulationLimits(tx.action, {
        owner,
        receiver,
        slippageTolerance: 0n,
      }),
    });
    expect(result.verification.operations[0]).toMatchObject({
      operation: "midnightSupplyCollateralTakeBorrow",
      account: owner,
      receiver,
      checkedLimits: {
        quote: {
          collateralSupplies: [{ collateralIndex: 0n, assets: SUPPLIED }],
        },
        slippageTolerance: 0n,
      },
    });
  });

  test("passes with partial nativeAmount funding", async ({ client }) => {
    const owner = await seedUser(client, { fundCollateralPull: false });
    const nativeAmount = SUPPLIED / 2n;
    await client.setBalance({ address: owner, value: parseEther("2") });
    await client.deal({
      erc20: wNative,
      account: owner,
      amount: SUPPLIED - nativeAmount,
    });
    const offers = await prepareBuyOffers(client);
    const tx = build({
      target: { type: "units", units: 123_457n, minSellerAssets: 100_000n },
      takeableOffers: offers,
      nativeAmount,
    });
    expect(tx.value).toBe(nativeAmount);

    const result = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(owner, tx)],
      limits: toSimulationLimits(tx.action, {
        owner,
        receiver,
        slippageTolerance: 0n,
      }),
    });
    expect(result.verification.operations[0]).toMatchObject({
      operation: "midnightSupplyCollateralTakeBorrow",
      account: owner,
      receiver,
      checkedLimits: {
        quote: {
          collateralSupplies: [{ collateralIndex: 0n, assets: SUPPLIED }],
        },
        slippageTolerance: 0n,
      },
    });
  });

  test("passes with full nativeAmount funding", async ({ client }) => {
    const owner = await seedUser(client, { fundCollateralPull: false });
    await client.setBalance({ address: owner, value: parseEther("2") });
    const offers = await prepareBuyOffers(client);
    const tx = build({
      target: { type: "units", units: 123_457n, minSellerAssets: 100_000n },
      takeableOffers: offers,
      nativeAmount: SUPPLIED,
    });
    expect(tx.value).toBe(SUPPLIED);

    const result = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(owner, tx)],
      limits: toSimulationLimits(tx.action, {
        owner,
        receiver,
        slippageTolerance: 0n,
      }),
    });
    expect(result.verification.operations[0]).toMatchObject({
      operation: "midnightSupplyCollateralTakeBorrow",
      account: owner,
      receiver,
      checkedLimits: {
        quote: {
          collateralSupplies: [{ collateralIndex: 0n, assets: SUPPLIED }],
        },
        slippageTolerance: 0n,
      },
    });
  });

  test("rejects a successful execution whose collateral credit misses the quote", async ({
    client,
  }) => {
    const owner = await seedUser(client);
    const offers = await prepareBuyOffers(client);
    const tx = build({
      target: { type: "units", units: 123_457n, minSellerAssets: 100_000n },
      takeableOffers: offers,
    });
    const limits = toSimulationLimits(tx.action, {
      owner,
      receiver,
      slippageTolerance: 0n,
    });
    const error = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(owner, tx)],
      limits: {
        operations: limits.operations.map((operation) => ({
          ...operation,
          quote: {
            ...operation.quote,
            collateralSupplies: [
              { collateralIndex: 0n, assets: SUPPLIED + 1n },
            ],
          },
        })),
      },
    }).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ConsumerLimitViolationError);
    expect(error).toMatchObject({
      message: expect.stringContaining(
        `midnightSupplyCollateralTakeBorrow, marketId "${marketId}"`,
      ),
    });
  });

  test("uses an earlier receipt in the bundle to fund the later collateral pull", async ({
    client,
  }) => {
    const owner = await seedUser(client, { fundCollateralPull: false });
    const offers = await prepareBuyOffers(client);
    const tx = build({
      target: { type: "units", units: 123_457n, minSellerAssets: 100_000n },
      takeableOffers: offers,
    });
    const deposit = {
      to: wNative,
      data: encodeFunctionData({
        abi: [
          {
            type: "function",
            name: "deposit",
            stateMutability: "payable",
            inputs: [],
          },
        ],
        functionName: "deposit",
      }),
      value: SUPPLIED,
    };
    const result = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(owner, deposit), asTransaction(owner, tx)],
      limits: toSimulationLimits(tx.action, {
        owner,
        receiver,
        slippageTolerance: 0n,
      }),
    });
    expect(result.verification.operations[0]?.operation).toBe(
      "midnightSupplyCollateralTakeBorrow",
    );
  });
});
