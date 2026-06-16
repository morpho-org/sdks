import {
  InvalidMidnightApiResponseError,
  MidnightApiError,
} from "../errors.js";
import type {
  Payload as MidnightPayload,
  Item as MidnightPayloadItem,
} from "../signatures/Payload.js";
import { encode as encodePayload } from "../signatures/Payload.js";
import { normalizeTree, type TreeInput } from "../signatures/Tree.js";
import { MIDNIGHT_SDK_VERSION } from "../version.js";

const DEFAULT_MIDNIGHT_API_URL = new URL("https://api.morpho.org");

/**
 * Fetch implementation used by Midnight API helpers.
 *
 * @example
 * ```ts
 * import type { MidnightApiFetch } from "@morpho-org/midnight-sdk";
 *
 * const apiFetch: MidnightApiFetch = fetch;
 * console.log(typeof apiFetch);
 * ```
 */
export type MidnightApiFetch = typeof fetch;

/**
 * Request options forwarded to Midnight API calls.
 *
 * The SDK owns `method` and `body`; callers can still pass headers, abort
 * signals, credentials, cache settings, and other fetch options.
 *
 * @example
 * ```ts
 * import type { MidnightApiRequestOptions } from "@morpho-org/midnight-sdk";
 *
 * const request: MidnightApiRequestOptions = {
 *   credentials: "include",
 * };
 * console.log(request.credentials);
 * ```
 */
export type MidnightApiRequestOptions = Omit<RequestInit, "method" | "body">;

/**
 * Shared configuration for Midnight API calls.
 *
 * @example
 * ```ts
 * import type { MidnightApiConfig } from "@morpho-org/midnight-sdk";
 *
 * const config: MidnightApiConfig = {
 *   baseUrl: "https://api.morpho.org",
 * };
 * console.log(config.baseUrl);
 * ```
 */
export interface MidnightApiConfig {
  /** Public Morpho API base URL. Defaults to `https://api.morpho.org`. */
  readonly baseUrl?: string | URL;
  /** Fetch implementation. Defaults to the global `fetch`. */
  readonly fetch?: MidnightApiFetch;
  /** Additional fetch options forwarded to the request. */
  readonly request?: MidnightApiRequestOptions;
}

/**
 * Parameters for {@link MidnightApi.validateMempoolPayload}.
 *
 * @example
 * ```ts
 * import type { ValidateMempoolPayloadParams } from "@morpho-org/midnight-sdk";
 *
 * const params: ValidateMempoolPayloadParams = {
 *   chainId: 8453,
 *   payload: "0x0100000000",
 * };
 * console.log(params.chainId);
 * ```
 */
export interface ValidateMempoolPayloadParams extends MidnightApiConfig {
  /** Chain id whose API policy should validate the payload. */
  readonly chainId: number;
  /** Encoded Midnight mempool payload bytes. */
  readonly payload: MidnightPayload;
  /** Optional ISO-8601 timestamp or `Date` selecting the API policy snapshot. */
  readonly timestamp?: string | Date;
}

/**
 * Parameters for {@link MidnightApi.validateMempoolItems}.
 *
 * @example
 * ```ts
 * import type { ValidateMempoolItemsParams } from "@morpho-org/midnight-sdk";
 *
 * const params: ValidateMempoolItemsParams = {
 *   chainId: 8453,
 *   items: [{ offer: {} as never, ratifierData: "0x" }],
 * };
 * console.log(params.items.length);
 * ```
 */
export interface ValidateMempoolItemsParams extends MidnightApiConfig {
  /** Chain id whose API policy should validate the payload. */
  readonly chainId: number;
  /** SDK-native payload items to encode before API validation. */
  readonly items: readonly MidnightPayloadItem[];
  /** Optional ISO-8601 timestamp or `Date` selecting the API policy snapshot. */
  readonly timestamp?: string | Date;
}

/**
 * Parameters for {@link MidnightApi.validateMempoolTree}.
 *
 * @example
 * ```ts
 * import type { ValidateMempoolTreeParams } from "@morpho-org/midnight-sdk";
 *
 * const params: ValidateMempoolTreeParams = {
 *   chainId: 8453,
 *   tree: { groups: [[{} as never]] },
 * };
 * console.log(params.chainId);
 * ```
 */
export interface ValidateMempoolTreeParams extends MidnightApiConfig {
  /** Chain id whose API policy should validate the tree. */
  readonly chainId: number;
  /** Offer tree to validate before ratifier data or payload publication exists. */
  readonly tree: TreeInput;
  /** Optional ISO-8601 timestamp or `Date` selecting the API policy snapshot. */
  readonly timestamp?: string | Date;
}

/**
 * Parameters for {@link MidnightApi.fetchMempoolRules}.
 *
 * @example
 * ```ts
 * import type { FetchMempoolRulesParams } from "@morpho-org/midnight-sdk";
 *
 * const params: FetchMempoolRulesParams = {
 *   chainIds: [8453],
 *   types: ["tick_spacing"],
 * };
 * console.log(params.types?.[0]);
 * ```
 */
export interface FetchMempoolRulesParams extends MidnightApiConfig {
  /** Optional chain-id filter. Serialized as comma-separated `chain_ids`. */
  readonly chainIds?: readonly number[];
  /** Optional API rule type filter. Serialized as comma-separated `types`. */
  readonly types?: readonly string[];
  /** Optional ISO-8601 timestamp or `Date` selecting the API policy snapshot. */
  readonly timestamp?: string | Date;
  /** Maximum number of rules to return. */
  readonly limit?: number;
  /** Opaque pagination cursor from a previous response. */
  readonly cursor?: string;
}

/**
 * Book side accepted by Midnight API book routes.
 *
 * @example
 * ```ts
 * import type { MidnightApiBookSide } from "@morpho-org/midnight-sdk";
 *
 * const side: MidnightApiBookSide = "asks";
 * console.log(side);
 * ```
 */
export type MidnightApiBookSide = "asks" | "bids";

/**
 * Parameters for {@link MidnightApi.fetchBooks}.
 *
 * @example
 * ```ts
 * import type { FetchBooksParams } from "@morpho-org/midnight-sdk";
 *
 * const params: FetchBooksParams = {
 *   chainIds: [8453],
 *   sort: ["-ask", "maturity"],
 * };
 * console.log(params.chainIds?.[0]);
 * ```
 */
export interface FetchBooksParams extends MidnightApiConfig {
  /** Optional sort fields. Serialized as comma-separated `sort`. */
  readonly sort?: string | readonly string[];
  /** Exact maturity timestamp filters in unix seconds. */
  readonly maturities?: readonly number[];
  /** Collateral token address filters. */
  readonly collateralTokens?: readonly string[];
  /** Loan token address filters. */
  readonly loanTokens?: readonly string[];
  /** Optional chain-id filter. */
  readonly chainIds?: readonly number[];
  /** Market id filters. Serialized as comma-separated `ids`. */
  readonly marketIds?: readonly string[];
  /** Maximum number of books to return. */
  readonly limit?: number;
  /** Opaque pagination cursor from a previous response. */
  readonly cursor?: string;
}

