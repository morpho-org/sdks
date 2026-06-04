import { readFileSync } from "node:fs";
import type { Hex } from "viem";
import { describe, expect, test } from "vitest";

import { baseMarketInput, baseOffer } from "../__test__/fixtures.js";
import {
  InvalidMidnightRouterResponseError,
  MidnightRouterApiError,
} from "../errors.js";
import * as Payload from "../signatures/Payload.js";
import { MIDNIGHT_SDK_VERSION } from "../version.js";
import {
  Api,
  MidnightRouterApi,
  type MidnightRouterFetch,
} from "./MidnightRouterApi.js";

type FetchCall = {
  readonly input: Parameters<MidnightRouterFetch>[0];
  readonly init: Parameters<MidnightRouterFetch>[1];
};

const ROUTER_VALID_MATURITY = 1_767_279_600n;

function routerValidOffer() {
  return baseOffer({
    market: {
      ...baseMarketInput(),
      maturity: ROUTER_VALID_MATURITY,
    },
    expiry: ROUTER_VALID_MATURITY - 60n,
    maxUnits: 0n,
    maxAssets: 1_000n,
  });
}

function createJsonFetch(body: unknown, status = 200) {
  const calls: FetchCall[] = [];
  const routerFetch: MidnightRouterFetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };

  return { calls, fetch: routerFetch };
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

describe("MIDNIGHT_SDK_VERSION", () => {
  test("default", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    ) as { readonly version?: unknown };

    expect(MIDNIGHT_SDK_VERSION).toBe(packageJson.version);
  });
});

describe("MidnightRouterApi.validateMempoolPayload", () => {
  test("default", async () => {
    const payload = "0x0100000000" as Payload.Payload;
    const timestamp = "2026-06-01T16:00:00Z";
    const controller = new AbortController();
    const { calls, fetch } = createJsonFetch({
      data: { issues: [] },
    });

    const result = await MidnightRouterApi.validateMempoolPayload({
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
      payload,
      valid: true,
      issues: [],
    });
    expect(calls).toHaveLength(1);

    const call = calls[0]!;
    const url = getRequestUrl(call);
    expect(url.origin).toBe("https://router.morpho.org");
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

    await MidnightRouterApi.validateMempoolPayload({
      chainId: 8453,
      payload: "0x0100000000" as Payload.Payload,
      baseUrl: "https://router.example/base/",
      fetch,
    });

    const url = getRequestUrl(calls[0]!);
    expect(url.origin).toBe("https://router.example");
    expect(url.pathname).toBe("/base/v1/midnight/mempool/validate");
  });

  test.each([400, 503])("error: MidnightRouterApiError %s", async (status) => {
    const { fetch } = createJsonFetch(
      {
        error: {
          code: status === 400 ? "BAD_REQUEST" : "SERVICE_UNAVAILABLE",
          message: "Router rejected request.",
          details: [{ field: "limit", issue: "Limit must be greater than 0." }],
          request_id: "req-123",
        },
      },
      status,
    );

    await expect(
      MidnightRouterApi.validateMempoolPayload({
        chainId: 8453,
        payload: "0x0100000000" as Payload.Payload,
        fetch,
      }),
    ).rejects.toMatchObject({
      name: "MidnightRouterApiError",
      status,
      code: status === 400 ? "BAD_REQUEST" : "SERVICE_UNAVAILABLE",
      message: "Router rejected request.",
      details: [{ field: "limit", issue: "Limit must be greater than 0." }],
      requestId: "req-123",
    });
  });

  test("error: InvalidMidnightRouterResponseError", async () => {
    const { fetch } = createJsonFetch({
      data: { issues: [{ field: "rule" }] },
    });

    await expect(
      MidnightRouterApi.validateMempoolPayload({
        chainId: 8453,
        payload: "0x0100000000" as Payload.Payload,
        fetch,
      }),
    ).rejects.toBeInstanceOf(InvalidMidnightRouterResponseError);
  });
});

describe("MidnightRouterApi.validateMempoolItems", () => {
  test("default", async () => {
    const { calls, fetch } = createJsonFetch({
      data: { issues: [{ rule: "tick_spacing" }] },
    });

    const result = await MidnightRouterApi.validateMempoolItems({
      chainId: 8453,
      items: [{ offer: routerValidOffer(), ratifierData: "0x1234" as Hex }],
      fetch,
    });

    const body = parseRequestBody(calls[0]!);
    expect(body.chain_id).toBe(8453);
    expect(body.payload).toBe(result.payload);
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual([{ rule: "tick_spacing" }]);

    expect(typeof body.payload).toBe("string");
    const decoded = await Payload.decode(body.payload as Payload.Payload);
    expect(decoded).toHaveLength(1);
    expect(decoded[0]!.ratifierData).toBe("0x1234");
  });
});

