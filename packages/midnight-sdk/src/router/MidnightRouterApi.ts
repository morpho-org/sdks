import {
  InvalidMidnightRouterResponseError,
  MidnightRouterApiError,
} from "../errors.js";
import { Tree, type TreeInput } from "../signatures/OfferTree.js";
import type {
  Payload as MidnightPayload,
  Item as MidnightPayloadItem,
} from "../signatures/Payload.js";
import { encode as encodePayload } from "../signatures/Payload.js";
import { MIDNIGHT_SDK_VERSION } from "../version.js";

const DEFAULT_ROUTER_API_URL = new URL("https://router.morpho.org");

/**
 * Fetch implementation used by Midnight router API helpers.
 *
 * @example
 * ```ts
 * import type { MidnightRouterFetch } from "@morpho-org/midnight-sdk";
 *
 * const routerFetch: MidnightRouterFetch = fetch;
 * console.log(typeof routerFetch);
 * ```
 */
export type MidnightRouterFetch = typeof fetch;

/**
 * Request options forwarded to Midnight router API calls.
 *
 * The SDK owns `method` and `body`; callers can still pass headers, abort
 * signals, credentials, cache settings, and other fetch options.
 *
 * @example
 * ```ts
 * import type { MidnightRouterRequestOptions } from "@morpho-org/midnight-sdk";
 *
 * const request: MidnightRouterRequestOptions = {
 *   credentials: "include",
 * };
 * console.log(request.credentials);
 * ```
 */
export type MidnightRouterRequestOptions = Omit<RequestInit, "method" | "body">;

/**
 * Shared configuration for Midnight router API calls.
 *
 * @example
 * ```ts
 * import type { MidnightRouterApiConfig } from "@morpho-org/midnight-sdk";
 *
 * const config: MidnightRouterApiConfig = {
 *   baseUrl: "https://router.morpho.org",
 * };
 * console.log(config.baseUrl);
 * ```
 */
export interface MidnightRouterApiConfig {
  /** Router API base URL. Defaults to `https://router.morpho.org`. */
  readonly baseUrl?: string | URL;
  /** Fetch implementation. Defaults to the global `fetch`. */
  readonly fetch?: MidnightRouterFetch;
  /** Additional fetch options forwarded to the request. */
  readonly request?: MidnightRouterRequestOptions;
}

/**
 * Parameters for {@link MidnightRouterApi.validateMempoolPayload}.
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
export interface ValidateMempoolPayloadParams extends MidnightRouterApiConfig {
  /** Chain id whose router policy should validate the payload. */
  readonly chainId: number;
  /** Encoded Midnight mempool payload bytes. */
  readonly payload: MidnightPayload;
  /** Optional ISO-8601 timestamp or `Date` selecting the router policy snapshot. */
  readonly timestamp?: string | Date;
}

/**
 * Parameters for {@link MidnightRouterApi.validateMempoolItems}.
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
export interface ValidateMempoolItemsParams extends MidnightRouterApiConfig {
  /** Chain id whose router policy should validate the payload. */
  readonly chainId: number;
  /** SDK-native payload items to encode before router validation. */
  readonly items: readonly MidnightPayloadItem[];
  /** Optional ISO-8601 timestamp or `Date` selecting the router policy snapshot. */
  readonly timestamp?: string | Date;
}

/**
 * Parameters for {@link MidnightRouterApi.validateMempoolTree}.
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
export interface ValidateMempoolTreeParams extends MidnightRouterApiConfig {
  /** Chain id whose router policy should validate the tree. */
  readonly chainId: number;
  /** Offer tree to validate before ratifier data or payload publication exists. */
  readonly tree: TreeInput;
  /** Optional ISO-8601 timestamp or `Date` selecting the router policy snapshot. */
  readonly timestamp?: string | Date;
}

/**
 * Parameters for {@link MidnightRouterApi.fetchMempoolRules}.
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
export interface FetchMempoolRulesParams extends MidnightRouterApiConfig {
  /** Optional chain-id filter. Serialized as comma-separated `chain_ids`. */
  readonly chainIds?: readonly number[];
  /** Optional router rule type filter. Serialized as comma-separated `types`. */
  readonly types?: readonly string[];
  /** Optional ISO-8601 timestamp or `Date` selecting the router policy snapshot. */
  readonly timestamp?: string | Date;
  /** Maximum number of rules to return. */
  readonly limit?: number;
  /** Opaque pagination cursor from a previous response. */
  readonly cursor?: string;
}

/**
 * One router validation issue.
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
  /** Router rule violated by the payload. */
  readonly rule: string;
}

