import { describe, expect, test } from "vitest";
import { ZodError, type z } from "zod";

import {
  fetchBookParamsSchema,
  fetchBookPriceLevelsParamsSchema,
  fetchBookQuoteParamsSchema,
  fetchBooksParamsSchema,
  fetchBookTakeableOffersParamsSchema,
  fetchConfigContractsParamsSchema,
  fetchMempoolRulesParamsSchema,
  fetchTakeableOffersParamsSchema,
  fetchUserGroupsParamsSchema,
  fetchUserOffersParamsSchema,
  midnightApiBookSideSchema,
  midnightApiConfigContractNameSchema,
  midnightApiConfigSchema,
  midnightApiConstructorConfigSchema,
  validateMempoolItemsParamsSchema,
  validateMempoolPayloadParamsSchema,
  validateMempoolTreeParamsSchema,
} from "./schemas.js";
import type { MidnightApiFetch } from "./types.js";

const MARKET_ID =
  "0x12590ae1aee324a005be565f3bcdd16dbf8daf7969b26c181c8b8f467dad9f67";
const GROUP_ID =
  "0x000000000000000000000000000000000000000000000000000000000008b8f4";
const MAKER = "0x7b093658BE7f90B63D7c359e8f408e503c2D9401";
const LOAN_TOKEN = "0xC9A9C45C0eB717f8b5F193Af6bAa05A1c0Ac5078";
const COLLATERAL_TOKEN = "0x34Cf890dB685FC536E05652FB41f02090c3fb751";
const TOO_MANY_ADDRESSES = Array.from({ length: 21 }, () => COLLATERAL_TOKEN);
const TOO_MANY_MARKET_IDS = Array.from({ length: 21 }, () => MARKET_ID);
const TOO_MANY_MATURITIES = Array.from(
  { length: 21 },
  (_, index) => 1_761_922_799 + index,
);

const apiFetch: MidnightApiFetch = async () =>
  new Response(JSON.stringify({ data: [] }));

type SchemaCase = {
  readonly name: string;
  readonly schema: z.ZodType;
  readonly valid: unknown;
  readonly invalid: unknown;
};

type InvalidSchemaCase = {
  readonly name: string;
  readonly schema: z.ZodType;
  readonly input: unknown;
};