describe("MidnightRouterApi.validateMempoolTree", () => {
  test("default", async () => {
    const { calls, fetch } = createJsonFetch({
      data: { issues: [] },
    });

    const result = await MidnightRouterApi.validateMempoolTree({
      chainId: 8453,
      tree: { groups: [[routerValidOffer()]] },
      fetch,
    });

    const body = parseRequestBody(calls[0]!);
    const decoded = await Payload.decode(body.payload as Payload.Payload);

    expect(result.valid).toBe(true);
    expect(decoded).toHaveLength(1);
    expect(decoded[0]!.ratifierData).toBe("0x");
  });
});

describe("Api.validate", () => {
  test("default", async () => {
    const { calls, fetch } = createJsonFetch({
      data: { issues: [] },
    });
    const api = Api.init({ fetch });

    const result = await api.validate({
      chainId: 8453,
      tree: { groups: [[routerValidOffer()]] },
    });

    expect(result.valid).toBe(true);
    expect(calls).toHaveLength(1);
  });
});

describe("MidnightRouterApi.fetchMempoolRules", () => {
  test("default", async () => {
    const timestamp = new Date("2026-06-01T16:00:00.000Z");
    const { calls, fetch } = createJsonFetch({
      cursor: "next",
      data: [
        {
          type: "tick_spacing",
          chain_id: 8453,
          tick_spacing: 4,
        },
        {
          type: "collateral_lltv",
          chain_id: 8453,
          allowed_lltvs: ["770000000000000000"],
        },
        {
          type: "callback",
          chain_id: 8453,
          callback_type: "buy_with_empty_callback",
          address: "0x0000000000000000000000000000000000000000",
          data: "0x",
        },
      ],
    });

    const result = await MidnightRouterApi.fetchMempoolRules({
      chainIds: [1, 8453],
      types: ["tick_spacing", "collateral_lltv"],
      timestamp,
      limit: 100,
      cursor: "previous",
      baseUrl: new URL("https://router.example"),
      fetch,
      request: {
        headers: { "x-app": "markets-v2" },
        credentials: "same-origin",
      },
    });

    expect(result).toEqual({
      cursor: "next",
      data: [
        {
          type: "tick_spacing",
          chainId: 8453,
          tickSpacing: 4,
        },
        {
          type: "collateral_lltv",
          chainId: 8453,
          allowedLltvs: ["770000000000000000"],
        },
        {
          type: "callback",
          chainId: 8453,
          callbackType: "buy_with_empty_callback",
          address: "0x0000000000000000000000000000000000000000",
          data: "0x",
        },
      ],
    });

    const call = calls[0]!;
    const url = getRequestUrl(call);
    expect(url.origin).toBe("https://router.example");
    expect(url.pathname).toBe("/v1/midnight/mempool/rules");
    expect(url.searchParams.get("chain_ids")).toBe("1,8453");
    expect(url.searchParams.get("types")).toBe("tick_spacing,collateral_lltv");
    expect(url.searchParams.get("timestamp")).toBe(timestamp.toISOString());
    expect(url.searchParams.get("limit")).toBe("100");
    expect(url.searchParams.get("cursor")).toBe("previous");
    expect(call.init?.method).toBe("GET");
    expect(call.init?.body).toBeUndefined();
    expect(call.init?.credentials).toBe("same-origin");

    const headers = new Headers(call.init?.headers);
    expect(headers.get("sdk-version")).toBe(MIDNIGHT_SDK_VERSION);
    expect(headers.get("content-type")).toBe(null);
    expect(headers.get("x-app")).toBe("markets-v2");
  });

  test("behavior: appends paths to baseUrl path", async () => {
    const { calls, fetch } = createJsonFetch({
      cursor: null,
      data: [],
    });

    await MidnightRouterApi.fetchMempoolRules({
      baseUrl: "https://router.example/base/",
      fetch,
    });

    const url = getRequestUrl(calls[0]!);
    expect(url.origin).toBe("https://router.example");
    expect(url.pathname).toBe("/base/v1/midnight/mempool/rules");
  });

  test("error: MidnightRouterApiError", async () => {
    const { fetch } = createJsonFetch(
      {
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Router unavailable.",
          details: null,
          request_id: "req-503",
        },
      },
      503,
    );

    await expect(
      MidnightRouterApi.fetchMempoolRules({ fetch }),
    ).rejects.toBeInstanceOf(MidnightRouterApiError);
  });

  test("error: InvalidMidnightRouterResponseError", async () => {
    const { fetch } = createJsonFetch({
      cursor: null,
      data: [{ type: "tick_spacing", tick_spacing: 4 }],
    });

    await expect(
      MidnightRouterApi.fetchMempoolRules({ fetch }),
    ).rejects.toBeInstanceOf(InvalidMidnightRouterResponseError);
  });
});
