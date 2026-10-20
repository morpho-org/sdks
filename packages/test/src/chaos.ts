import { AssertionError } from "node:assert";
import type {
  ClientRequest,
  IncomingMessage,
  Server,
  ServerResponse,
} from "node:http";
import { createServer, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { AddressInfo, Socket } from "node:net";
import { RpcError, RpcRequestError } from "viem";
import { FaultProxyInternalError } from "./errors.js";

export { FaultProxyInternalError };

/**
 * Describes one fault applied to an HTTP JSON-RPC request or call.
 */
export type Fault =
  | { readonly kind: "refuse" }
  | { readonly kind: "status"; readonly status: number; readonly body?: string }
  | { readonly kind: "rawBody"; readonly body: string }
  | {
      readonly kind: "rpcError";
      readonly code: number;
      readonly message: string;
      readonly data?: unknown;
    }
  | { readonly kind: "forwardThenDrop" };

/**
 * Creates frozen fault descriptions for a JSON-RPC fault proxy.
 */
export const fault = Object.freeze({
  /**
   * Creates a fault that destroys the client socket without responding.
   *
   * @returns A frozen connection-refusal fault.
   * @example
   * ```ts
   * import { fault } from "@morpho-org/test/chaos";
   *
   * const refusal = fault.refuse();
   * // { kind: "refuse" }
   * ```
   */
  refuse: (): Fault => Object.freeze({ kind: "refuse" }),
  /**
   * Creates a fault that returns an HTTP status and optional raw body.
   *
   * @param status - HTTP status sent to the client.
   * @param body - Optional response body; defaults to an empty string.
   * @returns A frozen HTTP-status fault.
   * @throws {RangeError} when status is not an integer from 100 through 999.
   * @example
   * ```ts
   * import { fault } from "@morpho-org/test/chaos";
   *
   * const rateLimit = fault.status(429, "too many requests");
   * // { kind: "status", status: 429, body: "too many requests" }
   * ```
   */
  status: (status: number, body?: string): Fault => {
    if (!Number.isInteger(status) || status < 100 || status > 999) {
      throw new RangeError("status must be an integer from 100 through 999");
    }
    return Object.freeze({
      kind: "status",
      status,
      ...(body === undefined ? {} : { body }),
    });
  },
  /**
   * Creates a fault that returns a raw HTTP 200 JSON response body.
   *
   * @param body - Response body sent verbatim with a JSON content type.
   * @returns A frozen raw-body fault.
   * @example
   * ```ts
   * import { fault } from "@morpho-org/test/chaos";
   *
   * const malformed = fault.rawBody("{not json");
   * // { kind: "rawBody", body: "{not json" }
   * ```
   */
  rawBody: (body: string): Fault => Object.freeze({ kind: "rawBody", body }),
  /**
   * Creates a fault that returns a JSON-RPC error for a call.
   *
   * @param code - JSON-RPC error code.
   * @param message - JSON-RPC error message.
   * @param data - Optional JSON-RPC error data.
   * @returns A frozen JSON-RPC error fault.
   * @example
   * ```ts
   * import { fault } from "@morpho-org/test/chaos";
   *
   * const rateLimit = fault.rpcError(-32005, "rate limited");
   * // { kind: "rpcError", code: -32005, message: "rate limited" }
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: code, message and optional data are the stable API.
  rpcError: (code: number, message: string, data?: unknown): Fault =>
    Object.freeze({
      kind: "rpcError",
      code,
      message,
      ...(data === undefined ? {} : { data }),
    }),
  /**
   * Creates a fault that waits for the upstream response before dropping the client socket.
   *
   * @returns A frozen forward-then-drop fault.
   * @example
   * ```ts
   * import { fault } from "@morpho-org/test/chaos";
   *
   * const dropped = fault.forwardThenDrop();
   * // { kind: "forwardThenDrop" }
   * ```
   */
  forwardThenDrop: (): Fault => Object.freeze({ kind: "forwardThenDrop" }),
} as const);

/**
 * Matches a JSON-RPC method, arrival index, and optional call predicate to a fault.
 */
export interface FaultRule {
  /** Exact JSON-RPC method name. */
  readonly method: string;
  /**
   * Zero-based arrival index or indexes for this method; omitted to match every call.
   * Indexes are deterministic for sequential calls or calls within one batch, but not for
   * concurrent requests.
   */
  readonly nth?: number | readonly number[];
  /** Additional predicate for the parsed call, useful for selecting concurrent requests. */
  readonly match?: (call: {
    readonly method: string;
    readonly params: unknown;
  }) => boolean;
  /** Fault applied to the matching call or request. */
  readonly fault: Fault;
}

/**
 * Describes the current dispatch status or final result for a JSON-RPC call.
 */
export type FaultOutcome =
  | "pending"
  | "forwarded"
  | "upstreamError"
  | "internalError"
  | Fault["kind"];

/**
 * Records the method and outcome of one JSON-RPC call.
 */
export interface FaultProxyLogEntry {
  /** JSON-RPC method name. */
  readonly method: string;
  /** How the proxy handled the call. */
  readonly outcome: FaultOutcome;
}

/**
 * Controls a local JSON-RPC fault proxy.
 */
export interface FaultProxy {
  /** Proxy URL bound to 127.0.0.1. */
  readonly url: string;
  /**
   * Live entries appear when a call is received and are finalized in place; batch calls add
   * one entry each, and the log is never reset. `pending` means the upstream has or is about
   * to receive the call. Filter by method regardless of outcome when checking for calls such
   * as `eth_sendRawTransaction`.
   */
  readonly log: readonly FaultProxyLogEntry[];
  /** Internal request-processing errors; teardown throws if any were recorded. */
  readonly errors: readonly Error[];
  /**
   * Replaces the active fault rules and resets per-method call indexes.
   *
   * @param faults - Rules applied in array order; the first matching rule wins.
   * @returns Nothing.
   */
  setFaults(faults: readonly FaultRule[]): void;
  /**
   * Stops listening and destroys all open sockets.
   *
   * @returns A promise that resolves after the server closes; repeated calls are safe.
   * @throws {FaultProxyInternalError} when internal request-processing errors were recorded.
   */
  kill(): Promise<void>;
  /**
   * Listens again on the same port.
   *
   * @returns A promise that resolves when the server is listening; no-op while already listening.
   * @throws {Error} when the proxy cannot listen on its port.
   */
  revive(): Promise<void>;
}

/**
 * Starts a local JSON-RPC proxy that can inject deterministic faults.
 *
 * Malformed JSON and parsed requests without a string `method` are forwarded verbatim and are not
 * logged.
 *
 * Upstream failures return HTTP 502 with a body naming the upstream error.
 *
 * `nth` uses the per-method, zero-based arrival index, which is deterministic for sequential
 * calls or calls within one batch but not for concurrent requests. Use `match` to target a
 * particular concurrent call, for example by `params[0].to` or a calldata selector.
 *
 * @param parameters.upstream - HTTP or HTTPS URL of the upstream JSON-RPC node.
 * @param parameters.faults - Optional fault rules, checked in list order and matched by method, `match`, and `nth`.
 * @param parameters.port - Optional local port; defaults to an ephemeral port.
 * @returns A controllable proxy with its URL and live call log.
 * @throws {TypeError} when `upstream` is not an HTTP or HTTPS URL.
 * @throws {Error} when the proxy cannot listen on its port.
 * @example
 * ```ts
 * import { createFaultProxy } from "@morpho-org/test/chaos";
 *
 * const proxy = await createFaultProxy({ upstream: "http://127.0.0.1:8545" });
 * // proxy.url is an HTTP URL on 127.0.0.1
 * await proxy.kill();
 * ```
 */
export const createFaultProxy = async (parameters: {
  readonly upstream: string;
  readonly faults?: readonly FaultRule[];
  readonly port?: number;
}): Promise<FaultProxy> => {
  const upstream = new URL(parameters.upstream);
  if (upstream.protocol !== "http:" && upstream.protocol !== "https:") {
    throw new TypeError("upstream must use HTTP or HTTPS");
  }

  let port = parameters.port ?? 0;
  let listening = false;
  let activeFaults = [...(parameters.faults ?? [])];
  const counters = new Map<string, number>();
  const entries: FaultProxyLogEntry[] = [];
  const errors: Error[] = [];
  const sockets = new Set<Socket>();
  const killedSockets = new WeakSet<Socket>();
  const upstreamRequests = new Set<ClientRequest>();
  const forward = (
    body: Buffer,
    {
      request,
      response: clientResponse,
      cancelOnClientClose = true,
    }: {
      readonly request: IncomingMessage;
      readonly response: ServerResponse;
      readonly cancelOnClientClose?: boolean;
    },
  ): Promise<{
    readonly statusCode: number;
    readonly contentType: string | undefined;
    readonly body: Buffer;
  }> =>
    new Promise((resolve, reject) => {
      let settled = false;
      let upstreamRequest: ClientRequest;
      const cleanup = (): void => {
        settled = true;
        clientResponse.off("close", onClientClose);
        upstreamRequests.delete(upstreamRequest);
      };
      const resolveUpstream = (result: {
        readonly statusCode: number;
        readonly contentType: string | undefined;
        readonly body: Buffer;
      }): void => {
        if (settled) return;
        cleanup();
        resolve(result);
      };
      const rejectUpstream = (error: unknown): void => {
        if (settled) return;
        cleanup();
        reject(error);
      };
      const onClientClose = (): void => {
        if (!clientResponse.writableEnded && cancelOnClientClose) {
          upstreamRequest.destroy();
        }
      };
      upstreamRequest = (
        upstream.protocol === "https:" ? httpsRequest : httpRequest
      )(
        upstream,
        {
          method: request.method ?? "POST",
          headers: {
            connection: "close",
            "content-length": body.length,
            ...(request.headers["content-type"] === undefined
              ? {}
              : { "content-type": request.headers["content-type"] }),
          },
        },
        (upstreamResponse) => {
          const chunks: Buffer[] = [];
          upstreamResponse.on("data", (chunk: Buffer | string) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });
          upstreamResponse.on("error", (error) => {
            upstreamRequest.destroy();
            rejectUpstream(error);
          });
          upstreamResponse.on("aborted", () => {
            upstreamRequest.destroy();
            rejectUpstream(new Error("Upstream response was aborted"));
          });
          upstreamResponse.on("end", () =>
            resolveUpstream({
              statusCode: upstreamResponse.statusCode ?? 502,
              contentType:
                typeof upstreamResponse.headers["content-type"] === "string"
                  ? upstreamResponse.headers["content-type"]
                  : undefined,
              body: Buffer.concat(chunks),
            }),
          );
        },
      );
      upstreamRequests.add(upstreamRequest);
      upstreamRequest.on("error", rejectUpstream);
      upstreamRequest.on("close", () => {
        upstreamRequests.delete(upstreamRequest);
        if (!settled) {
          rejectUpstream(
            new Error("Upstream request closed before a response"),
          );
        }
      });
      if (cancelOnClientClose) {
        clientResponse.once("close", onClientClose);
      }
      upstreamRequest.end(body);
    });
  // biome-ignore lint/complexity/useMaxParams: the shared writer keeps HTTP response fields explicit.
  const sendBody = (
    response: ServerResponse,
    status: number,
    contentType: string | undefined,
    body: string | Buffer,
  ): void => {
    response.writeHead(status, {
      connection: "close",
      "content-length":
        typeof body === "string" ? Buffer.byteLength(body) : body.length,
      ...(contentType === undefined ? {} : { "content-type": contentType }),
    });
    response.end(body);
  };
  const sendBadGateway = (response: ServerResponse, error: unknown): void => {
    if (response.destroyed || response.writableEnded) return;
    const errorDetails =
      typeof error === "object" && error !== null
        ? (error as { readonly code?: unknown; readonly message?: unknown })
        : undefined;
    const reason =
      typeof errorDetails?.code === "string"
        ? errorDetails.code
        : typeof errorDetails?.message === "string"
          ? errorDetails.message
          : String(error);
    sendBody(
      response,
      502,
      "text/plain; charset=utf-8",
      `Upstream request failed: ${reason}`,
    );
  };
  const forwardRaw = async (
    response: ServerResponse,
    forwardParameters: {
      readonly request: IncomingMessage;
      readonly body: Buffer;
    },
  ): Promise<void> => {
    const { request, body } = forwardParameters;
    try {
      const result = await forward(body, { request, response });
      sendBody(response, result.statusCode, result.contentType, result.body);
    } catch (error) {
      sendBadGateway(response, error);
    }
  };
  const server: Server = createServer((request: IncomingMessage, response) => {
    response.setHeader("connection", "close");
    let finalizeInternalError: (() => void) | undefined;
    void (async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const body = Buffer.concat(chunks);
      let parsed: unknown;
      try {
        parsed = JSON.parse(body.toString());
      } catch {
        await forwardRaw(response, { request, body });
        return;
      }

      const values: readonly unknown[] = Array.isArray(parsed)
        ? parsed
        : [parsed];
      if (values.length === 0) {
        await forwardRaw(response, { request, body });
        return;
      }
      const calls: {
        readonly method: string;
        readonly value: Record<string, unknown>;
      }[] = [];
      let invalid = false;
      for (const value of values) {
        if (
          value === null ||
          typeof value !== "object" ||
          Array.isArray(value)
        ) {
          invalid = true;
          break;
        }
        const call = value as Record<string, unknown>;
        if (typeof call.method !== "string") {
          invalid = true;
          break;
        }
        calls.push({ method: call.method, value: call });
      }
      if (invalid) {
        await forwardRaw(response, { request, body });
        return;
      }

      const logIndexes: number[] = [];
      for (let index = 0; index < calls.length; index += 1) {
        logIndexes.push(entries.length);
        entries.push(
          Object.freeze({
            method: calls[index]!.method,
            outcome: "pending",
          }),
        );
      }
      const finalizeLogCalls = (
        entryIndexes: readonly number[],
        outcomeFor: (index: number) => FaultOutcome,
      ): void => {
        for (let index = 0; index < entryIndexes.length; index += 1) {
          const logIndex = entryIndexes[index]!;
          if (entries[logIndex]?.outcome !== "pending") continue;
          entries[logIndex] = Object.freeze({
            method: calls[index]!.method,
            outcome: outcomeFor(index),
          });
        }
      };
      finalizeInternalError = () => {
        for (let index = 0; index < logIndexes.length; index += 1) {
          entries[logIndexes[index]!] = Object.freeze({
            method: calls[index]!.method,
            outcome: "internalError",
          });
        }
      };
      const matchedFaults: (Fault | undefined)[] = [];
      for (let index = 0; index < calls.length; index += 1) {
        const call = calls[index]!;
        const nth = counters.get(call.method) ?? 0;
        counters.set(call.method, nth + 1);
        const rule = activeFaults.find(
          (candidate) =>
            candidate.method === call.method &&
            (candidate.match === undefined ||
              candidate.match({
                method: call.method,
                params: call.value.params,
              })) &&
            (candidate.nth === undefined ||
              (typeof candidate.nth === "number"
                ? candidate.nth === nth
                : candidate.nth.includes(nth))),
        );
        const matchedFault = rule?.fault;
        matchedFaults.push(matchedFault);
      }

      const requestFaultIndex = matchedFaults.findIndex(
        (matched) => matched !== undefined && matched.kind !== "rpcError",
      );
      if (requestFaultIndex !== -1) {
        const requestFault = matchedFaults[requestFaultIndex]!;
        if (requestFault.kind === "forwardThenDrop") {
          try {
            await forward(body, {
              request,
              response,
              cancelOnClientClose: false,
            });
            finalizeLogCalls(logIndexes, () => requestFault.kind);
            request.socket.destroy();
          } catch (error) {
            finalizeLogCalls(logIndexes, () => "upstreamError");
            sendBadGateway(response, error);
          }
          return;
        }
        finalizeLogCalls(logIndexes, () => requestFault.kind);
        if (requestFault.kind === "refuse") {
          request.socket.destroy();
        } else if (requestFault.kind === "status") {
          const faultBody = requestFault.body ?? "";
          sendBody(
            response,
            requestFault.status,
            "text/plain; charset=utf-8",
            faultBody,
          );
        } else if (requestFault.kind === "rawBody") {
          sendBody(response, 200, "application/json", requestFault.body);
        }
        return;
      }

      const rpcFaults = matchedFaults.map((matched) =>
        matched?.kind === "rpcError" ? matched : undefined,
      );
      if (Array.isArray(parsed) || rpcFaults[0] !== undefined) {
        finalizeLogCalls(logIndexes, (index) =>
          rpcFaults[index] === undefined ? "pending" : "rpcError",
        );
        const forwardedCalls = calls.filter(
          (_, index) => rpcFaults[index] === undefined,
        );
        let upstreamResponse: Awaited<ReturnType<typeof forward>> | undefined;
        let upstreamReplies: unknown[] = [];
        if (forwardedCalls.length > 0) {
          try {
            upstreamResponse = await forward(
              Buffer.from(
                JSON.stringify(forwardedCalls.map((call) => call.value)),
              ),
              { request, response },
            );
          } catch (error) {
            finalizeLogCalls(logIndexes, (index) =>
              rpcFaults[index] === undefined ? "upstreamError" : "rpcError",
            );
            sendBadGateway(response, error);
            return;
          }
          let parsedReplies: unknown;
          try {
            parsedReplies = JSON.parse(upstreamResponse.body.toString());
          } catch {
            parsedReplies = undefined;
          }
          if (!Array.isArray(parsedReplies)) {
            const canMergeSingleReply =
              forwardedCalls.length === 1 &&
              parsedReplies !== null &&
              typeof parsedReplies === "object" &&
              "id" in parsedReplies &&
              (JSON.stringify(forwardedCalls[0]!.value.id) ?? "undefined") ===
                (JSON.stringify(parsedReplies.id) ?? "undefined");
            if (canMergeSingleReply) {
              upstreamReplies = [parsedReplies];
            } else {
              if (rpcFaults.some((rpcFault) => rpcFault !== undefined)) {
                finalizeLogCalls(logIndexes, (index) =>
                  rpcFaults[index] === undefined ? "upstreamError" : "rpcError",
                );
                sendBadGateway(
                  response,
                  new Error(
                    "Upstream response was not a mergeable JSON-RPC reply",
                  ),
                );
              } else {
                finalizeLogCalls(logIndexes, () => "forwarded");
                sendBody(
                  response,
                  upstreamResponse.statusCode,
                  upstreamResponse.contentType,
                  upstreamResponse.body,
                );
              }
              return;
            }
          } else {
            upstreamReplies = parsedReplies;
          }
        }
        const repliesById = new Map<string, unknown[]>();
        for (const reply of upstreamReplies) {
          if (reply !== null && typeof reply === "object" && "id" in reply) {
            const key = JSON.stringify(reply.id) ?? "undefined";
            const replies = repliesById.get(key) ?? [];
            replies.push(reply);
            repliesById.set(key, replies);
          }
        }
        const missingForwardedCalls = new Set<number>();
        const replies = calls.flatMap((call, index) => {
          const rpcFault = rpcFaults[index];
          if (rpcFault !== undefined) {
            return [
              {
                jsonrpc: "2.0",
                ...(call.value.id === undefined ? {} : { id: call.value.id }),
                error: {
                  code: rpcFault.code,
                  message: rpcFault.message,
                  ...(rpcFault.data === undefined
                    ? {}
                    : { data: rpcFault.data }),
                },
              },
            ];
          }
          const key = JSON.stringify(call.value.id) ?? "undefined";
          const upstreamRepliesForId = repliesById.get(key);
          const upstreamReply = upstreamRepliesForId?.shift();
          if (upstreamReply === undefined) {
            missingForwardedCalls.add(index);
            return [];
          }
          return [upstreamReply];
        });
        if (missingForwardedCalls.size > 0) {
          finalizeLogCalls(logIndexes, (index) => {
            if (missingForwardedCalls.has(index)) return "upstreamError";
            return rpcFaults[index] === undefined ? "forwarded" : "rpcError";
          });
          sendBadGateway(
            response,
            new Error("Upstream response was not a mergeable JSON-RPC reply"),
          );
          return;
        }
        finalizeLogCalls(logIndexes, (index) =>
          rpcFaults[index] === undefined ? "forwarded" : "rpcError",
        );
        sendBody(
          response,
          upstreamResponse?.statusCode ?? 200,
          upstreamResponse?.contentType ?? "application/json",
          JSON.stringify(Array.isArray(parsed) ? replies : replies[0]),
        );
        return;
      }

      try {
        const result = await forward(body, { request, response });
        finalizeLogCalls(logIndexes, () => "forwarded");
        sendBody(response, result.statusCode, result.contentType, result.body);
      } catch (error) {
        finalizeLogCalls(logIndexes, () => "upstreamError");
        sendBadGateway(response, error);
      }
    })().catch((error: unknown) => {
      const internalError =
        error instanceof Error ? error : new Error(String(error));
      // Only ignore errors from sockets destroyed during teardown.
      if (!killedSockets.has(request.socket)) errors.push(internalError);
      finalizeInternalError?.();
      if (response.destroyed || response.headersSent) {
        response.destroy();
        return;
      }
      sendBody(
        response,
        500,
        "text/plain; charset=utf-8",
        `Fault proxy internal error: ${internalError.message}`,
      );
    });
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.off("error", onError);
      port = (server.address() as AddressInfo).port;
      listening = true;
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, "127.0.0.1");
  });

  return {
    url: `http://127.0.0.1:${port}`,
    log: entries,
    errors,
    setFaults(faults) {
      activeFaults = [...faults];
      counters.clear();
    },
    async kill() {
      if (listening) {
        listening = false;
        const socketsToDestroy = [...sockets];
        for (const socket of socketsToDestroy) killedSockets.add(socket);
        const closed = new Promise<void>((resolve, reject) => {
          server.close((error) =>
            error === undefined ? resolve() : reject(error),
          );
        });
        const requests = [...upstreamRequests];
        const requestsClosed = Promise.all(
          requests.map(
            (request) =>
              new Promise<void>((resolve) => request.once("close", resolve)),
          ),
        );
        server.closeAllConnections();
        for (const socket of socketsToDestroy) socket.destroy();
        for (const request of requests) request.destroy();
        await Promise.all([closed, requestsClosed]);
      }
      if (errors.length > 0) {
        throw new FaultProxyInternalError(
          "Fault proxy encountered internal errors",
          {
            cause: new AggregateError(
              errors,
              "Fault proxy encountered internal errors",
            ),
          },
        );
      }
    },
    async revive() {
      if (listening) return;
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error): void => {
          server.off("listening", onListening);
          reject(error);
        };
        const onListening = (): void => {
          server.off("error", onError);
          listening = true;
          resolve();
        };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(port, "127.0.0.1");
      });
    },
  };
};

