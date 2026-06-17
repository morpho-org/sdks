import { OfferTreeUtils } from "../signatures/OfferTreeUtils.js";
import { encode as encodePayload } from "../signatures/Payload.js";
import {
  buildBookPath,
  mapBookMarket,
  mapPriceLevel,
  mapTakeableOffer,
  parseRulesResponse,
  parseValidationResponse,
  requestMidnightApi,
} from "./helpers.js";
import type {
  ApiBookResponse,
  ApiBooksResponse,
  ApiBookTakeableOffersResponse,
  ApiPriceLevelsResponse,
  ApiQuoteResponse,
  ApiTakeableOffersResponse,
  FetchBookParams,
  FetchBookPriceLevelsParams,
  FetchBookQuoteParams,
  FetchBooksParams,
  FetchBookTakeableOffersParams,
  FetchMempoolRulesParams,
  FetchTakeableOffersParams,
  MempoolPayloadValidationResult,
  MempoolRulesResult,
  MidnightApiBookPriceLevelsResult,
  MidnightApiBookResult,
  MidnightApiBooksResult,
  MidnightApiBookTakeableOffersResult,
  MidnightApiClientParams,
  MidnightApiConfig,
  MidnightApiConstructorConfig,
  MidnightApiQuoteResult,
  MidnightApiTakeableOffersResult,
  ValidateMempoolItemsParams,
  ValidateMempoolPayloadParams,
  ValidateMempoolTreeParams,
} from "./types.js";

export type {
  FetchBookParams,
  FetchBookPriceLevelsParams,
  FetchBookQuoteParams,
  FetchBooksParams,
  FetchBookTakeableOffersParams,
  FetchMempoolRulesParams,
  FetchTakeableOffersParams,
  MempoolPayloadValidationIssue,
  MempoolPayloadValidationResult,
  MempoolRule,
  MempoolRulesResult,
  MidnightApiBookMarket,
  MidnightApiBookPriceLevelsResult,
  MidnightApiBookResult,
  MidnightApiBookSide,
  MidnightApiBookSort,
  MidnightApiBookSortField,
  MidnightApiBookSortTerm,
  MidnightApiBooksResult,
  MidnightApiBookTakeableOffersResult,
  MidnightApiClientParams,
  MidnightApiCollateral,
  MidnightApiConfig,
  MidnightApiConstructorConfig,
  MidnightApiFetch,
  MidnightApiOffer,
  MidnightApiOfferMarket,
  MidnightApiPriceLevel,
  MidnightApiQuote,
  MidnightApiQuoteAssetsTarget,
  MidnightApiQuoteAverageWorstPriceGuard,
  MidnightApiQuoteResult,
  MidnightApiQuoteSlippageGuard,
  MidnightApiQuoteUnitsTarget,
  MidnightApiQuoteWithoutGuard,
  MidnightApiRequestOptions,
  MidnightApiSlippage,
  MidnightApiTakeableOffer,
  MidnightApiTakeableOffersResult,
  ValidateMempoolItemsParams,
  ValidateMempoolPayloadParams,
  ValidateMempoolTreeParams,
} from "./types.js";

