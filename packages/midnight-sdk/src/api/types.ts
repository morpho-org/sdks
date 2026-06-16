import type { z } from "zod";

import type {
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
export type MidnightApiConfig = z.infer<typeof midnightApiConfigSchema>;

/**
 * Constructor input for {@link MidnightApi}.
 */
export type MidnightApiConstructorConfig = z.infer<
  typeof midnightApiConstructorConfigSchema
>;

/**
 * Book side accepted by Midnight API book routes.
 */
export type MidnightApiBookSide = z.infer<typeof midnightApiBookSideSchema>;

/**
 * Contract names returned by the router config contracts endpoint.
 */
export type MidnightApiConfigContractName = z.infer<
  typeof midnightApiConfigContractNameSchema
>;

/**
 * Parameters for {@link MidnightApi.validateMempoolPayload}.
 */
export type ValidateMempoolPayloadParams = z.infer<
  typeof validateMempoolPayloadParamsSchema
>;

/**
 * Parameters for {@link MidnightApi.validateMempoolItems}.
 */
export type ValidateMempoolItemsParams = z.infer<
  typeof validateMempoolItemsParamsSchema
>;

/**
 * Parameters for {@link MidnightApi.validateMempoolTree}.
 */
export type ValidateMempoolTreeParams = z.infer<
  typeof validateMempoolTreeParamsSchema
>;

/**
 * Parameters for {@link MidnightApi.fetchMempoolRules}.
 */
export type FetchMempoolRulesParams = z.infer<
  typeof fetchMempoolRulesParamsSchema
>;

/**
 * Parameters for {@link MidnightApi.fetchConfigContracts}.
 */
export type FetchConfigContractsParams = z.infer<
  typeof fetchConfigContractsParamsSchema
>;

/**
 * Parameters for {@link MidnightApi.fetchBooks}.
 */
export type FetchBooksParams = z.infer<typeof fetchBooksParamsSchema>;

/**
 * Parameters for {@link MidnightApi.fetchBook}.
 */
export type FetchBookParams = z.infer<typeof fetchBookParamsSchema>;

/**
 * Parameters for {@link MidnightApi.fetchBookPriceLevels}.
 */
export type FetchBookPriceLevelsParams = z.infer<
  typeof fetchBookPriceLevelsParamsSchema
>;

/**
 * Parameters for {@link MidnightApi.fetchBookTakeableOffers}.
 */
export type FetchBookTakeableOffersParams = z.infer<
  typeof fetchBookTakeableOffersParamsSchema
>;

/**
 * Parameters for {@link MidnightApi.fetchBookQuote}.
 */
export type FetchBookQuoteParams = z.infer<typeof fetchBookQuoteParamsSchema>;

/**
 * Parameters for {@link MidnightApi.fetchTakeableOffers}.
 */
export type FetchTakeableOffersParams = z.infer<
  typeof fetchTakeableOffersParamsSchema
>;

/**
 * Parameters for {@link MidnightApi.fetchUserOffers}.
 */
export type FetchUserOffersParams = z.infer<typeof fetchUserOffersParamsSchema>;

/**
 * Parameters for {@link MidnightApi.fetchUserGroups}.
 */
export type FetchUserGroupsParams = z.infer<typeof fetchUserGroupsParamsSchema>;

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
 */
export interface MempoolRulesResult {
  /** Opaque pagination cursor, or `null` when no next page exists. */
  readonly cursor: string | null;
  /** API rules mapped to SDK camelCase fields. */
  readonly data: readonly MempoolRule[];
}

/**
 * Contract address entry returned by the router config contracts endpoint.
 */
export interface MidnightApiConfigContract {
  /** Chain id the contract is configured on. */
  readonly chainId: number;
  /** Router contract role name. */
  readonly name: MidnightApiConfigContractName;
  /** Contract address. */
  readonly address: string;
}

/**
 * Paginated router config contracts result.
 */
export interface MidnightApiConfigContractsResult {
  /** Opaque pagination cursor, or `null` when no next page exists. */
  readonly cursor: string | null;
  /** Router contract address entries. */
  readonly data: readonly MidnightApiConfigContract[];
}

/**
 * Collateral metadata returned by Midnight API book routes.
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
 * Midnight API offer market data.
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
 */
export interface MidnightApiBookTakeableOffersResult {
  /** Takeable offers for the requested book side. */
  readonly data: readonly MidnightApiTakeableOffer[];
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
  readonly takeableOffers: readonly MidnightApiTakeableOffer[];
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
  readonly data: readonly MidnightApiTakeableOffer[];
}

/**
 * Market metadata returned by Midnight API user offer routes.
 */
export interface MidnightApiUserOfferMarket extends MidnightApiOfferMarket {
  /** Market id. */
  readonly id: string;
}

/**
 * Group metadata returned inline with a Midnight API user offer.
 */
export interface MidnightApiUserOfferGroup {
  /** Consumption group id. */
  readonly id: string;
  /** Current onchain consumed value for the group. */
  readonly consumed: string;
  /** Currently executable size in units. */
  readonly takeableUnits: string;
}

/**
 * Offer returned by Midnight API user offer routes.
 */
export interface MidnightApiUserOffer {
  /** Offer hash. */
  readonly hash: string;
  /** Market this offer trades. */
  readonly market: MidnightApiUserOfferMarket;
  /** Whether the maker buys units. */
  readonly buy: boolean;
  /** Offer maker address. */
  readonly maker: string;
  /** Start timestamp in unix seconds. */
  readonly start: number;
  /** Expiry timestamp in unix seconds. */
  readonly expiry: number;
  /** Midnight tick. */
  readonly tick: number;
  /** Consumption group with current onchain usage. */
  readonly group: MidnightApiUserOfferGroup;
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
  /** Maximum units; zero means max assets controls consumption. */
  readonly maxUnits: string;
  /** Maximum buyer or seller assets, depending on side. */
  readonly maxAssets: string;
}

/**
 * Paginated Midnight API user offers result.
 */
export interface MidnightApiUserOffersResult {
  /** Opaque pagination cursor, or `null` when no next page exists. */
  readonly cursor: string | null;
  /** Offers created by the requested user. */
  readonly data: readonly MidnightApiUserOffer[];
}

/**
 * Group returned by Midnight API user group routes.
 */
export interface MidnightApiUserGroup {
  /** Consumption group id. */
  readonly id: string;
  /** Chain id the group lives on. */
  readonly chainId: number;
  /** Maximum units configured for the group. */
  readonly maxUnits: string;
  /** Maximum assets configured for the group. */
  readonly maxAssets: string;
  /** Current onchain consumed value for the group. */
  readonly consumed: string;
}

/**
 * Paginated Midnight API user groups result.
 */
export interface MidnightApiUserGroupsResult {
  /** Opaque pagination cursor, or `null` when no next page exists. */
  readonly cursor: string | null;
  /** Groups created by the requested user. */
  readonly data: readonly MidnightApiUserGroup[];
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
  readonly token: string;
  readonly lltv: string;
  readonly max_lif: string;
  readonly oracle: string;
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
  readonly loan_token: string;
  readonly collaterals: readonly ApiCollateralResponse[];
  readonly maturity: number;
  readonly rcf_threshold: string;
  readonly enter_gate: string;
  readonly liquidator_gate: string;
};

/** @internal Inline offer response shape returned by the API. */
export type ApiOfferResponse = {
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

/** @internal Takeable-offer response shape returned by the API. */
export type ApiTakeableOfferResponse = {
  readonly units: string;
  readonly offer: ApiOfferResponse;
  readonly ratifier_data: string;
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

/** @internal Config contract response shape returned by the API. */
export type ApiConfigContractResponse = {
  readonly chain_id: number;
  readonly name: MidnightApiConfigContractName;
  readonly address: string;
};

/** @internal Config contracts response shape returned by the API. */
export type ApiConfigContractsResponse = {
  readonly cursor: string | null;
  readonly data: readonly ApiConfigContractResponse[];
};

/** @internal User-offer market response shape returned by the API. */
export type ApiUserOfferMarketResponse = ApiOfferMarketResponse & {
  readonly id: string;
};

/** @internal User-offer group response shape returned by the API. */
export type ApiUserOfferGroupResponse = {
  readonly id: string;
  readonly consumed: string;
  readonly takeable_units: string;
};

/** @internal User offer response shape returned by the API. */
export type ApiUserOfferResponse = {
  readonly hash: string;
  readonly market: ApiUserOfferMarketResponse;
  readonly buy: boolean;
  readonly maker: string;
  readonly start: number;
  readonly expiry: number;
  readonly tick: number;
  readonly group: ApiUserOfferGroupResponse;
  readonly callback: string;
  readonly callback_data: string;
  readonly receiver_if_maker_is_seller: string;
  readonly ratifier: string;
  readonly reduce_only: boolean;
  readonly max_units: string;
  readonly max_assets: string;
};

/** @internal User offers response shape returned by the API. */
export type ApiUserOffersResponse = {
  readonly cursor: string | null;
  readonly data: readonly ApiUserOfferResponse[];
};

/** @internal User group response shape returned by the API. */
export type ApiUserGroupResponse = {
  readonly id: string;
  readonly chain_id: number;
  readonly max_units: string;
  readonly max_assets: string;
  readonly consumed: string;
};

/** @internal User groups response shape returned by the API. */
export type ApiUserGroupsResponse = {
  readonly cursor: string | null;
  readonly data: readonly ApiUserGroupResponse[];
};
