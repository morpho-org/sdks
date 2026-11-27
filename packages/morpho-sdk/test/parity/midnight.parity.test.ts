import {
  AccrualPosition,
  Market,
  MarketParams,
  midnightAbi,
  Offer,
  Tree,
} from "@morpho-org/midnight-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { createMockClient, type RpcHandler } from "@morpho-org/test/mock";
import {
  decodeFunctionData,
  encodeFunctionResult,
  type Hex,
  maxUint256,
  padHex,
  zeroAddress,
} from "viem";
import { base, mainnet } from "viem/chains";
import { afterEach, assert, describe, expect, test, vi } from "vitest";
import { parseMidnightWithdrawCollateralPreparation } from "../../src/actions/midnight/withdrawCollateral.js";
import { parseWithdrawCollateralParams } from "../../src/entities/midnight/parse.js";
import * as entity from "../../src/entities/midnight/prepare.js";
import type { MidnightMakerOfferState } from "../../src/entities/midnight/publication.js";
import type { GetOffersDataParams } from "../../src/entities/midnight/types.js";
import * as plan from "../../src/transactionPlan/midnight/prepare.js";
import type { MorphoClientType } from "../../src/types/client.js";
import { ChainIdMismatchError } from "../../src/types/error.js";
import {
  midnightAddresses,
  midnightBaseOffer,
  midnightChainId,
  midnightMarket,
  midnightTwoCollateralMarket,
} from "../fixtures/midnight.js";

const reader = vi.hoisted(() => ({ now: 0n, real: false }));

vi.mock(
  "../../src/entities/midnight/publication.js",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../src/entities/midnight/publication.js")
      >();
    return {
      ...actual,
      fetchMidnightMakerOfferStatesWithChainCheck: vi.fn(
        async (
          ...args: Parameters<
            typeof actual.fetchMidnightMakerOfferStatesWithChainCheck
          >
        ) => {
          if (reader.real) {
            return actual.fetchMidnightMakerOfferStatesWithChainCheck(...args);
          }
          const [{ tree }, chainCheck] = args;
          await chainCheck();
          return {
            states: tree.offers.map(
              () =>
                ({
                  consumed: 0n,
                  tickSpacing: 1,
                  continuousFee: 0n,
                  credit: 0n,
                  debt: 0n,
                  market: {
                    id: padHex("0x01", { size: 32 }),
                    params: { maturity: 1_767_279_600n },
                  },
                  lltvEnabled: [],
                  liquidationCursorEnabled: [],
                  oracleHasCode: [],
                }) as unknown as MidnightMakerOfferState,
            ),
            now: reader.now,
          };
        },
      ),
    };
  },
);

const maturity = 1_767_279_600n;
const expiry = maturity - 60n;
const { maker, taker } = midnightAddresses;

function priceTree(...overrides: Parameters<typeof midnightBaseOffer>[0][]) {
  return Tree.create({
    type: "priceV1",
    entries: (overrides.length === 0 ? [{}] : overrides).map((override) => ({
      offer: Offer.create(
        midnightBaseOffer({
          market: { ...midnightMarket, maturity },
          expiry,
          ratifier: getChainAddress(midnightChainId, "priceRatifierV1"),
          ...override,
        }),
      ),
    })),
  });
}

function rateTree() {
  return Tree.create({
    type: "rateV1",
    entries: [
      {
        offer: Offer.create(
          midnightBaseOffer({
            market: { ...midnightMarket, maturity },
            expiry,
            ratifier: getChainAddress(midnightChainId, "rateRatifierV1"),
          }),
        ),
        rate: 1_000_000_000n,
      },
    ],
  });
}

function rejectFetch() {
  return vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("unexpected fetch"));
}

