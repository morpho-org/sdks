import {
  AccrualPosition,
  Market,
  MarketParams,
  MarketUtils,
  midnightAbi,
  Offer,
  OfferUtils,
  RateRatifierV1,
  Tree,
} from "@morpho-org/midnight-sdk";
import { ChainId, getChainAddress, Time } from "@morpho-org/morpho-ts";
import { type AnvilTestClient, getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  concatHex,
  type Hex,
  maxUint256,
  padHex,
  parseEther,
  parseUnits,
  toHex,
  zeroAddress,
} from "viem";
import { base } from "viem/chains";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type MockInstance,
  vi,
} from "vitest";
import {
  type ActionRequirement,
  isRequirementSignature,
  morphoViemExtension,
} from "../../../src/index.js";
import {
  MidnightOfferExpiredError,
  MidnightOfferNoCreditError,
  MidnightOfferNoDebtError,
} from "../../../src/types/midnightPublicationError.js";

const test = createViemTest(base, {
  forkUrl: getErpcForkUrl(base.id, process.env.ERPC_SECRET),
  forkBlockNumber: 52_252_000n,
  stepsTracing: false,
});

const midnight = getChainAddress(ChainId.BaseMainnet, "midnight");
const rateRatifierV1 = getChainAddress(ChainId.BaseMainnet, "rateRatifierV1");
const loanToken = getChainAddress(ChainId.BaseMainnet, "usdc");
const collateralToken = getChainAddress(ChainId.BaseMainnet, "wNative");
const oracle = "0x0000000000000000000000000000000000080001" as Address;
const oraclePrice = 10n ** 36n;
const taker = "0x0000000000000000000000000000000000007A4f" as Address;
const collateralAssets = parseEther("2");

type Client = AnvilTestClient<typeof base>;

const entity = (client: Client) =>
  client.extend(morphoViemExtension()).morpho.midnight(base.id);

const deadline = () => Time.timestamp() + 600n;

/** Builds market params no fork state has touched, so the market is not created onchain. */
const freshMarket = (timestamp: bigint) =>
  new MarketParams({
    chainId: base.id,
    midnight,
    loanToken,
    collateralParams: [
      {
        token: collateralToken,
        lltv: 770_000_000_000_000_000n,
        liquidationCursor: 300_000_000_000_000_000n,
        oracle,
      },
    ],
    // Offer payloads only encode maturities at 15:00 UTC.
    maturity:
      ((timestamp + 365n * 86_400n) / 86_400n + 1n) * 86_400n + 15n * 3_600n,
    rcfThreshold: 0n,
    enterGate: zeroAddress,
    liquidatorGate: zeroAddress,
  });

/** Market snapshot an integrator builds for a market that has no onchain state yet. */
const uncreatedMarketData = (params: MarketParams) =>
  new Market({
    params,
    totalUnits: 0n,
    lossFactor: 0n,
    withdrawable: 0n,
    continuousFeeCredit: 0n,
    settlementFeeCbps: [0, 0, 0, 0, 0, 0, 0],
    continuousFee: 0,
    tickSpacing: 0,
  });

/** `getPositionData` cannot read a market that is not created, so the empty position is built locally. */
const emptyPosition = (market: Market, user: Address) =>
  new AccrualPosition(
    {
      user,
      credit: 0n,
      pendingFee: 0n,
      lastLossFactor: 0n,
      lastAccrual: 0n,
      debt: 0n,
      collateralBitmap: 0n,
      collateral: [0n],
    },
    market,
  );

const readMarketState = (client: Client, id: Hex) =>
  client.readContract({
    address: midnight,
    abi: midnightAbi,
    functionName: "marketState",
    args: [id],
  });

const readPosition = async (
  client: Client,
  [id, user]: readonly [Hex, Address],
) => {
  const [credit, , , , debt] = await client.readContract({
    address: midnight,
    abi: midnightAbi,
    functionName: "position",
    args: [id, user],
  });
  const collateral = await client.readContract({
    address: midnight,
    abi: midnightAbi,
    functionName: "collateral",
    args: [id, user, 0n],
  });
  return { credit, debt, collateral };
};

const expectUncreatedMarket = async (client: Client, id: Hex) => {
  const state = await readMarketState(client, id);
  expect(state.every((field) => BigInt(field) === 0n)).toBe(true);
};

const expectNoPosition = async (
  client: Client,
  key: readonly [Hex, Address],
) => {
  await expect(readPosition(client, key)).resolves.toEqual({
    credit: 0n,
    debt: 0n,
    collateral: 0n,
  });
};

const send = async (
  client: Client,
  transaction: Parameters<Client["sendTransaction"]>[0],
) => {
  const hash = await client.sendTransaction(transaction);
  const receipt = await client.waitForTransactionReceipt({ hash });
  expect(receipt.status).toBe("success");
};