/**
 * Parameters for {@link MidnightApi.fetchBook}.
 *
 * @example
 * ```ts
 * import type { FetchBookParams } from "@morpho-org/midnight-sdk";
 *
 * const params: FetchBookParams = {
 *   marketId: "0x12590ae1aee324a005be565f3bcdd16dbf8daf7969b26c181c8b8f467dad9f67",
 *   depth: 100,
 * };
 * console.log(params.depth);
 * ```
 */
export interface FetchBookParams extends MidnightApiConfig {
  /** Market id whose book should be read. */
  readonly marketId: string;
  /** Maximum levels returned per side. */
  readonly depth?: number;
}

/**
 * Parameters for {@link MidnightApi.fetchBookPriceLevels}.
 *
 * @example
 * ```ts
 * import type { FetchBookPriceLevelsParams } from "@morpho-org/midnight-sdk";
 *
 * const params: FetchBookPriceLevelsParams = {
 *   marketId: "0x12590ae1aee324a005be565f3bcdd16dbf8daf7969b26c181c8b8f467dad9f67",
 *   side: "bids",
 * };
 * console.log(params.side);
 * ```
 */
export interface FetchBookPriceLevelsParams extends MidnightApiConfig {
  /** Market id whose side should be read. */
  readonly marketId: string;
  /** Book side to query. */
  readonly side: MidnightApiBookSide;
  /** Maximum levels returned. */
  readonly depth?: number;
}

/**
 * Parameters for {@link MidnightApi.fetchBookTakeableOffers}.
 *
 * @example
 * ```ts
 * import type { FetchBookTakeableOffersParams } from "@morpho-org/midnight-sdk";
 *
 * const params: FetchBookTakeableOffersParams = {
 *   marketId: "0x12590ae1aee324a005be565f3bcdd16dbf8daf7969b26c181c8b8f467dad9f67",
 *   side: "asks",
 * };
 * console.log(params.marketId);
 * ```
 */
export interface FetchBookTakeableOffersParams extends MidnightApiConfig {
  /** Market id whose executable side offers should be read. */
  readonly marketId: string;
  /** Book side to query. */
  readonly side: MidnightApiBookSide;
}

/**
 * Parameters for {@link MidnightApi.fetchBookQuote}.
 *
 * @example
 * ```ts
 * import type { FetchBookQuoteParams } from "@morpho-org/midnight-sdk";
 *
 * const params: FetchBookQuoteParams = {
 *   marketId: "0x12590ae1aee324a005be565f3bcdd16dbf8daf7969b26c181c8b8f467dad9f67",
 *   side: "asks",
 *   assets: 1000000000000000000n,
 *   slippage: "0.5",
 * };
 * console.log(params.assets);
 * ```
 */
export interface FetchBookQuoteParams extends MidnightApiConfig {
  /** Market id whose book should be quoted. */
  readonly marketId: string;
  /** Book side to quote. */
  readonly side: MidnightApiBookSide;
  /** Optional average weighted-price guard. */
  readonly averageWorstPrice?: string | number | bigint;
  /** Optional slippage percentage used by the API to derive the guard. */
  readonly slippage?: string | number;
  /** Target unit amount. */
  readonly units?: string | number | bigint;
  /** Target assets amount. */
  readonly assets?: string | number | bigint;
}

/**
 * Parameters for {@link MidnightApi.fetchTakeableOffers}.
 *
 * @example
 * ```ts
 * import type { FetchTakeableOffersParams } from "@morpho-org/midnight-sdk";
 *
 * const params: FetchTakeableOffersParams = {
 *   maker: "0x7b093658BE7f90B63D7c359e8f408e503c2D9401",
 *   marketIds: ["0x12590ae1aee324a005be565f3bcdd16dbf8daf7969b26c181c8b8f467dad9f67"],
 * };
 * console.log(params.maker);
 * ```
 */
export interface FetchTakeableOffersParams extends MidnightApiConfig {
  /** Maker EVM address. */
  readonly maker: string;
  /** Optional market id filters. Serialized as comma-separated `market_ids`. */
  readonly marketIds?: readonly string[];
  /** Optional group id filters. Serialized as comma-separated `groups`. */
  readonly groups?: readonly string[];
  /** Maximum number of offers to return. */
  readonly limit?: number;
  /** Opaque pagination cursor from a previous response. */
  readonly cursor?: string;
}

/**
 * One API validation issue.
 *
 * @example
 * ```ts
 * import type { MempoolPayloadValidationIssue } from "@morpho-org/midnight-sdk";
 *
 * const issue: MempoolPayloadValidationIssue = { rule: "tick_spacing" };
 * console.log(issue.rule);
 * ```
 */
export interface MempoolPayloadValidationIssue {
  /** API rule violated by the payload. */
  readonly rule: string;
}

/**
 * SDK-shaped result returned by Midnight mempool validation.
 *
 * @example
 * ```ts
 * import type { MempoolPayloadValidationResult } from "@morpho-org/midnight-sdk";
 *
 * const result: MempoolPayloadValidationResult = { valid: true, issues: [] };
 * console.log(result.valid);
 * ```
 */
export interface MempoolPayloadValidationResult {
  /** Whether the API returned zero validation issues. */
  readonly valid: boolean;
  /** Payload-level API issues. */
  readonly issues: readonly MempoolPayloadValidationIssue[];
}

/**
 * One SDK-shaped Midnight API mempool rule.
 *
 * @example
 * ```ts
 * import type { MempoolRule } from "@morpho-org/midnight-sdk";
 *
 * const rule: MempoolRule = { type: "tick_spacing", chainId: 8453 };
 * console.log(rule.chainId);
 * ```
 */
export interface MempoolRule {
  /** API rule type. */
  readonly type: string;
  /** Chain id the rule applies to. */
  readonly chainId: number;
  /** Rule name, when returned by the API. */
  readonly name?: string;
  /** Rule timestamp, when returned by the API. */
  readonly timestamp?: number;
  /** Address value, when returned by address-based rules. */
  readonly address?: string;
  /** Callback policy type, when returned by callback rules. */
  readonly callbackType?: string;
  /** Callback data, when returned by callback rules. */
  readonly data?: string;
  /** Minimum supported tick, when returned by min-tick rules. */
  readonly minTick?: number;
  /** Maximum supported tick, when returned by max-tick rules. */
  readonly maxTick?: number;
  /** Required tick spacing, when returned by tick-spacing rules. */
  readonly tickSpacing?: number;
  /** Maximum policy value, when returned by bounded rules. */
  readonly max?: number;
  /** Minimum seconds value, when returned by timing rules. */
  readonly minSeconds?: number;
  /** Allowed LLTV values, when returned by collateral LLTV rules. */
  readonly allowedLltvs?: readonly string[];
  /** Rule description, when returned by the API. */
  readonly description?: string;
}

