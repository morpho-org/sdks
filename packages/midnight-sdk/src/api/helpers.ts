import type { Address, Hex } from "viem";
import {
  InvalidMidnightApiResponseError,
  MidnightApiError,
} from "../errors.js";
import { MIDNIGHT_SDK_VERSION } from "../version.js";
import type {
  ApiBookMarketResponse,
  ApiCollateralResponse,
  ApiConfigContractResponse,
  ApiPriceLevelResponse,
  ApiRequestParams,
  ApiTakeableOfferResponse,
  ApiUserGroupResponse,
  ApiUserOfferResponse,
  MempoolPayloadValidationResult,
  MempoolRulesResult,
  MidnightApiBookMarket,
  MidnightApiBookSide,
  MidnightApiCollateral,
  MidnightApiConfigContract,
  MidnightApiPriceLevel,
  MidnightApiTakeableOffer,
  MidnightApiUserGroup,
  MidnightApiUserOffer,
  QueryValue,
} from "./types.js";

const DEFAULT_MIDNIGHT_API_URL = new URL("https://api.morpho.org");

/** @internal Sends one Midnight API request and maps non-2xx responses to SDK errors. */
export async function requestMidnightApi<Response = unknown>(
  params: ApiRequestParams,
): Promise<Response> {
  const url = buildApiUrl({
    baseUrl: params.baseUrl,
    path: params.path,
    query: params.query,
  });
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
  const json = await readJson(response);

  if (!response.ok) {
    const error = isRecord(json)
      ? readOptionalRecord(json, "error")
      : undefined;

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
  readonly marketId: string;
  readonly side?: MidnightApiBookSide;
  readonly suffix?: "quote" | "takeable-offers";
}) {
  const segments = [
    "v1",
    "midnight",
    "books",
    params.marketId,
    params.side,
    params.suffix,
  ].filter((segment): segment is string => segment !== undefined);

  return `/${segments.map(encodeURIComponent).join("/")}`;
}

/** @internal Builds a user endpoint path with encoded path segments. */
export function buildUserPath(params: {
  readonly user: string;
  readonly suffix: "offers" | "groups";
}) {
  const segments = ["v1", "users", params.user, params.suffix];

  return `/${segments.map(encodeURIComponent).join("/")}`;
}

function buildApiUrl(params: {
  readonly baseUrl?: string | URL;
  readonly path: string;
  readonly query?: Readonly<Record<string, QueryValue>>;
}) {
  const baseUrl = buildApiBaseUrl(params.baseUrl);
  const relativePath = params.path.startsWith("/")
    ? params.path.slice(1)
    : params.path;
  const url = new URL(relativePath, baseUrl);
  url.search = "";
  url.hash = "";

  if (params.query == null) return url;

  for (const [key, value] of Object.entries(params.query)) {
    appendQueryParam({ url, key, value });
  }

  return url;
}

function buildApiBaseUrl(input?: string | URL) {
  const baseUrl = new URL(input ?? DEFAULT_MIDNIGHT_API_URL);
  baseUrl.search = "";
  baseUrl.hash = "";
  if (!baseUrl.pathname.endsWith("/")) {
    baseUrl.pathname = `${baseUrl.pathname}/`;
  }

  return baseUrl;
}

function appendQueryParam(params: {
  readonly url: URL;
  readonly key: string;
  readonly value: QueryValue;
}) {
  if (params.value === undefined) return;
  if (Array.isArray(params.value)) {
    if (params.value.length === 0) return;
    params.url.searchParams.set(params.key, params.value.map(String).join(","));
    return;
  }
  params.url.searchParams.set(
    params.key,
    params.value instanceof Date
      ? params.value.toISOString()
      : String(params.value),
  );
}

async function readJson(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch (error) {
    if (response.ok) {
      throw new InvalidMidnightApiResponseError(
        "Midnight API success response did not contain valid JSON.",
        { cause: error },
      );
    }
    return undefined;
  }
}

