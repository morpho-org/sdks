import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { base } from "viem/chains";
import { describe, expect, test } from "vitest";
import { addresses, baseMarket, baseOffer } from "../__test__/fixtures.js";
import { erc20Abi, midnightAbi } from "../abis.js";
import { MAX_TICK } from "../constants.js";
import {
  NegativeValueError,
  SettlementFeeExceedsPriceError,
} from "../errors.js";
import { TickLib } from "../math/index.js";
import {
  fetchConsumableUnits,
  fetchErc20Allowance,
  fetchIsAuthorized,
  fetchMarket,
  fetchMarketId,
  fetchMarketState,
  fetchPosition,
  fetchRatifierInfo,
  fetchSettlementFee,
} from "./midnight.js";

const marketId =
  "0x2222222222222222222222222222222222222222222222222222222222222222" as const;

describe("fetchIsAuthorized", () => {
  test("default", async () => {
    const handle = createMockClient(base);
    mockRead(handle, {
      address: addresses.midnight,
      abi: midnightAbi,
      functionName: "isAuthorized",
      args: [addresses.taker, addresses.midnightBundles],
      result: true,
    });

    await expect(
      fetchIsAuthorized({
        client: handle.client,
        midnight: addresses.midnight,
        authorizer: addresses.taker,
        authorized: addresses.midnightBundles,
      }),
    ).resolves.toBe(true);
  });
});

describe("fetchErc20Allowance", () => {
  test("default", async () => {
    const handle = createMockClient(base);
    mockRead(handle, {
      address: addresses.loanToken,
      abi: erc20Abi,
      functionName: "allowance",
      args: [addresses.taker, addresses.midnightBundles],
      result: 123n,
    });

    await expect(
      fetchErc20Allowance({
        client: handle.client,
        token: addresses.loanToken,
        owner: addresses.taker,
        spender: addresses.midnightBundles,
      }),
    ).resolves.toBe(123n);
  });
});

describe("fetchMarketState", () => {
  test("default", async () => {
    const handle = createMockClient(base);
    mockRead(handle, {
      address: addresses.midnight,
      abi: midnightAbi,
      functionName: "marketState",
      args: [marketId],
      result: [1n, 2n, 3n, 4n, 5, 6, 7, 8, 9, 10, 11, 12, 4],
    });

    const state = await fetchMarketState({
      client: handle.client,
      midnight: addresses.midnight,
      marketId,
    });

    expect(state.totalUnits).toBe(1n);
    expect(state.settlementFeeCbps).toEqual([5, 6, 7, 8, 9, 10, 11]);
    expect(state.tickSpacing).toBe(4);
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
      result: baseMarket().toStruct(),
    });

    const market = await fetchMarket({
      client: handle.client,
      midnight: addresses.midnight,
      marketId,
    });

    expect(market.loanToken).toBe(addresses.loanToken);
    expect(market.collateralParams).toHaveLength(1);
  });
});

describe("fetchPosition", () => {
  test("default", async () => {
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
    });

    expect(position.credit).toBe(1n);
    expect(position.debt).toBe(5n);
    expect(position.collateral).toHaveLength(128);
    expect(position.collateral[0]).toBe(7n);
    expect(position.collateral[127]).toBe(7n);
  });
});

describe("fetchSettlementFee", () => {
  test("default", async () => {
    const handle = createMockClient(base);
    mockRead(handle, {
      address: addresses.midnight,
      abi: midnightAbi,
      functionName: "settlementFee",
      args: [marketId, 1000n],
      result: 0n,
    });

    await expect(
      fetchSettlementFee({
        client: handle.client,
        midnight: addresses.midnight,
        marketId,
        timeToMaturity: 1000n,
      }),
    ).resolves.toBe(0n);
  });

  test("error: NegativeValueError", () => {
    const handle = createMockClient(base);

    expect(() =>
      fetchSettlementFee({
        client: handle.client,
        midnight: addresses.midnight,
        marketId,
        timeToMaturity: -1n,
      }),
    ).toThrow(NegativeValueError);
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
      args: [addresses.maker, offer.group],
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
      args: [addresses.maker, offer.group],
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
      args: [addresses.maker, offer.group],
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

describe("fetchMarketId", () => {
  test("default via mockRead shape", async () => {
    const handle = createMockClient(base);
    mockRead(handle, {
      address: addresses.midnight,
      abi: midnightAbi,
      functionName: "toId",
      args: [baseMarket().toStruct()],
      result: marketId,
    });

    await expect(
      fetchMarketId({
        client: handle.client,
        midnight: addresses.midnight,
        market: baseMarket(),
      }),
    ).resolves.toBe(marketId);
  });
});
