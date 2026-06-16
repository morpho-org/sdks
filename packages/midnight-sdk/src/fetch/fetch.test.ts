import { NegativeValueError } from "@morpho-org/morpho-ts";
import {
  createMockClient,
  type MockClientHandle,
  mockRead,
} from "@morpho-org/test/mock";
import {
  type Abi,
  type Address,
  type ContractFunctionName,
  encodeFunctionResult,
  type Hex,
} from "viem";
import { base } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  addresses,
  baseMarketParams,
  baseOffer,
  marketId,
} from "../__test__/fixtures.js";
import { midnightAbi } from "../abis.js";
import { MAX_TICK } from "../constants.js";
import { SettlementFeeExceedsPriceError } from "../errors.js";
import { MarketUtils } from "../market/index.js";
import { TickLib } from "../math/index.js";
import { abi as getPositionAbi } from "../queries/GetPosition.js";
import {
  fetchAccrualPosition,
  fetchConsumableUnits,
  fetchMarket,
  fetchMarketParams,
  fetchPosition,
  fetchRatifierInfo,
} from "./index.js";

function mockDeploylessRead<
  const abi extends Abi,
  fn extends ContractFunctionName<abi, "view" | "pure">,
>(
  handle: MockClientHandle,
  params: {
    readonly abi: abi;
    readonly functionName: fn;
    readonly result: unknown;
  },
) {
  const defaultRequest = handle.request.getMockImplementation();
  const result = encodeFunctionResult({
    abi: params.abi,
    functionName: params.functionName,
    result: params.result,
  });

  handle.request.mockImplementation(async (call) => {
    if (call.method === "eth_call") {
      const [tx] = (call.params ?? []) as [{ to?: Address; data?: Hex }];
      if (tx?.to == null && typeof tx?.data === "string") return result;
    }

    if (defaultRequest != null) return defaultRequest(call);
    throw new TypeError("missing default mock request implementation");
  });
}

function mockDeploylessFailure(handle: MockClientHandle) {
  const defaultRequest = handle.request.getMockImplementation();

  handle.request.mockImplementation(async (call) => {
    if (call.method === "eth_call") {
      const [tx] = (call.params ?? []) as [{ to?: Address; data?: Hex }];
      if (tx?.to == null && typeof tx?.data === "string") {
        throw new TypeError("deployless unavailable");
      }
    }

    if (defaultRequest != null) return defaultRequest(call);
    throw new TypeError("missing default mock request implementation");
  });
}

describe("fetchMarketParams", () => {
  test("default", async () => {
    const handle = createMockClient(base);
    mockRead(handle, {
      address: addresses.midnight,
      abi: midnightAbi,
      functionName: "toMarket",
      args: [marketId],
      result: MarketUtils.toStruct(baseMarketParams()),
    });

    const params = await fetchMarketParams({
      client: handle.client,
      midnight: addresses.midnight,
      marketId,
    });

    expect(params.loanToken).toBe(addresses.loanToken);
    expect(params.collateralParams[0]?.token).toBe(addresses.collateralToken);
  });
});

describe("fetchMarket", () => {
  test("default", async () => {
    const handle = createMockClient(base);
    mockRead(handle, {
      address: addresses.midnight,
      abi: midnightAbi,
      functionName: "toMarket",
      args: [marketId],
      result: MarketUtils.toStruct(baseMarketParams()),
    });
    mockRead(handle, {
      address: addresses.midnight,
      abi: midnightAbi,
      functionName: "marketState",
      args: [marketId],
      result: [1n, 2n, 3n, 4n, 5, 6, 7, 8, 9, 10, 11, 12, 4],
    });

    const market = await fetchMarket({
      client: handle.client,
      midnight: addresses.midnight,
      marketId,
    });

    expect(market.params.loanToken).toBe(addresses.loanToken);
    expect(market.params.collateralParams).toHaveLength(1);
    expect(market.totalUnits).toBe(1n);
    expect(market.settlementFeeCbps).toEqual([5, 6, 7, 8, 9, 10, 11]);
  });
});