/**
 * Categorizes an error by its outermost recognized class name.
 */
export type ErrorCategory =
  | "infra"
  | "integrity"
  | "chain"
  | "revert"
  | "auth"
  | "config"
  | "unknown";

/**
 * Selectors of signature, nonce and deadline reverts in the pinned Permit2 and
 * bundles ABIs: DeadlinePassed(), InvalidNonce(), SignatureExpired(uint256),
 * InvalidSigner(), InvalidSignature(), InvalidSignatureLength(),
 * InvalidContractSignature().
 */
const AUTH_REVERT_SELECTORS: readonly string[] = [
  "0x70f65caa",
  "0x756688fe",
  "0xcd21db4f",
  "0x815e1d64",
  "0x8baa579f",
  "0x4be6321b",
  "0xb0669cbc",
];

// Specific wrapper rules precede broad transport rules.
const ERROR_CATEGORY_RULES: readonly {
  readonly name: string;
  readonly category: Exclude<ErrorCategory, "unknown">;
  readonly when?: (error: Error & Record<string, unknown>) => boolean;
}[] = [
  {
    name: "SimulationRevertedError",
    category: "auth",
    when: (error) =>
      typeof error.revertData === "string" &&
      AUTH_REVERT_SELECTORS.includes(
        error.revertData.slice(0, 10).toLowerCase(),
      ),
  },
  { name: "SimulationRevertedError", category: "revert" },
  { name: "ContractFunctionRevertedError", category: "revert" },
  { name: "ExecutionRevertedError", category: "revert" },
  { name: "InvalidChainIdError", category: "chain" },
  { name: "ChainIdMismatchError", category: "chain" },
  { name: "ChainMismatchError", category: "chain" },
  {
    name: "HttpRequestError",
    category: "integrity",
    when: (error) =>
      (error.status === undefined ||
        (typeof error.status === "number" && error.status < 400)) &&
      error.cause instanceof SyntaxError,
  },
  { name: "InvalidSimulationResponseError", category: "integrity" },
  { name: "SlippageCheckUnavailableError", category: "integrity" },
  { name: "InvalidTransactionHashError", category: "integrity" },
  { name: "AbiDecodingZeroDataError", category: "integrity" },
  { name: "AbiDecodingDataSizeTooSmallError", category: "integrity" },
  { name: "InvalidHexValueError", category: "integrity" },
  { name: "InvalidSignatureError", category: "auth" },
  { name: "AddressMismatchError", category: "auth" },
  { name: "ExpiredDeadlineError", category: "auth" },
  { name: "UnsupportedErc20ApprovalSpenderError", category: "auth" },
  { name: "BundlesPermitMismatchError", category: "auth" },
  { name: "BundlesRequirementSignatureMismatchError", category: "auth" },
  { name: "DepositOwnerMismatchError", category: "auth" },
  { name: "DepositSpenderMismatchError", category: "auth" },
  { name: "DepositAssetMismatchError", category: "auth" },
  { name: "DepositAmountMismatchError", category: "auth" },
  { name: "Permit2SignatureTransferNonceAlreadyUsedError", category: "auth" },
  { name: "InvalidPermitDomainChainIdError", category: "auth" },
  { name: "InvalidPermitDomainVerifyingContractError", category: "auth" },
  { name: "AuthorizationRequestMismatchError", category: "auth" },
  { name: "ContractFunctionZeroDataError", category: "config" },
  { name: "UnknownTokenError", category: "config" },
  { name: "MissingPermitDomainNameError", category: "config" },
  { name: "MalformedTokenMetadataError", category: "integrity" },
  { name: "BlacklistViolationError", category: "config" },
  { name: "ConsumerLimitViolationError", category: "revert" },
  { name: "MissingContractCodeError", category: "config" },
  { name: "SimulationValidationError", category: "config" },
  { name: "UnsupportedChainError", category: "config" },
  { name: "RpcTransportError", category: "infra" },
  { name: "HttpRequestError", category: "infra" },
  { name: "TimeoutError", category: "infra" },
  { name: "UnconfirmedBroadcastError", category: "infra" },
  { name: "LimitExceededRpcError", category: "infra" },
  { name: "InternalRpcError", category: "infra" },
  { name: "ResourceUnavailableRpcError", category: "infra" },
  { name: "RpcRequestError", category: "infra" },
];

