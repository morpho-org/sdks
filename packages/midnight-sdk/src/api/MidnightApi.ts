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

type ApiMethod = "GET" | "POST";

type QueryValue =
  | string
  | number
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

type MidnightApiConstructorConfig = MidnightApiConfig | string | URL;

/**
 * Midnight API client and stateless helper surface for mempool validation.
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

async function requestMidnightApi(params: ApiRequestParams): Promise<unknown> {
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

  return json;
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
