import packageJson from "@morpho-org/midnight-sdk/package.json" with {
  type: "json",
};
import { ChainId, getChainAddress, MathLib } from "@morpho-org/morpho-ts";
import { type Hex, maxUint256 } from "viem";
import { describe, expect, test } from "vitest";

import { createFixtures } from "../__test__/fixtures.js";
import {
  InvalidMidnightApiResponseError,
  MidnightApiError,
} from "../errors.js";
import { TickLib } from "../math/index.js";
import type { IOffer } from "../offers/index.js";
import { Payload } from "../signatures/Payload.js";
import {
  MempoolPayloadValidationRule,
  MidnightApi,
  type MidnightApiFetch,
} from "./MidnightApi.js";

const { baseMarketParamsInput, baseOffer } = createFixtures({
  midnight: getChainAddress(ChainId.BaseMainnet, "midnight"),
  ecrecoverRatifier: getChainAddress(ChainId.BaseMainnet, "ecrecoverRatifier"),
});

type FetchCall = {
  readonly input: Parameters<MidnightApiFetch>[0];
  readonly init: Parameters<MidnightApiFetch>[1];
};

const API_VALID_MATURITY = 1_767_279_600n;

function apiValidOffer(overrides: Partial<IOffer> = {}) {
  return baseOffer({
    market: {
      ...baseMarketParamsInput(),
      maturity: API_VALID_MATURITY,
    },
    expiry: API_VALID_MATURITY - 60n,
    maxUnits: 0n,
    maxAssets: 1_000n,
    ...overrides,
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
  "0xbb7c4d7ca92fc06e8b046a913d1c100482e6e5cb11298a4530f8e19657ea296e";
const SECOND_MARKET_ID =
  "0x22590ae1aee324a005be565f3bcdd16dbf8daf7969b26c181c8b8f467dad9f68";
const GROUP_ID =
  "0x000000000000000000000000000000000000000000000000000000000008b8f4";
const MAKER = "0x7b093658BE7f90B63D7c359e8f408e503c2D9401";
const LOAN_TOKEN = "0xC9A9C45C0eB717f8b5F193Af6bAa05A1c0Ac5078";
const COLLATERAL_TOKEN = "0x34Cf890dB685FC536E05652FB41f02090c3fb751";
const ORACLE = "0x45093658BE7f90b63D7c359E8F408E503C2D9401";
const API_MIDNIGHT = "0x0000000000000000000000000000000000001234";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const RATIFIER = "0x0000000000000000000000000000000000000002";

const apiCollateral = {
  token: COLLATERAL_TOKEN,
  lltv: "860000000000000000",
  liquidation_cursor: "0",
  oracle: ORACLE,
};

const expectedCollateral = {
  token: COLLATERAL_TOKEN,
  lltv: "860000000000000000",
  liquidationCursor: "0",
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
  midnight: API_MIDNIGHT,
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
  midnight: API_MIDNIGHT,
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
  chain_id: 8453,
  midnight: API_MIDNIGHT,
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
  continuous_fee_cap: "317097919",
};

const expectedOffer = {
  market: {
    chainId: 8453n,
    midnight: API_MIDNIGHT,
    loanToken: LOAN_TOKEN,
    collateralParams: [
      {
        token: COLLATERAL_TOKEN,
        lltv: 860000000000000000n,
        liquidationCursor: 0n,
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
  continuousFeeCap: 317097919n,
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

describe("MidnightApi.validateMempoolPayload", () => {
  test("behavior: exposes every documented validation rule", () => {
    const documentedRules = [
      "payload_version",
      "payload_frame",
      "payload_gzip_length",
      "payload_suffix_too_large",
      "payload_decompression",
      "payload_abi_decode",
      "empty_payload",
      "max_offers_per_tree",
      "duplicate_offer_hash",
      "unsupported_chain",
      "market_chain_mismatch",
      "maturity",
      "loan_token",
      "collateral_token",
      "oracle",
      "market_triplet",
      "rcf_threshold",
      "collateral_lltv",
      "max_lif",
      "max_collaterals",
      "amount_missing",
      "amount_conflict",
      "min_offer_assets_usd",
      "min_tick",
      "max_tick",
      "tick_spacing",
      "min_duration",
      "ratifier",
      "mixed_maker",
      "mixed_ratifier",
      "group_identity",
      "group_consistency",
      "non_empty_callback",
      "buy_empty_callback",
      "sell_empty_callback",
    ];

    expect(Object.values(MempoolPayloadValidationRule).toSorted()).toEqual(
      documentedRules.toSorted(),
    );
  });

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
    expect(url.pathname).toBe("/v0/midnight/mempool/validate");
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
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("sdk-version")).toBe(packageJson.version);
    expect(headers.get("x-app")).toBe("markets-v2");
  });

  test("behavior: parses known non-null details", async () => {
    const { fetch } = createJsonFetch({
      data: {
        issues: [
          {
            rule: "min_offer_assets_usd",
            details: {
              loan_token: LOAN_TOKEN,
              min_assets: "100014791",
            },
          },
        ],
      },
    });

    const result = await MidnightApi.validateMempoolPayload({
      chainId: 8453,
      payload: "0x0100000000" as Hex,
      fetch,
    });

    expect(result.issues).toEqual([
      {
        rule: MempoolPayloadValidationRule.MinOfferAssetsUsd,
        details: {
          type: "minOfferAssetsUsd",
          loanToken: LOAN_TOKEN,
          minAssets: 100014791n,
        },
      },
    ]);
  });

  test.each([
    ["null", { rule: "tick_spacing", details: null }],
    ["omitted", { rule: "tick_spacing" }],
  ])(
    "behavior: preserves the existing shape for %s details",
    async (_, issue) => {
      const { fetch } = createJsonFetch({ data: { issues: [issue] } });

      const result = await MidnightApi.validateMempoolPayload({
        chainId: 8453,
        payload: "0x0100000000" as Hex,
        fetch,
      });

      expect(result.issues).toEqual([
        { rule: MempoolPayloadValidationRule.TickSpacing },
      ]);
    },
  );

  test("behavior: retains future rules and details", async () => {
    const futureDetails = { next_allowed_tick: 4 };
    const futureRuleDetails = { threshold: "1000" };
    const { fetch } = createJsonFetch({
      data: {
        issues: [
          { rule: "tick_spacing", details: futureDetails },
          { rule: "future_router_policy", details: futureRuleDetails },
        ],
      },
    });

    const result = await MidnightApi.validateMempoolPayload({
      chainId: 8453,
      payload: "0x0100000000" as Hex,
      fetch,
    });

    expect(result.issues).toEqual([
      {
        rule: MempoolPayloadValidationRule.TickSpacing,
        details: { type: "unknown", raw: futureDetails },
      },
      {
        rule: "future_router_policy",
        details: { type: "unknown", raw: futureRuleDetails },
      },
    ]);
  });

  test.each([
    ["malformed", { loan_token: LOAN_TOKEN, min_assets: null }],
    ["oversized", { loan_token: LOAN_TOKEN, min_assets: "9".repeat(79) }],
    [
      "above uint256",
      { loan_token: LOAN_TOKEN, min_assets: (maxUint256 + 1n).toString() },
    ],
  ])(
    "behavior: retains %s known details without rejecting the response",
    async (_, unrecognizedDetails) => {
      const { fetch } = createJsonFetch({
        data: {
          issues: [
            {
              rule: "min_offer_assets_usd",
              details: unrecognizedDetails,
            },
          ],
        },
      });

      const result = await MidnightApi.validateMempoolPayload({
        chainId: 8453,
        payload: "0x0100000000" as Hex,
        fetch,
      });

      expect(result.issues).toEqual([
        {
          rule: MempoolPayloadValidationRule.MinOfferAssetsUsd,
          details: { type: "unknown", raw: unrecognizedDetails },
        },
      ]);
    },
  );

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

  test.each([
    ["missing data", {}],
    ["missing issues", { data: {} }],
    ["non-array issues", { data: { issues: {} } }],
    ["non-object issue", { data: { issues: [null] } }],
    ["missing rule", { data: { issues: [{ field: "rule" }] } }],
  ])("error: InvalidMidnightApiResponseError for %s", async (_, response) => {
    const { fetch } = createJsonFetch(response);

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
    expect(decoded[0]!.offer.group).toBe(GROUP_ID);
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
    expect(url.pathname).toBe("/v0/midnight/books");
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
    expect(url.pathname).toBe(`/v0/midnight/books/${MARKET_ID}`);
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
    expect(url.pathname).toBe(`/v0/midnight/books/${MARKET_ID}/asks`);
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
      side: "asks",
      fetch,
    });

    expect(result).toEqual({ data: [expectedTakeableOffer] });

    const call = calls[0]!;
    const url = getRequestUrl(call);
    expect(url.pathname).toBe(
      `/v0/midnight/books/${MARKET_ID}/asks/takeable-offers`,
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
    expect(url.pathname).toBe(`/v0/midnight/books/${MARKET_ID}/asks/quote`);
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
    expect(url.pathname).toBe(`/v0/midnight/books/${MARKET_ID}/bids/quote`);
    expect(url.searchParams.get("assets")).toBe("1000000000000000000");
    expect(url.searchParams.get("slippage")).toBe("0.5");
  });

  test("behavior: clamps guard checks to requested units", async () => {
    const secondTakeableOffer = {
      ...apiTakeableOffer,
      units: "100000000000000000000",
      offer: {
        ...apiOffer,
        tick: 5_000,
      },
    };
    const { fetch } = createJsonFetch({
      data: {
        average_best_price: "1000000000000000000",
        average_worst_price: TickLib.tickToPrice(apiOffer.tick).toString(),
        available_assets: "1500000000000000000",
        available_units: "1500000000000000000",
        takeable_offers: [apiTakeableOffer, secondTakeableOffer],
      },
    });

    const result = await MidnightApi.fetchBookQuote({
      marketId: MARKET_ID,
      side: "asks",
      units: apiTakeableOffer.units,
      averageWorstPrice: TickLib.tickToPrice(apiOffer.tick).toString(),
      fetch,
    });

    expect(result.data.takeableOffers).toHaveLength(2);
  });

  test("behavior: clamps guard checks to requested assets", async () => {
    const firstPrice = TickLib.tickToPrice(apiOffer.tick);
    const firstAssets = MathLib.mulDivUp(
      BigInt(apiTakeableOffer.units),
      firstPrice,
      MathLib.WAD,
    );
    const secondTakeableOffer = {
      ...apiTakeableOffer,
      units: "100000000000000000000",
      offer: {
        ...apiOffer,
        tick: 5_000,
      },
    };
    const { fetch } = createJsonFetch({
      data: {
        average_best_price: "1000000000000000000",
        average_worst_price: firstPrice.toString(),
        available_assets: "1500000000000000000",
        available_units: "1500000000000000000",
        takeable_offers: [apiTakeableOffer, secondTakeableOffer],
      },
    });

    const result = await MidnightApi.fetchBookQuote({
      marketId: MARKET_ID,
      side: "asks",
      assets: firstAssets,
      averageWorstPrice: firstPrice,
      fetch,
    });

    expect(result.data.takeableOffers).toHaveLength(2);
  });

  test("error: direct averageWorstPrice guard is enforced over response guard", async () => {
    const callerGuard = TickLib.tickToPrice(apiOffer.tick) - 1n;
    const { fetch } = createJsonFetch({
      data: {
        average_best_price: "1000000000000000000",
        average_worst_price: TickLib.tickToPrice(apiOffer.tick).toString(),
        available_assets: "1500000000000000000",
        available_units: "1500000000000000000",
        takeable_offers: [apiTakeableOffer],
      },
    });

    await expect(
      MidnightApi.fetchBookQuote({
        marketId: MARKET_ID,
        side: "asks",
        units: apiTakeableOffer.units,
        averageWorstPrice: callerGuard,
        fetch,
      }),
    ).rejects.toBeInstanceOf(InvalidMidnightApiResponseError);
  });

  test("error: asset-targeted quote guards check aggregate price", async () => {
    const firstPrice = TickLib.tickToPrice(apiOffer.tick);
    const secondTakeableOffer = {
      ...apiTakeableOffer,
      units: "100000000000000000000",
      offer: {
        ...apiOffer,
        tick: 5_000,
      },
    };
    const secondPrice = TickLib.tickToPrice(secondTakeableOffer.offer.tick);
    const requestedAssets =
      MathLib.mulDivUp(
        BigInt(apiTakeableOffer.units),
        firstPrice,
        MathLib.WAD,
      ) +
      MathLib.mulDivUp(
        BigInt(secondTakeableOffer.units),
        secondPrice,
        MathLib.WAD,
      );
    const { fetch } = createJsonFetch({
      data: {
        average_best_price: "1000000000000000000",
        average_worst_price: firstPrice.toString(),
        available_assets: "1500000000000000000",
        available_units: "1500000000000000000",
        takeable_offers: [apiTakeableOffer, secondTakeableOffer],
      },
    });

    await expect(
      MidnightApi.fetchBookQuote({
        marketId: MARKET_ID,
        side: "asks",
        assets: requestedAssets,
        averageWorstPrice: firstPrice,
        fetch,
      }),
    ).rejects.toBeInstanceOf(InvalidMidnightApiResponseError);
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
    expect(url.pathname).toBe("/v0/midnight/takeable-offers");
    expect(url.searchParams.get("maker")).toBe(MAKER);
    expect(url.searchParams.get("market_ids")).toBe(
      `${MARKET_ID},${SECOND_MARKET_ID}`,
    );
    expect(url.searchParams.get("groups")).toBe(GROUP_ID);
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("cursor")).toBe("previous");
    expect(call.init?.method).toBe("GET");
  });

  test("behavior: treats empty optional filters as unset", async () => {
    const { calls, fetch } = createJsonFetch({
      cursor: null,
      data: [apiTakeableOffer],
    });

    const result = await MidnightApi.fetchTakeableOffers({
      maker: MAKER,
      marketIds: [],
      groups: [],
      fetch,
    });

    expect(result.data).toEqual([expectedTakeableOffer]);
    const url = getRequestUrl(calls[0]!);
    expect(url.searchParams.has("market_ids")).toBe(false);
    expect(url.searchParams.has("groups")).toBe(false);
  });
});
