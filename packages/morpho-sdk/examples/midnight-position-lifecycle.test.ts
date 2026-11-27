import { MAX_TICK, Offer, Tree } from "@morpho-org/midnight-sdk";
import {
  ChainIdMismatchError,
  InputExceedsMaxError,
  InvalidBigIntInputError,
  InvalidTransactionPlanError,
  MidnightOfferMakerMismatchError,
  MidnightTakeableOfferMarketMismatchError,
  MidnightTakeableOffersNotFillableError,
  MidnightTakeTargetUnreachableError,
  NonIntegerInputError,
  NonPositiveInputError,
  prepareMidnightCancelOffers,
  serializeTransactionPlan,
} from "@morpho-org/morpho-sdk";
import { RatifierV1TakerNotAllowedError } from "@morpho-org/morpho-sdk/midnight/errors";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { createMockClient } from "@morpho-org/test/mock";
import { maxUint256, padHex } from "viem";
import { base } from "viem/chains";
import { describe, expect, test, vi } from "vitest";
import {
  midnightAddresses,
  midnightMarket,
  midnightOtherMarket,
} from "../test/fixtures/midnight.js";
import {
  getBlockAtLeast,
  prepareMidnightLifecycle,
  storeAndBuildMidnightPlan,
} from "./midnight-position-lifecycle.js";

const chainId = base.id;
const { maker, taker } = midnightAddresses;

function offer(overrides: Partial<Parameters<typeof Offer.create>[0]> = {}) {
  return Offer.create({
    market: midnightMarket,
    maker,
    ratifier: getChainAddress(chainId, "priceRatifierV1"),
    group: padHex("0xab", { size: 32 }),
    buy: false,
    start: 0n,
    expiry: 2_000n,
    tick: MAX_TICK,
    maxUnits: 100n,
    ...overrides,
  });
}

const otherGroup = padHex("0xcd", { size: 32 });

const unitsTarget = { type: "units", units: 1n, maxBuyerAssets: 1n } as const;

test.for([
  {
    name: "non-bigint fill units",
    offers: [offer()],
    fillUnits: 1 as unknown as bigint,
    target: unitsTarget,
    offerIndex: 0,
    error: InvalidBigIntInputError,
  },
  {
    name: "zero fill units",
    offers: [offer()],
    fillUnits: 0n,
    target: unitsTarget,
    offerIndex: 0,
    error: NonPositiveInputError,
  },
  {
    name: "an offer index outside the tree",
    offers: [offer()],
    fillUnits: 1n,
    target: unitsTarget,
    offerIndex: 1,
    error: RangeError,
  },
  {
    name: "an unselected offer in another market",
    offers: [
      offer(),
      offer({ market: midnightOtherMarket, group: otherGroup }),
    ],
    fillUnits: 1n,
    target: unitsTarget,
    offerIndex: 0,
    error: MidnightTakeableOfferMarketMismatchError,
  },
  {
    name: "an unselected offer from another maker",
    offers: [offer(), offer({ maker: taker, group: otherGroup })],
    fillUnits: 1n,
    target: unitsTarget,
    offerIndex: 0,
    error: MidnightOfferMakerMismatchError,
  },
  {
    name: "a positive fill below the units target",
    offers: [offer()],
    fillUnits: 1n,
    target: { type: "units", units: 2n, maxBuyerAssets: 2n } as const,
    offerIndex: 0,
    error: MidnightTakeTargetUnreachableError,
  },
  {
    name: "a positive fill below an assets target's unit floor",
    offers: [offer()],
    fillUnits: 1n,
    target: { type: "assets", assets: 1n, minUnits: 2n } as const,
    offerIndex: 0,
    error: MidnightTakeTargetUnreachableError,
  },
  {
    name: "a fill covering an assets target's unit floor but not its assets",
    offers: [offer()],
    fillUnits: 1n,
    target: { type: "assets", assets: 2n, minUnits: 1n } as const,
    offerIndex: 0,
    error: MidnightTakeTargetUnreachableError,
  },
])(
  "rejects $name before the first plan or any read",
  async ({ offers, fillUnits, target, offerIndex, error }) => {
    const { client, request } = createMockClient(base);
    const lifecycle = prepareMidnightLifecycle({
      maker: client,
      taker: client,
      supply: {
        chainId,
        account: maker,
        market: midnightMarket,
        collateralAssets: 10n,
      },
      borrow: {
        offers: Tree.create({
          type: "priceV1",
          entries: offers.map((entry) => ({ offer: entry })),
        }),
      },
      lend: {
        account: taker,
        fillUnits,
        offerIndex,
        target,
        maxContinuousFee: 0n,
      },
      maxRepayAssets: 1n,
    });
    await expect(lifecycle.next()).rejects.toBeInstanceOf(error);
    expect(request).not.toHaveBeenCalled();
  },
);

