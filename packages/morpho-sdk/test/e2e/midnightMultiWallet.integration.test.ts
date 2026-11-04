import {
  AccrualPosition,
  MarketUtils,
  midnightAbi,
  midnightBundlesV2Abi,
  Offer,
  TickLib,
  Tree,
} from "@morpho-org/midnight-sdk";
import type { E2eScenario } from "@morpho-org/morpho-test";
import {
  createE2eMidnightMarket,
  E2E_MIDNIGHT_WALLETS,
  type E2eMidnightWallet,
  fundE2eMidnightWallets,
  getE2eTakeableOffers,
} from "@morpho-org/morpho-test/midnight";
import { getChainAddress, MathLib, Time } from "@morpho-org/morpho-ts";
import type { AnvilTestClient } from "@morpho-org/test";
import {
  type Address,
  type BaseError,
  type Chain,
  decodeErrorResult,
  erc20Abi,
  type Hex,
  maxUint256,
  numberToHex,
  padHex,
  parseEther,
  zeroAddress,
} from "viem";
import { expect } from "vitest";
import {
  type ActionRequirement,
  isRequirementSignature,
  morphoViemExtension,
  type Transaction,
} from "../../src/index.js";
import { describeE2e } from "./setup.js";

const scenario: E2eScenario = {
  name: "midnight-multi-wallet",
  requires: ["midnight", "midnightBundlesV2", "priceRatifierV1"],
};

type Client = AnvilTestClient<Chain>;

const { A, B, C, D } = E2E_MIDNIGHT_WALLETS;
const oraclePrice = 10n ** 36n;
const units = parseEther("1");
const collateralAssets = 2n * units;
const takeGas = 8_000_000n;
const { WAD } = MathLib;

const deadline = () => Time.timestamp() + 600n;

/**
 * Creates a fresh Midnight market whose maturity an offer payload can encode, and funds each
 * wallet once with every asset its part of the scenario needs.
 */
const setUpMarket = async (
  client: Client,
  params: {
    readonly chainId: number;
    readonly wallets: Parameters<typeof fundE2eMidnightWallets>[1]["wallets"];
  },
) => {
  const now = Time.timestamp();
  const { params: market, marketData } = await createE2eMidnightMarket(
    client,
    params.chainId,
    // Offer payloads only encode maturities at 15:00 UTC.
    {
      maturity:
        ((now + 365n * 86_400n) / 86_400n + 1n) * 86_400n + 15n * 3_600n,
    },
  );
  await fundE2eMidnightWallets(client, { market, wallets: params.wallets });
  for (const account of [A, B, C, D])
    await client.setFeeTokenBalance({ account, amount: units });

  return {
    client,
    market,
    marketId: MarketUtils.toId(market),
    uncreatedMarketData: marketData,
    midnight: client
      .extend(morphoViemExtension())
      .morpho.midnight(params.chainId),
    priceRatifierV1: getChainAddress(params.chainId, "priceRatifierV1"),
  };
};

type Ctx = Awaited<ReturnType<typeof setUpMarket>>;

const position = async ({ client, market, marketId }: Ctx, user: Address) => {
  const [credit, , , , debt] = await client.readContract({
    address: market.midnight,
    abi: midnightAbi,
    functionName: "position",
    args: [marketId, user],
  });
  const collateral = await client.readContract({
    address: market.midnight,
    abi: midnightAbi,
    functionName: "collateral",
    args: [marketId, user, 0n],
  });
  return { credit, debt, collateral };
};

/** Sends an entity output's onchain requirements, then its transaction, from `account`. */
const execute = async (
  { client }: Ctx,
  params: {
    readonly account: Address;
    readonly output: {
      readonly getRequirements: () => Promise<readonly ActionRequirement[]>;
      readonly buildTx: () => Transaction;
    };
  },
) => {
  const { account, output } = params;
  const transactions = [
    ...(await output.getRequirements()).map((requirement) => {
      if (isRequirementSignature(requirement))
        expect.unreachable("expected onchain requirements");
      return { ...requirement, account };
    }),
    { ...output.buildTx(), account, gas: takeGas },
  ];
  for (const transaction of transactions) {
    const hash = await client.sendTransaction(transaction);
    const receipt = await client.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");
  }
};