/**
 * SDK-shaped paginated Midnight API mempool rules result.
 *
 * @example
 * ```ts
 * import type { MempoolRulesResult } from "@morpho-org/midnight-sdk";
 *
 * const result: MempoolRulesResult = {
 *   cursor: null,
 *   data: [{ type: "tick_spacing", chainId: 8453, tickSpacing: 4 }],
 * };
 * console.log(result.data.length);
 * ```
 */
export interface MempoolRulesResult {
  /** Opaque pagination cursor, or `null` when no next page exists. */
  readonly cursor: string | null;
  /** API rules mapped to SDK camelCase fields. */
  readonly data: readonly MempoolRule[];
}

/**
 * Collateral metadata returned by Midnight API book routes.
 *
 * @example
 * ```ts
 * import type { MidnightApiCollateral } from "@morpho-org/midnight-sdk";
 *
 * const collateral: MidnightApiCollateral = {
 *   token: "0x0000000000000000000000000000000000000001",
 *   lltv: "860000000000000000",
 *   maxLif: "0",
 *   oracle: "0x0000000000000000000000000000000000000002",
 * };
 * console.log(collateral.lltv);
 * ```
 */
export interface MidnightApiCollateral {
  /** Collateral token address. */
  readonly token: string;
  /** WAD-scaled liquidation loan-to-value. */
  readonly lltv: string;
  /** WAD-scaled maximum liquidation incentive factor. */
  readonly maxLif: string;
  /** Oracle address used to price this collateral. */
  readonly oracle: string;
}

/**
 * Price level returned by Midnight API book routes.
 *
 * @example
 * ```ts
 * import type { MidnightApiPriceLevel } from "@morpho-org/midnight-sdk";
 *
 * const level: MidnightApiPriceLevel = {
 *   tick: 495,
 *   price: "500000000000000000",
 *   units: "369216000000000000000000",
 *   assets: "184608000000000000000000",
 *   count: 5,
 * };
 * console.log(level.tick);
 * ```
 */
export interface MidnightApiPriceLevel {
  /** Midnight tick. */
  readonly tick: number;
  /** WAD-scaled price at this tick. */
  readonly price: string;
  /** Total executable units at this tick. */
  readonly units: string;
  /** Total maker-side assets at this tick. */
  readonly assets: string;
  /** Number of offers grouped into this level. */
  readonly count: number;
}

/**
 * Market and top-of-book metadata returned by Midnight API book routes.
 *
 * @example
 * ```ts
 * import type { MidnightApiBookMarket } from "@morpho-org/midnight-sdk";
 *
 * const book = {} as MidnightApiBookMarket;
 * console.log(book.chainId);
 * ```
 */
export interface MidnightApiBookMarket {
  /** Market id. */
  readonly id: string;
  /** Chain id the market lives on. */
  readonly chainId: number;
  /** Loan token address. */
  readonly loanToken: string;
  /** Collateral definitions for the market. */
  readonly collaterals: readonly MidnightApiCollateral[];
  /** Market maturity timestamp in unix seconds. */
  readonly maturity: number;
  /** Recovery close factor threshold. */
  readonly rcfThreshold: string;
  /** Entry gate address. */
  readonly enterGate: string;
  /** Liquidator gate address. */
  readonly liquidatorGate: string;
  /** Ask levels sorted best first. */
  readonly asks: readonly MidnightApiPriceLevel[];
  /** Bid levels sorted best first. */
  readonly bids: readonly MidnightApiPriceLevel[];
}

/**
 * Paginated Midnight API books result.
 *
 * @example
 * ```ts
 * import type { MidnightApiBooksResult } from "@morpho-org/midnight-sdk";
 *
 * const result: MidnightApiBooksResult = { cursor: null, data: [] };
 * console.log(result.data.length);
 * ```
 */
export interface MidnightApiBooksResult {
  /** Opaque pagination cursor, or `null` when no next page exists. */
  readonly cursor: string | null;
  /** Books with market metadata and top price levels. */
  readonly data: readonly MidnightApiBookMarket[];
}

/**
 * Midnight API single-book result.
 *
 * @example
 * ```ts
 * import type { MidnightApiBookResult } from "@morpho-org/midnight-sdk";
 *
 * const result = {} as MidnightApiBookResult;
 * console.log(result.data.id);
 * ```
 */
export interface MidnightApiBookResult {
  /** Book snapshot with market metadata and both sides. */
  readonly data: MidnightApiBookMarket;
}

/**
 * Midnight API offer market data.
 *
 * @example
 * ```ts
 * import type { MidnightApiOfferMarket } from "@morpho-org/midnight-sdk";
 *
 * const market = {} as MidnightApiOfferMarket;
 * console.log(market.loanToken);
 * ```
 */
export interface MidnightApiOfferMarket {
  /** Loan token address. */
  readonly loanToken: string;
  /** Collateral definitions for the market. */
  readonly collaterals: readonly MidnightApiCollateral[];
  /** Market maturity timestamp in unix seconds. */
  readonly maturity: number;
  /** Recovery close factor threshold. */
  readonly rcfThreshold: string;
  /** Entry gate address. */
  readonly enterGate: string;
  /** Liquidator gate address. */
  readonly liquidatorGate: string;
}

/**
 * Inline offer returned by Midnight API book and quote routes.
 *
 * @example
 * ```ts
 * import type { MidnightApiOffer } from "@morpho-org/midnight-sdk";
 *
 * const offer = {} as MidnightApiOffer;
 * console.log(offer.maker);
 * ```
 */
export interface MidnightApiOffer {
  /** Market this offer trades. */
  readonly market: MidnightApiOfferMarket;
  /** Whether the maker buys units. */
  readonly buy: boolean;
  /** Offer maker address. */
  readonly maker: string;
  /** Maximum units; zero means max assets controls consumption. */
  readonly maxUnits: string;
  /** Start timestamp in unix seconds. */
  readonly start: number;
  /** Expiry timestamp in unix seconds. */
  readonly expiry: number;
  /** Midnight tick. */
  readonly tick: number;
  /** Consumption group id. */
  readonly group: string;
  /** Optional maker callback. */
  readonly callback: string;
  /** Callback payload. */
  readonly callbackData: string;
  /** Receiver used when the maker is the seller. */
  readonly receiverIfMakerIsSeller: string;
  /** Ratifier contract address. */
  readonly ratifier: string;
  /** Whether the offer can only reduce maker exposure. */
  readonly reduceOnly: boolean;
  /** Maximum buyer or seller assets, depending on side. */
  readonly maxAssets: string;
}

/**
 * Executable offer returned by Midnight API book and quote routes.
 *
 * @example
 * ```ts
 * import type { MidnightApiTakeableOffer } from "@morpho-org/midnight-sdk";
 *
 * const take = {} as MidnightApiTakeableOffer;
 * console.log(take.ratifierData);
 * ```
 */
