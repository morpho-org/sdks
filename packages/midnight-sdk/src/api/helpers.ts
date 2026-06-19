import { BLUE_API_BASE_URL } from "@morpho-org/morpho-ts";
import type { Address, Hash, Hex } from "viem";
import {
  InvalidMidnightApiResponseError,
  MidnightApiError,
} from "../errors.js";
import { MIDNIGHT_SDK_VERSION } from "../version.js";
import type {
  ApiBookMarketResponse,
  ApiCollateralResponse,
  ApiPriceLevelResponse,
  ApiRequestParams,
  ApiTakeableOfferResponse,
  MempoolPayloadValidationResult,
  MempoolRulesResult,
  MidnightApiBookMarket,
  MidnightApiBookSide,
  MidnightApiCollateral,
  MidnightApiPriceLevel,
  MidnightApiTake,
} from "./types.js";

const DEFAULT_MIDNIGHT_API_URL = new URL("/v1/midnight", BLUE_API_BASE_URL);

/** @internal Sends one Midnight API request and maps non-2xx responses to SDK errors. */
export async function requestMidnightApi<Response = unknown>(
  params: ApiRequestParams,
): Promise<Response> {
  const baseUrl = new URL(params.baseUrl ?? DEFAULT_MIDNIGHT_API_URL);
  baseUrl.search = "";
  baseUrl.hash = "";
  if (!baseUrl.pathname.endsWith("/")) {
    baseUrl.pathname = `${baseUrl.pathname}/`;
  }
  const relativePath = params.path.startsWith("/")
    ? params.path.slice(1)
    : params.path;
  const url = new URL(relativePath, baseUrl);
  url.search = "";
  url.hash = "";
  if (params.query != null) {
    for (const [key, value] of Object.entries(params.query)) {
      if (value === undefined) continue;
      if (Array.isArray(value) && value.length === 0) continue;
      url.searchParams.set(
        key,
        Array.isArray(value)
          ? value.map(String).join(",")
          : value instanceof Date
            ? value.toISOString()
            : String(value),
      );
    }
  }
  const headers = new Headers(params.request?.headers);
  if (params.body !== undefined)
    headers.set("Content-Type", "application/json");
  headers.set("sdk-version", MIDNIGHT_SDK_VERSION);

  const init: RequestInit = {
    ...params.request,
    method: params.method,
    headers,
  };
  init.body =
    params.body === undefined ? undefined : JSON.stringify(params.body);

  const response = await (params.fetch ?? globalThis.fetch)(url, init);
  let json: unknown;
  try {
    json = await response.json();
  } catch (error) {
    if (response.ok) {
      throw new InvalidMidnightApiResponseError(
        "Midnight API success response did not contain valid JSON.",
        { cause: error },
      );
    }
    json = undefined;
  }

  if (!response.ok) {
    const error =
      isRecord(json) && isRecord(json.error) ? json.error : undefined;

    throw new MidnightApiError({
      status: response.status,
      code: typeof error?.code === "string" ? error.code : undefined,
      message: typeof error?.message === "string" ? error.message : undefined,
      details: error != null && "details" in error ? error.details : undefined,
      requestId:
        typeof error?.request_id === "string" ? error.request_id : undefined,
    });
  }

  return json as Response;
}

/** @internal Builds a book endpoint path with encoded path segments. */
export function buildBookPath(params: {
  readonly marketId: Hash;
  readonly side?: MidnightApiBookSide;
  readonly suffix?: "quote" | "takeable-offers";
}) {
  const segments = [
    "books",
    params.marketId,
    params.side,
    params.suffix,
  ].filter((segment): segment is string => segment !== undefined);

  return segments.map(encodeURIComponent).join("/");
}

/** @internal Maps a book market API payload to the SDK response shape. */
export function mapBookMarket(
  book: ApiBookMarketResponse,
): MidnightApiBookMarket {
  return {
    marketId: book.market_id,
    chainId: book.chain_id,
    loanToken: book.loan_token,
    collaterals: book.collaterals.map(mapCollateral),
    maturity: book.maturity,
    rcfThreshold: book.rcf_threshold,
    enterGate: book.enter_gate,
    liquidatorGate: book.liquidator_gate,
    asks: book.asks.map(mapPriceLevel),
    bids: book.bids.map(mapPriceLevel),
  };
}

/** @internal Maps a collateral API payload to the SDK response shape. */
export function mapCollateral(
  collateral: ApiCollateralResponse,
): MidnightApiCollateral {
  return {
    token: collateral.token,
    lltv: collateral.lltv,
    maxLif: collateral.max_lif,
    oracle: collateral.oracle,
  };
}

/** @internal Maps a price-level API payload to the SDK response shape. */
export function mapPriceLevel(
  level: ApiPriceLevelResponse,
): MidnightApiPriceLevel {
  return {
    tick: level.tick,
    price: level.price,
    units: level.units,
    assets: level.assets,
    count: level.count,
  };
}