/** One PriceRatifierV1 offer on the test market, capped at `maxUnits`. */
const priceTree = (
  { market, priceRatifierV1 }: Ctx,
  params: {
    readonly maker: Address;
    readonly buy: boolean;
    readonly price: bigint;
    readonly maxUnits: bigint;
    readonly group: bigint;
    readonly reduceOnly?: boolean;
  },
) =>
  Tree.create({
    type: "priceV1",
    entries: [
      {
        offer: Offer.create({
          market,
          buy: params.buy,
          maker: params.maker,
          expiry: market.maturity,
          tick: TickLib.priceToTick(params.price),
          group: padHex(numberToHex(params.group), { size: 32 }),
          receiverIfMakerIsSeller: params.buy ? zeroAddress : params.maker,
          ratifier: priceRatifierV1,
          reduceOnly: params.reduceOnly ?? false,
          maxUnits: params.maxUnits,
        }),
      },
    ],
  });

/**
 * Posts each maker's lend offer and has B supply collateral and borrow `units` from them on the
 * uncreated market, taking the offers best price first as the Midnight API lists them.
 */
const openLoan = async (
  ctx: Ctx,
  params: {
    readonly lenders: readonly {
      readonly maker: Address;
      readonly price: bigint;
    }[];
    readonly units: bigint;
  } = { lenders: [{ maker: A, price: parseEther("0.95") }], units },
) => {
  const offers: ReturnType<typeof getE2eTakeableOffers>[number][] = [];
  for (const [index, { maker, price }] of params.lenders.entries()) {
    const tree = priceTree(ctx, {
      maker,
      buy: true,
      price,
      maxUnits: units,
      group: BigInt(index + 1),
    });
    await execute(ctx, {
      account: maker,
      output: await ctx.midnight.makeLend({
        accountAddress: maker,
        offers: tree,
        loanToken: ctx.market.loanToken,
        loanAssets: units,
        deadline: deadline(),
        validation: false,
      }),
    });
    offers.push(...getE2eTakeableOffers({ tree, units }));
  }
  offers.sort((left, right) =>
    Number(
      TickLib.tickToPrice(right.offer.tick) -
        TickLib.tickToPrice(left.offer.tick),
    ),
  );
  await execute(ctx, {
    account: B,
    output: ctx.midnight.supplyCollateralTakeBorrow({
      accountAddress: B,
      marketData: ctx.uncreatedMarketData,
      positionData: new AccrualPosition(
        {
          user: B,
          credit: 0n,
          pendingFee: 0n,
          lastLossFactor: 0n,
          lastAccrual: 0n,
          debt: 0n,
          collateralBitmap: 0n,
          collateral: [0n],
        },
        ctx.uncreatedMarketData,
      ),
      collateralPrices: [oraclePrice],
      collateralSupplies: [{ collateralIndex: 0n, assets: collateralAssets }],
      target: { type: "units", units: params.units, minSellerAssets: 1n },
      takeableOffers: offers,
      deadline: deadline(),
    }),
  });
  await expect(position(ctx, B)).resolves.toEqual({
    credit: 0n,
    debt: params.units,
    collateral: collateralAssets,
  });
};

/** Funding of the loan between A and B that `openLoan` opens by default. */
const loanWallets = {
  A: { loanAssets: units },
  B: { collateralAssets },
} as const satisfies Partial<Record<E2eMidnightWallet, object>>;

