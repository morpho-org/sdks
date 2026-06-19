import { encode as encodePayload } from "../signatures/Payload.js";
import {
  buildBookPath,
  mapBookMarket,
  mapPriceLevel,
  mapTakeableOffer,
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
  FetchTakeableOffersParams,
  MempoolPayloadValidationResult,
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
} from "./types.js";

export type {
  FetchBookParams,
  FetchBookPriceLevelsParams,
  FetchBookQuoteParams,
  FetchBooksParams,
  FetchBookTakeableOffersParams,
  FetchTakeableOffersParams,
  MempoolPayloadValidationIssue,
  MempoolPayloadValidationResult,
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
  MidnightApiTake,
  MidnightApiTakeableOffersResult,
  ValidateMempoolItemsParams,
  ValidateMempoolPayloadParams,
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
 * import { MidnightApi } from "@morpho-org/midnight-sdk/api";
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
   * @param config.baseUrl - Optional Midnight API base URL.
   * @param config.fetch - Optional fetch implementation used for all instance calls.
   * @param config.request - Optional fetch options forwarded to all instance calls.
   * @returns Configured Midnight API client.
   * @example
   * ```ts
   * import { MidnightApi } from "@morpho-org/midnight-sdk/api";
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
   * Reads `GET /books` from the Midnight API. Does not read onchain RPC state.
   *
   * @param params.sort - Optional book sort terms.
   * @param params.maturities - Optional exact maturity timestamp filters in unix seconds.
   * @param params.collateralTokens - Optional collateral token address filters.
   * @param params.loanTokens - Optional loan token address filters.
   * @param params.chainIds - Optional chain id filters.
   * @param params.marketIds - Optional market id filters.
   * @param params.limit - Optional maximum number of books to return.
   * @param params.cursor - Optional opaque pagination cursor from a previous response.
   * @param params.baseUrl - Optional Midnight API base URL override.
   * @param params.fetch - Optional fetch implementation override.
   * @param params.request - Optional fetch options forwarded to this request.
   * @returns Paginated books mapped to SDK camelCase fields.
   * @throws {MidnightApiError} when the API returns a non-2xx response.
   * @throws {InvalidMidnightApiResponseError} when the API success response is not JSON.
   * @example
   * ```ts
   * import { MidnightApi } from "@morpho-org/midnight-sdk/api";
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
   * Reads `GET /books/{marketId}` from the Midnight API. Does not read onchain RPC state.
   *
   * @param params.marketId - Market id whose book to read.
   * @param params.depth - Optional maximum levels returned per side.
   * @param params.baseUrl - Optional Midnight API base URL override.
   * @param params.fetch - Optional fetch implementation override.
   * @param params.request - Optional fetch options forwarded to this request.
   * @returns Book snapshot mapped to SDK camelCase fields.
   * @throws {MidnightApiError} when the API returns a non-2xx response.
   * @throws {InvalidMidnightApiResponseError} when the API success response is not JSON.
   * @example
   * ```ts
   * import { MidnightApi } from "@morpho-org/midnight-sdk/api";
   *
   * const book = await MidnightApi.fetchBook({
   *   marketId: "0x12590ae1aee324a005be565f3bcdd16dbf8daf7969b26c181c8b8f467dad9f67",
   * });
   * console.log(book.data.marketId);
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
   * Reads `GET /books/{marketId}/{side}` from the Midnight API. Does not read onchain RPC state.
   *
   * @param params.marketId - Market id whose book side to read.
   * @param params.side - Book side to query.
   * @param params.depth - Optional maximum levels returned.
   * @param params.baseUrl - Optional Midnight API base URL override.
   * @param params.fetch - Optional fetch implementation override.
   * @param params.request - Optional fetch options forwarded to this request.
   * @returns Price levels mapped to SDK camelCase fields.
   * @throws {MidnightApiError} when the API returns a non-2xx response.
   * @throws {InvalidMidnightApiResponseError} when the API success response is not JSON.
   * @example
   * ```ts
   * import { MidnightApi } from "@morpho-org/midnight-sdk/api";
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
   * Reads `GET /books/{marketId}/{side}/takeable-offers` from the Midnight API. Does not read onchain RPC state.
   *
   * @param params.marketId - Market id whose book side to read.
   * @param params.side - Book side to query.
   * @param params.baseUrl - Optional Midnight API base URL override.
   * @param params.fetch - Optional fetch implementation override.
   * @param params.request - Optional fetch options forwarded to this request.
   * @returns ABI-ready take objects mapped from the API response.
   * @throws {MidnightApiError} when the API returns a non-2xx response.
   * @throws {InvalidMidnightApiResponseError} when the API success response is not JSON.
   * @example
   * ```ts
   * import { MidnightApi } from "@morpho-org/midnight-sdk/api";
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
   * Reads `GET /books/{marketId}/{side}/quote` from the Midnight API. Does not read onchain RPC state.
   *
   * @param params.marketId - Market id whose book side to quote.
   * @param params.side - Book side to quote.
   * @param params.assets - Optional maker-side target assets amount. Mutually exclusive with `params.units`.
   * @param params.units - Optional target unit amount. Mutually exclusive with `params.assets`.
   * @param params.averageWorstPrice - Optional WAD-scaled average worst price guard. Mutually exclusive with `params.slippage`.
   * @param params.slippage - Optional slippage percentage used to derive the guard. Mutually exclusive with `params.averageWorstPrice`.
   * @param params.baseUrl - Optional Midnight API base URL override.
   * @param params.fetch - Optional fetch implementation override.
   * @param params.request - Optional fetch options forwarded to this request.
   * @returns Quote and signed ABI-ready take caps mapped from the API response.
   * @throws {MidnightApiError} when the API returns a non-2xx response.
   * @throws {InvalidMidnightApiResponseError} when the API success response is not JSON.
   * @example
   * ```ts
   * import { MidnightApi } from "@morpho-org/midnight-sdk/api";
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
   * Reads `GET /takeable-offers` from the Midnight API. Does not read onchain RPC state.
   *
   * @param params.maker - Maker EVM address.
   * @param params.marketIds - Optional market id filters.
   * @param params.groups - Optional group id filters.
   * @param params.limit - Optional maximum number of offers to return.
   * @param params.cursor - Optional opaque pagination cursor from a previous response.
   * @param params.baseUrl - Optional Midnight API base URL override.
   * @param params.fetch - Optional fetch implementation override.
   * @param params.request - Optional fetch options forwarded to this request.
   * @returns Paginated ABI-ready take objects mapped from the API response.
   * @throws {MidnightApiError} when the API returns a non-2xx response.
   * @throws {InvalidMidnightApiResponseError} when the API success response is not JSON.
   * @example
   * ```ts
   * import { MidnightApi } from "@morpho-org/midnight-sdk/api";
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
   * Use when an integration already has encoded payload bytes and wants API
   * feedback before publishing those bytes onchain. Normal SDK maker flows
   * should call `Tree.mempoolValidate` before ratification instead of
   * validating again after `Payload.encode`.
   *
   * Sends `POST /mempool/validate` to the Midnight API. Does not read onchain RPC state.
   *
   * @param params.chainId - Chain id whose API policy should validate the payload.
   * @param params.payload - Encoded Midnight mempool payload bytes.
   * @param params.timestamp - Optional ISO-8601 timestamp or `Date` selecting the API policy snapshot.
   * @param params.baseUrl - Optional Midnight API base URL override.
   * @param params.fetch - Optional fetch implementation override.
   * @param params.request - Optional fetch options forwarded to this request.
   * @returns API issues and `valid` summary.
   * @throws {MidnightApiError} when the API returns a non-2xx response.
   * @throws {InvalidMidnightApiResponseError} when the API returns malformed success JSON.
   * @example
   * ```ts
   * import { MidnightApi } from "@morpho-org/midnight-sdk/api";
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
   * Use when an integration already has payload-ready items but not encoded
   * payload bytes. Normal SDK maker flows should call `Tree.mempoolValidate`
   * before ratification. This helper owns the temporary payload encoding for
   * validation only.
   *
   * Encodes `params.items`, then sends `POST /mempool/validate` to the Midnight API. Does not read onchain RPC state.
   *
   * @param params.chainId - Chain id whose API policy should validate the payload.
   * @param params.items - SDK-native payload items to encode before API validation.
   * @param params.timestamp - Optional ISO-8601 timestamp or `Date` selecting the API policy snapshot.
   * @param params.baseUrl - Optional Midnight API base URL override.
   * @param params.fetch - Optional fetch implementation override.
   * @param params.request - Optional fetch options forwarded to this request.
   * @returns API issues and `valid` summary.
   * @throws {Payload.DecodeError} when item encoding fails.
   * @throws {MidnightApiError} when the API returns a non-2xx response.
   * @throws {InvalidMidnightApiResponseError} when the API returns malformed success JSON.
   * @example
   * ```ts
   * import { Offer } from "@morpho-org/midnight-sdk";
   * import { MidnightApi } from "@morpho-org/midnight-sdk/api";
   * import { zeroAddress } from "viem";
   *
   * const offer = Offer.create({
   *   market: {
   *     loanToken: "0x0000000000000000000000000000000000006000",
   *     collateralParams: [
   *       {
   *         token: "0x0000000000000000000000000000000000007000",
   *         lltv: 770000000000000000n,
   *         maxLif: 1061007957559681697n,
   *         oracle: "0x0000000000000000000000000000000000008000",
   *       },
   *     ],
   *     maturity: 54_000n,
   *     rcfThreshold: 0n,
   *     enterGate: zeroAddress,
   *     liquidatorGate: zeroAddress,
   *   },
   *   buy: true,
   *   maker: "0x0000000000000000000000000000000000009000",
   *   tick: 5_000n,
   *   expiry: 3_600n,
   *   ratifier: "0x0000000000000000000000000000000000004000",
   *   maxUnits: 100n,
   * });
   *
   * const validation = await MidnightApi.validateMempoolItems({
   *   chainId: 8453,
   *   items: [{ offer, ratifierData: "0x" }],
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
   * Fetches active Midnight books with this client's configuration.
   *
   * Reads `GET /books` from the Midnight API using this client's configuration. Does not read onchain RPC state.
   *
   * @param params.sort - Optional book sort terms.
   * @param params.maturities - Optional exact maturity timestamp filters in unix seconds.
   * @param params.collateralTokens - Optional collateral token address filters.
   * @param params.loanTokens - Optional loan token address filters.
   * @param params.chainIds - Optional chain id filters.
   * @param params.marketIds - Optional market id filters.
   * @param params.limit - Optional maximum number of books to return.
   * @param params.cursor - Optional opaque pagination cursor from a previous response.
   * @returns Paginated books mapped to SDK camelCase fields.
   * @throws {MidnightApiError} when the API returns a non-2xx response.
   * @throws {InvalidMidnightApiResponseError} when the API success response is not JSON.
   * @example
   * ```ts
   * import { MidnightApi } from "@morpho-org/midnight-sdk/api";
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
   * Reads `GET /books/{marketId}` from the Midnight API using this client's configuration. Does not read onchain RPC state.
   *
   * @param params.marketId - Market id whose book to read.
   * @param params.depth - Optional maximum levels returned per side.
   * @returns Book snapshot mapped to SDK camelCase fields.
   * @throws {MidnightApiError} when the API returns a non-2xx response.
   * @throws {InvalidMidnightApiResponseError} when the API success response is not JSON.
   * @example
   * ```ts
   * import { MidnightApi } from "@morpho-org/midnight-sdk/api";
   *
   * const api = new MidnightApi();
   * const book = await api.fetchBook({
   *   marketId: "0x12590ae1aee324a005be565f3bcdd16dbf8daf7969b26c181c8b8f467dad9f67",
   * });
   * console.log(book.data.marketId);
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
   * Reads `GET /books/{marketId}/{side}` from the Midnight API using this client's configuration. Does not read onchain RPC state.
   *
   * @param params.marketId - Market id whose book side to read.
   * @param params.side - Book side to query.
   * @param params.depth - Optional maximum levels returned.
   * @returns Price levels mapped to SDK camelCase fields.
   * @throws {MidnightApiError} when the API returns a non-2xx response.
   * @throws {InvalidMidnightApiResponseError} when the API success response is not JSON.
   * @example
   * ```ts
   * import { MidnightApi } from "@morpho-org/midnight-sdk/api";
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
   * Reads `GET /books/{marketId}/{side}/takeable-offers` from the Midnight API using this client's configuration. Does not read onchain RPC state.
   *
   * @param params.marketId - Market id whose book side to read.
   * @param params.side - Book side to query.
   * @returns ABI-ready take objects mapped from the API response.
   * @throws {MidnightApiError} when the API returns a non-2xx response.
   * @throws {InvalidMidnightApiResponseError} when the API success response is not JSON.
   * @example
   * ```ts
   * import { MidnightApi } from "@morpho-org/midnight-sdk/api";
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
   * Reads `GET /books/{marketId}/{side}/quote` from the Midnight API using this client's configuration. Does not read onchain RPC state.
   *
   * @param params.marketId - Market id whose book side to quote.
   * @param params.side - Book side to quote.
   * @param params.assets - Optional maker-side target assets amount. Mutually exclusive with `params.units`.
   * @param params.units - Optional target unit amount. Mutually exclusive with `params.assets`.
   * @param params.averageWorstPrice - Optional WAD-scaled average worst price guard. Mutually exclusive with `params.slippage`.
   * @param params.slippage - Optional slippage percentage used to derive the guard. Mutually exclusive with `params.averageWorstPrice`.
   * @returns Quote and signed ABI-ready take caps mapped from the API response.
   * @throws {MidnightApiError} when the API returns a non-2xx response.
   * @throws {InvalidMidnightApiResponseError} when the API success response is not JSON.
   * @example
   * ```ts
   * import { MidnightApi } from "@morpho-org/midnight-sdk/api";
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
   * Reads `GET /takeable-offers` from the Midnight API using this client's configuration. Does not read onchain RPC state.
   *
   * @param params.maker - Maker EVM address.
   * @param params.marketIds - Optional market id filters.
   * @param params.groups - Optional group id filters.
   * @param params.limit - Optional maximum number of offers to return.
   * @param params.cursor - Optional opaque pagination cursor from a previous response.
   * @returns Paginated ABI-ready take objects mapped from the API response.
   * @throws {MidnightApiError} when the API returns a non-2xx response.
   * @throws {InvalidMidnightApiResponseError} when the API success response is not JSON.
   * @example
   * ```ts
   * import { MidnightApi } from "@morpho-org/midnight-sdk/api";
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
   * Use when an integration already has encoded payload bytes and wants API
   * feedback before publishing those bytes onchain. Normal SDK maker flows
   * should call `Tree.mempoolValidate` before ratification instead of
   * validating again after `Payload.encode`.
   *
   * Sends `POST /mempool/validate` to the Midnight API using this client's configuration. Does not read onchain RPC state.
   *
   * @param params.chainId - Chain id whose API policy should validate the payload.
   * @param params.payload - Encoded Midnight mempool payload bytes.
   * @param params.timestamp - Optional ISO-8601 timestamp or `Date` selecting the API policy snapshot.
   * @returns API validation result.
   * @throws {MidnightApiError} when the API returns a non-2xx response.
   * @throws {InvalidMidnightApiResponseError} when the API returns malformed success JSON.
   * @example
   * ```ts
   * import { MidnightApi } from "@morpho-org/midnight-sdk/api";
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
   * Use when an integration already has payload-ready items but not encoded
   * payload bytes. Normal SDK maker flows should call `Tree.mempoolValidate`
   * before ratification.
   *
   * Encodes `params.items`, then sends `POST /mempool/validate` to the Midnight API using this client's configuration. Does not read onchain RPC state.
   *
   * @param params.chainId - Chain id whose API policy should validate the payload.
   * @param params.items - SDK-native payload items to encode before API validation.
   * @param params.timestamp - Optional ISO-8601 timestamp or `Date` selecting the API policy snapshot.
   * @returns API validation result.
   * @throws {Payload.DecodeError} when item encoding fails.
   * @throws {MidnightApiError} when the API returns a non-2xx response.
   * @throws {InvalidMidnightApiResponseError} when the API returns malformed success JSON.
   * @example
   * ```ts
   * import { Offer } from "@morpho-org/midnight-sdk";
   * import { MidnightApi } from "@morpho-org/midnight-sdk/api";
   * import { zeroAddress } from "viem";
   *
   * const api = new MidnightApi();
   * const offer = Offer.create({
   *   market: {
   *     loanToken: "0x0000000000000000000000000000000000006000",
   *     collateralParams: [
   *       {
   *         token: "0x0000000000000000000000000000000000007000",
   *         lltv: 770000000000000000n,
   *         maxLif: 1061007957559681697n,
   *         oracle: "0x0000000000000000000000000000000000008000",
   *       },
   *     ],
   *     maturity: 54_000n,
   *     rcfThreshold: 0n,
   *     enterGate: zeroAddress,
   *     liquidatorGate: zeroAddress,
   *   },
   *   buy: true,
   *   maker: "0x0000000000000000000000000000000000009000",
   *   tick: 5_000n,
   *   expiry: 3_600n,
   *   ratifier: "0x0000000000000000000000000000000000004000",
   *   maxUnits: 100n,
   * });
   * const validation = await api.validateMempoolItems({
   *   chainId: 8453,
   *   items: [{ offer, ratifierData: "0x" }],
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
}
