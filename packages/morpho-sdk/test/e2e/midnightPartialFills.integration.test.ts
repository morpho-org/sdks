import { ORACLE_PRICE_SCALE } from "@morpho-org/blue-sdk";
import {
  AccrualPosition,
  DEFAULT_TICK_SPACING,
  Market,
  MarketParams,
  MarketUtils,
  midnightAbi,
  Offer,
  OfferUtils,
  PriceRatifierV1,
  RateRatifierV1,
  TickLib,
  Tree,
} from "@morpho-org/midnight-sdk";
import {
  type E2eScenario,
  getE2eAsset,
  installE2eAsset,
  installE2eOracle,
} from "@morpho-org/morpho-test";
import { getChainAddress, MathLib } from "@morpho-org/morpho-ts";
import { type AnvilTestClient, testAccount } from "@morpho-org/test";
import {
  type Address,
  BaseError,
  type Chain,
  erc20Abi,
  type Hex,
  type LocalAccount,
  maxUint128,
  maxUint256,
  parseEther,
  toFunctionSelector,
  zeroAddress,
} from "viem";
import { expect, vi } from "vitest";
import {
  getMidnightBlueBuyCallbackAddress,
  getMidnightBlueBuyCallbackData,
} from "../../src/helpers/index.js";
import {
  type ActionRequirement,
  isRequirementSignature,
  morphoViemExtension,
} from "../../src/index.js";
import { seedDeadSupply } from "../helpers/blue.js";
import { createE2eMarket, describeE2e } from "./setup.js";

type Client = AnvilTestClient<Chain>;

const BASE_SCENARIO: E2eScenario = {
  name: "midnight-partial-fills",
  requires: [
    "midnight",
    "midnightBundlesV2",
    "priceRatifierV1",
    "rateRatifierV1",
  ],
};
const BLUE_SCENARIO: E2eScenario = {
  name: "midnight-partial-fills-blue",
  requires: [
    ...BASE_SCENARIO.requires,
    "blue",
    "adaptiveCurveIrm",
    "bundles.blueBundlesV1",
    "midnightBlueBuyCallbackFactory",
  ],
};

const maker = testAccount(1);
const takerB = testAccount(2);
const takerC = testAccount(3);
const takerD = testAccount(4);
const collateralToken = "0xE2e0000000000000000000000000000000000004" as Address;
const cap = parseEther("3");
const fill = parseEther("1");
const collateralAssets = parseEther("10");
const loanAssets = parseEther("20");

const buildAtForkTimestamp = <T>(timestamp: bigint, build: () => T): T => {
  // The SDK checks deadlines against local time, not the warped fork timestamp.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(Number(timestamp * 1_000n)));
  try {
    return build();
  } finally {
    vi.useRealTimers();
  }
};

const entity = (client: Client, chainId: number) =>
  client.extend(morphoViemExtension()).morpho.midnight(chainId);

const setup = async (client: Client, chainId: number) => {
  const loanAsset = getE2eAsset(chainId);
  if (loanAsset.requiresInstall)
    await installE2eAsset(client, loanAsset.address);
  await installE2eAsset(client, collateralToken);
  const oracle = await installE2eOracle(client);
  for (const account of [maker, takerB, takerC, takerD]) {
    await client.setBalance({
      address: account.address,
      value: parseEther("10"),
    });
    await client.setFeeTokenBalance({
      account: account.address,
      amount: maxUint128,
    });
  }

  const block = await client.getBlock();
  const market = new MarketParams({
    chainId,
    midnight: getChainAddress(chainId, "midnight"),
    loanToken: loanAsset.address,
    collateralParams: [
      {
        token: collateralToken,
        lltv: 770_000_000_000_000_000n,
        liquidationCursor: 300_000_000_000_000_000n,
        oracle,
      },
    ],
    maturity:
      ((block.timestamp + 365n * 86_400n) / 86_400n + 1n) * 86_400n +
      15n * 3_600n,
    rcfThreshold: 0n,
    enterGate: zeroAddress,
    liquidatorGate: zeroAddress,
  });
  const marketData = new Market({
    params: market,
    totalUnits: 0n,
    lossFactor: 0n,
    withdrawable: 0n,
    continuousFeeCredit: 0n,
    settlementFeeCbps: [0, 0, 0, 0, 0, 0, 0],
    continuousFee: 0,
    tickSpacing: 0,
  });

  return {
    market,
    marketData,
    marketId: MarketUtils.toId(market),
    loanToken: loanAsset.address,
  };
};