export interface MidnightApiTakeableOffer {
  /** Executable or currently reserved offer size in units. */
  readonly units: string;
  /** Inline offer. */
  readonly offer: MidnightApiOffer;
  /** Ratifier data generated by the maker. */
  readonly ratifierData: string;
}

/**
 * Non-paginated takeable offers returned for a book side.
 *
 * @example
 * ```ts
 * import type { MidnightApiBookTakeableOffersResult } from "@morpho-org/midnight-sdk";
 *
 * const result: MidnightApiBookTakeableOffersResult = { data: [] };
 * console.log(result.data.length);
 * ```
 */
export interface MidnightApiBookTakeableOffersResult {
  /** Takeable offers for the requested book side. */
  readonly data: readonly MidnightApiTakeableOffer[];
}

/**
 * One side of a Midnight API book grouped by price level.
 *
 * @example
 * ```ts
 * import type { MidnightApiBookPriceLevelsResult } from "@morpho-org/midnight-sdk";
 *
 * const result: MidnightApiBookPriceLevelsResult = { data: [] };
 * console.log(result.data.length);
 * ```
 */
export interface MidnightApiBookPriceLevelsResult {
  /** Book price levels grouped by tick, sorted best first. */
  readonly data: readonly MidnightApiPriceLevel[];
}

/**
 * Quote returned by Midnight API book quote routes.
 *
 * @example
 * ```ts
 * import type { MidnightApiQuote } from "@morpho-org/midnight-sdk";
 *
 * const quote: MidnightApiQuote = {
 *   averageBestPrice: "1000000000000000000",
 *   averageWorstPrice: "1010000000000000000",
 *   availableAssets: "1500000000000000000",
 *   availableUnits: "1500000000000000000",
 *   takes: [],
 * };
 * console.log(quote.averageBestPrice);
 * ```
 */
export interface MidnightApiQuote {
  /** Weighted average price for the requested size before any guard. */
  readonly averageBestPrice: string;
  /** Effective weighted average-price guard for the returned instructions. */
  readonly averageWorstPrice: string;
  /** Maximum assets available from the returned take caps. */
  readonly availableAssets: string;
  /** Maximum units available from the returned take caps. */
  readonly availableUnits: string;
  /** Best-priced signed take caps for target-aware bundle execution. */
  readonly takes: readonly MidnightApiTakeableOffer[];
}

/**
 * Quote response returned by Midnight API book quote routes.
 *
 * @example
 * ```ts
 * import type { MidnightApiQuoteResult } from "@morpho-org/midnight-sdk";
 *
 * const result = {} as MidnightApiQuoteResult;
 * console.log(result.data.takes.length);
 * ```
 */
export interface MidnightApiQuoteResult {
  /** Quote result and signed take instructions. */
  readonly data: MidnightApiQuote;
}

/**
 * Paginated maker takeable offers result.
 *
 * @example
 * ```ts
 * import type { MidnightApiTakeableOffersResult } from "@morpho-org/midnight-sdk";
 *
 * const result: MidnightApiTakeableOffersResult = { cursor: null, data: [] };
 * console.log(result.cursor);
 * ```
 */
export interface MidnightApiTakeableOffersResult {
  /** Opaque pagination cursor, or `null` when no next page exists. */
  readonly cursor: string | null;
  /** Takeable offers for the requested maker. */
  readonly data: readonly MidnightApiTakeableOffer[];
}

type ApiMethod = "GET" | "POST";

type QueryValue =
  | string
  | number
  | bigint
  | Date
  | readonly string[]
  | readonly number[]
  | undefined;

type ApiRequestParams = MidnightApiConfig & {
  readonly method: ApiMethod;
  readonly path: string;
  readonly query?: Readonly<Record<string, QueryValue>>;
  readonly body?: unknown;
};

type ApiErrorEnvelope = {
  readonly code?: string;
  readonly message?: string;
  readonly details?: unknown;
  readonly requestId?: string;
};

type ApiCollateralResponse = {
  readonly token: string;
  readonly lltv: string;
  readonly max_lif: string;
  readonly oracle: string;
};

type ApiPriceLevelResponse = {
  readonly tick: number;
  readonly price: string;
  readonly units: string;
  readonly assets: string;
  readonly count: number;
};

type ApiBookMarketResponse = {
  readonly id: string;
  readonly chain_id: number;
  readonly loan_token: string;
  readonly collaterals: readonly ApiCollateralResponse[];
  readonly maturity: number;
  readonly rcf_threshold: string;
  readonly enter_gate: string;
  readonly liquidator_gate: string;
  readonly asks: readonly ApiPriceLevelResponse[];
  readonly bids: readonly ApiPriceLevelResponse[];
};

type ApiBooksResponse = {
  readonly cursor: string | null;
  readonly data: readonly ApiBookMarketResponse[];
};

type ApiBookResponse = {
  readonly data: ApiBookMarketResponse;
};

type ApiPriceLevelsResponse = {
  readonly data: readonly ApiPriceLevelResponse[];
};

type ApiOfferMarketResponse = {
  readonly loan_token: string;
  readonly collaterals: readonly ApiCollateralResponse[];
  readonly maturity: number;
  readonly rcf_threshold: string;
  readonly enter_gate: string;
  readonly liquidator_gate: string;
};

type ApiOfferResponse = {
  readonly market: ApiOfferMarketResponse;
  readonly buy: boolean;
  readonly maker: string;
  readonly max_units: string;
  readonly start: number;
  readonly expiry: number;
  readonly tick: number;
  readonly group: string;
  readonly callback: string;
  readonly callback_data: string;
  readonly receiver_if_maker_is_seller: string;
  readonly ratifier: string;
  readonly reduce_only: boolean;
  readonly max_assets: string;
};

type ApiTakeableOfferResponse = {
  readonly units: string;
  readonly offer: ApiOfferResponse;
  readonly ratifier_data: string;
};

type ApiBookTakeableOffersResponse = {
  readonly data: readonly ApiTakeableOfferResponse[];
};

type ApiQuoteResponse = {
  readonly data: {
    readonly average_best_price: string;
    readonly average_worst_price: string;
    readonly available_assets: string;
    readonly available_units: string;
    readonly takes: readonly ApiTakeableOfferResponse[];
  };
};

type ApiTakeableOffersResponse = {
  readonly cursor: string | null;
  readonly data: readonly ApiTakeableOfferResponse[];
};

type MidnightApiConstructorConfig = MidnightApiConfig | string | URL;

/**
 * Midnight API client and stateless helper surface for books and mempool data.
 *
 * Static methods use `https://api.morpho.org` by default and accept per-call
 * configuration. Instances keep shared `baseUrl`, `fetch`, and request options
 * for integrations that make repeated calls.
 *
 * @example
 * ```ts
 * import { MidnightApi } from "@morpho-org/midnight-sdk";
 *
 * const direct = await MidnightApi.validateMempoolPayload({
 *   chainId: 8453,
 *   payload: "0x0100000000",
 * });
 *
 * const api = new MidnightApi("https://api.morpho.org");
 * const configured = await api.validateMempoolPayload({
 *   chainId: 8453,
 *   payload: "0x0100000000",
 * });
 *
 * console.log(direct.valid && configured.valid);
 * ```
 */