const sendRequirements = async (
  client: Client,
  {
    account,
    output,
  }: {
    readonly account: Address;
    readonly output: {
      getRequirements: () => Promise<readonly ActionRequirement[]>;
    };
  },
) => {
  for (const requirement of await output.getRequirements()) {
    if (isRequirementSignature(requirement)) {
      expect.unreachable("expected onchain requirements");
    }
    await send(client, { ...requirement, account });
  }
};

const installOracle = (client: Client) =>
  client.setCode({
    address: oracle,
    bytecode: concatHex([
      "0x7f",
      padHex(toHex(oraclePrice), { size: 32 }),
      "0x60005260206000f3",
    ]),
  });

const fundTaker = async (client: Client) => {
  await client.setBalance({ address: taker, value: parseEther("1") });
  await client.impersonateAccount({ address: taker });
};

const takeableOffersFor = (tree: Tree<"rateV1">, units: bigint) =>
  RateRatifierV1.ratify({ tree }).map((item) => ({
    ...item,
    offer: OfferUtils.toStruct({ offer: item.offer }),
    units,
  }));

const rateOffer = (params: {
  readonly market: MarketParams;
  readonly maker: Address;
  readonly buy: boolean;
  readonly group: Hex;
  readonly expiry?: bigint;
  readonly reduceOnly?: boolean;
}) =>
  Offer.create({
    market: params.market,
    buy: params.buy,
    maker: params.maker,
    expiry: params.expiry ?? params.market.maturity,
    tick: 5_000n,
    group: params.group,
    receiverIfMakerIsSeller: params.buy ? zeroAddress : params.maker,
    ratifier: rateRatifierV1,
    reduceOnly: params.reduceOnly ?? false,
    ...(params.buy
      ? { maxAssets: parseUnits("1", 6) }
      : { maxUnits: parseUnits("1", 6) }),
  });

let fetchSpy: MockInstance<typeof fetch>;
const mempoolCalls = () =>
  fetchSpy.mock.calls.filter(([input]) =>
    (input instanceof Request ? input.url : String(input)).includes("/mempool"),
  );