const schemaCases: readonly SchemaCase[] = [
  {
    name: "midnightApiConfigSchema",
    schema: midnightApiConfigSchema,
    valid: {
      baseUrl: new URL("https://api.morpho.org"),
      fetch: apiFetch,
      request: { headers: { "x-app": "markets-v2" } },
    },
    invalid: { request: { method: "GET" } },
  },
  {
    name: "midnightApiConstructorConfigSchema",
    schema: midnightApiConstructorConfigSchema,
    valid: "https://api.morpho.org",
    invalid: "not-a-url",
  },
  {
    name: "midnightApiBookSideSchema",
    schema: midnightApiBookSideSchema,
    valid: "asks",
    invalid: "sell",
  },
  {
    name: "midnightApiConfigContractNameSchema",
    schema: midnightApiConfigContractNameSchema,
    valid: "midnight",
    invalid: "permit2",
  },
  {
    name: "validateMempoolPayloadParamsSchema",
    schema: validateMempoolPayloadParamsSchema,
    valid: {
      chainId: 8453,
      payload: "0x0100000000",
      timestamp: "2026-06-01T16:00:00Z",
    },
    invalid: { chainId: 0, payload: "0x0100000000" },
  },
  {
    name: "validateMempoolItemsParamsSchema",
    schema: validateMempoolItemsParamsSchema,
    valid: {
      chainId: 8453,
      items: [{ offer: {}, ratifierData: "0x" }],
    },
    invalid: {
      chainId: 8453,
      items: [{ offer: {}, ratifierData: "not-hex" }],
    },
  },
  {
    name: "validateMempoolTreeParamsSchema",
    schema: validateMempoolTreeParamsSchema,
    valid: { chainId: 8453, tree: { groups: [] } },
    invalid: { chainId: 8453, tree: null },
  },
  {
    name: "fetchMempoolRulesParamsSchema",
    schema: fetchMempoolRulesParamsSchema,
    valid: {
      chainIds: [8453],
      types: ["tick_spacing"],
      limit: 100,
      cursor: "next",
    },
    invalid: { chainIds: [0] },
  },
  {
    name: "fetchConfigContractsParamsSchema",
    schema: fetchConfigContractsParamsSchema,
    valid: { chainIds: [8453], limit: 10, cursor: "next" },
    invalid: { limit: 0 },
  },
  {
    name: "fetchBooksParamsSchema",
    schema: fetchBooksParamsSchema,
    valid: {
      sort: ["-ask", "maturity"],
      maturities: [1_761_922_799],
      collateralTokens: [COLLATERAL_TOKEN],
      loanTokens: [LOAN_TOKEN],
      chainIds: [8453],
      marketIds: [MARKET_ID],
      limit: 10,
      cursor: "next",
    },
    invalid: { marketIds: ["0x1234"] },
  },
  {
    name: "fetchBookParamsSchema",
    schema: fetchBookParamsSchema,
    valid: { marketId: MARKET_ID, depth: 100 },
    invalid: { marketId: MARKET_ID, depth: 5_822 },
  },
  {
    name: "fetchBookPriceLevelsParamsSchema",
    schema: fetchBookPriceLevelsParamsSchema,
    valid: { marketId: MARKET_ID, side: "bids", depth: 100 },
    invalid: { marketId: MARKET_ID, side: "sell" },
  },
  {
    name: "fetchBookTakeableOffersParamsSchema",
    schema: fetchBookTakeableOffersParamsSchema,
    valid: { marketId: MARKET_ID, side: "asks" },
    invalid: { marketId: MARKET_ID, side: "sell" },
  },
  {
    name: "fetchBookQuoteParamsSchema",
    schema: fetchBookQuoteParamsSchema,
    valid: {
      marketId: MARKET_ID,
      side: "asks",
      assets: 1_000000000000000000n,
      slippage: "0.5",
    },
    invalid: {
      marketId: MARKET_ID,
      side: "asks",
      assets: "0",
    },
  },
  {
    name: "fetchTakeableOffersParamsSchema",
    schema: fetchTakeableOffersParamsSchema,
    valid: {
      maker: MAKER,
      marketIds: [MARKET_ID],
      groups: [GROUP_ID],
      limit: 10,
    },
    invalid: { maker: "0x1234" },
  },
  {
    name: "fetchUserOffersParamsSchema",
    schema: fetchUserOffersParamsSchema,
    valid: {
      user: MAKER,
      marketIds: [MARKET_ID],
      groups: [GROUP_ID],
      active: true,
    },
    invalid: { user: MAKER, active: "true" },
  },
  {
    name: "fetchUserGroupsParamsSchema",
    schema: fetchUserGroupsParamsSchema,
    valid: { user: MAKER, limit: 10 },
    invalid: { user: MAKER, limit: 0 },
  },
];