test.for([
  {
    name: "a non-bigint repayment cap",
    maxRepayAssets: 1 as unknown as bigint,
    makerPollingInterval: undefined,
    takerPollingInterval: undefined,
    error: InvalidBigIntInputError,
  },
  {
    name: "a zero repayment cap",
    maxRepayAssets: 0n,
    makerPollingInterval: undefined,
    takerPollingInterval: undefined,
    error: NonPositiveInputError,
  },
  {
    name: "a maxUint256 repayment cap",
    maxRepayAssets: maxUint256,
    makerPollingInterval: undefined,
    takerPollingInterval: undefined,
    error: InputExceedsMaxError,
  },
  {
    name: "a maker with a zero polling interval",
    maxRepayAssets: 1n,
    makerPollingInterval: 0,
    takerPollingInterval: undefined,
    error: NonIntegerInputError,
  },
  {
    name: "a taker with a zero polling interval",
    maxRepayAssets: 1n,
    makerPollingInterval: undefined,
    takerPollingInterval: 0,
    error: NonIntegerInputError,
  },
])(
  "rejects $name before the first plan or any read",
  async ({
    maxRepayAssets,
    makerPollingInterval,
    takerPollingInterval,
    error,
  }) => {
    const makerMock = createMockClient(base);
    const takerMock = createMockClient(base);
    const lifecycle = prepareMidnightLifecycle({
      maker:
        makerPollingInterval === undefined
          ? makerMock.client
          : { ...makerMock.client, pollingInterval: makerPollingInterval },
      taker:
        takerPollingInterval === undefined
          ? takerMock.client
          : { ...takerMock.client, pollingInterval: takerPollingInterval },
      supply: {
        chainId,
        account: maker,
        market: midnightMarket,
        collateralAssets: 10n,
      },
      borrow: {
        offers: Tree.create({ type: "priceV1", entries: [{ offer: offer() }] }),
      },
      lend: {
        account: taker,
        fillUnits: 1n,
        target: unitsTarget,
        maxContinuousFee: 0n,
      },
      maxRepayAssets,
    });
    await expect(lifecycle.next()).rejects.toBeInstanceOf(error);
    expect(makerMock.request).not.toHaveBeenCalled();
    expect(takerMock.request).not.toHaveBeenCalled();
  },
);

test("rejects a selected leaf restricted to another lender before the first plan or any read", async () => {
  const { client, request } = createMockClient(base);
  const lifecycle = prepareMidnightLifecycle({
    maker: client,
    taker: client,
    supply: {
      chainId,
      account: maker,
      market: midnightMarket,
      collateralAssets: 10n,
    },
    borrow: {
      offers: Tree.create({
        type: "priceV1",
        entries: [{ offer: offer(), allowedTaker: maker }],
      }),
    },
    lend: {
      account: taker,
      fillUnits: 1n,
      target: unitsTarget,
      maxContinuousFee: 0n,
    },
    maxRepayAssets: 1n,
  });
  const rejection = lifecycle.next();
  await expect(rejection).rejects.toBeInstanceOf(
    RatifierV1TakerNotAllowedError,
  );
  await expect(rejection).rejects.toMatchObject({
    taker,
    allowedTaker: maker,
  });
  expect(request).not.toHaveBeenCalled();
});

test("rejects a lender that is the borrower before the first plan or any read", async () => {
  const { client, request } = createMockClient(base);
  const lifecycle = prepareMidnightLifecycle({
    maker: client,
    taker: client,
    supply: {
      chainId,
      account: maker,
      market: midnightMarket,
      collateralAssets: 10n,
    },
    borrow: {
      offers: Tree.create({
        type: "priceV1",
        entries: [{ offer: offer() }, { offer: offer({ group: otherGroup }) }],
      }),
    },
    lend: {
      account: maker,
      fillUnits: 1n,
      target: unitsTarget,
      maxContinuousFee: 0n,
    },
    maxRepayAssets: 1n,
  });
  const rejection = lifecycle.next();
  await expect(rejection).rejects.toBeInstanceOf(
    MidnightTakeableOffersNotFillableError,
  );
  await expect(rejection).rejects.toMatchObject({
    offers: [
      { index: 0, reason: "selfTake" },
      { index: 1, reason: "selfTake" },
    ],
  });
  expect(request).not.toHaveBeenCalled();
});

test("storeAndBuildMidnightPlan builds from the plan loaded back from storage", async () => {
  const { client, request } = createMockClient(base);
  const plan = await prepareMidnightCancelOffers(client, {
    chainId,
    account: maker,
    groups: [otherGroup],
    now: 1_000n,
  });
  request.mockClear();
  const saved: string[] = [];
  await expect(
    storeAndBuildMidnightPlan(plan, async (json) => {
      saved.push(json);
      return "not json";
    }),
  ).rejects.toBeInstanceOf(InvalidTransactionPlanError);
  expect(saved).toEqual([serializeTransactionPlan(plan)]);
  expect(request).not.toHaveBeenCalled();
});