/** @internal Maps a takeable-offer API payload to the SDK response shape. */
export function mapTakeableOffer(
  takeableOffer: ApiTakeableOfferResponse,
): MidnightApiTake {
  const offer = takeableOffer.offer;

  return {
    marketId: takeableOffer.market_id,
    units: BigInt(takeableOffer.units),
    offer: {
      market: {
        loanToken: offer.market.loan_token,
        collateralParams: offer.market.collaterals.map((collateral) => ({
          token: collateral.token,
          lltv: BigInt(collateral.lltv),
          maxLif: BigInt(collateral.max_lif),
          oracle: collateral.oracle,
        })),
        maturity: BigInt(offer.market.maturity),
        rcfThreshold: BigInt(offer.market.rcf_threshold),
        enterGate: offer.market.enter_gate,
        liquidatorGate: offer.market.liquidator_gate,
      },
      buy: offer.buy,
      maker: offer.maker,
      start: BigInt(offer.start),
      expiry: BigInt(offer.expiry),
      tick: BigInt(offer.tick),
      group: offer.group,
      callback: offer.callback,
      callbackData: offer.callback_data,
      receiverIfMakerIsSeller: offer.receiver_if_maker_is_seller,
      ratifier: offer.ratifier,
      reduceOnly: offer.reduce_only,
      maxUnits: BigInt(offer.max_units),
      maxAssets: BigInt(offer.max_assets),
    },
    ratifierData: takeableOffer.ratifier_data,
  };
}

/** @internal Parses the mempool validation response envelope. */
export function parseValidationResponse(
  response: unknown,
): MempoolPayloadValidationResult {
  const parsedResponse = requireRecord(response, "validation response");
  const data = requireRecord(parsedResponse.data, "validation response data");
  if (!Array.isArray(data.issues)) {
    throw new InvalidMidnightApiResponseError(
      'Midnight API validation response is missing "data.issues".',
    );
  }

  const issues = data.issues.map((issue) => {
    const record = requireRecord(issue, "validation issue");
    const rule = record.rule;
    if (typeof rule !== "string") {
      throw new InvalidMidnightApiResponseError(
        'Midnight API validation issue is missing "rule".',
      );
    }

    return { rule };
  });

  return {
    valid: issues.length === 0,
    issues,
  };
}

/** @internal Parses the mempool rules response envelope. */
export function parseRulesResponse(response: unknown): MempoolRulesResult {
  const parsedResponse = requireRecord(response, "rules response");
  const cursor = parsedResponse.cursor;
  if (cursor !== null && typeof cursor !== "string") {
    throw new InvalidMidnightApiResponseError(
      'Midnight API rules response has invalid "cursor".',
    );
  }
  if (!Array.isArray(parsedResponse.data)) {
    throw new InvalidMidnightApiResponseError(
      'Midnight API rules response is missing "data".',
    );
  }

  return {
    cursor,
    data: parsedResponse.data.map((rule) => {
      const record = requireRecord(rule, "rules entry");
      const type = record.type;
      if (typeof type !== "string") {
        throw new InvalidMidnightApiResponseError(
          'Midnight API rules entry is missing "type".',
        );
      }
      const chainId = record.chain_id;
      if (typeof chainId !== "number") {
        throw new InvalidMidnightApiResponseError(
          'Midnight API rules entry is missing "chain_id".',
        );
      }
      const allowedLltvs = record.allowed_lltvs;
      if (
        allowedLltvs !== undefined &&
        (!Array.isArray(allowedLltvs) ||
          !allowedLltvs.every((item: unknown) => typeof item === "string"))
      ) {
        throw new InvalidMidnightApiResponseError(
          'Midnight API response field "allowed_lltvs" must be a string array.',
        );
      }

      return {
        type,
        chainId,
        name: readOptionalString(record, "name"),
        timestamp: readOptionalNumber(record, "timestamp"),
        address: readOptionalString(record, "address") as Address | undefined,
        callbackType: readOptionalString(record, "callback_type"),
        data: readOptionalString(record, "data") as Hex | undefined,
        minTick: readOptionalNumber(record, "min_tick"),
        maxTick: readOptionalNumber(record, "max_tick"),
        tickSpacing: readOptionalNumber(record, "tick_spacing"),
        max: readOptionalNumber(record, "max"),
        minSeconds: readOptionalNumber(record, "min_seconds"),
        allowedLltvs,
        description: readOptionalString(record, "description"),
      };
    }),
  };
}

function requireRecord(
  value: unknown,
  context: string,
): Readonly<Record<string, unknown>> {
  if (isRecord(value)) return value;
  throw new InvalidMidnightApiResponseError(
    `Midnight API ${context} is malformed.`,
  );
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOptionalString(
  record: Readonly<Record<string, unknown>>,
  key: string,
) {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;
  throw new InvalidMidnightApiResponseError(
    `Midnight API response field "${key}" must be a string.`,
  );
}

function readOptionalNumber(
  record: Readonly<Record<string, unknown>>,
  key: string,
) {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value === "number") return value;
  throw new InvalidMidnightApiResponseError(
    `Midnight API response field "${key}" must be a number.`,
  );
}