describe("fetchPosition", () => {
  test("default", async () => {
    const handle = createMockClient(base);
    mockDeploylessRead(handle, {
      abi: getPositionAbi,
      functionName: "query",
      result: {
        credit: 1n,
        pendingFee: 2n,
        lastLossFactor: 3n,
        lastAccrual: 4n,
        debt: 5n,
        collateralBitmap: 6n,
        collateral: Array.from({ length: 128 }, (_, index) =>
          index === 0 ? 7n : 0n,
        ),
      },
    });

    const position = await fetchPosition({
      client: handle.client,
      midnight: addresses.midnight,
      marketId,
      user: addresses.taker,
    });

    expect(position.credit).toBe(1n);
    expect(position.debt).toBe(5n);
    expect(position.collateral).toHaveLength(128);
    expect(position.collateral[0]).toBe(7n);
    expect(position.collateral[127]).toBe(0n);
  });

  test("behavior: direct reads when deployless is disabled", async () => {
    const handle = createMockClient(base);
    mockRead(handle, {
      address: addresses.midnight,
      abi: midnightAbi,
      functionName: "position",
      args: [marketId, addresses.taker],
      result: [1n, 2n, 3n, 4n, 5n, 6n],
    });
    mockRead(handle, {
      address: addresses.midnight,
      abi: midnightAbi,
      functionName: "collateral",
      args: [marketId, addresses.taker, 0n],
      result: 7n,
    });

    const position = await fetchPosition({
      client: handle.client,
      midnight: addresses.midnight,
      marketId,
      user: addresses.taker,
      blockNumber: 123n,
      deployless: false,
    });

    expect(position.credit).toBe(1n);
    expect(position.debt).toBe(5n);
    expect(position.collateral).toHaveLength(128);
    expect(position.collateral[0]).toBe(7n);
    expect(position.collateral[127]).toBe(7n);
    expect(
      handle.request.mock.calls
        .map(([call]) => call)
        .filter((call) => call.method === "eth_call")
        .every((call) => call.params?.[1] === "0x7b"),
    ).toBe(true);
  });

  test("behavior: falls back when deployless fails", async () => {
    const handle = createMockClient(base);
    mockDeploylessFailure(handle);
    mockRead(handle, {
      address: addresses.midnight,
      abi: midnightAbi,
      functionName: "position",
      args: [marketId, addresses.taker],
      result: [1n, 2n, 3n, 4n, 5n, 6n],
    });
    mockRead(handle, {
      address: addresses.midnight,
      abi: midnightAbi,
      functionName: "collateral",
      args: [marketId, addresses.taker, 0n],
      result: 7n,
    });

    const position = await fetchPosition({
      client: handle.client,
      midnight: addresses.midnight,
      marketId,
      user: addresses.taker,
    });

    expect(position.credit).toBe(1n);
    expect(position.collateral[127]).toBe(7n);
  });

  test("error: forced deployless failure", async () => {
    const handle = createMockClient(base);
    mockDeploylessFailure(handle);

    await expect(
      fetchPosition({
        client: handle.client,
        midnight: addresses.midnight,
        marketId,
        user: addresses.taker,
        deployless: "force",
      }),
    ).rejects.toThrow("deployless unavailable");
  });
});

describe("fetchAccrualPosition", () => {
  test("behavior: returns a position that locally matches updatePositionView", async () => {
    const handle = createMockClient(base);
    mockDeploylessRead(handle, {
      abi: getPositionAbi,
      functionName: "query",
      result: {
        credit: 1_000n,
        pendingFee: 100n,
        lastLossFactor: 0n,
        lastAccrual: 1_000n,
        debt: 0n,
        collateralBitmap: 0n,
        collateral: Array.from({ length: 128 }, () => 0n),
      },
    });
    mockRead(handle, {
      address: addresses.midnight,
      abi: midnightAbi,
      functionName: "toMarket",
      args: [marketId],
      result: MarketUtils.toStruct(baseMarketParams()),
    });
    mockRead(handle, {
      address: addresses.midnight,
      abi: midnightAbi,
      functionName: "marketState",
      args: [marketId],
      result: [1_000n, 0n, 0n, 0n, 1, 2, 3, 4, 5, 6, 7, 10, 4],
    });

    const position = await fetchAccrualPosition({
      client: handle.client,
      midnight: addresses.midnight,
      marketId,
      user: addresses.taker,
    });
    const accrued = position.accrueInterest(1_500n);

    expect(accrued.credit).toBe(950n);
    expect(accrued.pendingFee).toBe(50n);
    expect(accrued.market.continuousFeeCredit).toBe(50n);
  });
});