export class MidnightApi {
  private readonly config: MidnightApiConfig;

  /**
   * Creates a Midnight API client with shared request configuration.
   *
   * @param config - API base URL or full request configuration.
   * @returns Configured Midnight API client.
   * @example
   * ```ts
   * import { MidnightApi } from "@morpho-org/midnight-sdk";
   *
   * const api = new MidnightApi({
   *   baseUrl: "https://api.morpho.org",
   * });
   * console.log(api);
   * ```
   */
  public constructor(config: MidnightApiConstructorConfig = {}) {
    this.config =
      typeof config === "string" || config instanceof URL
        ? { baseUrl: config }
        : { ...config };
  }

  /**
   * Fetches active Midnight books with market metadata and top price levels.
   *
   * @param params - Book filters, sorting, pagination, and optional request configuration.
   * @returns Paginated books mapped to SDK camelCase fields.
   * @throws MidnightApiError when the API returns a non-2xx response.
   * @throws InvalidMidnightApiResponseError when the API success response is not JSON.
   * @example
   * ```ts
   * import { MidnightApi } from "@morpho-org/midnight-sdk";
   *
   * const books = await MidnightApi.fetchBooks({
   *   chainIds: [8453],
   *   limit: 10,
   * });
   * console.log(books.data.length);
   * ```
   */
  public static async fetchBooks(
    params: FetchBooksParams = {},
  ): Promise<MidnightApiBooksResult> {
    const response = await requestMidnightApi<ApiBooksResponse>({
      ...params,
      method: "GET",
      path: "/v1/midnight/books",
      query: {
        sort: params.sort,
        maturities: params.maturities,
        collateral_tokens: params.collateralTokens,
        loan_tokens: params.loanTokens,
        chain_ids: params.chainIds,
        ids: params.marketIds,
        limit: params.limit,
        cursor: params.cursor,
      },
    });

    return mapBooksResponse(response);
  }

  /**
   * Fetches one Midnight book with market metadata and both sides.
   *
   * @param params - Market id, optional depth, and optional request configuration.
   * @returns Book snapshot mapped to SDK camelCase fields.
   * @throws MidnightApiError when the API returns a non-2xx response.
   * @throws InvalidMidnightApiResponseError when the API success response is not JSON.
   * @example
   * ```ts
   * import { MidnightApi } from "@morpho-org/midnight-sdk";
   *
   * const book = await MidnightApi.fetchBook({
   *   marketId: "0x12590ae1aee324a005be565f3bcdd16dbf8daf7969b26c181c8b8f467dad9f67",
   * });
   * console.log(book.data.id);
   * ```
   */
  public static async fetchBook(
    params: FetchBookParams,
  ): Promise<MidnightApiBookResult> {
    const response = await requestMidnightApi<ApiBookResponse>({
      ...params,
      method: "GET",
      path: buildBookPath({ marketId: params.marketId }),
      query: {
        depth: params.depth,
      },
    });

    return mapBookResponse(response);
  }

  /**
   * Fetches one side of a Midnight book grouped by price level.
   *
   * @param params - Market id, side, optional depth, and optional request configuration.
   * @returns Price levels mapped to SDK camelCase fields.
   * @throws MidnightApiError when the API returns a non-2xx response.
   * @throws InvalidMidnightApiResponseError when the API success response is not JSON.
   * @example
   * ```ts
   * import { MidnightApi } from "@morpho-org/midnight-sdk";
   *
   * const levels = await MidnightApi.fetchBookPriceLevels({
   *   marketId: "0x12590ae1aee324a005be565f3bcdd16dbf8daf7969b26c181c8b8f467dad9f67",
   *   side: "asks",
   * });
   * console.log(levels.data.length);
   * ```
   */
  public static async fetchBookPriceLevels(
    params: FetchBookPriceLevelsParams,
  ): Promise<MidnightApiBookPriceLevelsResult> {
    const response = await requestMidnightApi<ApiPriceLevelsResponse>({
      ...params,
      method: "GET",
      path: buildBookPath({ marketId: params.marketId, side: params.side }),
      query: {
        depth: params.depth,
      },
    });

    return mapPriceLevelsResponse(response);
  }

  /**
   * Fetches executable offers for one side of a Midnight book.
   *
   * @param params - Market id, side, and optional request configuration.
   * @returns Takeable offers mapped to SDK camelCase fields.
   * @throws MidnightApiError when the API returns a non-2xx response.
   * @throws InvalidMidnightApiResponseError when the API success response is not JSON.
   * @example
   * ```ts
   * import { MidnightApi } from "@morpho-org/midnight-sdk";
   *
   * const offers = await MidnightApi.fetchBookTakeableOffers({
   *   marketId: "0x12590ae1aee324a005be565f3bcdd16dbf8daf7969b26c181c8b8f467dad9f67",
   *   side: "bids",
   * });
   * console.log(offers.data.length);
   * ```
   */
  public static async fetchBookTakeableOffers(
    params: FetchBookTakeableOffersParams,
  ): Promise<MidnightApiBookTakeableOffersResult> {
    const response = await requestMidnightApi<ApiBookTakeableOffersResponse>({
      ...params,
      method: "GET",
      path: buildBookPath({
        marketId: params.marketId,
        side: params.side,
        suffix: "takeable-offers",
      }),
    });

    return mapBookTakeableOffersResponse(response);
  }

  /**
   * Fetches a bundle-ready quote for one side of a Midnight book.
   *
   * @param params - Market id, side, target size, price guard, and optional request configuration.
   * @returns Quote and signed take instructions mapped to SDK camelCase fields.
   * @throws MidnightApiError when the API returns a non-2xx response.
   * @throws InvalidMidnightApiResponseError when the API success response is not JSON.
   * @example
   * ```ts
   * import { MidnightApi } from "@morpho-org/midnight-sdk";
   *
   * const quote = await MidnightApi.fetchBookQuote({
   *   marketId: "0x12590ae1aee324a005be565f3bcdd16dbf8daf7969b26c181c8b8f467dad9f67",
   *   side: "asks",
   *   assets: 1000000000000000000n,
   *   slippage: "0.5",
   * });
   * console.log(quote.data.averageBestPrice);
   * ```
   */
  public static async fetchBookQuote(
    params: FetchBookQuoteParams,
  ): Promise<MidnightApiQuoteResult> {
    const response = await requestMidnightApi<ApiQuoteResponse>({
      ...params,
      method: "GET",
      path: buildBookPath({
        marketId: params.marketId,
        side: params.side,
        suffix: "quote",
      }),
      query: {
        average_worst_price: params.averageWorstPrice,
        slippage: params.slippage,
        units: params.units,
        assets: params.assets,
      },
    });

    return mapQuoteResponse(response);
  }