const NEIGHBOUR_CATEGORIES: Record<
  Exclude<ErrorCategory, "unknown">,
  readonly ErrorCategory[]
> = {
  infra: ["revert", "chain", "auth", "integrity", "config"],
  integrity: ["infra", "revert"],
  chain: ["infra"],
  revert: ["infra"],
  auth: ["infra"],
  config: ["infra"],
};

type ErrorChainEntry = {
  readonly name: string;
  readonly rule: (typeof ERROR_CATEGORY_RULES)[number] | undefined;
  readonly carrier: boolean;
};

const walkErrorChain = (error: unknown): ErrorChainEntry[] => {
  const chain: ErrorChainEntry[] = [];
  const seen = new Set<object>();
  let current: unknown = error;
  while (
    typeof current === "object" &&
    current !== null &&
    !seen.has(current)
  ) {
    seen.add(current);
    const record = current as Record<string, unknown>;
    const constructorName =
      typeof record.constructor === "function" ||
      (typeof record.constructor === "object" && record.constructor !== null)
        ? (record.constructor as { readonly name?: unknown }).name
        : undefined;
    const names: string[] = [];
    if (typeof constructorName === "string") names.push(constructorName);
    if (typeof record.name === "string") names.push(record.name);
    const rule = ERROR_CATEGORY_RULES.find(
      (candidate) =>
        names.includes(candidate.name) &&
        (candidate.when === undefined ||
          (current instanceof Error &&
            candidate.when(current as Error & Record<string, unknown>))),
    );
    const previous = chain.at(-1);
    const carrier =
      current instanceof RpcError ||
      (current instanceof RpcRequestError &&
        previous?.name === "ExecutionRevertedError" &&
        chain.find((entry) => entry.rule?.category === "revert") === previous);
    chain.push({
      name: names[0] ?? "Object",
      rule,
      carrier,
    });
    current = record.cause;
  }
  return chain;
};