beforeEach(() => {
  // Pass-through spy: fork RPC traffic still reaches Anvil.
  fetchSpy = vi.spyOn(globalThis, "fetch");
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe("Midnight P2P flows with validation: false on an uncreated market (Base fork)", () => {
  test("makeLend publishes on an uncreated market; the first supplyCollateralTakeBorrow creates the market and both positions", async ({
    client,
  }) => {
    const block = await client.getBlock();
    const market = freshMarket(block.timestamp);
    const marketId = MarketUtils.toId(market);
    const maker = client.account.address;
    await expectUncreatedMarket(client, marketId);
    await expectNoPosition(client, [marketId, maker]);
    await expectNoPosition(client, [marketId, taker]);

    await installOracle(client);
    const loanAssets = parseUnits("1", 6);
    await client.deal({ erc20: loanToken, account: maker, amount: loanAssets });
    const lendTree = Tree.create({
      type: "rateV1",
      entries: [
        {
          offer: rateOffer({
            market,
            maker,
            buy: true,
            group: `0x${"e1".repeat(32)}`,
          }),
          rate: 0n,
        },
      ],
    });
    const make = await entity(client).makeLend({
      accountAddress: maker,
      offers: lendTree,
      loanToken,
      loanAssets,
      deadline: deadline(),
      validation: false,
    });
    await sendRequirements(client, { account: maker, output: make });
    await send(client, { ...make.buildTx(), account: maker });
    expect(mempoolCalls()).toHaveLength(0);
    await expectUncreatedMarket(client, marketId);

    await fundTaker(client);
    await client.deal({
      erc20: collateralToken,
      account: taker,
      amount: collateralAssets,
    });
    const units = parseUnits("0.5", 6);
    const marketData = uncreatedMarketData(market);
    const take = entity(client).supplyCollateralTakeBorrow({
      marketData,
      accountAddress: taker,
      positionData: emptyPosition(marketData, taker),
      collateralPrices: [oraclePrice],
      collateralSupplies: [{ collateralIndex: 0n, assets: collateralAssets }],
      target: { type: "units", units, minSellerAssets: 1n },
      takeableOffers: takeableOffersFor(lendTree, units),
      deadline: deadline(),
    });
    await sendRequirements(client, { account: taker, output: take });
    await send(client, { ...take.buildTx(), account: taker, gas: 8_000_000n });

    const createdMarket = await entity(client).getMarketData(marketId);
    expect(createdMarket.tickSpacing).toBeGreaterThan(0);
    expect(createdMarket.totalUnits).toBe(units);
    await expect(readPosition(client, [marketId, maker])).resolves.toEqual({
      credit: units,
      debt: 0n,
      collateral: 0n,
    });
    await expect(readPosition(client, [marketId, taker])).resolves.toEqual({
      credit: 0n,
      debt: units,
      collateral: collateralAssets,
    });
    expect(mempoolCalls()).toHaveLength(0);
  });

  test("supplyCollateralMakeBorrow creates the market when supplying collateral; the first takeLend opens both positions", async ({
    client,
  }) => {
    const block = await client.getBlock();
    const market = freshMarket(block.timestamp);
    const marketId = MarketUtils.toId(market);
    const maker = client.account.address;
    await expectUncreatedMarket(client, marketId);
    await expectNoPosition(client, [marketId, maker]);
    await expectNoPosition(client, [marketId, taker]);

    await installOracle(client);
    await client.deal({
      erc20: collateralToken,
      account: maker,
      amount: collateralAssets,
    });
    const borrowTree = Tree.create({
      type: "rateV1",
      entries: [
        {
          offer: rateOffer({
            market,
            maker,
            buy: false,
            group: `0x${"e2".repeat(32)}`,
          }),
          rate: 1_000_000_000n,
        },
      ],
    });
    const make = await entity(client).supplyCollateralMakeBorrow({
      accountAddress: maker,
      offers: borrowTree,
      collateral: {
        market,
        supplies: [{ collateralIndex: 0n, assets: collateralAssets }],
      },
      deadline: deadline(),
      validation: false,
    });
    await sendRequirements(client, { account: maker, output: make });
    await send(client, { ...make.buildTx(), account: maker });
    expect(mempoolCalls()).toHaveLength(0);
    await expect(readPosition(client, [marketId, maker])).resolves.toEqual({
      credit: 0n,
      debt: 0n,
      collateral: collateralAssets,
    });
    const suppliedMarket = await entity(client).getMarketData(marketId);
    expect(suppliedMarket.tickSpacing).toBeGreaterThan(0);
    expect(suppliedMarket.totalUnits).toBe(0n);

    await fundTaker(client);
    const units = parseUnits("0.5", 6);
    await client.deal({ erc20: loanToken, account: taker, amount: units * 2n });
    const take = entity(client).takeLend({
      marketData: uncreatedMarketData(market),
      accountAddress: taker,
      target: { type: "units", units, maxBuyerAssets: units * 2n },
      takeableOffers: takeableOffersFor(borrowTree, units),
      maxContinuousFee: maxUint256,
      deadline: deadline(),
    });
    await sendRequirements(client, { account: taker, output: take });
    await send(client, { ...take.buildTx(), account: taker, gas: 8_000_000n });

    const createdMarket = await entity(client).getMarketData(marketId);
    expect(createdMarket.tickSpacing).toBeGreaterThan(0);
    expect(createdMarket.totalUnits).toBe(units);
    await expect(readPosition(client, [marketId, maker])).resolves.toEqual({
      credit: 0n,
      debt: units,
      collateral: collateralAssets,
    });
    await expect(readPosition(client, [marketId, taker])).resolves.toEqual({
      credit: units,
      debt: 0n,
      collateral: 0n,
    });
    expect(mempoolCalls()).toHaveLength(0);
  });

  test("local maker checks still reject unfillable offers on an uncreated market", async ({
    client,
  }) => {
    const block = await client.getBlock();
    const market = freshMarket(block.timestamp);
    const marketId = MarketUtils.toId(market);
    const maker = client.account.address;
    await expectUncreatedMarket(client, marketId);
    await expectNoPosition(client, [marketId, maker]);
    await installOracle(client);
    const tree = (params: {
      readonly buy: boolean;
      readonly expiry?: bigint;
      readonly reduceOnly?: boolean;
    }) =>
      Tree.create({
        type: "rateV1",
        entries: [
          {
            offer: rateOffer({
              market,
              maker,
              group: `0x${"e3".repeat(32)}`,
              ...params,
            }),
            rate: params.buy ? 0n : 1_000_000_000n,
          },
        ],
      });

    await expect(
      entity(client).makeLend({
        accountAddress: maker,
        offers: tree({ buy: true, expiry: block.timestamp - 1n }),
        loanToken,
        loanAssets: parseUnits("1", 6),
        deadline: deadline(),
        validation: false,
      }),
    ).rejects.toThrow(MidnightOfferExpiredError);
    await expect(
      entity(client).makeWithdraw({
        accountAddress: maker,
        offers: tree({ buy: false, reduceOnly: true }),
        deadline: deadline(),
        validation: false,
      }),
    ).rejects.toThrow(MidnightOfferNoCreditError);
    await expect(
      entity(client).makeRepay({
        accountAddress: maker,
        offers: tree({ buy: true, reduceOnly: true }),
        loanToken,
        loanAssets: parseUnits("1", 6),
        deadline: deadline(),
        validation: false,
      }),
    ).rejects.toThrow(MidnightOfferNoDebtError);
    expect(mempoolCalls()).toHaveLength(0);
  });
});
