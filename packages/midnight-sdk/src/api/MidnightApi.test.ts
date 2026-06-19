import { readFileSync } from "node:fs";
import type { Hex } from "viem";
import { describe, expect, test } from "vitest";

import { baseMarketParamsInput, baseOffer } from "../__test__/fixtures.js";
import {
  InvalidMidnightApiResponseError,
  MidnightApiError,
} from "../errors.js";
import * as Payload from "../signatures/Payload.js";
import { MIDNIGHT_SDK_VERSION } from "../version.js";
import { MidnightApi, type MidnightApiFetch } from "./MidnightApi.js";

type FetchCall = {
  readonly input: Parameters<MidnightApiFetch>[0];
  readonly init: Parameters<MidnightApiFetch>[1];
};

const API_VALID_MATURITY = 1_767_279_600n;

function apiValidOffer() {
  return baseOffer({
    market: {
      ...baseMarketParamsInput(),
      maturity: API_VALID_MATURITY,
    },
    expiry: API_VALID_MATURITY - 60n,
    maxUnits: 0n,
    maxAssets: 1_000n,
  });
}

function createJsonFetch(body: unknown, status = 200) {
  const calls: FetchCall[] = [];
  const apiFetch: MidnightApiFetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };

  return { calls, fetch: apiFetch };
}

function parseRequestBody(call: FetchCall) {
  return JSON.parse(String(call.init?.body)) as Readonly<
    Record<string, unknown>
  >;
}

function getRequestUrl(call: FetchCall) {
  expect(call.input).toBeInstanceOf(URL);
  return call.input as URL;
}

const MARKET_ID =
  "0x12590ae1aee324a005be565f3bcdd16dbf8daf7969b26c181c8b8f467dad9f67";
const SECOND_MARKET_ID =
  "0x22590ae1aee324a005be565f3bcdd16dbf8daf7969b26c181c8b8f467dad9f68";
const GROUP_ID =
  "0x000000000000000000000000000000000000000000000000000000000008b8f4";
const MAKER = "0x7b093658BE7f90B63D7c359e8f408e503c2D9401";
const LOAN_TOKEN = "0xC9A9C45C0eB717f8b5F193Af6bAa05A1c0Ac5078";
const COLLATERAL_TOKEN = "0x34Cf890dB685FC536E05652FB41f02090c3fb751";
const ORACLE = "0x45093658BE7f90b63D7c359E8F408E503C2D9401";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const RATIFIER = "0x0000000000000000000000000000000000000002";

const apiCollateral = {
  token: COLLATERAL_TOKEN,
  lltv: "860000000000000000",
  max_lif: "0",
  oracle: ORACLE,
};

const expectedCollateral = {
  token: COLLATERAL_TOKEN,
  lltv: "860000000000000000",
  maxLif: "0",
  oracle: ORACLE,
};

const apiPriceLevel = {
  tick: 495,
  price: "500000000000000000",
  units: "369216000000000000000000",
  assets: "184608000000000000000000",
  count: 5,
};

const apiBook = {
  market_id: MARKET_ID,
  chain_id: 8453,
  loan_token: LOAN_TOKEN,
  collaterals: [apiCollateral],
  maturity: 1_761_922_799,
  rcf_threshold: "0",
  enter_gate: ZERO_ADDRESS,
  liquidator_gate: ZERO_ADDRESS,
  asks: [apiPriceLevel],
  bids: [],
};

const expectedPriceLevel = {
  tick: 495,
  price: "500000000000000000",
  units: "369216000000000000000000",
  assets: "184608000000000000000000",
  count: 5,
};

const expectedBook = {
  marketId: MARKET_ID,
  chainId: 8453,
  loanToken: LOAN_TOKEN,
  collaterals: [expectedCollateral],
  maturity: 1_761_922_799,
  rcfThreshold: "0",
  enterGate: ZERO_ADDRESS,
  liquidatorGate: ZERO_ADDRESS,
  asks: [expectedPriceLevel],
  bids: [],
};

const apiOfferMarket = {
  loan_token: LOAN_TOKEN,
  collaterals: [apiCollateral],
  maturity: 1_761_922_799,
  rcf_threshold: "0",
  enter_gate: ZERO_ADDRESS,
  liquidator_gate: ZERO_ADDRESS,
};

const apiOffer = {
  market: apiOfferMarket,
  buy: false,
  maker: MAKER,
  max_units: "369216000000000000000000",
  start: 1_761_922_790,
  expiry: 1_761_922_799,
  tick: 495,
  group: GROUP_ID,
  callback: ZERO_ADDRESS,
  callback_data: "0x",
  receiver_if_maker_is_seller: MAKER,
  ratifier: RATIFIER,
  reduce_only: false,
  max_assets: "0",
};