function acceptFetch() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(
    async () =>
      new Response(JSON.stringify({ data: { issues: [] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
}

async function settle<T>(run: () => Promise<T>) {
  try {
    return { value: await run() };
  } catch (error) {
    return { error };
  }
}

const pinnedBlock = {
  baseFeePerGas: "0x0",
  difficulty: "0x0",
  extraData: "0x",
  gasLimit: "0x1c9c380",
  gasUsed: "0x0",
  hash: `0x${"01".repeat(32)}`,
  logsBloom: `0x${"00".repeat(256)}`,
  miner: maker,
  mixHash: `0x${"02".repeat(32)}`,
  nonce: "0x0000000000000000",
  number: "0x1396",
  parentHash: `0x${"03".repeat(32)}`,
  receiptsRoot: `0x${"04".repeat(32)}`,
  sha3Uncles: `0x${"05".repeat(32)}`,
  stateRoot: `0x${"06".repeat(32)}`,
  timestamp: "0x3e8",
  totalDifficulty: "0x0",
  transactions: [],
  transactionsRoot: `0x${"07".repeat(32)}`,
};

function readMidnightState(data: Hex) {
  const call = decodeFunctionData({ abi: midnightAbi, data });
  switch (call.functionName) {
    case "marketState":
      return encodeFunctionResult({
        abi: midnightAbi,
        functionName: "marketState",
        result: [1n, 0n, 0n, 0n, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      });
    case "consumed":
    case "credit":
    case "debt":
      return encodeFunctionResult({
        abi: midnightAbi,
        functionName: call.functionName,
        result: 0n,
      });
    case "defaultContinuousFee":
      return encodeFunctionResult({
        abi: midnightAbi,
        functionName: "defaultContinuousFee",
        result: 0,
      });
    case "isLltvEnabled":
    case "isLiquidationCursorEnabled":
      return encodeFunctionResult({
        abi: midnightAbi,
        functionName: call.functionName,
        result: true,
      });
    default:
      throw new Error(`unexpected Midnight read ${call.functionName}`);
  }
}

function pinnedStateRpc(reportedChainId: number): RpcHandler {
  return async ({ method, params }) => {
    if (method === "eth_chainId") return `0x${reportedChainId.toString(16)}`;
    if (method === "eth_blockNumber") return pinnedBlock.number;
    if (method === "eth_getBlockByNumber") return pinnedBlock;
    if (method === "eth_getCode") return "0x01";
    if (method === "eth_call") {
      const [transaction] = params as readonly [{ data: Hex }];
      return readMidnightState(transaction.data);
    }
    throw new Error(`unexpected RPC ${method}`);
  };
}

async function prepareBoth(
  params: GetOffersDataParams,
  {
    chain = base,
    rpc,
  }: { chain?: typeof base | typeof mainnet; rpc?: RpcHandler } = {},
) {
  const planHandle = createMockClient(chain);
  const entityHandle = createMockClient(chain);
  if (rpc) {
    planHandle.request.mockImplementation(rpc);
    entityHandle.request.mockImplementation(rpc);
  } else {
    const defaultRequest = planHandle.request.getMockImplementation();
    planHandle.request.mockImplementation(async (args) =>
      args.method === "eth_blockNumber" ? "0x1" : defaultRequest?.(args),
    );
  }
  const planContext = { client: planHandle.client, chainId: base.id };
  const entityContext = {
    client: { viemClient: entityHandle.client } as unknown as MorphoClientType,
    chainId: base.id,
  };
  const planResult = await settle(async () =>
    plan.getOffersDataInternal(
      plan.parseGetOffersDataParams(params, planContext),
      planContext,
    ),
  );
  const entityResult = await settle(async () =>
    entity.getOffersDataInternal(
      entity.parseGetOffersDataParams(params, entityContext),
      entityContext,
    ),
  );
  const requests = (handle: typeof planHandle) =>
    handle.request.mock.calls.map(([call]) => ({
      method: call.method,
      params: call.params,
    }));
  const methods = (handle: typeof planHandle) =>
    requests(handle).map(({ method }) => method);
  return {
    plan: planResult,
    entity: entityResult,
    planMethods: methods(planHandle).filter(
      (method) => method !== "eth_blockNumber",
    ),
    entityMethods: methods(entityHandle),
    planRequests: requests(planHandle),
    entityRequests: requests(entityHandle),
  };
}

describe.sequential("plan-side maker offer preparation matches the entity copy", () => {
  afterEach(() => {
    reader.real = false;
    vi.restoreAllMocks();
  });

  test.for([
    { name: "a Price V1 tree", offers: priceTree() },
    { name: "a Rate V1 tree", offers: rateTree() },
  ])(
    "behavior: the real state reader sends the same pinned requests for $name",
    async ({ offers }) => {
      reader.real = true;
      const fetch = rejectFetch();
      const result = await prepareBoth(
        { accountAddress: maker, offers, validation: false },
        { rpc: pinnedStateRpc(base.id) },
      );
      expect(fetch).not.toHaveBeenCalled();
      expect(result.plan.error).toBeUndefined();
      expect(result.plan).toStrictEqual(result.entity);
      expect(result.planRequests).toStrictEqual(result.entityRequests);
      expect(new Set(result.planRequests.map(({ method }) => method))).toEqual(
        new Set([
          "eth_chainId",
          "eth_blockNumber",
          "eth_getBlockByNumber",
          "eth_call",
          "eth_getCode",
        ]),
      );
      const stateReads = result.planRequests.filter(
        ({ method }) => method === "eth_call" || method === "eth_getCode",
      );
      expect(stateReads).not.toHaveLength(0);
      for (const { params } of stateReads) {
        expect(params?.[1]).toBe(pinnedBlock.number);
      }
    },
  );

  test("error: ChainIdMismatchError from both copies when the transport reports another chain, before any state read", async () => {
    reader.real = true;
    const fetch = rejectFetch();
    const result = await prepareBoth(
      { accountAddress: maker, offers: priceTree(), validation: false },
      { rpc: pinnedStateRpc(mainnet.id) },
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(result.plan.error).toBeInstanceOf(ChainIdMismatchError);
    expect(result.entity.error).toBeInstanceOf(ChainIdMismatchError);
    expect(result.plan).toStrictEqual(result.entity);
    expect(result.planMethods).toEqual(["eth_chainId"]);
    expect(result.entityMethods).toEqual(["eth_chainId"]);
  });

  test.for([
    { name: "one live offer", offers: priceTree(), now: 0n },
    { name: "one live Rate V1 offer", offers: rateTree(), now: 0n },
    {
      name: "a group repeated in another case",
      offers: priceTree(
        { group: padHex("0xab", { size: 32 }) },
        { group: padHex("0xAB", { size: 32 }), expiry: expiry - 1n },
      ),
      now: 0n,
    },
  ])(
    "behavior: $name returns the same offers data and reads",
    async ({ offers, now }) => {
      reader.now = now;
      const fetch = rejectFetch();
      const result = await prepareBoth({
        accountAddress: maker,
        offers,
        validation: false,
      });
      expect(fetch).not.toHaveBeenCalled();
      expect(result.plan.error).toBeUndefined();
      expect(result.plan).toStrictEqual(result.entity);
      expect(result.planMethods).toEqual(result.entityMethods);
    },
  );

  test.for([
    { name: "a Price V1 tree", offers: priceTree() },
    { name: "a Rate V1 tree", offers: rateTree() },
  ])(
    "error: default validation of $name sends the same mempool request and rejects the same way",
    async ({ offers }) => {
      reader.now = 0n;
      const fetch = rejectFetch();
      const result = await prepareBoth({ accountAddress: maker, offers });
      expect(result.plan.error).toBeInstanceOf(Error);
      expect(result.plan).toStrictEqual(result.entity);
      expect(result.planMethods).toEqual(result.entityMethods);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(fetch.mock.calls[0]).toEqual(fetch.mock.calls[1]);
    },
  );

  test.for([
    { name: "a Price V1 tree", offers: priceTree() },
    { name: "a Rate V1 tree", offers: rateTree() },
  ])(
    "behavior: default validation of $name accepted by the mempool returns the same offers data",
    async ({ offers }) => {
      reader.now = 0n;
      const fetch = acceptFetch();
      const result = await prepareBoth({ accountAddress: maker, offers });
      expect(result.plan.error).toBeUndefined();
      expect(result.plan).toStrictEqual(result.entity);
      expect(result.planMethods).toEqual(result.entityMethods);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(fetch.mock.calls[0]).toEqual(fetch.mock.calls[1]);
    },
  );

  test.for([
    {
      name: "a client on another chain",
      params: { accountAddress: maker, offers: priceTree() },
      chain: mainnet,
    },
    {
      name: "the zero account",
      params: { accountAddress: zeroAddress, offers: priceTree() },
    },
    {
      name: "a malformed account",
      params: { accountAddress: "0x1234", offers: priceTree() },
    },
    {
      name: "an offer naming another maker",
      params: { accountAddress: maker, offers: priceTree({ maker: taker }) },
    },
    {
      name: "an offer naming another ratifier",
      params: {
        accountAddress: maker,
        offers: priceTree({
          ratifier: getChainAddress(base.id, "rateRatifierV1"),
        }),
      },
    },
    {
      name: "an offer expired at the pinned block",
      params: { accountAddress: maker, offers: priceTree() },
      now: expiry,
    },
  ] as const)(
    "error: $name throws the same error from both copies",
    async ({
      params,
      chain,
      now = 0n,
    }: {
      params: GetOffersDataParams;
      chain?: typeof mainnet;
      now?: bigint;
    }) => {
      reader.now = now;
      const fetch = rejectFetch();
      const result = await prepareBoth(params, { chain });
      expect(fetch).not.toHaveBeenCalled();
      expect(result.plan.error).toBeInstanceOf(Error);
      expect(result.plan.error?.constructor).toBe(
        result.entity.error?.constructor,
      );
      expect(result.plan).toStrictEqual(result.entity);
      expect(result.planMethods).toEqual(result.entityMethods);
    },
  );
});

function withdrawalSnapshot({
  market = midnightTwoCollateralMarket,
  positionMarket = market,
  user = taker,
  collateral = [200n, 50n],
}: {
  market?: MarketParams;
  positionMarket?: MarketParams;
  user?: Hex;
  collateral?: bigint[];
} = {}) {
  const marketFor = (params: MarketParams) =>
    new Market({
      params,
      totalUnits: 100n,
      lossFactor: 0n,
      withdrawable: 0n,
      continuousFeeCredit: 0n,
      settlementFeeCbps: [0, 0, 0, 0, 0, 0, 0],
      continuousFee: 0,
      tickSpacing: 1,
    });
  const positionData = new AccrualPosition(
    {
      user,
      debt: 0n,
      credit: 0n,
      pendingFee: 0n,
      lastAccrual: 1_000n,
      lastLossFactor: 0n,
      collateralBitmap: 3n,
      collateral,
    },
    marketFor(positionMarket),
  );
  return { marketData: marketFor(market), positionData };
}

function parseWithdrawalBoth(
  changes: Partial<Parameters<typeof parseWithdrawCollateralParams>[0]>,
) {
  const params = {
    accountAddress: taker,
    ...withdrawalSnapshot(),
    collateralPrices: [],
    assets: 10n,
    ...changes,
  };
  const run = <T>(parse: () => T) => {
    try {
      return { value: parse() };
    } catch (error) {
      return { error };
    }
  };
  return {
    planResult: run(() =>
      parseMidnightWithdrawCollateralPreparation({
        ...params,
        chainId: base.id,
      }),
    ),
    entityResult: run(() =>
      parseWithdrawCollateralParams(params, {
        client: {
          options: {},
          viemClient: { chain: base },
        } as unknown as MorphoClientType,
        chainId: base.id,
      }),
    ),
  };
}

describe("plan-side collateral withdrawal parsing matches the entity copy", () => {
  const foreignMidnight = new MarketParams({
    ...midnightTwoCollateralMarket,
    midnight: padHex("0x01", { size: 20 }),
  });
  const otherChain = new MarketParams({
    ...midnightTwoCollateralMarket,
    chainId: BigInt(mainnet.id),
  });
  const midnight = getChainAddress(base.id, "midnight");

  test.for([
    { name: "the first collateral by default", changes: {} },
    {
      name: "maxUint256 at the second index to another receiver",
      changes: { collateralIndex: 1n, assets: maxUint256, receiver: maker },
    },
  ])("behavior: $name parses to the same withdrawal", ({ changes }) => {
    const { planResult, entityResult } = parseWithdrawalBoth(changes);
    expect(planResult.error).toBeUndefined();
    assert(planResult.value && entityResult.value);
    for (const [key, value] of Object.entries(planResult.value)) {
      expect(
        entityResult.value[key as keyof typeof entityResult.value],
      ).toStrictEqual(value);
    }
  });

  test.for([
    { name: "an unknown index", changes: { collateralIndex: 2n } },
    {
      name: "another account's position",
      changes: withdrawalSnapshot({ user: maker }),
    },
    {
      name: "a position from another market",
      changes: withdrawalSnapshot({ positionMarket: midnightMarket }),
    },
    {
      name: "a market on another Midnight deployment",
      changes: withdrawalSnapshot({ market: foreignMidnight }),
    },
    {
      name: "a market on another chain",
      changes: withdrawalSnapshot({ market: otherChain }),
    },
    { name: "the zero account", changes: { accountAddress: zeroAddress } },
    { name: "the zero receiver", changes: { receiver: zeroAddress } },
    { name: "Midnight core as receiver", changes: { receiver: midnight } },
    { name: "zero assets", changes: { assets: 0n } },
    {
      name: "maxUint256 at an empty index",
      changes: {
        ...withdrawalSnapshot({ collateral: [200n, 0n] }),
        collateralIndex: 1n,
        assets: maxUint256,
      },
    },
    {
      name: "an unknown index and the zero receiver",
      changes: { collateralIndex: 2n, receiver: zeroAddress },
    },
    {
      name: "another account's position on another Midnight deployment",
      changes: withdrawalSnapshot({ market: foreignMidnight, user: maker }),
    },
    {
      name: "zero assets to the zero receiver",
      changes: { assets: 0n, receiver: zeroAddress },
    },
  ])(
    "error: $name throws the same error class from both copies",
    ({ changes }) => {
      const { planResult, entityResult } = parseWithdrawalBoth(changes);
      expect(planResult.error).toBeInstanceOf(Error);
      expect(planResult.error?.constructor).toBe(
        entityResult.error?.constructor,
      );
    },
  );
});
