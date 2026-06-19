import type { BigIntish } from "@morpho-org/morpho-ts";
import type { Address, Hash, Hex } from "viem";

import type { OfferStruct } from "../offers/Offer.js";
import type { Item as MidnightPayloadItem } from "../signatures/Payload.js";
import type { TreeInput } from "../signatures/Tree.js";

/**
 * Fetch implementation used by Midnight API helpers.
 */
export type MidnightApiFetch = typeof fetch;

/**
 * Request options forwarded to Midnight API calls.
 *
 * The SDK owns `method` and `body`; callers can still pass headers, abort
 * signals, credentials, cache settings, and other fetch options.
 */
export type MidnightApiRequestOptions = Omit<RequestInit, "method" | "body">;

/**
 * Shared configuration for Midnight API calls.
 */
export interface MidnightApiConfig {
  /** Midnight API base URL. Defaults to `https://api.morpho.org/v1/midnight`. */
  readonly baseUrl?: string | URL;
  /** Fetch implementation. Defaults to the global `fetch`. */
  readonly fetch?: MidnightApiFetch;
  /** Additional fetch options forwarded to the request. */
  readonly request?: MidnightApiRequestOptions;
}

/**
 * Constructor input for {@link MidnightApi}.
 */
export type MidnightApiConstructorConfig = string | URL | MidnightApiConfig;

/**
 * Removes shared instance configuration keys from a parameter union.
 */
export type MidnightApiClientParams<Params extends MidnightApiConfig> =
  Params extends unknown ? Omit<Params, keyof MidnightApiConfig> : never;

/**
 * Book side accepted by Midnight API book routes.
 */
export type MidnightApiBookSide = "asks" | "bids";

/**
 * Book list sort field accepted by the Midnight API.
 */
export type MidnightApiBookSortField = "id" | "ask" | "bid" | "maturity";

/**
 * One Midnight API book sort term. Prefix with `-` for descending order.
 */
export type MidnightApiBookSortTerm =
  | MidnightApiBookSortField
  | `-${MidnightApiBookSortField}`;

/**
 * Book list sort input. Strings are forwarded as comma-separated API sort keys.
 */
export type MidnightApiBookSort = string | readonly MidnightApiBookSortTerm[];

/**
 * Quote slippage percentage accepted by the Midnight API.
 */
export type MidnightApiSlippage = string | number;

/**
 * Parameters for {@link MidnightApi.validateMempoolPayload}.
 */
export interface ValidateMempoolPayloadParams extends MidnightApiConfig {
  /** Chain id whose API policy should validate the payload. */
  readonly chainId: number;
  /** Encoded Midnight mempool payload bytes. */
  readonly payload: Hex;
  /** Optional ISO-8601 timestamp or `Date` selecting the API policy snapshot. */
  readonly timestamp?: string | Date;
}

/**
 * Parameters for {@link MidnightApi.validateMempoolItems}.
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
 */
export interface FetchMempoolRulesParams extends MidnightApiConfig {
  /** Chain ids to include. */
  readonly chainIds?: readonly number[];
  /** Rule types to include. */
  readonly types?: readonly string[];
  /** Optional ISO-8601 timestamp or `Date` selecting the API policy snapshot. */
  readonly timestamp?: string | Date;
  /** Maximum number of rules to return. */
  readonly limit?: number;
  /** Opaque pagination cursor from a previous response. */
  readonly cursor?: string;
}

/**
 * Parameters for {@link MidnightApi.fetchBooks}.
 */
export interface FetchBooksParams extends MidnightApiConfig {
  /** Sort fields, either already comma-separated or as individual terms. */
  readonly sort?: MidnightApiBookSort;
  /** Exact maturity timestamp filters in unix seconds. */
  readonly maturities?: readonly number[];
  /** Collateral token address filters. */
  readonly collateralTokens?: readonly Address[];
  /** Loan token address filters. */
  readonly loanTokens?: readonly Address[];
  /** Chain id filters. */
  readonly chainIds?: readonly number[];
  /** Market id filters. */
  readonly marketIds?: readonly Hash[];
  /** Maximum number of books to return. */
  readonly limit?: number;
  /** Opaque pagination cursor from a previous response. */
  readonly cursor?: string;
}