describe.sequential("getBlockAtLeast polling with fake timers", () => {
  test("getBlockAtLeast waits until a lagging client reaches the minimum block", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    try {
      const { client, request } = createMockClient(base);
      const heads = [9n, 10n];
      request.mockImplementation(async ({ method }) => {
        if (method !== "eth_getBlockByNumber") throw new Error(method);
        const number = heads.shift() ?? 10n;
        return {
          number: `0x${number.toString(16)}`,
          timestamp: `0x${(1_000n + number).toString(16)}`,
        };
      });
      let settled = false;
      const block = getBlockAtLeast(client, { minBlockNumber: 10n }).finally(
        () => {
          settled = true;
        },
      );
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toBe(false);
      expect(request).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(client.pollingInterval);
      await expect(block).resolves.toMatchObject({
        number: 10n,
        timestamp: 1_010n,
      });
      expect(request).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
  test("getBlockAtLeast gives up when the client's head never advances", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    try {
      const { client, request } = createMockClient(base);
      request.mockImplementation(async ({ method }) => {
        if (method !== "eth_getBlockByNumber") throw new Error(method);
        return { number: "0x9", timestamp: "0x3f1" };
      });
      const block = getBlockAtLeast(client, {
        minBlockNumber: 10n,
        maxAttempts: 3,
      });
      const rejection = expect(block).rejects.toThrow(
        "Client did not reach block 10 after 3 reads; last block seen: 9",
      );
      await vi.advanceTimersByTimeAsync(client.pollingInterval * 3);
      await rejection;
      expect(request).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
  test("getBlockAtLeast defaults to about one minute of polling", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    try {
      const { client, request } = createMockClient(base);
      request.mockImplementation(async ({ method }) => {
        if (method !== "eth_getBlockByNumber") throw new Error(method);
        return { number: "0x9", timestamp: "0x3f1" };
      });
      const attempts = Math.ceil(60_000 / client.pollingInterval);
      const block = getBlockAtLeast(client, { minBlockNumber: 10n });
      const rejection = expect(block).rejects.toThrow(
        `after ${attempts} reads; last block seen: 9`,
      );
      await vi.advanceTimersByTimeAsync(60_000 + client.pollingInterval);
      await rejection;
      expect(request).toHaveBeenCalledTimes(attempts);
    } finally {
      vi.useRealTimers();
    }
  });
});

test.for([
  {
    name: "a NaN read budget",
    pollingInterval: undefined,
    maxAttempts: Number.NaN,
    error: NonIntegerInputError,
  },
  {
    name: "a zero polling interval's unbounded default budget",
    pollingInterval: 0,
    maxAttempts: undefined,
    error: NonIntegerInputError,
  },
  {
    name: "a zero read budget",
    pollingInterval: undefined,
    maxAttempts: 0,
    error: NonPositiveInputError,
  },
])(
  "getBlockAtLeast rejects $name before any read",
  async ({ pollingInterval, maxAttempts, error }) => {
    const mock = createMockClient(base);
    mock.request.mockImplementation(async ({ method }) => {
      if (method !== "eth_getBlockByNumber") throw new Error(method);
      return { number: "0x9", timestamp: "0x3f1" };
    });
    const client =
      pollingInterval === undefined
        ? mock.client
        : { ...mock.client, pollingInterval };
    await expect(
      getBlockAtLeast(client, { minBlockNumber: 10n, maxAttempts }),
    ).rejects.toBeInstanceOf(error);
    expect(mock.request).not.toHaveBeenCalled();
  },
);

test("rejects a taker served on another chain before the first plan", async () => {
  const makerMock = createMockClient(base);
  const takerMock = createMockClient(base);
  takerMock.request.mockImplementation(async ({ method }) => {
    if (method !== "eth_chainId") throw new Error(method);
    return "0x1";
  });
  const lifecycle = prepareMidnightLifecycle({
    maker: makerMock.client,
    taker: takerMock.client,
    supply: {
      chainId,
      account: maker,
      market: midnightMarket,
      collateralAssets: 10n,
    },
    borrow: {
      offers: Tree.create({ type: "priceV1", entries: [{ offer: offer() }] }),
    },
    lend: {
      account: taker,
      fillUnits: 1n,
      target: unitsTarget,
      maxContinuousFee: 0n,
    },
    maxRepayAssets: 1n,
  });
  await expect(lifecycle.next()).rejects.toBeInstanceOf(ChainIdMismatchError);
  expect(makerMock.request.mock.calls.map(([{ method }]) => method)).toEqual([
    "eth_chainId",
  ]);
  expect(takerMock.request.mock.calls.map(([{ method }]) => method)).toEqual([
    "eth_chainId",
  ]);
});
