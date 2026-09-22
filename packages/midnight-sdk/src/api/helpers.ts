import { BLUE_API_BASE_URL, isHexEqual } from "@morpho-org/morpho-ts";
import {
  type Address,
  type Hash,
  isAddress,
  isAddressEqual,
  maxUint256,
} from "viem";
import {
  InvalidMidnightApiResponseError,
  InvalidOfferParameterError,
  MidnightApiError,
} from "../errors.js";
import { MarketUtils } from "../market/index.js";
import { OfferUtils } from "../offers/index.js";
import {
  type ApiBookMarketResponse,
  type ApiCollateralResponse,
  type ApiPriceLevelResponse,
  type ApiRequestParams,
  type ApiTakeableOfferResponse,
  type MempoolPayloadValidationResult,
  MempoolPayloadValidationRule,
  type MidnightApiBookMarket,
  type MidnightApiBookSide,
  type MidnightApiCollateral,
  type MidnightApiPriceLevel,
  type MidnightApiTake,
} from "./types.js";
import { MIDNIGHT_SDK_VERSION } from "./version.generated.js";

const DEFAULT_MIDNIGHT_API_URL = new URL("/v0/midnight", BLUE_API_BASE_URL);
const MAX_UINT256_DECIMAL_LENGTH = maxUint256.toString().length;

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
  let jsonParseError: unknown;
  try {
    json = await response.json();
  } catch (error) {
    if (response.ok) {
      throw new InvalidMidnightApiResponseError(
        "Midnight API success response did not contain valid JSON.",
        { cause: error },
      );
    }
    jsonParseError = error;
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
      cause: jsonParseError,
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

/**
 * @internal Maps a book market API payload to the SDK response shape, rejecting any
 * response whose advertised `market_id` cannot be derived from — or does not match —
 * its own market params. Recomputing the id with `MarketUtils.toId` (mirroring the
 * takeable-offers path) stops a hostile API from pairing a trusted id with foreign
 * metadata; every book flows through here, so both bound paths reject the same substitution.
 */
export function mapBookMarket(
  book: ApiBookMarketResponse,
): MidnightApiBookMarket {
  let derivedMarketId: Hash;
  let matchesAdvertisedId: boolean;
  try {
    derivedMarketId = MarketUtils.toId({
      chainId: book.chain_id,
      midnight: book.midnight,
      loanToken: book.loan_token,
      collateralParams: book.collaterals.map((collateral) => ({
        token: collateral.token,
        lltv: collateral.lltv,
        liquidationCursor: collateral.liquidation_cursor,
        oracle: collateral.oracle,
      })),
      maturity: book.maturity,
      rcfThreshold: book.rcf_threshold,
      enterGate: book.enter_gate,
      liquidatorGate: book.liquidator_gate,
    });
    // Comparison stays inside the try so a malformed advertised `market_id`
    // (non-hex value) surfaces as a wrapped response error, not a raw TypeError.
    matchesAdvertisedId = isHexEqual(derivedMarketId, book.market_id);
  } catch (cause) {
    throw new InvalidMidnightApiResponseError(
      `Midnight API book market_id "${book.market_id}" could not be validated against its market params.`,
      { cause },
    );
  }
  if (!matchesAdvertisedId) {
    throw new InvalidMidnightApiResponseError(
      `Midnight API book market_id "${book.market_id}" does not match the id "${derivedMarketId}" derived from its market params.`,
    );
  }
  return {
    marketId: book.market_id,
    chainId: book.chain_id,
    midnight: book.midnight,
    loanToken: book.loan_token,
    collaterals: book.collaterals.map(mapCollateral),
    maturity: book.maturity,
    rcfThreshold: book.rcf_threshold,
    enterGate: book.enter_gate,
    liquidatorGate: book.liquidator_gate,
    asks: mapPriceLevels(book.asks, "asks"),
    bids: mapPriceLevels(book.bids, "bids"),
  };
}

/** @internal Maps a book market, binding its verified id to the requested market. */
export function mapBoundBookMarket(
  book: ApiBookMarketResponse,
  requestedMarketId: Hash,
): MidnightApiBookMarket {
  const market = mapBookMarket(book);
  if (!isHexEqual(market.marketId, requestedMarketId)) {
    throw new InvalidMidnightApiResponseError(
      `Midnight API book market_id "${market.marketId}" does not match requested market "${requestedMarketId}".`,
    );
  }
  return market;
}

/** @internal Requested `fetchBooks` filters that every returned book must satisfy. */
export interface BookFilterContext {
  readonly marketIds?: readonly Hash[];
  readonly chainIds?: readonly number[];
  readonly loanTokens?: readonly Address[];
  readonly collateralTokens?: readonly Address[];
  readonly maturities?: readonly number[];
}

/** @internal Maps listed book markets, binding each verified id to requested filters when present. */
export function mapBoundBooks(
  books: readonly ApiBookMarketResponse[],
  context: BookFilterContext = {},
): MidnightApiBookMarket[] {
  return books.map((book) => {
    const market = mapBookMarket(book);
    if (
      context.marketIds != null &&
      context.marketIds.length > 0 &&
      !context.marketIds.some((marketId) =>
        isHexEqual(marketId, market.marketId),
      )
    ) {
      throw new InvalidMidnightApiResponseError(
        `Midnight API book market_id "${market.marketId}" is outside the requested market_ids filter.`,
      );
    }
    if (
      context.chainIds != null &&
      context.chainIds.length > 0 &&
      !context.chainIds.includes(market.chainId)
    ) {
      throw new InvalidMidnightApiResponseError(
        `Midnight API book market_id "${market.marketId}" is outside the requested chain_ids filter.`,
      );
    }
    if (
      context.loanTokens != null &&
      context.loanTokens.length > 0 &&
      !context.loanTokens.some((token) =>
        isAddressEqual(token, market.loanToken),
      )
    ) {
      throw new InvalidMidnightApiResponseError(
        `Midnight API book market_id "${market.marketId}" is outside the requested loan_tokens filter.`,
      );
    }
    const { collateralTokens } = context;
    if (
      collateralTokens != null &&
      collateralTokens.length > 0 &&
      !market.collaterals.some((collateral) =>
        collateralTokens.some((token) =>
          isAddressEqual(token, collateral.token),
        ),
      )
    ) {
      throw new InvalidMidnightApiResponseError(
        `Midnight API book market_id "${market.marketId}" is outside the requested collateral_tokens filter.`,
      );
    }
    if (
      context.maturities != null &&
      context.maturities.length > 0 &&
      !context.maturities.includes(market.maturity)
    ) {
      throw new InvalidMidnightApiResponseError(
        `Midnight API book market_id "${market.marketId}" is outside the requested maturities filter.`,
      );
    }
    return market;
  });
}

/** @internal Maps a collateral API payload to the SDK response shape. */
export function mapCollateral(
  collateral: ApiCollateralResponse,
): MidnightApiCollateral {
  return {
    token: collateral.token,
    lltv: collateral.lltv,
    liquidationCursor: collateral.liquidation_cursor,
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

/** @internal Maps API price levels and sorts them best first: asks by ascending tick, bids by descending tick. */
export function mapPriceLevels(
  levels: readonly ApiPriceLevelResponse[],
  side: MidnightApiBookSide,
): MidnightApiPriceLevel[] {
  return levels
    .map(mapPriceLevel)
    .sort((a, b) => (side === "asks" ? a.tick - b.tick : b.tick - a.tick));
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
        chainId: BigInt(offer.market.chain_id),
        midnight: offer.market.midnight,
        loanToken: offer.market.loan_token,
        collateralParams: offer.market.collaterals.map((collateral) => ({
          token: collateral.token,
          lltv: BigInt(collateral.lltv),
          liquidationCursor: BigInt(collateral.liquidation_cursor),
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
      continuousFeeCap: BigInt(offer.continuous_fee_cap),
    },
    ratifierData: takeableOffer.ratifier_data,
  };
}

/** @internal API response context required for a takeable offer to be executable for the caller's request. */
export interface TakeableOfferContext {
  readonly marketId?: Hash;
  readonly side?: MidnightApiBookSide;
  readonly maker?: Address;
  readonly marketIds?: readonly Hash[];
  readonly groups?: readonly Hash[];
}

/** @internal Maps, validates, and best-price-sorts API takeable offers. */
export function mapBoundTakeableOffers(
  takeableOffers: readonly ApiTakeableOfferResponse[],
  context: TakeableOfferContext,
): MidnightApiTake[] {
  const mapped = takeableOffers.map((takeableOffer) => {
    let take: MidnightApiTake;
    let matchesAdvertisedId: boolean;
    let embeddedMarketId: Hash;
    try {
      take = mapTakeableOffer(takeableOffer);
      embeddedMarketId = MarketUtils.toId(take.offer.market);
      matchesAdvertisedId = isHexEqual(embeddedMarketId, take.marketId);
    } catch (cause) {
      throw new InvalidMidnightApiResponseError(
        `Midnight API takeable offer market_id "${takeableOffer.market_id}" could not be mapped or validated against its embedded offer market.`,
        { cause },
      );
    }
    if (!matchesAdvertisedId) {
      throw new InvalidMidnightApiResponseError(
        `Midnight API takeable offer market_id "${take.marketId}" does not match embedded offer market "${embeddedMarketId}".`,
      );
    }
    const { maxUnits, maxAssets, buy, maker, receiverIfMakerIsSeller } =
      take.offer;
    if (!isAddress(receiverIfMakerIsSeller)) {
      throw new InvalidMidnightApiResponseError(
        `Midnight API takeable offer receiverIfMakerIsSeller "${receiverIfMakerIsSeller}" is not an address.`,
      );
    }
    try {
      // Return values unused: called only to enforce the cap-shape and buy-receiver invariants.
      OfferUtils.validateOfferCaps({ maxUnits, maxAssets });
      OfferUtils.resolveReceiverIfMakerIsSeller({
        buy,
        maker,
        receiverIfMakerIsSeller,
      });
    } catch (cause) {
      if (!(cause instanceof InvalidOfferParameterError)) throw cause;
      throw new InvalidMidnightApiResponseError(
        `Midnight API takeable offer for market_id "${take.marketId}" is not executable: ${cause.message}`,
        { cause },
      );
    }
    if (
      context.marketId != null &&
      !isHexEqual(take.marketId, context.marketId)
    ) {
      throw new InvalidMidnightApiResponseError(
        `Midnight API takeable offer market_id "${take.marketId}" does not match requested market "${context.marketId}".`,
      );
    }
    if (
      context.marketIds != null &&
      context.marketIds.length > 0 &&
      !context.marketIds.some((marketId) => isHexEqual(marketId, take.marketId))
    ) {
      throw new InvalidMidnightApiResponseError(
        `Midnight API takeable offer market_id "${take.marketId}" is outside the requested market_ids filter.`,
      );
    }
    if (context.side != null) {
      const expectedBuy = context.side === "bids";
      if (take.offer.buy !== expectedBuy) {
        throw new InvalidMidnightApiResponseError(
          `Midnight API ${context.side} takeable offer returned offer.buy "${take.offer.buy}".`,
        );
      }
    }
    if (
      context.maker != null &&
      !isAddressEqual(take.offer.maker, context.maker)
    ) {
      throw new InvalidMidnightApiResponseError(
        `Midnight API takeable offer maker "${take.offer.maker}" does not match requested maker "${context.maker}".`,
      );
    }
    if (
      context.groups != null &&
      context.groups.length > 0 &&
      !context.groups.some((group) => isHexEqual(group, take.offer.group))
    ) {
      throw new InvalidMidnightApiResponseError(
        `Midnight API takeable offer group "${take.offer.group}" is outside the requested groups filter.`,
      );
    }

    return take;
  });

  if (context.side == null) return mapped;

  return [...mapped].sort((a, b) => {
    if (a.offer.tick === b.offer.tick) return 0;
    if (context.side === "asks") return a.offer.tick < b.offer.tick ? -1 : 1;
    return a.offer.tick > b.offer.tick ? -1 : 1;
  });
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

    const details = record.details;
    if (details == null) return { rule };

    if (
      rule === MempoolPayloadValidationRule.MinOfferAssetsUsd &&
      isRecord(details)
    ) {
      const loanToken = details.loan_token;
      const rawMinAssets = details.min_assets;
      if (
        typeof loanToken === "string" &&
        isAddress(loanToken) &&
        typeof rawMinAssets === "string" &&
        rawMinAssets.length <= MAX_UINT256_DECIMAL_LENGTH &&
        /^\d+$/.test(rawMinAssets)
      ) {
        const minAssets = BigInt(rawMinAssets);
        if (minAssets <= maxUint256) {
          return {
            rule,
            details: {
              type: "minOfferAssetsUsd" as const,
              loanToken,
              minAssets,
            },
          };
        }
      }
    }

    return {
      rule,
      details: {
        type: "unknown" as const,
        raw: details,
      },
    };
  });

  return {
    valid: issues.length === 0,
    issues,
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