describeE2e(scenario, (it, { chainId }) => {
  it("L2-10: B borrows across A's and D's lend offers and the better-priced offer fills first", async ({
    client,
  }) => {
    const ctx = await setUpMarket(client, {
      chainId,
      wallets: { ...loanWallets, D: { loanAssets: units } },
    });
    const target = units + units / 2n;

    // D's worse price is posted first; the take still fills A's offer completely before D's.
    await openLoan(ctx, {
      lenders: [
        { maker: D, price: parseEther("0.9") },
        { maker: A, price: parseEther("0.95") },
      ],
      units: target,
    });

    await expect(position(ctx, A)).resolves.toMatchObject({
      credit: units,
      debt: 0n,
    });
    await expect(position(ctx, D)).resolves.toMatchObject({
      credit: units / 2n,
      debt: 0n,
    });
  });

  it("L2-11: A exits its loan to B by takeWithdraw into C's lend offer and C now holds the credit", async ({
    client,
  }) => {
    const ctx = await setUpMarket(client, {
      chainId,
      wallets: { ...loanWallets, C: { loanAssets: units } },
    });
    await openLoan(ctx);
    const cPrice = parseEther("0.96");
    const cTree = priceTree(ctx, {
      maker: C,
      buy: true,
      price: cPrice,
      maxUnits: units,
      group: 0xc11n,
    });
    await execute(ctx, {
      account: C,
      output: await ctx.midnight.makeLend({
        accountAddress: C,
        offers: cTree,
        loanToken: ctx.market.loanToken,
        loanAssets: units,
        deadline: deadline(),
        validation: false,
      }),
    });
    const before = await client.readContract({
      address: ctx.market.loanToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [A],
    });

    await execute(ctx, {
      account: A,
      output: ctx.midnight.takeWithdraw({
        accountAddress: A,
        marketData: await ctx.midnight.getMarketData(ctx.marketId),
        target: { type: "units", units, minSellerAssets: 1n },
        takeableOffers: getE2eTakeableOffers({ tree: cTree, units }),
        deadline: deadline(),
      }),
    });

    await expect(position(ctx, A)).resolves.toEqual({
      credit: 0n,
      debt: 0n,
      collateral: 0n,
    });
    await expect(position(ctx, C)).resolves.toMatchObject({
      credit: units,
      debt: 0n,
    });
    await expect(position(ctx, B)).resolves.toEqual({
      credit: 0n,
      debt: units,
      collateral: collateralAssets,
    });
    // A sells its units at C's tick price, less a settlement fee of at most 1%.
    const received =
      (await client.readContract({
        address: ctx.market.loanToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [A],
      })) - before;
    const expected =
      (units * TickLib.tickToPrice(TickLib.priceToTick(cPrice))) / WAD;
    expect(received).toBeLessThanOrEqual(expected);
    expect(received).toBeGreaterThanOrEqual(expected - expected / 100n);
  });

  it("L2-12: B repays into D's borrow offer with takeRepayWithdrawCollateral and gets its collateral back", async ({
    client,
  }) => {
    const ctx = await setUpMarket(client, {
      chainId,
      wallets: {
        A: loanWallets.A,
        B: { collateralAssets, loanAssets: units },
        D: { collateralAssets },
      },
    });
    await openLoan(ctx);
    const dTree = priceTree(ctx, {
      maker: D,
      buy: false,
      price: parseEther("0.97"),
      maxUnits: units,
      group: 0xd12n,
    });
    await execute(ctx, {
      account: D,
      output: await ctx.midnight.supplyCollateralMakeBorrow({
        accountAddress: D,
        offers: dTree,
        collateral: {
          market: ctx.market,
          supplies: [{ collateralIndex: 0n, assets: collateralAssets }],
        },
        deadline: deadline(),
        validation: false,
      }),
    });

    await execute(ctx, {
      account: B,
      output: ctx.midnight.takeRepayWithdrawCollateral({
        accountAddress: B,
        marketData: await ctx.midnight.getMarketData(ctx.marketId),
        positionData: await ctx.midnight.getPositionData({
          marketId: ctx.marketId,
          accountAddress: B,
        }),
        collateralPrices: [oraclePrice],
        target: { type: "units", units, maxBuyerAssets: units },
        takeableOffers: getE2eTakeableOffers({ tree: dTree, units }),
        repayEnabled: false,
        collateralWithdrawals: [{ collateralIndex: 0n, assets: maxUint256 }],
        maxContinuousFee: maxUint256,
        deadline: deadline(),
      }),
    });

    await expect(position(ctx, B)).resolves.toEqual({
      credit: 0n,
      debt: 0n,
      collateral: 0n,
    });
    await expect(
      client.readContract({
        address: ctx.market.collateralParams[0]!.token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [B],
      }),
    ).resolves.toBe(collateralAssets);
    await expect(position(ctx, D)).resolves.toEqual({
      credit: 0n,
      debt: units,
      collateral: collateralAssets,
    });
    await expect(position(ctx, A)).resolves.toMatchObject({ credit: units });
  });

  it("L2-13: A's makeWithdraw and B's makeRepay exits fill against C and D and stay reduce-only", async ({
    client,
  }) => {
    const ctx = await setUpMarket(client, {
      chainId,
      wallets: {
        A: { loanAssets: units, collateralAssets },
        B: { collateralAssets, loanAssets: 2n * units },
        C: { loanAssets: 2n * units },
        D: { collateralAssets: 2n * collateralAssets },
      },
    });
    await openLoan(ctx);
    // Collateral keeps A healthy if its exit offer ever opened debt, so only reduce-only stops it.
    for (const [account, collateral] of [
      [A, collateralAssets],
      [D, 2n * collateralAssets],
    ] as const)
      await execute(ctx, {
        account,
        output: ctx.midnight.supplyCollateral({
          accountAddress: account,
          marketData: await ctx.midnight.getMarketData(ctx.marketId),
          collateralAssets: collateral,
        }),
      });

    // Both exit offers are capped at twice the position they close.
    const aTree = priceTree(ctx, {
      maker: A,
      buy: false,
      price: parseEther("0.96"),
      maxUnits: 2n * units,
      group: 0xa13n,
      reduceOnly: true,
    });
    await execute(ctx, {
      account: A,
      output: await ctx.midnight.makeWithdraw({
        accountAddress: A,
        offers: aTree,
        deadline: deadline(),
        validation: false,
      }),
    });
    const takeLendOffers = getE2eTakeableOffers({
      tree: aTree,
      units: 2n * units,
    });
    const [takeLendOffer] = takeLendOffers;
    if (takeLendOffer === undefined)
      expect.unreachable("expected the lend offer to be takeable");
    const takeLend = async () =>
      ctx.midnight.takeLend({
        accountAddress: C,
        marketData: await ctx.midnight.getMarketData(ctx.marketId),
        target: { type: "units", units, maxBuyerAssets: units },
        takeableOffers: takeLendOffers,
        maxContinuousFee: maxUint256,
        deadline: deadline(),
      });
    await execute(ctx, { account: C, output: await takeLend() });
    await expect(position(ctx, A)).resolves.toEqual({
      credit: 0n,
      debt: 0n,
      collateral: collateralAssets,
    });
    await expect(position(ctx, C)).resolves.toMatchObject({
      credit: units,
      debt: 0n,
    });

    const bTree = priceTree(ctx, {
      maker: B,
      buy: true,
      price: parseEther("0.94"),
      maxUnits: 2n * units,
      group: 0xb13n,
      reduceOnly: true,
    });
    await execute(ctx, {
      account: B,
      output: await ctx.midnight.makeRepay({
        accountAddress: B,
        offers: bTree,
        loanToken: ctx.market.loanToken,
        loanAssets: 2n * units,
        deadline: deadline(),
        validation: false,
      }),
    });
    const takeBorrowOffers = getE2eTakeableOffers({
      tree: bTree,
      units: 2n * units,
    });
    const [takeBorrowOffer] = takeBorrowOffers;
    if (takeBorrowOffer === undefined)
      expect.unreachable("expected the borrow offer to be takeable");
    const takeBorrow = async () =>
      ctx.midnight.takeBorrow({
        accountAddress: D,
        marketData: await ctx.midnight.getMarketData(ctx.marketId),
        positionData: await ctx.midnight.getPositionData({
          marketId: ctx.marketId,
          accountAddress: D,
        }),
        collateralPrices: [oraclePrice],
        target: { type: "units", units, minSellerAssets: 1n },
        takeableOffers: takeBorrowOffers,
        deadline: deadline(),
      });
    await execute(ctx, { account: D, output: await takeBorrow() });
    await expect(position(ctx, B)).resolves.toEqual({
      credit: 0n,
      debt: 0n,
      collateral: collateralAssets,
    });
    await expect(position(ctx, D)).resolves.toMatchObject({
      credit: 0n,
      debt: units,
    });

    // A second full take would reopen a reverse position. Direct takes show Midnight rejects it
    // with MakerCreditOrDebtIncreased; the bundle then skips the offer and runs out of offers.
    for (const { account, tx, offer } of [
      {
        account: C,
        tx: (await takeLend()).buildTx(),
        offer: takeLendOffer,
      },
      {
        account: D,
        tx: (await takeBorrow()).buildTx(),
        offer: takeBorrowOffer,
      },
    ] as const) {
      const revert = await client.call({ ...tx, account }).then(
        () => expect.unreachable("expected the reduce-only offer to revert"),
        (failure: BaseError) =>
          failure.walk(
            (cause) =>
              typeof (cause as { data?: unknown } | null)?.data === "string",
          ) as { data: Hex } | null,
      );
      if (revert == null) expect.unreachable("expected revert data");
      const { data } = revert;
      expect(
        decodeErrorResult({
          abi: [...midnightAbi, ...midnightBundlesV2Abi],
          data,
        }).errorName,
      ).toBe("OutOfOffers");
      const directRevert = await client
        .simulateContract({
          account,
          address: ctx.market.midnight,
          abi: midnightAbi,
          functionName: "take",
          args: [
            offer.offer,
            offer.ratifierData,
            units,
            account,
            offer.offer.buy ? account : zeroAddress,
            zeroAddress,
            "0x",
          ],
        })
        .then(
          () => expect.unreachable("expected the reduce-only offer to revert"),
          (failure: BaseError) =>
            failure.walk(
              (cause) =>
                typeof (cause as { data?: unknown } | null)?.data === "string",
            ) as { data: Hex } | null,
        );
      if (directRevert == null) expect.unreachable("expected revert data");
      expect(
        decodeErrorResult({
          abi: midnightAbi,
          data: directRevert.data,
        }).errorName,
      ).toBe("MakerCreditOrDebtIncreased");
    }
  });
});