/**
 * Classifies an error and its cause chain using known SDK and viem error names.
 *
 * `RpcTransportError` maps to infra because it reports an RPC transport or provider
 * failure; it still withholds the transaction like every other simulation rejection.
 *
 * @param error - Error or thrown value to classify.
 * @returns The category of the outermost matching error, or `unknown`.
 * @example
 * ```ts
 * import { classifyError } from "@morpho-org/test/chaos";
 * import { ContractFunctionRevertedError } from "viem";
 *
 * const error = new ContractFunctionRevertedError({
 *   abi: [],
 *   functionName: "withdraw",
 * });
 * const category = classifyError(error);
 * // category === "revert"
 * ```
 */
export const classifyError = (error: unknown): ErrorCategory =>
  walkErrorChain(error).find((entry) => entry.rule !== undefined)?.rule
    ?.category ?? "unknown";

/**
 * Asserts that an asynchronous operation rejects with the expected fail-closed category.
 *
 * @param promise - Operation expected to reject.
 * @param category - Required error category.
 * @returns The rejected error when its category is safe.
 * @throws {AssertionError} when the promise resolves, rejects with a non-Error, has the wrong
 *   category, or includes a neighbouring failure category before the first carrier. Any viem
 *   `RpcError` in the cause chain is a carrier; a `RpcRequestError` is also a
 *   carrier when it is the direct `cause` of the first revert-category
 *   `ExecutionRevertedError` in the chain.
 * @example
 * ```ts
 * import { expectFailClosed } from "@morpho-org/test/chaos";
 *
 * const error = Object.assign(new Error("execution reverted"), {
 *   name: "ContractFunctionRevertedError",
 * });
 * const rejected = await expectFailClosed(Promise.reject(error), "revert");
 * // rejected === error
 * ```
 */