  /**
   * Fetches one maker's unexpired, unmatured takeable offers.
   *
   * @param params - Maker filter, optional market/group filters, pagination, and request configuration.
   * @returns Paginated takeable offers mapped to SDK camelCase fields.
   * @throws MidnightApiError when the API returns a non-2xx response.
   * @throws InvalidMidnightApiResponseError when the API success response is not JSON.
   * @example
   * ```ts
   * import { MidnightApi } from "@morpho-org/midnight-sdk";
   *
   * const offers = await MidnightApi.fetchTakeableOffers({
   *   maker: "0x7b093658BE7f90B63D7c359e8f408e503c2D9401",
   * });
   * console.log(offers.data.length);
   * ```
   */
  public static async fetchTakeableOffers(
    params: FetchTakeableOffersParams,
  ): Promise<MidnightApiTakeableOffersResult> {
    const response = await requestMidnightApi<ApiTakeableOffersResponse>({
      ...params,
      method: "GET",
      path: "/v1/midnight/takeable-offers",
      query: {
        maker: params.maker,
        market_ids: params.marketIds,
        groups: params.groups,
        limit: params.limit,
        cursor: params.cursor,
      },
    });

    return mapTakeableOffersResponse(response);
  }

  /**
   * Validates an encoded Midnight mempool payload against API policy.
   *
   * @param params - Validation parameters and optional request configuration.
   * @returns API issues and `valid` summary.
   * @throws MidnightApiError when the API returns a non-2xx response.
   * @throws InvalidMidnightApiResponseError when the API returns malformed success JSON.
   * @example
   * ```ts
   * import { MidnightApi } from "@morpho-org/midnight-sdk";
   *
   * const validation = await MidnightApi.validateMempoolPayload({
   *   chainId: 8453,
   *   payload: "0x0100000000",
   * });
   * console.log(validation.valid);
   * ```
   */
  public static async validateMempoolPayload(
    params: ValidateMempoolPayloadParams,
  ): Promise<MempoolPayloadValidationResult> {
    const response = await requestMidnightApi({
      ...params,
      method: "POST",
      path: "/v1/midnight/mempool/validate",
      query: {
        timestamp: params.timestamp,
      },
      body: {
        chain_id: params.chainId,
        payload: params.payload,
      },
    });

    return parseValidationResponse(response);
  }

  /**
   * Encodes SDK-native payload items and validates them against API policy.
   *
   * @param params - Validation parameters and optional request configuration.
   * @returns API issues and `valid` summary.
   * @throws Payload.DecodeError when item encoding fails.
   * @throws MidnightApiError when the API returns a non-2xx response.
   * @throws InvalidMidnightApiResponseError when the API returns malformed success JSON.
   * @example
   * ```ts
   * import { MidnightApi } from "@morpho-org/midnight-sdk";
   *
   * const validation = await MidnightApi.validateMempoolItems({
   *   chainId: 8453,
   *   items: [{ offer: {} as never, ratifierData: "0x" }],
   * });
   * console.log(validation.valid);
   * ```
   */
  public static async validateMempoolItems(
    params: ValidateMempoolItemsParams,
  ): Promise<MempoolPayloadValidationResult> {
    const payload = await encodePayload(params.items);

    return MidnightApi.validateMempoolPayload({
      ...params,
      payload,
    });
  }

  /**
   * Validates an offer tree before wallet signature or root approval.
   *
   * API policy only inspects offer contents, so this helper encodes each
   * tree leaf with empty `ratifierData` and keeps payload bytes at the edge.
   *
   * @param params - Validation parameters and optional request configuration.
   * @returns API issues and `valid` summary.
   * @throws Payload.DecodeError when validation payload encoding fails.
   * @throws MidnightApiError when the API returns a non-2xx response.
   * @throws InvalidMidnightApiResponseError when the API returns malformed success JSON.
   * @example
   * ```ts
   * import { MidnightApi } from "@morpho-org/midnight-sdk";
   *
   * const validation = await MidnightApi.validateMempoolTree({
   *   chainId: 8453,
   *   tree: { groups: [[{} as never]] },
   * });
   * console.log(validation.valid);
   * ```
   */
  public static async validateMempoolTree(
    params: ValidateMempoolTreeParams,
  ): Promise<MempoolPayloadValidationResult> {
    const tree = normalizeTree(params.tree);

    return MidnightApi.validateMempoolItems({
      ...params,
      items: tree.offers.map((offer) => ({ offer, ratifierData: "0x" })),
    });
  }

  /**
   * Fetches inspectable Midnight API mempool policy rules.
   *
   * @param params - Rule filters, pagination, and optional request configuration.
   * @returns Paginated API rules mapped to SDK camelCase fields.
   * @throws MidnightApiError when the API returns a non-2xx response.
   * @throws InvalidMidnightApiResponseError when the API returns malformed success JSON.
   * @example
   * ```ts
   * import { MidnightApi } from "@morpho-org/midnight-sdk";
   *
   * const rules = await MidnightApi.fetchMempoolRules({
   *   chainIds: [8453],
   *   types: ["tick_spacing"],
   * });
   * console.log(rules.data[0]?.type);
   * ```
   */
  public static async fetchMempoolRules(
    params: FetchMempoolRulesParams = {},
  ): Promise<MempoolRulesResult> {
    const response = await requestMidnightApi({
      ...params,
      method: "GET",
      path: "/v1/midnight/mempool/rules",
      query: {
        timestamp: params.timestamp,
        chain_ids: params.chainIds,
        types: params.types,
        limit: params.limit,
        cursor: params.cursor,
      },
    });

    return parseRulesResponse(response);
  }

  /**
   * Fetches active Midnight books with this client's configuration.
   *
   * @param params - Book filters, sorting, and pagination.
   * @returns Paginated books mapped to SDK camelCase fields.
   * @throws MidnightApiError when the API returns a non-2xx response.
   * @throws InvalidMidnightApiResponseError when the API success response is not JSON.
   * @example
   * ```ts
   * import { MidnightApi } from "@morpho-org/midnight-sdk";
   *
   * const api = new MidnightApi();
   * const books = await api.fetchBooks({ chainIds: [8453], limit: 10 });
   * console.log(books.data.length);
   * ```
   */
  public fetchBooks(
    params: Omit<FetchBooksParams, keyof MidnightApiConfig> = {},
  ): Promise<MidnightApiBooksResult> {
    return MidnightApi.fetchBooks({
      ...this.config,
      ...params,
    });
  }

  /**
   * Fetches one Midnight book with this client's configuration.
   *
   * @param params - Market id and optional depth.
   * @returns Book snapshot mapped to SDK camelCase fields.
   * @throws MidnightApiError when the API returns a non-2xx response.
   * @throws InvalidMidnightApiResponseError when the API success response is not JSON.
   * @example
   * ```ts
   * import { MidnightApi } from "@morpho-org/midnight-sdk";
   *
   * const api = new MidnightApi();
   * const book = await api.fetchBook({
   *   marketId: "0x12590ae1aee324a005be565f3bcdd16dbf8daf7969b26c181c8b8f467dad9f67",
   * });
   * console.log(book.data.id);
   * ```
   */
  public fetchBook(
    params: Omit<FetchBookParams, keyof MidnightApiConfig>,
  ): Promise<MidnightApiBookResult> {
    return MidnightApi.fetchBook({
      ...this.config,
      ...params,
    });
  }