/**
 * Midnight API client and stateless helper surface for books and mempool data.
 *
 * Static methods use `https://api.morpho.org/v1/midnight` by default and accept
 * per-call configuration. Instances keep shared `baseUrl`, `fetch`, and request
 * options for integrations that make repeated calls.
 * Caller input and successful JSON output shapes are trusted at runtime;
 * returned TypeScript types model the API contract.
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
 * const api = new MidnightApi("https://api.morpho.org/v1/midnight");
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
   *   baseUrl: "https://api.morpho.org/v1/midnight",
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
    const input = params;
    const response = await requestMidnightApi<ApiBooksResponse>({
      ...input,
      method: "GET",
      path: "books",
      query: {
        sort: input.sort,
        maturities: input.maturities,
        collateral_tokens: input.collateralTokens,
        loan_tokens: input.loanTokens,
        chain_ids: input.chainIds,
        ids: input.marketIds,
        limit: input.limit,
        cursor: input.cursor,
      },
    });

    return {
      cursor: response.cursor,
      data: response.data.map(mapBookMarket),
    };
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
    const input = params;
    const response = await requestMidnightApi<ApiBookResponse>({
      ...input,
      method: "GET",
      path: buildBookPath({ marketId: input.marketId }),
      query: {
        depth: input.depth,
      },
    });

    return {
      data: mapBookMarket(response.data),
    };
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
    const input = params;
    const response = await requestMidnightApi<ApiPriceLevelsResponse>({
      ...input,
      method: "GET",
      path: buildBookPath({ marketId: input.marketId, side: input.side }),
      query: {
        depth: input.depth,
      },
    });

    return {
      data: response.data.map(mapPriceLevel),
    };
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
    const input = params;
    const response = await requestMidnightApi<ApiBookTakeableOffersResponse>({
      ...input,
      method: "GET",
      path: buildBookPath({
        marketId: input.marketId,
        side: input.side,
        suffix: "takeable-offers",
      }),
    });

    return {
      data: response.data.map(mapTakeableOffer),
    };
  }

  /**
   * Fetches a bundle-ready quote for one side of a Midnight book.
   *
   * @param params - Market id, side, target size, price guard, and optional request configuration.
   * @returns Quote and signed takeable-offer caps mapped to SDK camelCase fields.
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
    const input = params;
    const response = await requestMidnightApi<ApiQuoteResponse>({
      ...input,
      method: "GET",
      path: buildBookPath({
        marketId: input.marketId,
        side: input.side,
        suffix: "quote",
      }),
      query: {
        average_worst_price: input.averageWorstPrice,
        slippage: input.slippage,
        units: input.units,
        assets: input.assets,
      },
    });

    const takeableOffers = response.data.takeable_offers.map(mapTakeableOffer);

    return {
      data: {
        averageBestPrice: response.data.average_best_price,
        averageWorstPrice: response.data.average_worst_price,
        availableAssets: response.data.available_assets,
        availableUnits: response.data.available_units,
        takeableOffers,
      },
    };
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
    const input = params;
    const response = await requestMidnightApi<ApiTakeableOffersResponse>({
      ...input,
      method: "GET",
      path: "takeable-offers",
      query: {
        maker: input.maker,
        market_ids: input.marketIds,
        groups: input.groups,
        limit: input.limit,
        cursor: input.cursor,
      },
    });

    return {
      cursor: response.cursor,
      data: response.data.map(mapTakeableOffer),
    };
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
    const input = params;
    const response = await requestMidnightApi({
      ...input,
      method: "POST",
      path: "mempool/validate",
      query: {
        timestamp: input.timestamp,
      },
      body: {
        chain_id: input.chainId,
        payload: input.payload,
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
   *   items: [{ offer: {} as never, group: "0x00" as never, ratifierData: "0x" }],
   * });
   * console.log(validation.valid);
   * ```
   */
  public static async validateMempoolItems(
    params: ValidateMempoolItemsParams,
  ): Promise<MempoolPayloadValidationResult> {
    const input = params;
    const payload = await encodePayload(input.items);

    return MidnightApi.validateMempoolPayload({
      baseUrl: input.baseUrl,
      fetch: input.fetch,
      request: input.request,
      chainId: input.chainId,
      timestamp: input.timestamp,
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
   *   tree: [{} as never],
   * });
   * console.log(validation.valid);
   * ```
   */
  public static async validateMempoolTree(
    params: ValidateMempoolTreeParams,
  ): Promise<MempoolPayloadValidationResult> {
    const input = params;
    const tree = OfferTreeUtils.normalizeTree(input.tree);

    return MidnightApi.validateMempoolItems({
      baseUrl: input.baseUrl,
      fetch: input.fetch,
      request: input.request,
      chainId: input.chainId,
      timestamp: input.timestamp,
      items: tree.groups.flatMap((group) =>
        group.offers.map((offer) => ({
          offer,
          group: group.id,
          ratifierData: "0x" as const,
        })),
      ),
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
    const input = params;
    const response = await requestMidnightApi({
      ...input,
      method: "GET",
      path: "mempool/rules",
      query: {
        timestamp: input.timestamp,
        chain_ids: input.chainIds,
        types: input.types,
        limit: input.limit,
        cursor: input.cursor,
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
    params: MidnightApiClientParams<FetchBooksParams> = {},
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
    params: MidnightApiClientParams<FetchBookParams>,
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
    params: MidnightApiClientParams<FetchBookPriceLevelsParams>,
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
    params: MidnightApiClientParams<FetchBookTakeableOffersParams>,
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
   * @returns Quote and signed takeable-offer caps mapped to SDK camelCase fields.
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
   * console.log(quote.data.takeableOffers.length);
   * ```
   */
  public fetchBookQuote(
    params: MidnightApiClientParams<FetchBookQuoteParams>,
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
    params: MidnightApiClientParams<FetchTakeableOffersParams>,
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
    params: MidnightApiClientParams<ValidateMempoolPayloadParams>,
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
   *   items: [{ offer: {} as never, group: "0x00" as never, ratifierData: "0x" }],
   * });
   * console.log(validation.valid);
   * ```
   */
  public validateMempoolItems(
    params: MidnightApiClientParams<ValidateMempoolItemsParams>,
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
   * const validation = await api.validateMempoolTree({ chainId: 8453, tree: [{} as never] });
   * console.log(validation.valid);
   * ```
   */
  public validateMempoolTree(
    params: MidnightApiClientParams<ValidateMempoolTreeParams>,
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
    params: MidnightApiClientParams<FetchMempoolRulesParams> = {},
  ): Promise<MempoolRulesResult> {
    return MidnightApi.fetchMempoolRules({
      ...this.config,
      ...params,
    });
  }
}