/**
 * Parameters for {@link MidnightApi.fetchBook}.
 */
export interface FetchBookParams extends MidnightApiConfig {
  /** Market id whose book to read. */
  readonly marketId: Hash;
  /** Maximum levels returned per side. */
  readonly depth?: number;
}

/**
 * Parameters for {@link MidnightApi.fetchBookPriceLevels}.
 */
export interface FetchBookPriceLevelsParams extends MidnightApiConfig {
  /** Market id whose book side to read. */
  readonly marketId: Hash;
  /** Book side to query. */
  readonly side: MidnightApiBookSide;
  /** Maximum levels returned. */
  readonly depth?: number;
}

/**
 * Parameters for {@link MidnightApi.fetchBookTakeableOffers}.
 */
export interface FetchBookTakeableOffersParams extends MidnightApiConfig {
  /** Market id whose book side to read. */
  readonly marketId: Hash;
  /** Book side to query. */
  readonly side: MidnightApiBookSide;
}

/**
 * Quote target specified as maker-side assets.
 */
export interface MidnightApiQuoteAssetsTarget {
  /** Target assets amount. */
  readonly assets: BigIntish;
  /** Mutually exclusive with `assets`. */
  readonly units?: never;
}

/**
 * Quote target specified as units.
 */
export interface MidnightApiQuoteUnitsTarget {
  /** Target unit amount. */
  readonly units: BigIntish;
  /** Mutually exclusive with `units`. */
  readonly assets?: never;
}

/**
 * Quote price guard specified directly as a WAD-scaled average worst price.
 */
export interface MidnightApiQuoteAverageWorstPriceGuard {
  /** Average worst price guard. */
  readonly averageWorstPrice: BigIntish;
  /** Mutually exclusive with `averageWorstPrice`. */
  readonly slippage?: never;
}

/**
 * Quote price guard specified as a slippage percentage.
 */
export interface MidnightApiQuoteSlippageGuard {
  /** Slippage percentage used to derive the guard. */
  readonly slippage: MidnightApiSlippage;
  /** Mutually exclusive with `slippage`. */
  readonly averageWorstPrice?: never;
}

/**
 * Quote request without a client-side price guard.
 */
export interface MidnightApiQuoteWithoutGuard {
  /** No average worst price guard. */
  readonly averageWorstPrice?: undefined;
  /** No slippage guard. */
  readonly slippage?: undefined;
}

/**
 * Parameters for {@link MidnightApi.fetchBookQuote}.
 */
export type FetchBookQuoteParams = MidnightApiConfig & {
  /** Market id whose book side to quote. */
  readonly marketId: Hash;
  /** Book side to quote. */
  readonly side: MidnightApiBookSide;
} & (MidnightApiQuoteAssetsTarget | MidnightApiQuoteUnitsTarget) &
  (
    | MidnightApiQuoteAverageWorstPriceGuard
    | MidnightApiQuoteSlippageGuard
    | MidnightApiQuoteWithoutGuard
  );

/**
 * Parameters for {@link MidnightApi.fetchTakeableOffers}.
 */
export interface FetchTakeableOffersParams extends MidnightApiConfig {
  /** Maker EVM address. */
  readonly maker: Address;
  /** Market id filters. */
  readonly marketIds?: readonly Hash[];
  /** Group id filters. */
  readonly groups?: readonly Hash[];
  /** Maximum number of offers to return. */
  readonly limit?: number;
  /** Opaque pagination cursor from a previous response. */
  readonly cursor?: string;
}

/**
 * One API validation issue.
 */
export interface MempoolPayloadValidationIssue {
  /** API rule violated by the payload. */
  readonly rule: string;
}

/**
 * SDK-shaped result returned by Midnight mempool validation.
 */
export interface MempoolPayloadValidationResult {
  /** Whether the API returned zero validation issues. */
  readonly valid: boolean;
  /** Payload-level API issues. */
  readonly issues: readonly MempoolPayloadValidationIssue[];
}