  /**
   * Fetches one side of a Midnight book with this client's configuration.
   *
   * @param params - Market id, side, and optional depth.
   * @returns Price levels mapped to SDK camelCase fields.
   * @throws MidnightApiError when the API returns a non-2xx response.
   * @throws InvalidMidnightApiResponseError when the API success response is not JSON.
   * @example
   * ```ts
   * import { MidnightApi } from "@morpho-org/midnight-sdk";
   *
   * const api = new MidnightApi();
   * const levels = await api.fetchBookPriceLevels({
   *   marketId: "0x12590ae1aee324a005be565f3bcdd16dbf8daf7969b26c181c8b8f467dad9f67",
   *   side: "asks",
   * });
   * console.log(levels.data.length);
   * ```
   */
  public fetchBookPriceLevels(
    params: Omit<FetchBookPriceLevelsParams, keyof MidnightApiConfig>,
  ): Promise<MidnightApiBookPriceLevelsResult> {
    return MidnightApi.fetchBookPriceLevels({
      ...this.config,
      ...params,
    });
  }

  /**
   * Fetches executable offers for one book side with this client's configuration.
   *
   * @param params - Market id and side.
   * @returns Takeable offers mapped to SDK camelCase fields.
   * @throws MidnightApiError when the API returns a non-2xx response.
   * @throws InvalidMidnightApiResponseError when the API success response is not JSON.
   * @example
   * ```ts
   * import { MidnightApi } from "@morpho-org/midnight-sdk";
   *
   * const api = new MidnightApi();
   * const offers = await api.fetchBookTakeableOffers({
   *   marketId: "0x12590ae1aee324a005be565f3bcdd16dbf8daf7969b26c181c8b8f467dad9f67",
   *   side: "bids",
   * });
   * console.log(offers.data.length);
   * ```
   */
  public fetchBookTakeableOffers(
    params: Omit<FetchBookTakeableOffersParams, keyof MidnightApiConfig>,
  ): Promise<MidnightApiBookTakeableOffersResult> {
    return MidnightApi.fetchBookTakeableOffers({
      ...this.config,
      ...params,
    });
  }

  /**
   * Fetches a bundle-ready quote with this client's configuration.
   *
   * @param params - Market id, side, target size, and price guard.
   * @returns Quote and signed take instructions mapped to SDK camelCase fields.
   * @throws MidnightApiError when the API returns a non-2xx response.
   * @throws InvalidMidnightApiResponseError when the API success response is not JSON.
   * @example
   * ```ts
   * import { MidnightApi } from "@morpho-org/midnight-sdk";
   *
   * const api = new MidnightApi();
   * const quote = await api.fetchBookQuote({
   *   marketId: "0x12590ae1aee324a005be565f3bcdd16dbf8daf7969b26c181c8b8f467dad9f67",
   *   side: "asks",
   *   units: "1000000000000000000",
   * });
   * console.log(quote.data.takes.length);
   * ```
   */
  public fetchBookQuote(
    params: Omit<FetchBookQuoteParams, keyof MidnightApiConfig>,
  ): Promise<MidnightApiQuoteResult> {
    return MidnightApi.fetchBookQuote({
      ...this.config,
      ...params,
    });
  }

  /**
   * Fetches one maker's takeable offers with this client's configuration.
   *
   * @param params - Maker filter, optional market/group filters, and pagination.
   * @returns Paginated takeable offers mapped to SDK camelCase fields.
   * @throws MidnightApiError when the API returns a non-2xx response.
   * @throws InvalidMidnightApiResponseError when the API success response is not JSON.
   * @example
   * ```ts
   * import { MidnightApi } from "@morpho-org/midnight-sdk";
   *
   * const api = new MidnightApi();
   * const offers = await api.fetchTakeableOffers({
   *   maker: "0x7b093658BE7f90B63D7c359e8f408e503c2D9401",
   * });
   * console.log(offers.data.length);
   * ```
   */
  public fetchTakeableOffers(
    params: Omit<FetchTakeableOffersParams, keyof MidnightApiConfig>,
  ): Promise<MidnightApiTakeableOffersResult> {
    return MidnightApi.fetchTakeableOffers({
      ...this.config,
      ...params,
    });
  }

  /**
   * Validates an encoded Midnight mempool payload with this client's configuration.
   *
   * @param params - Payload validation parameters.
   * @returns API validation result.
   * @throws MidnightApiError when the API returns a non-2xx response.
   * @throws InvalidMidnightApiResponseError when the API returns malformed success JSON.
   * @example
   * ```ts
   * import { MidnightApi } from "@morpho-org/midnight-sdk";
   *
   * const api = new MidnightApi();
   * const validation = await api.validateMempoolPayload({ chainId: 8453, payload: "0x0100000000" });
   * console.log(validation.valid);
   * ```
   */
  public validateMempoolPayload(
    params: Omit<ValidateMempoolPayloadParams, keyof MidnightApiConfig>,
  ): Promise<MempoolPayloadValidationResult> {
    return MidnightApi.validateMempoolPayload({
      ...this.config,
      ...params,
    });
  }

  /**
   * Validates payload-ready items with this client's configuration.
   *
   * @param params - Item validation parameters.
   * @returns API validation result.
   * @throws Payload.DecodeError when item encoding fails.
   * @throws MidnightApiError when the API returns a non-2xx response.
   * @throws InvalidMidnightApiResponseError when the API returns malformed success JSON.
   * @example
   * ```ts
   * import { MidnightApi } from "@morpho-org/midnight-sdk";
   *
   * const api = new MidnightApi();
   * const validation = await api.validateMempoolItems({
   *   chainId: 8453,
   *   items: [{ offer: {} as never, ratifierData: "0x" }],
   * });
   * console.log(validation.valid);
   * ```
   */
  public validateMempoolItems(
    params: Omit<ValidateMempoolItemsParams, keyof MidnightApiConfig>,
  ): Promise<MempoolPayloadValidationResult> {
    return MidnightApi.validateMempoolItems({
      ...this.config,
      ...params,
    });
  }

  /**
   * Validates an offer tree before ratifier data or payload publication exists.
   *
   * @param params - Tree validation parameters.
   * @returns API issues and `valid` summary.
   * @throws Payload.DecodeError when validation payload encoding fails.
   * @throws MidnightApiError when the API returns a non-2xx response.
   * @throws InvalidMidnightApiResponseError when the API returns malformed success JSON.
   * @example
   * ```ts
   * import { MidnightApi } from "@morpho-org/midnight-sdk";
   *
   * const api = new MidnightApi();
   * const validation = await api.validateMempoolTree({ chainId: 8453, tree: { groups: [[{} as never]] } });
   * console.log(validation.valid);
   * ```
   */
  public validateMempoolTree(
    params: Omit<ValidateMempoolTreeParams, keyof MidnightApiConfig>,
  ): Promise<MempoolPayloadValidationResult> {
    return MidnightApi.validateMempoolTree({
      ...this.config,
      ...params,
    });
  }