const expectedOffer = {
  market: {
    loanToken: LOAN_TOKEN,
    collateralParams: [
      {
        token: COLLATERAL_TOKEN,
        lltv: 860000000000000000n,
        maxLif: 0n,
        oracle: ORACLE,
      },
    ],
    maturity: 1_761_922_799n,
    rcfThreshold: 0n,
    enterGate: ZERO_ADDRESS,
    liquidatorGate: ZERO_ADDRESS,
  },
  buy: false,
  maker: MAKER,
  start: 1_761_922_790n,
  expiry: 1_761_922_799n,
  tick: 495n,
  group: GROUP_ID,
  callback: ZERO_ADDRESS,
  callbackData: "0x",
  receiverIfMakerIsSeller: MAKER,
  ratifier: RATIFIER,
  reduceOnly: false,
  maxUnits: 369216000000000000000000n,
  maxAssets: 0n,
};

const apiTakeableOffer = {
  market_id: MARKET_ID,
  units: "369216000000000000000000",
  offer: apiOffer,
  ratifier_data: "0x1234",
};

const expectedTakeableOffer = {
  marketId: MARKET_ID,
  units: 369216000000000000000000n,
  offer: expectedOffer,
  ratifierData: "0x1234",
};

describe("MIDNIGHT_SDK_VERSION", () => {
  test("default", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    ) as { readonly version?: unknown };

    expect(MIDNIGHT_SDK_VERSION).toBe(packageJson.version);
  });
});