export const expectFailClosed = async (
  promise: Promise<unknown>,
  category: Exclude<ErrorCategory, "unknown">,
): Promise<Error> => {
  let resolved: unknown;
  try {
    resolved = await promise;
  } catch (error) {
    if (!(error instanceof Error)) {
      throw new AssertionError({
        message: `expected an Error rejection for ${category}, got ${typeof error}`,
      });
    }
    const chain = walkErrorChain(error);
    const chainNames = chain.map((entry) => entry.name).join(" -> ") || "none";
    const outermostMatch = chain.find((entry) => entry.rule !== undefined);
    const actual = outermostMatch?.rule?.category ?? "unknown";
    if (actual !== category) {
      throw new AssertionError({
        message: `expected ${category}, got ${actual}; cause chain: ${chainNames}`,
      });
    }
    const firstCarrierIndex = chain.findIndex((entry) => entry.carrier);
    if (
      chain.some(
        (entry, index) =>
          entry.rule !== undefined &&
          (firstCarrierIndex === -1 || index < firstCarrierIndex) &&
          NEIGHBOUR_CATEGORIES[category].includes(entry.rule.category),
      )
    ) {
      throw new AssertionError({
        message: `expected ${category} without neighbouring failures; cause chain: ${chainNames}`,
      });
    }
    return error;
  }

  let rendered: string;
  try {
    rendered =
      JSON.stringify(resolved, (_key, value: unknown) =>
        typeof value === "bigint" ? `${value}n` : value,
      ) ?? String(resolved);
  } catch {
    try {
      rendered = String(resolved);
    } catch {
      rendered = "an unserializable value";
    }
  }
  throw new AssertionError({
    message: `expected the promise to reject (fail closed) but it resolved with ${rendered}`,
  });
};