  /**
   * Fetches inspectable Midnight API mempool policy rules.
   *
   * @param params - Rule filters and pagination.
   * @returns Paginated API rules mapped to SDK camelCase fields.
   * @throws MidnightApiError when the API returns a non-2xx response.
   * @throws InvalidMidnightApiResponseError when the API returns malformed success JSON.
   * @example
   * ```ts
   * import { MidnightApi } from "@morpho-org/midnight-sdk";
   *
   * const api = new MidnightApi();
   * const rules = await api.fetchMempoolRules({ chainIds: [8453] });
   * console.log(rules.data.length);
   * ```
   */
  public fetchMempoolRules(
    params: Omit<FetchMempoolRulesParams, keyof MidnightApiConfig> = {},
  ): Promise<MempoolRulesResult> {
    return MidnightApi.fetchMempoolRules({
      ...this.config,
      ...params,
    });
  }
}

async function requestMidnightApi<Response = unknown>(
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
    const envelope = parseApiErrorEnvelope(json);
    throw new MidnightApiError({
      status: response.status,
      code: envelope.code,
      message: envelope.message,
      details: envelope.details,
      requestId: envelope.requestId,
    });
  }

  return json as Response;
}

function buildBookPath(params: {
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

function parseApiErrorEnvelope(json: unknown): ApiErrorEnvelope {
  if (!isRecord(json) || !isRecord(json.error)) return {};

  return {
    code: readApiErrorString(json.error, "code"),
    message: readApiErrorString(json.error, "message"),
    details: "details" in json.error ? json.error.details : undefined,
    requestId: readApiErrorString(json.error, "request_id"),
  };
}

function readApiErrorString(
  record: Readonly<Record<string, unknown>>,
  key: string,
) {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function mapBooksResponse(response: ApiBooksResponse): MidnightApiBooksResult {
  return {
    cursor: response.cursor,
    data: response.data.map(mapBookMarket),
  };
}

function mapBookResponse(response: ApiBookResponse): MidnightApiBookResult {
  return {
    data: mapBookMarket(response.data),
  };
}

function mapPriceLevelsResponse(
  response: ApiPriceLevelsResponse,
): MidnightApiBookPriceLevelsResult {
  return {
    data: response.data.map(mapPriceLevel),
  };
}

function mapBookTakeableOffersResponse(
  response: ApiBookTakeableOffersResponse,
): MidnightApiBookTakeableOffersResult {
  return {
    data: response.data.map(mapTakeableOffer),
  };
}

function mapQuoteResponse(response: ApiQuoteResponse): MidnightApiQuoteResult {
  return {
    data: {
      averageBestPrice: response.data.average_best_price,
      averageWorstPrice: response.data.average_worst_price,
      availableAssets: response.data.available_assets,
      availableUnits: response.data.available_units,
      takes: response.data.takes.map(mapTakeableOffer),
    },
  };
}

function mapTakeableOffersResponse(
  response: ApiTakeableOffersResponse,
): MidnightApiTakeableOffersResult {
  return {
    cursor: response.cursor,
    data: response.data.map(mapTakeableOffer),
  };
}

function mapBookMarket(book: ApiBookMarketResponse): MidnightApiBookMarket {
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

function mapCollateral(
  collateral: ApiCollateralResponse,
): MidnightApiCollateral {
  return {
    token: collateral.token,
    lltv: collateral.lltv,
    maxLif: collateral.max_lif,
    oracle: collateral.oracle,
  };
}

function mapPriceLevel(level: ApiPriceLevelResponse): MidnightApiPriceLevel {
  return {
    tick: level.tick,
    price: level.price,
    units: level.units,
    assets: level.assets,
    count: level.count,
  };
}

function mapOfferMarket(
  market: ApiOfferMarketResponse,
): MidnightApiOfferMarket {
  return {
    loanToken: market.loan_token,
    collaterals: market.collaterals.map(mapCollateral),
    maturity: market.maturity,
    rcfThreshold: market.rcf_threshold,
    enterGate: market.enter_gate,
    liquidatorGate: market.liquidator_gate,
  };
}

function mapOffer(offer: ApiOfferResponse): MidnightApiOffer {
  return {
    market: mapOfferMarket(offer.market),
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
  };
}

function mapTakeableOffer(
  takeableOffer: ApiTakeableOfferResponse,
): MidnightApiTakeableOffer {
  return {
    units: takeableOffer.units,
    offer: mapOffer(takeableOffer.offer),
    ratifierData: takeableOffer.ratifier_data,
  };
}

function parseValidationResponse(
  json: unknown,
): MempoolPayloadValidationResult {
  const response = requireRecord(json, "validation response");
  const data = requireRecord(response.data, "validation response data");
  if (!Array.isArray(data.issues)) {
    throw new InvalidMidnightApiResponseError(
      'Midnight API validation response is missing "data.issues".',
    );
  }

  const issues = data.issues.map(parseValidationIssue);

  return {
    valid: issues.length === 0,
    issues,
  };
}

function parseValidationIssue(issue: unknown): MempoolPayloadValidationIssue {
  const record = requireRecord(issue, "validation issue");
  const rule = record.rule;
  if (typeof rule !== "string") {
    throw new InvalidMidnightApiResponseError(
      'Midnight API validation issue is missing "rule".',
    );
  }

  return { rule };
}

function parseRulesResponse(json: unknown): MempoolRulesResult {
  const response = requireRecord(json, "rules response");
  const cursor = response.cursor;
  if (cursor !== null && typeof cursor !== "string") {
    throw new InvalidMidnightApiResponseError(
      'Midnight API rules response has invalid "cursor".',
    );
  }
  if (!Array.isArray(response.data)) {
    throw new InvalidMidnightApiResponseError(
      'Midnight API rules response is missing "data".',
    );
  }

  return {
    cursor,
    data: response.data.map(parseRule),
  };
}

function parseRule(rule: unknown): MempoolRule {
  const record = requireRecord(rule, "rules entry");
  const type = requireString({ record, key: "type", context: "rules entry" });
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
    address: readOptionalString(record, "address"),
    callbackType: readOptionalString(record, "callback_type"),
    data: readOptionalString(record, "data"),
    minTick: readOptionalNumber(record, "min_tick"),
    maxTick: readOptionalNumber(record, "max_tick"),
    tickSpacing: readOptionalNumber(record, "tick_spacing"),
    max: readOptionalNumber(record, "max"),
    minSeconds: readOptionalNumber(record, "min_seconds"),
    allowedLltvs: readOptionalStringArray(record, "allowed_lltvs"),
    description: readOptionalString(record, "description"),
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