/**
 * One SDK-shaped Midnight API mempool rule.
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
  readonly address?: Address;
  /** Callback policy type, when returned by callback rules. */
  readonly callbackType?: string;
  /** Callback data, when returned by callback rules. */
  readonly data?: Hex;
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
 */
export interface MempoolRulesResult {
  /** Opaque pagination cursor, or `null` when no next page exists. */
  readonly cursor: string | null;
  /** API rules mapped to SDK camelCase fields. */
  readonly data: readonly MempoolRule[];
}

/**
 * Collateral metadata returned by Midnight API book routes.
 */
export interface MidnightApiCollateral {
  /** Collateral token address. */
  readonly token: Address;
  /** WAD-scaled liquidation loan-to-value. */
  readonly lltv: string;
  /** WAD-scaled maximum liquidation incentive factor. */
  readonly maxLif: string;
  /** Oracle address used to price this collateral. */
  readonly oracle: Address;
}

/**
 * Price level returned by Midnight API book routes.
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
 */
export interface MidnightApiBookMarket {
  /** Market id. */
  readonly marketId: Hash;
  /** Chain id the market lives on. */
  readonly chainId: number;
  /** Loan token address. */
  readonly loanToken: Address;
  /** Collateral definitions for the market. */
  readonly collaterals: readonly MidnightApiCollateral[];
  /** Market maturity timestamp in unix seconds. */
  readonly maturity: number;
  /** Recovery close factor threshold. */
  readonly rcfThreshold: string;
  /** Entry gate address. */
  readonly enterGate: Address;
  /** Liquidator gate address. */
  readonly liquidatorGate: Address;
  /** Ask levels sorted best first. */
  readonly asks: readonly MidnightApiPriceLevel[];
  /** Bid levels sorted best first. */
  readonly bids: readonly MidnightApiPriceLevel[];
}

/**
 * Paginated Midnight API books result.
 */
export interface MidnightApiBooksResult {
  /** Opaque pagination cursor, or `null` when no next page exists. */
  readonly cursor: string | null;
  /** Books with market metadata and top price levels. */
  readonly data: readonly MidnightApiBookMarket[];
}

/**
 * Midnight API single-book result.
 */
export interface MidnightApiBookResult {
  /** Book snapshot with market metadata and both sides. */
  readonly data: MidnightApiBookMarket;
}

/**
 * ABI-ready take returned by Midnight API book and quote routes.
 *
 * This shape matches the Midnight periphery `Take` tuple. Pass `offer`,
 * `ratifierData`, and `units` directly to `IMidnight.take`, or pass the object
 * in the `takes` array of a target-aware `MidnightBundles` call. `marketId` is
 * API metadata and is ignored by ABI encoders.
 */
export interface MidnightApiTake {
  /** Market id the offer belongs to. */
  readonly marketId: Hash;
  /** Executable or currently reserved offer size in units. */
  readonly units: bigint;
  /** Inline protocol offer. */
  readonly offer: OfferStruct;
  /** Ratifier data generated by the maker. */
  readonly ratifierData: Hex;
}

/**
 * Non-paginated takeable offers returned for a book side.
 */
export interface MidnightApiBookTakeableOffersResult {
  /** Takeable offers for the requested book side. */
  readonly data: readonly MidnightApiTake[];
}

/**
 * One side of a Midnight API book grouped by price level.
 */
export interface MidnightApiBookPriceLevelsResult {
  /** Book price levels grouped by tick, sorted best first. */
  readonly data: readonly MidnightApiPriceLevel[];
}

/**
 * Quote returned by Midnight API book quote routes.
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
  /**
   * Best-priced signed takeable-offer caps for target-aware bundle execution.
   *
   * The sum can exceed the requested target. Clamp each offer to the remaining
   * target before calling Midnight.take directly.
   */
  readonly takeableOffers: readonly MidnightApiTake[];
}

/**
 * Quote response returned by Midnight API book quote routes.
 */
export interface MidnightApiQuoteResult {
  /** Quote result and signed takeable-offer caps. */
  readonly data: MidnightApiQuote;
}

/**
 * Paginated maker takeable offers result.
 */