/**
 * SDK-shaped result returned by Midnight mempool validation.
 *
 * @example
 * ```ts
 * import type { MempoolPayloadValidationResult } from "@morpho-org/midnight-sdk";
 *
 * const result: MempoolPayloadValidationResult = {
 *   payload: "0x0100000000",
 *   valid: true,
 *   issues: [],
 * };
 * console.log(result.valid);
 * ```
 */
export interface MempoolPayloadValidationResult {
  /** Encoded payload that was validated. */
  readonly payload: MidnightPayload;
  /** Whether the router returned zero validation issues. */
  readonly valid: boolean;
  /** Payload-level router issues. */
  readonly issues: readonly MempoolPayloadValidationIssue[];
}

/**
 * One SDK-shaped Midnight router mempool rule.
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
  /** Router rule type. */
  readonly type: string;
  /** Chain id the rule applies to. */
  readonly chainId: number;
  /** Rule name, when returned by the router. */
  readonly name?: string;
  /** Rule timestamp, when returned by the router. */
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
  /** Rule description, when returned by the router. */
  readonly description?: string;
}

/**
 * SDK-shaped paginated Midnight router mempool rules result.
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
  /** Router rules mapped to SDK camelCase fields. */
  readonly data: readonly MempoolRule[];
}

type RouterMethod = "GET" | "POST";

type QueryValue =
  | string
  | number
  | Date
  | readonly string[]
  | readonly number[]
  | undefined;

type RouterRequestParams = MidnightRouterApiConfig & {
  readonly method: RouterMethod;
  readonly path: string;
  readonly query?: Readonly<Record<string, QueryValue>>;
  readonly body?: unknown;
};

type RouterErrorEnvelope = {
  readonly code?: string;
  readonly message?: string;
  readonly details?: unknown;
  readonly requestId?: string;
};

/**
 * API helpers for the Midnight router mempool validation surface.
 *
 * @example
 * ```ts
 * import { MidnightRouterApi } from "@morpho-org/midnight-sdk";
 *
 * const result = await MidnightRouterApi.validateMempoolPayload({
 *   chainId: 8453,
 *   payload: "0x0100000000",
 * });
 * console.log(result.valid);
 * ```
 */