/** @internal Maps a book market API payload to the SDK response shape. */
export function mapBookMarket(
  book: ApiBookMarketResponse,
): MidnightApiBookMarket {
  return {
    id: book.id,
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
): MidnightApiTakeableOffer {
  const offer = takeableOffer.offer;

  return {
    units: takeableOffer.units,
    offer: {
      market: {
        loanToken: offer.market.loan_token,
        collaterals: offer.market.collaterals.map(mapCollateral),
        maturity: offer.market.maturity,
        rcfThreshold: offer.market.rcf_threshold,
        enterGate: offer.market.enter_gate,
        liquidatorGate: offer.market.liquidator_gate,
      },
      buy: offer.buy,
      maker: offer.maker,
      maxUnits: offer.max_units,
      start: offer.start,
      expiry: offer.expiry,
      tick: offer.tick,
      group: offer.group,
      callback: offer.callback,
      callbackData: offer.callback_data,
      receiverIfMakerIsSeller: offer.receiver_if_maker_is_seller,
      ratifier: offer.ratifier,
      reduceOnly: offer.reduce_only,
      maxAssets: offer.max_assets,
    },
    ratifierData: takeableOffer.ratifier_data,
  };
}

/** @internal Maps a config-contract API payload to the SDK response shape. */
export function mapConfigContract(
  contract: ApiConfigContractResponse,
): MidnightApiConfigContract {
  return {
    chainId: contract.chain_id,
    name: contract.name,
    address: contract.address,
  };
}

/** @internal Maps a user-offer API payload to the SDK response shape. */
export function mapUserOffer(
  offer: ApiUserOfferResponse,
): MidnightApiUserOffer {
  return {
    hash: offer.hash,
    market: {
      id: offer.market.id,
      loanToken: offer.market.loan_token,
      collaterals: offer.market.collaterals.map(mapCollateral),
      maturity: offer.market.maturity,
      rcfThreshold: offer.market.rcf_threshold,
      enterGate: offer.market.enter_gate,
      liquidatorGate: offer.market.liquidator_gate,
    },
    buy: offer.buy,
    maker: offer.maker,
    start: offer.start,
    expiry: offer.expiry,
    tick: offer.tick,
    group: {
      id: offer.group.id,
      consumed: offer.group.consumed,
      takeableUnits: offer.group.takeable_units,
    },
    callback: offer.callback,
    callbackData: offer.callback_data,
    receiverIfMakerIsSeller: offer.receiver_if_maker_is_seller,
    ratifier: offer.ratifier,
    reduceOnly: offer.reduce_only,
    maxUnits: offer.max_units,
    maxAssets: offer.max_assets,
  };
}

/** @internal Maps a user-group API payload to the SDK response shape. */
export function mapUserGroup(
  group: ApiUserGroupResponse,
): MidnightApiUserGroup {
  return {
    id: group.id,
    chainId: group.chain_id,
    maxUnits: group.max_units,
    maxAssets: group.max_assets,
    consumed: group.consumed,
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
      const type = requireString({
        record,
        key: "type",
        context: "rules entry",
      });
      const chainId = requireNumber({
        record,
        key: "chain_id",
        context: "rules entry",
      });

      return {
        type,
        chainId,
        name: readOptionalString(record, "name"),
        timestamp: readOptionalNumber(record, "timestamp"),
        address: readOptionalAddress(record, "address"),
        callbackType: readOptionalString(record, "callback_type"),
        data: readOptionalHex(record, "data"),
        minTick: readOptionalNumber(record, "min_tick"),
        maxTick: readOptionalNumber(record, "max_tick"),
        tickSpacing: readOptionalNumber(record, "tick_spacing"),
        max: readOptionalNumber(record, "max"),
        minSeconds: readOptionalNumber(record, "min_seconds"),
        allowedLltvs: readOptionalStringArray(record, "allowed_lltvs"),
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

function readOptionalRecord(
  record: Readonly<Record<string, unknown>>,
  key: string,
) {
  const value = record[key];
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(params: {
  readonly record: Readonly<Record<string, unknown>>;
  readonly key: string;
  readonly context: string;
}) {
  const value = params.record[params.key];
  if (typeof value === "string") return value;
  throw new InvalidMidnightApiResponseError(
    `Midnight API ${params.context} is missing "${params.key}".`,
  );
}

function requireNumber(params: {
  readonly record: Readonly<Record<string, unknown>>;
  readonly key: string;
  readonly context: string;
}) {
  const value = params.record[params.key];
  if (typeof value === "number") return value;
  throw new InvalidMidnightApiResponseError(
    `Midnight API ${params.context} is missing "${params.key}".`,
  );
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

function readOptionalAddress(
  record: Readonly<Record<string, unknown>>,
  key: string,
) {
  return readOptionalString(record, key) as Address | undefined;
}

function readOptionalHex(
  record: Readonly<Record<string, unknown>>,
  key: string,
) {
  return readOptionalString(record, key) as Hex | undefined;
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

function readOptionalStringArray(
  record: Readonly<Record<string, unknown>>,
  key: string,
) {
  const value = record[key];
  if (value === undefined) return undefined;
  if (isStringArray(value)) {
    return value;
  }
  throw new InvalidMidnightApiResponseError(
    `Midnight API response field "${key}" must be a string array.`,
  );
}

function isStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.every((item: unknown) => typeof item === "string")
  );
}