describe("MidnightApi.validateMempoolPayload", () => {
  test("default", async () => {
    const payload = "0x0100000000" as Hex;
    const timestamp = "2026-06-01T16:00:00Z";
    const controller = new AbortController();
    const { calls, fetch } = createJsonFetch({
      data: { issues: [] },
    });

    const result = await MidnightApi.validateMempoolPayload({
      chainId: 8453,
      payload,
      timestamp,
      fetch,
      request: {
        headers: {
          "Content-Type": "text/plain",
          "sdk-version": "caller-version",
          "x-app": "markets-v2",
        },
        signal: controller.signal,
        credentials: "include",
        cache: "no-store",
        keepalive: true,
      },
    });

    expect(result).toEqual({
      valid: true,
      issues: [],
    });
    expect(calls).toHaveLength(1);

    const call = calls[0]!;
    const url = getRequestUrl(call);
    expect(url.origin).toBe("https://api.morpho.org");
    expect(url.pathname).toBe("/v1/midnight/mempool/validate");
    expect(url.searchParams.get("timestamp")).toBe(timestamp);
    expect(call.init?.method).toBe("POST");
    expect(call.init?.signal).toBe(controller.signal);
    expect(call.init?.credentials).toBe("include");
    expect(call.init?.cache).toBe("no-store");
    expect(call.init?.keepalive).toBe(true);
    expect(parseRequestBody(call)).toEqual({
      chain_id: 8453,
      payload,
    });

    const headers = new Headers(call.init?.headers);
    expect(headers.get("sdk-version")).toBe(MIDNIGHT_SDK_VERSION);
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-app")).toBe("markets-v2");
  });

  test("behavior: uses baseUrl override", async () => {
    const { calls, fetch } = createJsonFetch({
      data: { issues: [] },
    });

    await MidnightApi.validateMempoolPayload({
      chainId: 8453,
      payload: "0x0100000000" as Hex,
      baseUrl: "https://api.example/base/",
      fetch,
    });

    const url = getRequestUrl(calls[0]!);
    expect(url.origin).toBe("https://api.example");
    expect(url.pathname).toBe("/base/mempool/validate");
  });

  test.each([400, 503])("error: MidnightApiError %s", async (status) => {
    const { fetch } = createJsonFetch(
      {
        error: {
          code: status === 400 ? "BAD_REQUEST" : "SERVICE_UNAVAILABLE",
          message: "API rejected request.",
          details: [{ field: "limit", issue: "Limit must be greater than 0." }],
          request_id: "req-123",
        },
      },
      status,
    );

    await expect(
      MidnightApi.validateMempoolPayload({
        chainId: 8453,
        payload: "0x0100000000" as Hex,
        fetch,
      }),
    ).rejects.toMatchObject({
      name: "MidnightApiError",
      status,
      code: status === 400 ? "BAD_REQUEST" : "SERVICE_UNAVAILABLE",
      message: "API rejected request.",
      details: [{ field: "limit", issue: "Limit must be greater than 0." }],
      requestId: "req-123",
    });
  });

  test("error: MidnightApiError preserves malformed error body cause", async () => {
    const fetch: MidnightApiFetch = async () =>
      new Response("not json", {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });

    try {
      await MidnightApi.validateMempoolPayload({
        chainId: 8453,
        payload: "0x0100000000" as Hex,
        fetch,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(MidnightApiError);
      if (!(error instanceof MidnightApiError)) throw error;

      expect(error.status).toBe(503);
      expect(error.cause).toBeInstanceOf(SyntaxError);
      return;
    }

    expect.unreachable("Expected malformed API error body to throw.");
  });

  test("error: InvalidMidnightApiResponseError", async () => {
    const { fetch } = createJsonFetch({
      data: { issues: [{ field: "rule" }] },
    });

    await expect(
      MidnightApi.validateMempoolPayload({
        chainId: 8453,
        payload: "0x0100000000" as Hex,
        fetch,
      }),
    ).rejects.toBeInstanceOf(InvalidMidnightApiResponseError);
  });
});

describe("MidnightApi.validateMempoolItems", () => {
  test("default", async () => {
    const { calls, fetch } = createJsonFetch({
      data: { issues: [{ rule: "tick_spacing" }] },
    });

    const result = await MidnightApi.validateMempoolItems({
      chainId: 8453,
      items: [
        {
          offer: apiValidOffer({ group: GROUP_ID }),
          ratifierData: "0x1234" as Hex,
        },
      ],
      fetch,
    });

    const body = parseRequestBody(calls[0]!);
    expect(body.chain_id).toBe(8453);
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual([{ rule: "tick_spacing" }]);

    expect(typeof body.payload).toBe("string");
    const decoded = await Payload.decode(body.payload as Hex);
    expect(decoded).toHaveLength(1);
    expect(decoded[0]!.ratifierData).toBe("0x1234");
  });
});

describe("MidnightApi instance", () => {
  test("default", async () => {
    const { calls, fetch } = createJsonFetch({
      data: { issues: [] },
    });
    const api = new MidnightApi({ fetch });

    const result = await api.validateMempoolPayload({
      chainId: 8453,
      payload: "0x0100000000" as Hex,
    });

    expect(result.valid).toBe(true);
    expect(calls).toHaveLength(1);
  });

  test("behavior: fetches books with shared config", async () => {
    const { calls, fetch } = createJsonFetch({
      cursor: null,
      data: [apiBook],
    });
    const api = new MidnightApi({
      baseUrl: "https://api.example/base/",
      fetch,
    });

    const result = await api.fetchBooks({ limit: 1 });

    expect(result.data).toEqual([expectedBook]);
    const url = getRequestUrl(calls[0]!);
    expect(url.origin).toBe("https://api.example");
    expect(url.pathname).toBe("/base/books");
    expect(url.searchParams.get("limit")).toBe("1");
  });
});

describe("MidnightApi.fetchBooks", () => {
  test("default", async () => {
    const { calls, fetch } = createJsonFetch({
      cursor: "next",
      data: [apiBook],
    });

    const result = await MidnightApi.fetchBooks({
      sort: ["-ask", "maturity"],
      maturities: [1_761_922_799, 1_764_524_800],
      collateralTokens: [COLLATERAL_TOKEN],
      loanTokens: [LOAN_TOKEN],
      chainIds: [8453],
      marketIds: [MARKET_ID, SECOND_MARKET_ID],
      limit: 10,
      cursor: "previous",
      fetch,
    });

    expect(result).toEqual({
      cursor: "next",
      data: [expectedBook],
    });

    const call = calls[0]!;
    const url = getRequestUrl(call);
    expect(url.pathname).toBe("/v1/midnight/books");
    expect(url.searchParams.get("sort")).toBe("-ask,maturity");
    expect(url.searchParams.get("maturities")).toBe("1761922799,1764524800");
    expect(url.searchParams.get("collateral_tokens")).toBe(COLLATERAL_TOKEN);
    expect(url.searchParams.get("loan_tokens")).toBe(LOAN_TOKEN);
    expect(url.searchParams.get("chain_ids")).toBe("8453");
    expect(url.searchParams.get("ids")).toBe(
      `${MARKET_ID},${SECOND_MARKET_ID}`,
    );
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("cursor")).toBe("previous");
    expect(call.init?.method).toBe("GET");
    expect(call.init?.body).toBeUndefined();
  });
});

describe("MidnightApi.fetchBook", () => {
  test("default", async () => {
    const { calls, fetch } = createJsonFetch({
      data: apiBook,
    });

    const result = await MidnightApi.fetchBook({
      marketId: MARKET_ID,
      depth: 100,
      fetch,
    });

    expect(result).toEqual({ data: expectedBook });

    const call = calls[0]!;
    const url = getRequestUrl(call);
    expect(url.pathname).toBe(`/v1/midnight/books/${MARKET_ID}`);
    expect(url.searchParams.get("depth")).toBe("100");
    expect(call.init?.method).toBe("GET");
  });
});

describe("MidnightApi.fetchBookPriceLevels", () => {
  test("default", async () => {
    const { calls, fetch } = createJsonFetch({
      data: [apiPriceLevel],
    });

    const result = await MidnightApi.fetchBookPriceLevels({
      marketId: MARKET_ID,
      side: "asks",
      depth: 50,
      fetch,
    });

    expect(result).toEqual({ data: [expectedPriceLevel] });

    const call = calls[0]!;
    const url = getRequestUrl(call);
    expect(url.pathname).toBe(`/v1/midnight/books/${MARKET_ID}/asks`);
    expect(url.searchParams.get("depth")).toBe("50");
    expect(call.init?.method).toBe("GET");
  });
});

describe("MidnightApi.fetchBookTakeableOffers", () => {
  test("default", async () => {
    const { calls, fetch } = createJsonFetch({
      data: [apiTakeableOffer],
    });

    const result = await MidnightApi.fetchBookTakeableOffers({
      marketId: MARKET_ID,
      side: "bids",
      fetch,
    });

    expect(result).toEqual({ data: [expectedTakeableOffer] });

    const call = calls[0]!;
    const url = getRequestUrl(call);
    expect(url.pathname).toBe(
      `/v1/midnight/books/${MARKET_ID}/bids/takeable-offers`,
    );
    expect(call.init?.method).toBe("GET");
  });
});

describe("MidnightApi.fetchBookQuote", () => {
  test("default", async () => {
    const { calls, fetch } = createJsonFetch({
      data: {
        average_best_price: "1000000000000000000",
        average_worst_price: "1010000000000000000",
        available_assets: "1500000000000000000",
        available_units: "1500000000000000000",
        takeable_offers: [apiTakeableOffer],
      },
    });

    const result = await MidnightApi.fetchBookQuote({
      marketId: MARKET_ID,
      side: "asks",
      units: 1_000000000000000000n,
      averageWorstPrice: "1010000000000000000",
      fetch,
    });

    expect(result).toEqual({
      data: {
        averageBestPrice: "1000000000000000000",
        averageWorstPrice: "1010000000000000000",
        availableAssets: "1500000000000000000",
        availableUnits: "1500000000000000000",
        takeableOffers: [expectedTakeableOffer],
      },
    });
    expect(result.data).not.toHaveProperty("takes");

    const call = calls[0]!;
    const url = getRequestUrl(call);
    expect(url.pathname).toBe(`/v1/midnight/books/${MARKET_ID}/asks/quote`);
    expect(url.searchParams.get("units")).toBe("1000000000000000000");
    expect(url.searchParams.get("average_worst_price")).toBe(
      "1010000000000000000",
    );
    expect(call.init?.method).toBe("GET");
  });

  test("behavior: serializes assets and slippage", async () => {
    const { calls, fetch } = createJsonFetch({
      data: {
        average_best_price: "1000000000000000000",
        average_worst_price: "1005000000000000000",
        available_assets: "1500000000000000000",
        available_units: "1500000000000000000",
        takeable_offers: [],
      },
    });

    await MidnightApi.fetchBookQuote({
      marketId: MARKET_ID,
      side: "bids",
      assets: "1000000000000000000",
      slippage: "0.5",
      fetch,
    });

    const url = getRequestUrl(calls[0]!);
    expect(url.pathname).toBe(`/v1/midnight/books/${MARKET_ID}/bids/quote`);
    expect(url.searchParams.get("assets")).toBe("1000000000000000000");
    expect(url.searchParams.get("slippage")).toBe("0.5");
  });
});

describe("MidnightApi.fetchTakeableOffers", () => {
  test("default", async () => {
    const { calls, fetch } = createJsonFetch({
      cursor: "next",
      data: [apiTakeableOffer],
    });

    const result = await MidnightApi.fetchTakeableOffers({
      maker: MAKER,
      marketIds: [MARKET_ID, SECOND_MARKET_ID],
      groups: [GROUP_ID],
      limit: 10,
      cursor: "previous",
      fetch,
    });

    expect(result).toEqual({
      cursor: "next",
      data: [expectedTakeableOffer],
    });

    const call = calls[0]!;
    const url = getRequestUrl(call);
    expect(url.pathname).toBe("/v1/midnight/takeable-offers");
    expect(url.searchParams.get("maker")).toBe(MAKER);
    expect(url.searchParams.get("market_ids")).toBe(
      `${MARKET_ID},${SECOND_MARKET_ID}`,
    );
    expect(url.searchParams.get("groups")).toBe(GROUP_ID);
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("cursor")).toBe("previous");
    expect(call.init?.method).toBe("GET");
  });
});