export namespace MidnightRouterApi {
  /**
   * Validates an encoded Midnight mempool payload against router policy.
   *
   * @param params - Validation parameters and optional request configuration.
   * @returns The validated payload plus router issues and `valid` summary.
   * @throws MidnightRouterApiError when the router returns a non-2xx response.
   * @throws InvalidMidnightRouterResponseError when the router returns malformed success JSON.
   * @example
   * ```ts
   * import { MidnightRouterApi } from "@morpho-org/midnight-sdk";
   *
   * const validation = await MidnightRouterApi.validateMempoolPayload({
   *   chainId: 8453,
   *   payload: "0x0100000000",
   * });
   * console.log(validation.valid);
   * ```
   */
  export async function validateMempoolPayload(
    params: ValidateMempoolPayloadParams,
  ): Promise<MempoolPayloadValidationResult> {
    const response = await requestRouter({
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

    return parseValidationResponse(response, params.payload);
  }

  /**
   * Encodes SDK-native payload items and validates them against router policy.
   *
   * @param params - Validation parameters and optional request configuration.
   * @returns The encoded payload plus router issues and `valid` summary.
   * @throws Payload.DecodeError when item encoding fails.
   * @throws MidnightRouterApiError when the router returns a non-2xx response.
   * @throws InvalidMidnightRouterResponseError when the router returns malformed success JSON.
   * @example
   * ```ts
   * import { MidnightRouterApi } from "@morpho-org/midnight-sdk";
   *
   * const validation = await MidnightRouterApi.validateMempoolItems({
   *   chainId: 8453,
   *   items: [{ offer: {} as never, ratifierData: "0x" }],
   * });
   * console.log(validation.payload);
   * ```
   */
  export async function validateMempoolItems(
    params: ValidateMempoolItemsParams,
  ): Promise<MempoolPayloadValidationResult> {
    const payload = await encodePayload(params.items);

    return validateMempoolPayload({
      ...params,
      payload,
    });
  }

  /**
   * Validates an offer tree before wallet signature or root approval.
   *
   * Router policy only inspects offer contents, so this helper encodes each
   * tree leaf with empty `ratifierData` and keeps payload bytes at the edge.
   *
   * @param params - Validation parameters and optional request configuration.
   * @returns The encoded validation payload plus router issues and `valid` summary.
   * @throws Payload.DecodeError when validation payload encoding fails.
   * @throws MidnightRouterApiError when the router returns a non-2xx response.
   * @throws InvalidMidnightRouterResponseError when the router returns malformed success JSON.
   * @example
   * ```ts
   * import { MidnightRouterApi } from "@morpho-org/midnight-sdk";
   *
   * const validation = await MidnightRouterApi.validateMempoolTree({
   *   chainId: 8453,
   *   tree: { groups: [[{} as never]] },
   * });
   * console.log(validation.valid);
   * ```
   */
  export async function validateMempoolTree(
    params: ValidateMempoolTreeParams,
  ): Promise<MempoolPayloadValidationResult> {
    const tree = Tree.from(params.tree);

    return validateMempoolItems({
      ...params,
      items: tree.offers.map((offer) => ({ offer, ratifierData: "0x" })),
    });
  }

  /**
   * Fetches inspectable Midnight router mempool policy rules.
   *
   * @param params - Rule filters, pagination, and optional request configuration.
   * @returns Paginated router rules mapped to SDK camelCase fields.
   * @throws MidnightRouterApiError when the router returns a non-2xx response.
   * @throws InvalidMidnightRouterResponseError when the router returns malformed success JSON.
   * @example
   * ```ts
   * import { MidnightRouterApi } from "@morpho-org/midnight-sdk";
   *
   * const rules = await MidnightRouterApi.fetchMempoolRules({
   *   chainIds: [8453],
   *   types: ["tick_spacing"],
   * });
   * console.log(rules.data[0]?.type);
   * ```
   */
  export async function fetchMempoolRules(
    params: FetchMempoolRulesParams = {},
  ): Promise<MempoolRulesResult> {
    const response = await requestRouter({
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
}

/**
 * Stateful convenience wrapper for Midnight router API calls.
 *
 * @example
 * ```ts
 * import { Api } from "@morpho-org/midnight-sdk";
 *
 * const api = Api.init();
 * const validation = await api.validate({ chainId: 8453, tree: { groups: [[{} as never]] } });
 * console.log(validation.valid);
 * ```
 */
export class Api {
  private readonly config: MidnightRouterApiConfig;

  private constructor(config: MidnightRouterApiConfig = {}) {
    this.config = config;
  }

  /**
   * Creates a configured Midnight router API wrapper.
   *
   * @param config - Router API configuration shared by instance methods.
   * @returns API wrapper.
   * @example
   * ```ts
   * import { Api } from "@morpho-org/midnight-sdk";
   *
   * const api = Api.init({ baseUrl: "https://router.morpho.org" });
   * console.log(api);
   * ```
   */
  public static init(config: MidnightRouterApiConfig = {}): Api {
    return new Api(config);
  }

  /**
   * Validates an offer tree before ratifier data or payload publication exists.
   *
   * @param params - Tree validation parameters.
   * @returns The encoded validation payload plus router issues and `valid` summary.
   * @example
   * ```ts
   * import { Api } from "@morpho-org/midnight-sdk";
   *
   * const validation = await Api.init().validate({ chainId: 8453, tree: { groups: [[{} as never]] } });
   * console.log(validation.valid);
   * ```
   */
  public validate(
    params: Omit<ValidateMempoolTreeParams, keyof MidnightRouterApiConfig>,
  ): Promise<MempoolPayloadValidationResult> {
    return MidnightRouterApi.validateMempoolTree({
      ...this.config,
      ...params,
    });
  }

  /**
   * Validates an already encoded mempool payload.
   *
   * @param params - Payload validation parameters.
   * @returns Router validation result.
   * @example
   * ```ts
   * import { Api } from "@morpho-org/midnight-sdk";
   *
   * const validation = await Api.init().validatePayload({ chainId: 8453, payload: "0x0100000000" });
   * console.log(validation.valid);
   * ```
   */
  public validatePayload(
    params: Omit<ValidateMempoolPayloadParams, keyof MidnightRouterApiConfig>,
  ): Promise<MempoolPayloadValidationResult> {
    return MidnightRouterApi.validateMempoolPayload({
      ...this.config,
      ...params,
    });
  }

  /**
   * Validates payload-ready items.
   *
   * @param params - Item validation parameters.
   * @returns Router validation result.
   * @example
   * ```ts
   * import { Api } from "@morpho-org/midnight-sdk";
   *
   * const validation = await Api.init().validateItems({
   *   chainId: 8453,
   *   items: [{ offer: {} as never, ratifierData: "0x" }],
   * });
   * console.log(validation.valid);
   * ```
   */
  public validateItems(
    params: Omit<ValidateMempoolItemsParams, keyof MidnightRouterApiConfig>,
  ): Promise<MempoolPayloadValidationResult> {
    return MidnightRouterApi.validateMempoolItems({
      ...this.config,
      ...params,
    });
  }

  /**
   * Fetches inspectable Midnight router mempool policy rules.
   *
   * @param params - Rule filters and pagination.
   * @returns Paginated router rules mapped to SDK camelCase fields.
   * @example
   * ```ts
   * import { Api } from "@morpho-org/midnight-sdk";
   *
   * const rules = await Api.init().fetchRules({ chainIds: [8453] });
   * console.log(rules.data.length);
   * ```
   */
  public fetchRules(
    params: Omit<FetchMempoolRulesParams, keyof MidnightRouterApiConfig> = {},
  ): Promise<MempoolRulesResult> {
    return MidnightRouterApi.fetchMempoolRules({
      ...this.config,
      ...params,
    });
  }
}

async function requestRouter(params: RouterRequestParams): Promise<unknown> {
  const url = buildRouterUrl({
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
    const envelope = parseRouterErrorEnvelope(json);
    throw new MidnightRouterApiError({
      status: response.status,
      code: envelope.code,
      message: envelope.message,
      details: envelope.details,
      requestId: envelope.requestId,
    });
  }

  return json;
}

function buildRouterUrl(params: {
  readonly baseUrl?: string | URL;
  readonly path: string;
  readonly query?: Readonly<Record<string, QueryValue>>;
}) {
  const baseUrl = buildRouterBaseUrl(params.baseUrl);
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

function buildRouterBaseUrl(input?: string | URL) {
  const baseUrl = new URL(input ?? DEFAULT_ROUTER_API_URL);
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
      throw new InvalidMidnightRouterResponseError(
        "Midnight router success response did not contain valid JSON.",
        { cause: error },
      );
    }
    return undefined;
  }
}

function parseRouterErrorEnvelope(json: unknown): RouterErrorEnvelope {
  if (!isRecord(json) || !isRecord(json.error)) return {};

  return {
    code: readRouterErrorString(json.error, "code"),
    message: readRouterErrorString(json.error, "message"),
    details: "details" in json.error ? json.error.details : undefined,
    requestId: readRouterErrorString(json.error, "request_id"),
  };
}

function readRouterErrorString(
  record: Readonly<Record<string, unknown>>,
  key: string,
) {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function parseValidationResponse(
  json: unknown,
  payload: MidnightPayload,
): MempoolPayloadValidationResult {
  const response = requireRecord(json, "validation response");
  const data = requireRecord(response.data, "validation response data");
  if (!Array.isArray(data.issues)) {
    throw new InvalidMidnightRouterResponseError(
      'Midnight router validation response is missing "data.issues".',
    );
  }

  const issues = data.issues.map(parseValidationIssue);

  return {
    payload,
    valid: issues.length === 0,
    issues,
  };
}

function parseValidationIssue(issue: unknown): MempoolPayloadValidationIssue {
  const record = requireRecord(issue, "validation issue");
  const rule = record.rule;
  if (typeof rule !== "string") {
    throw new InvalidMidnightRouterResponseError(
      'Midnight router validation issue is missing "rule".',
    );
  }

  return { rule };
}

function parseRulesResponse(json: unknown): MempoolRulesResult {
  const response = requireRecord(json, "rules response");
  const cursor = response.cursor;
  if (cursor !== null && typeof cursor !== "string") {
    throw new InvalidMidnightRouterResponseError(
      'Midnight router rules response has invalid "cursor".',
    );
  }
  if (!Array.isArray(response.data)) {
    throw new InvalidMidnightRouterResponseError(
      'Midnight router rules response is missing "data".',
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
  throw new InvalidMidnightRouterResponseError(
    `Midnight router ${context} is malformed.`,
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
  throw new InvalidMidnightRouterResponseError(
    `Midnight router ${params.context} is missing "${params.key}".`,
  );
}

function requireNumber(params: {
  readonly record: Readonly<Record<string, unknown>>;
  readonly key: string;
  readonly context: string;
}) {
  const value = params.record[params.key];
  if (typeof value === "number") return value;
  throw new InvalidMidnightRouterResponseError(
    `Midnight router ${params.context} is missing "${params.key}".`,
  );
}

function readOptionalString(
  record: Readonly<Record<string, unknown>>,
  key: string,
) {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;
  throw new InvalidMidnightRouterResponseError(
    `Midnight router response field "${key}" must be a string.`,
  );
}

function readOptionalNumber(
  record: Readonly<Record<string, unknown>>,
  key: string,
) {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value === "number") return value;
  throw new InvalidMidnightRouterResponseError(
    `Midnight router response field "${key}" must be a number.`,
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
  throw new InvalidMidnightRouterResponseError(
    `Midnight router response field "${key}" must be a string array.`,
  );
}

function isStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.every((item: unknown) => typeof item === "string")
  );
}