const consumed = (
  client: Client,
  { chainId, group }: { chainId: number; group: `0x${string}` },
) =>
  client.readContract({
    address: getChainAddress(chainId, "midnight"),
    abi: midnightAbi,
    functionName: "consumed",
    args: [maker.address, group],
  });

const priceTakeable = (tree: Tree<"priceV1">, units: bigint) =>
  PriceRatifierV1.ratify({ tree }).map((item) => ({
    ...item,
    offer: OfferUtils.toStruct({ offer: item.offer }),
    units,
  }));

const rateTakeable = ({
  tree,
  units,
  timestamp,
  tickSpacing,
}: {
  readonly tree: Tree<"rateV1">;
  readonly units: bigint;
  readonly timestamp: bigint;
  readonly tickSpacing: bigint;
}) =>
  RateRatifierV1.ratify({ tree }).map((item, index) => {
    const rate = tree.entries[index]!.rate;
    const maturity =
      "params" in item.offer.market
        ? item.offer.market.params.maturity
        : item.offer.market.maturity;
    const bound = RateRatifierV1.priceBound({
      rate,
      timeToMaturity: BigInt(maturity) - timestamp,
      buy: item.offer.buy,
    });
    const upperTick = TickLib.priceToTick(bound, tickSpacing);
    const tick =
      item.offer.buy && TickLib.tickToPrice(upperTick) > bound
        ? upperTick - tickSpacing
        : upperTick;
    const offer = { ...item.offer, tick, group: item.offer.group };

    expect(tick >= RateRatifierV1.MIN_TICK).toBe(true);
    expect(tick % tickSpacing).toBe(0n);
    expect(RateRatifierV1.isPriceAcceptable({ offer, rate, timestamp })).toBe(
      true,
    );
    expect(
      RateRatifierV1.verifyRatifierData({
        offer,
        ratifierData: item.ratifierData,
      }).rate,
    ).toBe(rate);

    return {
      ...item,
      offer: OfferUtils.toStruct({ offer }),
      units,
    };
  });

const makeOffer = ({
  chainId,
  market,
  buy,
  tick,
  ratifier,
  callback,
  callbackData,
  receiverIfMakerIsSeller,
}: {
  chainId: number;
  market: MarketParams;
  buy: boolean;
  tick: bigint;
  ratifier: "priceRatifierV1" | "rateRatifierV1";
  callback?: Address;
  callbackData?: Hex;
  receiverIfMakerIsSeller?: Address;
}) =>
  Offer.create({
    market,
    buy,
    maker: maker.address,
    expiry: market.maturity,
    tick,
    ratifier: getChainAddress(chainId, ratifier),
    maxUnits: cap,
    ...(callback === undefined || callbackData === undefined
      ? {}
      : { callback, callbackData }),
    ...(receiverIfMakerIsSeller === undefined
      ? {}
      : { receiverIfMakerIsSeller }),
  });

const priceTree = (offer: ReturnType<typeof makeOffer>) =>
  Tree.create({ type: "priceV1", entries: [{ offer }] });

type OfferTree = Tree<"priceV1"> | Tree<"rateV1">;
type MarketId = ReturnType<typeof MarketUtils.toId>;
type SendableOutput = {
  getRequirements: () => Promise<readonly ActionRequirement[]>;
  buildTx: () => Parameters<Client["sendTransaction"]>[0];
};