const invalidSchemaCases: readonly InvalidSchemaCase[] = [
  {
    name: "midnightApiConfigSchema baseUrl",
    schema: midnightApiConfigSchema,
    input: { baseUrl: "not-a-url" },
  },
  {
    name: "midnightApiConfigSchema fetch",
    schema: midnightApiConfigSchema,
    input: { fetch: "fetch" },
  },
  {
    name: "midnightApiConfigSchema request body",
    schema: midnightApiConfigSchema,
    input: { request: { body: "{}" } },
  },
  {
    name: "midnightApiConfigSchema unknown key",
    schema: midnightApiConfigSchema,
    input: { unknown: true },
  },
  {
    name: "midnightApiConstructorConfigSchema request method",
    schema: midnightApiConstructorConfigSchema,
    input: { request: { method: "GET" } },
  },
  {
    name: "validateMempoolPayloadParamsSchema payload",
    schema: validateMempoolPayloadParamsSchema,
    input: { chainId: 8453, payload: "not-hex" },
  },
  {
    name: "validateMempoolPayloadParamsSchema timestamp string",
    schema: validateMempoolPayloadParamsSchema,
    input: {
      chainId: 8453,
      payload: "0x0100000000",
      timestamp: "June 1, 2026",
    },
  },
  {
    name: "validateMempoolPayloadParamsSchema timestamp date",
    schema: validateMempoolPayloadParamsSchema,
    input: {
      chainId: 8453,
      payload: "0x0100000000",
      timestamp: new Date(Number.NaN),
    },
  },
  {
    name: "validateMempoolItemsParamsSchema item shape",
    schema: validateMempoolItemsParamsSchema,
    input: { chainId: 8453, items: [{ ratifierData: "0x" }] },
  },
  {
    name: "fetchMempoolRulesParamsSchema type",
    schema: fetchMempoolRulesParamsSchema,
    input: { types: [""] },
  },
  {
    name: "fetchMempoolRulesParamsSchema cursor",
    schema: fetchMempoolRulesParamsSchema,
    input: { cursor: "" },
  },
  {
    name: "fetchConfigContractsParamsSchema cursor",
    schema: fetchConfigContractsParamsSchema,
    input: { cursor: "" },
  },
  {
    name: "fetchBooksParamsSchema sort string",
    schema: fetchBooksParamsSchema,
    input: { sort: "" },
  },
  {
    name: "fetchBooksParamsSchema sort array",
    schema: fetchBooksParamsSchema,
    input: { sort: [""] },
  },
  {
    name: "fetchBooksParamsSchema unsupported sort field",
    schema: fetchBooksParamsSchema,
    input: { sort: "-price" },
  },
  {
    name: "fetchBooksParamsSchema sort maximum",
    schema: fetchBooksParamsSchema,
    input: { sort: ["-ask", "bid", "maturity", "id"] },
  },
  {
    name: "fetchBooksParamsSchema sort string maximum",
    schema: fetchBooksParamsSchema,
    input: { sort: "-ask,bid,maturity,id" },
  },
  {
    name: "fetchBooksParamsSchema maturity",
    schema: fetchBooksParamsSchema,
    input: { maturities: [0] },
  },
  {
    name: "fetchBooksParamsSchema maturity maximum",
    schema: fetchBooksParamsSchema,
    input: { maturities: TOO_MANY_MATURITIES },
  },
  {
    name: "fetchBooksParamsSchema collateral token",
    schema: fetchBooksParamsSchema,
    input: { collateralTokens: ["0x1234"] },
  },
  {
    name: "fetchBooksParamsSchema collateral token maximum",
    schema: fetchBooksParamsSchema,
    input: { collateralTokens: TOO_MANY_ADDRESSES },
  },
  {
    name: "fetchBooksParamsSchema loan token",
    schema: fetchBooksParamsSchema,
    input: { loanTokens: ["0x1234"] },
  },
  {
    name: "fetchBooksParamsSchema loan token maximum",
    schema: fetchBooksParamsSchema,
    input: { loanTokens: TOO_MANY_ADDRESSES },
  },
  {
    name: "fetchBooksParamsSchema chain id",
    schema: fetchBooksParamsSchema,
    input: { chainIds: [0] },
  },
  {
    name: "fetchBooksParamsSchema chain id maximum",
    schema: fetchBooksParamsSchema,
    input: { chainIds: [1, 8453] },
  },
  {
    name: "fetchBooksParamsSchema market id maximum",
    schema: fetchBooksParamsSchema,
    input: { marketIds: TOO_MANY_MARKET_IDS },
  },
  {
    name: "fetchBooksParamsSchema limit",
    schema: fetchBooksParamsSchema,
    input: { limit: 0 },
  },
  {
    name: "fetchBookParamsSchema depth minimum",
    schema: fetchBookParamsSchema,
    input: { marketId: MARKET_ID, depth: 0 },
  },
  {
    name: "fetchBookPriceLevelsParamsSchema depth maximum",
    schema: fetchBookPriceLevelsParamsSchema,
    input: { marketId: MARKET_ID, side: "bids", depth: 5_822 },
  },
  {
    name: "fetchBookQuoteParamsSchema no target amount",
    schema: fetchBookQuoteParamsSchema,
    input: { marketId: MARKET_ID, side: "asks" },
  },
  {
    name: "fetchBookQuoteParamsSchema two target amounts",
    schema: fetchBookQuoteParamsSchema,
    input: {
      marketId: MARKET_ID,
      side: "asks",
      assets: "1000",
      units: "1000",
    },
  },
  {
    name: "fetchBookQuoteParamsSchema two price constraints",
    schema: fetchBookQuoteParamsSchema,
    input: {
      marketId: MARKET_ID,
      side: "asks",
      assets: "1000",
      averageWorstPrice: "1000",
      slippage: "0.5",
    },
  },
  {
    name: "fetchBookQuoteParamsSchema slippage minimum",
    schema: fetchBookQuoteParamsSchema,
    input: {
      marketId: MARKET_ID,
      side: "asks",
      assets: "1000",
      slippage: "0",
    },
  },
  {
    name: "fetchBookQuoteParamsSchema slippage precision",
    schema: fetchBookQuoteParamsSchema,
    input: {
      marketId: MARKET_ID,
      side: "asks",
      assets: "1000",
      slippage: 1.23,
    },
  },
  {
    name: "fetchBookQuoteParamsSchema unsafe number",
    schema: fetchBookQuoteParamsSchema,
    input: {
      marketId: MARKET_ID,
      side: "asks",
      assets: Number.MAX_SAFE_INTEGER + 1,
    },
  },
  {
    name: "fetchTakeableOffersParamsSchema group",
    schema: fetchTakeableOffersParamsSchema,
    input: { maker: MAKER, groups: ["0x1234"] },
  },
  {
    name: "fetchTakeableOffersParamsSchema market id maximum",
    schema: fetchTakeableOffersParamsSchema,
    input: { maker: MAKER, marketIds: TOO_MANY_MARKET_IDS },
  },
  {
    name: "fetchTakeableOffersParamsSchema group maximum",
    schema: fetchTakeableOffersParamsSchema,
    input: { maker: MAKER, groups: TOO_MANY_MARKET_IDS },
  },
  {
    name: "fetchTakeableOffersParamsSchema cursor",
    schema: fetchTakeableOffersParamsSchema,
    input: { maker: MAKER, cursor: "" },
  },
  {
    name: "fetchUserOffersParamsSchema market id",
    schema: fetchUserOffersParamsSchema,
    input: { user: MAKER, marketIds: ["0x1234"] },
  },
  {
    name: "fetchUserOffersParamsSchema group",
    schema: fetchUserOffersParamsSchema,
    input: { user: MAKER, groups: ["0x1234"] },
  },
  {
    name: "fetchUserOffersParamsSchema cursor",
    schema: fetchUserOffersParamsSchema,
    input: { user: MAKER, cursor: "" },
  },
  {
    name: "fetchUserGroupsParamsSchema cursor",
    schema: fetchUserGroupsParamsSchema,
    input: { user: MAKER, cursor: "" },
  },
];

describe("Midnight API input schemas", () => {
  test.each(schemaCases)("default: $name accepts valid input", ({
    schema,
    valid,
  }) => {
    expect(schema.safeParse(valid).success).toBe(true);
  });

  test.each(schemaCases)("error: $name rejects invalid input", ({
    schema,
    invalid,
  }) => {
    expect(schema.safeParse(invalid).success).toBe(false);
  });

  test.each(invalidSchemaCases)("error: $name rejects invalid input", ({
    schema,
    input,
  }) => {
    expect(schema.safeParse(input).success).toBe(false);
  });

  test("error: schemas throw ZodError validation failures", () => {
    expect(() => fetchBookParamsSchema.parse({ marketId: "0x1234" })).toThrow(
      ZodError,
    );
  });
});