describe("fetchConsumableUnits", () => {
  test("default: max-unit offers only read consumed", async () => {
    const handle = createMockClient(base);
    const offer = baseOffer({ maxUnits: 100n });
    mockRead(handle, {
      address: addresses.midnight,
      abi: midnightAbi,
      functionName: "consumed",
      args: [offer.maker, offer.group],
      result: 40n,
    });

    await expect(
      fetchConsumableUnits({
        client: handle.client,
        midnight: addresses.midnight,
        marketId,
        offer,
        timeToMaturity: 1000n,
      }),
    ).resolves.toBe(60n);
  });

  test("behavior: asset-capped offers fetch settlement fee", async () => {
    const handle = createMockClient(base);
    const offer = baseOffer({
      buy: true,
      tick: MAX_TICK,
      maxUnits: 0n,
      maxAssets: 100n,
    });
    mockRead(handle, {
      address: addresses.midnight,
      abi: midnightAbi,
      functionName: "consumed",
      args: [offer.maker, offer.group],
      result: 40n,
    });
    mockRead(handle, {
      address: addresses.midnight,
      abi: midnightAbi,
      functionName: "settlementFee",
      args: [marketId, 1000n],
      result: 0n,
    });

    await expect(
      fetchConsumableUnits({
        client: handle.client,
        midnight: addresses.midnight,
        marketId,
        offer,
        timeToMaturity: 1000n,
      }),
    ).resolves.toBe(60n);
  });

  test("error: SettlementFeeExceedsPriceError from fetched settlement fee", async () => {
    const handle = createMockClient(base);
    const offer = baseOffer({ buy: true, tick: 2n, maxUnits: 0n });
    mockRead(handle, {
      address: addresses.midnight,
      abi: midnightAbi,
      functionName: "consumed",
      args: [offer.maker, offer.group],
      result: 0n,
    });
    mockRead(handle, {
      address: addresses.midnight,
      abi: midnightAbi,
      functionName: "settlementFee",
      args: [marketId, 1000n],
      result: TickLib.tickToPrice(offer.tick) + 1n,
    });

    await expect(
      fetchConsumableUnits({
        client: handle.client,
        midnight: addresses.midnight,
        marketId,
        offer,
        timeToMaturity: 1000n,
      }),
    ).rejects.toBeInstanceOf(SettlementFeeExceedsPriceError);
  });

  test("error: NegativeValueError before reads for negative offer limits", async () => {
    const handle = createMockClient(base);

    await expect(
      fetchConsumableUnits({
        client: handle.client,
        midnight: addresses.midnight,
        marketId,
        offer: baseOffer({ maxUnits: -1n }),
        timeToMaturity: 1000n,
      }),
    ).rejects.toBeInstanceOf(NegativeValueError);
  });
});

describe("fetchRatifierInfo", () => {
  test("behavior: EIP-7702 designator routes through Ecrecover", async () => {
    const handle = createMockClient(base);
    handle.request.mockImplementation(async ({ method }) => {
      if (method === "eth_getCode") return "0xef0100";
      if (method === "eth_chainId") return `0x${base.id.toString(16)}`;
      throw new TypeError("unexpected method");
    });

    const info = await fetchRatifierInfo({
      client: handle.client,
      maker: addresses.maker,
      ecrecoverRatifier: addresses.ecrecoverRatifier,
      setterRatifier: addresses.setterRatifier,
    });

    expect(info.type).toBe("ecrecover");
  });
});