const sendOutput = async (
  client: Client,
  {
    account,
    output,
    gas,
    expectedStatus = "success",
  }: {
    account: LocalAccount;
    output: SendableOutput;
    gas?: bigint;
    expectedStatus?: "success" | "reverted";
  },
) => {
  for (const requirement of await output.getRequirements()) {
    if (isRequirementSignature(requirement))
      expect.unreachable("expected onchain requirements");
    const hash = await client.sendTransaction({ ...requirement, account });
    const receipt = await client.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");
  }
  const transaction = output.buildTx();
  if (expectedStatus === "reverted") {
    const error = await client
      .call({
        account,
        to: transaction.to,
        data: transaction.data,
        gas: gas ?? 8_000_000n,
      })
      .then(
        () => undefined,
        (cause: unknown) => cause,
      );
    expect(error).toBeInstanceOf(BaseError);
    const revert =
      error instanceof BaseError
        ? (error.walk(
            (cause) => typeof (cause as { data?: unknown }).data === "string",
          ) as { data?: string } | null)
        : null;
    expect(revert?.data?.slice(0, 10).toLowerCase()).toBe(
      toFunctionSelector("OutOfOffers()").toLowerCase(),
    );
  }
  const hash = await client.sendTransaction({
    ...transaction,
    account,
    ...(gas === undefined ? {} : { gas }),
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  expect(receipt.status).toBe(expectedStatus);
};

const fillCollateral = async ({
  client,
  midnight,
  marketData,
  marketId,
  loanToken,
  account,
  tree,
  units,
  firstFill,
  minSellerAssets = 1n,
  expectedStatus = "success",
}: {
  client: Client;
  midnight: ReturnType<typeof entity>;
  marketData: Market;
  marketId: MarketId;
  loanToken: Address;
  account: LocalAccount;
  tree: OfferTree;
  units: bigint;
  firstFill: boolean;
  minSellerAssets?: bigint;
  expectedStatus?: "success" | "reverted";
}) => {
  await client.deal({
    erc20: collateralToken,
    account: account.address,
    amount: collateralAssets,
  });
  const currentMarketData = firstFill
    ? marketData
    : await midnight.getMarketData(marketId);
  const positionData = firstFill
    ? new AccrualPosition(
        {
          user: account.address,
          credit: 0n,
          pendingFee: 0n,
          lastLossFactor: 0n,
          lastAccrual: 0n,
          debt: 0n,
          collateralBitmap: 0n,
          collateral: [0n],
        },
        marketData,
      )
    : await midnight.getPositionData({
        marketId,
        accountAddress: account.address,
      });
  const timestamp = (await client.getBlock()).timestamp;
  const before = await client.readContract({
    address: loanToken,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });
  const takeableOffers =
    tree.type === "priceV1"
      ? priceTakeable(tree, units)
      : rateTakeable({
          tree,
          units,
          timestamp,
          tickSpacing:
            BigInt(currentMarketData.tickSpacing) || DEFAULT_TICK_SPACING,
        });
  const take = buildAtForkTimestamp(timestamp, () =>
    midnight.supplyCollateralTakeBorrow({
      marketData: currentMarketData,
      accountAddress: account.address,
      positionData,
      collateralPrices: [ORACLE_PRICE_SCALE],
      collateralSupplies: [{ collateralIndex: 0n, assets: collateralAssets }],
      target: { type: "units", units, minSellerAssets },
      takeableOffers,
      deadline: timestamp + 600n,
    }),
  );
  await sendOutput(client, {
    account,
    output: take,
    gas: 8_000_000n,
    expectedStatus,
  });
  const after = await client.readContract({
    address: loanToken,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });
  return {
    timestamp,
    tick: takeableOffers[0]!.offer.tick,
    received: after - before,
  };
};

const fillLend = async ({
  client,
  midnight,
  marketId,
  loanToken,
  account,
  tree,
  units,
  maxBuyerAssets = loanAssets,
  expectedStatus = "success",
}: {
  client: Client;
  midnight: ReturnType<typeof entity>;
  marketId: MarketId;
  loanToken: Address;
  account: LocalAccount;
  tree: OfferTree;
  units: bigint;
  maxBuyerAssets?: bigint;
  expectedStatus?: "success" | "reverted";
}) => {
  await client.deal({
    erc20: loanToken,
    account: account.address,
    amount: loanAssets,
  });
  const marketData = await midnight.getMarketData(marketId);
  const timestamp = (await client.getBlock()).timestamp;
  const takeableOffers =
    tree.type === "priceV1"
      ? priceTakeable(tree, units)
      : rateTakeable({
          tree,
          units,
          timestamp: timestamp + 60n,
          tickSpacing: BigInt(marketData.tickSpacing),
        });
  const take = buildAtForkTimestamp(timestamp, () =>
    midnight.takeLend({
      marketData,
      accountAddress: account.address,
      target: { type: "units", units, maxBuyerAssets },
      takeableOffers,
      maxContinuousFee: maxUint256,
      deadline: timestamp + 600n,
    }),
  );
  await sendOutput(client, {
    account,
    output: take,
    gas: 8_000_000n,
    expectedStatus,
  });
};

describeE2e(BASE_SCENARIO, (test, { chainId }) => {
  test.for(["priceV1", "rateV1"] as const)(
    "two wallets partially fill one %s lend offer",
    async (type, { client }) => {
      const { market, marketData, marketId, loanToken } = await setup(
        client,
        chainId,
      );
      const midnight = entity(client, chainId);
      await client.deal({
        erc20: loanToken,
        account: maker.address,
        amount: loanAssets,
      });
      const rate = 3_171_000_000n;
      const tree: OfferTree =
        type === "priceV1"
          ? priceTree(
              makeOffer({
                chainId,
                market,
                buy: true,
                tick: 5_000n,
                ratifier: "priceRatifierV1",
              }),
            )
          : Tree.create({
              type: "rateV1",
              entries: [
                {
                  offer: makeOffer({
                    chainId,
                    market,
                    buy: true,
                    tick: 4_992n,
                    ratifier: "rateRatifierV1",
                  }),
                  rate,
                },
              ],
            });
      const group = tree.offers[0]!.group;
      const make = await midnight.makeLend({
        accountAddress: maker.address,
        offers: tree,
        loanToken,
        loanAssets,
        deadline: maxUint256,
        validation: false,
      });
      await sendOutput(client, { account: maker, output: make });

      const b = await fillCollateral({
        client,
        midnight,
        marketData,
        marketId,
        loanToken,
        account: takerB,
        tree,
        units: fill,
        firstFill: true,
      });
      expect(await consumed(client, { chainId, group })).toBe(fill);
      const bBound =
        tree.type === "rateV1"
          ? RateRatifierV1.priceBound({
              rate,
              timeToMaturity: market.maturity - b.timestamp,
              buy: true,
            })
          : 0n;
      if (tree.type === "rateV1") {
        const now = (await client.getBlock()).timestamp;
        await client.setNextBlockTimestamp({
          timestamp: now + 90n * 86_400n,
        });
        await client.mine({ blocks: 1 });
      }
      const c = await fillCollateral({
        client,
        midnight,
        marketData,
        marketId,
        loanToken,
        account: takerC,
        tree,
        units: fill,
        firstFill: false,
      });
      expect(await consumed(client, { chainId, group })).toBe(2n * fill);
      if (tree.type === "rateV1") {
        expect(c.timestamp - b.timestamp).toBeGreaterThan(90n * 86_400n - 2n);
        const cBound = RateRatifierV1.priceBound({
          rate,
          timeToMaturity: market.maturity - c.timestamp,
          buy: true,
        });
        expect(cBound).toBeGreaterThan(bBound);
        // The rate-implied buy bound approaches par as maturity nears.
        expect(c.tick).toBeGreaterThan(b.tick);
        expect((c.received * MathLib.WAD) / fill).toBeGreaterThan(
          (b.received * MathLib.WAD) / fill,
        );
      }

      const timestamp = (await client.getBlock()).timestamp;
      const dMarketData = await midnight.getMarketData(marketId);
      const dTakeableOffers =
        tree.type === "priceV1"
          ? priceTakeable(tree, 2n * fill)
          : rateTakeable({
              tree,
              units: 2n * fill,
              timestamp,
              tickSpacing:
                BigInt(dMarketData.tickSpacing) || DEFAULT_TICK_SPACING,
            });
      await fillCollateral({
        client,
        midnight,
        marketData,
        marketId,
        loanToken,
        account: takerD,
        tree,
        units: 2n * fill,
        firstFill: false,
        minSellerAssets:
          (2n * fill * TickLib.tickToPrice(dTakeableOffers[0]!.offer.tick)) /
          MathLib.WAD,
        expectedStatus: "reverted",
      });
      expect(await consumed(client, { chainId, group })).toBe(2n * fill);
      const dPosition = await midnight.getPositionData({
        marketId,
        accountAddress: takerD.address,
      });
      expect(dPosition.debt).toBe(0n);
      const [makerPosition, bPosition, cPosition] = await Promise.all([
        midnight.getPositionData({ marketId, accountAddress: maker.address }),
        midnight.getPositionData({ marketId, accountAddress: takerB.address }),
        midnight.getPositionData({ marketId, accountAddress: takerC.address }),
      ]);
      expect(makerPosition.credit).toBe(bPosition.debt + cPosition.debt);
      const remainder = cap - (await consumed(client, { chainId, group }));
      expect(remainder).toBe(fill);
      await fillCollateral({
        client,
        midnight,
        marketData,
        marketId,
        loanToken,
        account: takerD,
        tree,
        units: remainder,
        firstFill: false,
      });
      expect(await consumed(client, { chainId, group })).toBe(cap);
    },
  );

  test.for(["priceV1", "rateV1"] as const)(
    "two wallets take borrow offers with %s ratifier",
    async (type, { client }) => {
      const { market, marketId, loanToken } = await setup(client, chainId);
      const midnight = entity(client, chainId);
      const tree =
        type === "priceV1"
          ? priceTree(
              makeOffer({
                chainId,
                market,
                buy: false,
                tick: 5_000n,
                ratifier: "priceRatifierV1",
                receiverIfMakerIsSeller: maker.address,
              }),
            )
          : Tree.create({
              type: "rateV1",
              entries: [
                {
                  offer: makeOffer({
                    chainId,
                    market,
                    buy: false,
                    tick: 5_000n,
                    ratifier: "rateRatifierV1",
                    receiverIfMakerIsSeller: maker.address,
                  }),
                  rate: 1_000_000_000n,
                },
              ],
            });
      const group = tree.offers[0]!.group;
      await client.deal({
        erc20: collateralToken,
        account: maker.address,
        amount: collateralAssets,
      });
      const make = await midnight.supplyCollateralMakeBorrow({
        accountAddress: maker.address,
        offers: tree,
        collateral: {
          market,
          supplies: [{ collateralIndex: 0n, assets: collateralAssets }],
        },
        deadline: maxUint256,
        validation: false,
      });
      await sendOutput(client, { account: maker, output: make });

      for (const [account, prior] of [
        [takerB, 0n],
        [takerC, fill],
      ] as const) {
        await fillLend({
          client,
          midnight,
          marketId,
          loanToken,
          account,
          tree,
          units: fill,
        });
        expect(await consumed(client, { chainId, group })).toBe(prior + fill);
      }

      const [makerPosition, bPosition, cPosition] = await Promise.all([
        midnight.getPositionData({ marketId, accountAddress: maker.address }),
        midnight.getPositionData({ marketId, accountAddress: takerB.address }),
        midnight.getPositionData({ marketId, accountAddress: takerC.address }),
      ]);
      expect(makerPosition.debt).toBe(bPosition.credit + cPosition.credit);

      await fillLend({
        client,
        midnight,
        marketId,
        loanToken,
        account: takerD,
        tree,
        units: 2n * fill,
        expectedStatus: "reverted",
      });
      expect(await consumed(client, { chainId, group })).toBe(2n * fill);
      expect(
        (
          await midnight.getPositionData({
            marketId,
            accountAddress: takerD.address,
          })
        ).credit,
      ).toBe(0n);

      const remainder = cap - (await consumed(client, { chainId, group }));
      expect(remainder).toBe(fill);
      await fillLend({
        client,
        midnight,
        marketId,
        loanToken,
        account: takerD,
        tree,
        units: remainder,
      });
      expect(await consumed(client, { chainId, group })).toBe(cap);
    },
  );
});

describeE2e(BLUE_SCENARIO, (test, { chainId }) => {
  test("each partial fill withdraws loan assets from the maker's Blue callback supply", async ({
    client,
  }) => {
    const { market, marketData, marketId, loanToken } = await setup(
      client,
      chainId,
    );
    const midnight = entity(client, chainId);
    const blueMarket = await createE2eMarket(client, chainId);
    expect(blueMarket.loanToken).toBe(loanToken);
    await client.deal({ erc20: loanToken, amount: loanAssets });
    const blue = client
      .extend(morphoViemExtension())
      .morpho.blue(blueMarket, chainId);
    await seedDeadSupply({ client, chainId: chainId, market: blueMarket });
    const seed = blue.supply({
      marketData: await blue.getMarketData(),
      userAddress: client.account.address,
      assets: loanAssets,
      deadline: maxUint256,
    });
    await sendOutput(client, { account: client.account, output: seed });

    const callbackSalt = `0x${"b3".repeat(32)}` as `0x${string}`;
    const callback = getMidnightBlueBuyCallbackAddress({
      chainId,
      owner: maker.address,
      salt: callbackSalt,
    });
    const callbackData = getMidnightBlueBuyCallbackData(blueMarket);
    const tree = priceTree(
      makeOffer({
        chainId,
        market,
        buy: true,
        tick: 5_000n,
        ratifier: "priceRatifierV1",
        callback,
        callbackData,
      }),
    );
    const group = tree.offers[0]!.group;
    await client.deal({
      erc20: loanToken,
      account: maker.address,
      amount: loanAssets,
    });
    const make = await midnight.supplyBlueMakeLend({
      accountAddress: maker.address,
      offers: tree,
      blueMarket,
      assetsToPark: loanAssets,
      callbackSalt,
      deadline: maxUint256,
      validation: false,
    });
    await sendOutput(client, { account: maker, output: make });

    let previousBlueSupply = (await blue.getPositionData(callback))
      .supplyAssets;
    for (const [account, prior] of [
      [takerB, 0n],
      [takerC, fill],
    ] as const) {
      const { received } = await fillCollateral({
        client,
        midnight,
        marketData,
        marketId,
        loanToken,
        account,
        tree,
        units: fill,
        firstFill: prior === 0n,
      });
      const after = await blue.getPositionData(callback);
      const supplyDecrease = previousBlueSupply - after.supplyAssets;
      expect(supplyDecrease).toBeGreaterThan(0n);
      expect(supplyDecrease).toBeGreaterThanOrEqual(received);
      expect(await consumed(client, { chainId, group })).toBe(prior + fill);
      previousBlueSupply = after.supplyAssets;
    }

    const minSellerAssets =
      (2n * fill * TickLib.tickToPrice(tree.offers[0]!.tick)) / MathLib.WAD;
    await fillCollateral({
      client,
      midnight,
      marketData,
      marketId,
      loanToken,
      account: takerD,
      tree,
      units: 2n * fill,
      firstFill: false,
      minSellerAssets,
      expectedStatus: "reverted",
    });
    expect(await consumed(client, { chainId, group })).toBe(2n * fill);
    expect((await blue.getPositionData(callback)).supplyAssets).toBe(
      previousBlueSupply,
    );

    const remainder = cap - (await consumed(client, { chainId, group }));
    expect(remainder).toBe(fill);
    const { received } = await fillCollateral({
      client,
      midnight,
      marketData,
      marketId,
      loanToken,
      account: takerD,
      tree,
      units: remainder,
      firstFill: false,
    });
    const afterRemainder = await blue.getPositionData(callback);
    const supplyDecrease = previousBlueSupply - afterRemainder.supplyAssets;
    expect(supplyDecrease).toBeGreaterThan(0n);
    expect(supplyDecrease).toBeGreaterThanOrEqual(received);
    expect(await consumed(client, { chainId, group })).toBe(cap);

    const [makerPosition, bPosition, cPosition, dPosition] = await Promise.all([
      midnight.getPositionData({ marketId, accountAddress: maker.address }),
      midnight.getPositionData({ marketId, accountAddress: takerB.address }),
      midnight.getPositionData({ marketId, accountAddress: takerC.address }),
      midnight.getPositionData({ marketId, accountAddress: takerD.address }),
    ]);
    expect(makerPosition.credit).toBe(
      bPosition.debt + cPosition.debt + dPosition.debt,
    );
  });
});