export interface MidnightApiTakeableOffersResult {
  /** Opaque pagination cursor, or `null` when no next page exists. */
  readonly cursor: string | null;
  /** Takeable offers for the requested maker. */
  readonly data: readonly MidnightApiTake[];
}

/** @internal HTTP method owned by Midnight API helpers. */
export type ApiMethod = "GET" | "POST";

/** @internal Query values serializable by Midnight API helpers. */
export type QueryValue =
  | string
  | number
  | bigint
  | boolean
  | Date
  | readonly string[]
  | readonly number[]
  | undefined;

/** @internal Request descriptor consumed by the Midnight API HTTP helper. */
export type ApiRequestParams = MidnightApiConfig & {
  readonly method: ApiMethod;
  readonly path: string;
  readonly query?: Readonly<Record<string, QueryValue>>;
  readonly body?: unknown;
};

/** @internal Collateral response shape returned by the API. */
export type ApiCollateralResponse = {
  readonly token: Address;
  readonly lltv: string;
  readonly max_lif: string;
  readonly oracle: Address;
};

/** @internal Price-level response shape returned by the API. */
export type ApiPriceLevelResponse = {
  readonly tick: number;
  readonly price: string;
  readonly units: string;
  readonly assets: string;
  readonly count: number;
};

/** @internal Book response shape returned by the API. */
export type ApiBookMarketResponse = {
  readonly market_id: Hash;
  readonly chain_id: number;
  readonly loan_token: Address;
  readonly collaterals: readonly ApiCollateralResponse[];
  readonly maturity: number;
  readonly rcf_threshold: string;
  readonly enter_gate: Address;
  readonly liquidator_gate: Address;
  readonly asks: readonly ApiPriceLevelResponse[];
  readonly bids: readonly ApiPriceLevelResponse[];
};

/** @internal Books response shape returned by the API. */
export type ApiBooksResponse = {
  readonly cursor: string | null;
  readonly data: readonly ApiBookMarketResponse[];
};

/** @internal Single-book response shape returned by the API. */
export type ApiBookResponse = {
  readonly data: ApiBookMarketResponse;
};

/** @internal Price-level response shape returned by the API. */
export type ApiPriceLevelsResponse = {
  readonly data: readonly ApiPriceLevelResponse[];
};

/** @internal Offer market response shape returned by the API. */
export type ApiOfferMarketResponse = {
  readonly loan_token: Address;
  readonly collaterals: readonly ApiCollateralResponse[];
  readonly maturity: number;
  readonly rcf_threshold: string;
  readonly enter_gate: Address;
  readonly liquidator_gate: Address;
};

/** @internal Inline offer response shape returned by the API. */
export type ApiOfferResponse = {
  readonly market: ApiOfferMarketResponse;
  readonly buy: boolean;
  readonly maker: Address;
  readonly max_units: string;
  readonly start: number;
  readonly expiry: number;
  readonly tick: number;
  readonly group: Hash;
  readonly callback: Address;
  readonly callback_data: Hex;
  readonly receiver_if_maker_is_seller: Address;
  readonly ratifier: Address;
  readonly reduce_only: boolean;
  readonly max_assets: string;
};

/** @internal Takeable-offer response shape returned by the API. */
export type ApiTakeableOfferResponse = {
  readonly market_id: Hash;
  readonly units: string;
  readonly offer: ApiOfferResponse;
  readonly ratifier_data: Hex;
};

/** @internal Book takeable-offers response shape returned by the API. */
export type ApiBookTakeableOffersResponse = {
  readonly data: readonly ApiTakeableOfferResponse[];
};

/** @internal Quote response shape returned by the API. */
export type ApiQuoteResponse = {
  readonly data: {
    readonly average_best_price: string;
    readonly average_worst_price: string;
    readonly available_assets: string;
    readonly available_units: string;
    readonly takeable_offers: readonly ApiTakeableOfferResponse[];
  };
};

/** @internal Paginated takeable-offers response shape returned by the API. */
export type ApiTakeableOffersResponse = {
  readonly cursor: string | null;
  readonly data: readonly ApiTakeableOfferResponse[];
};
