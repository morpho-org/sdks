import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";

const DROPPED_REQUEST_HEADERS = new Set([
  "accept-encoding",
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "transfer-encoding",
]);
const DROPPED_RESPONSE_HEADERS = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "keep-alive",
  "transfer-encoding",
]);

/** @internal A local HTTP proxy in front of a fork RPC. */
export interface ForkProxy {
  /** URL of the proxy. */
  readonly url: `http://127.0.0.1:${number}`;
  /** Stops reusing the pinned block once Anvil is listening. */
  readonly finishStartup: () => void;
  /** Closes the server and its open connections. Idempotent. */
  readonly close: () => void;
}

/**
 * Creates a fixture-scoped cache of one historical block from a fixed upstream.
 * @internal
 * @param blockNumber The pinned historical fork block.
 * @returns A matcher that can cache a reply once Anvil starts successfully.
 * @example
 * ```ts
 * const bootstrapBlock = createForkBootstrapBlock(22_000_000n);
 * const proxy = await startForkProxy(upstreamUrl, bootstrapBlock);
 * ```
 */
export const createForkBootstrapBlock = (blockNumber: bigint | number) => {
  const number = `0x${blockNumber.toString(16)}`;
  let block: object | undefined;

  return (payload: unknown) => {
    if (
      typeof payload !== "object" ||
      payload === null ||
      !("jsonrpc" in payload) ||
      payload.jsonrpc !== "2.0" ||
      !("id" in payload) ||
      (typeof payload.id !== "number" && typeof payload.id !== "string") ||
      !("method" in payload) ||
      payload.method !== "eth_getBlockByNumber" ||
      !("params" in payload) ||
      !Array.isArray(payload.params) ||
      payload.params.length !== 2 ||
      payload.params[0] !== number ||
      payload.params[1] !== false
    ) {
      return undefined;
    }

    const { id } = payload;
    return {
      hit:
        block === undefined
          ? undefined
          : JSON.stringify({ jsonrpc: "2.0", id, result: block }),
      prepare: (body: Buffer) => {
        if (block !== undefined) {
          return;
        }
        try {
          const reply: unknown = JSON.parse(body.toString());
          if (
            typeof reply !== "object" ||
            reply === null ||
            !("id" in reply) ||
            reply.id !== id ||
            !("jsonrpc" in reply) ||
            reply.jsonrpc !== "2.0" ||
            "error" in reply ||
            !("result" in reply)
          ) {
            return;
          }

          const { result } = reply;
          if (
            typeof result === "object" &&
            result !== null &&
            "number" in result &&
            result.number === number &&
            "hash" in result &&
            typeof result.hash === "string" &&
            /^0x[0-9a-f]{64}$/i.test(result.hash)
          ) {
            return () => {
              block ??= result;
            };
          }
        } catch {
          // Forward malformed replies to Anvil without caching them.
        }
      },
    };
  };
};

function createForkStartup(
  bootstrapBlock: ReturnType<typeof createForkBootstrapBlock> | undefined,
) {
  let starting = true;
  let rememberBootstrapBlock: (() => void) | undefined;
  return {
    match(payload: unknown) {
      const match = starting ? bootstrapBlock?.(payload) : undefined;
      if (match === undefined) {
        return undefined;
      }
      return {
        hit: match.hit,
        remember(body: Buffer | undefined) {
          if (starting) {
            rememberBootstrapBlock =
              body === undefined ? undefined : match.prepare(body);
          }
        },
      };
    },
    finish() {
      starting = false;
      rememberBootstrapBlock?.();
      rememberBootstrapBlock = undefined;
    },
  };
}

const isNodeInfoRequest = (
  request: unknown,
): request is { readonly id?: unknown } =>
  typeof request === "object" &&
  request !== null &&
  "method" in request &&
  request.method === "anvil_nodeInfo";

function readPayload(body: Buffer): unknown {
  try {
    return JSON.parse(body.toString());
  } catch {
    return undefined;
  }
}

function partitionRequests(payload: unknown) {
  const isBatch = Array.isArray(payload);
  const requests: unknown[] = Array.isArray(payload) ? payload : [payload];
  const localResponses = requests.filter(isNodeInfoRequest).map(({ id }) => ({
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code: -32601, message: "Method not found" },
  }));
  return {
    isBatch,
    localResponses,
    forwardedRequests: requests.filter(
      (request) => !isNodeInfoRequest(request),
    ),
  };
}

function forwardHeaders(req: IncomingMessage, authorization?: string) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined || DROPPED_REQUEST_HEADERS.has(name)) {
      continue;
    }
    for (const item of [value].flat()) {
      headers.append(name, item);
    }
  }
  if (authorization !== undefined && !headers.has("authorization")) {
    headers.set("authorization", authorization);
  }
  return headers;
}

async function sendUpstreamResponse(
  res: ServerResponse,
  {
    upstream,
    localResponses,
    rememberBootstrap,
  }: {
    readonly upstream: Response;
    readonly localResponses: ReturnType<
      typeof partitionRequests
    >["localResponses"];
    readonly rememberBootstrap?:
      | ((body: Buffer | undefined) => void)
      | undefined;
  },
) {
  let responseBody = Buffer.from(await upstream.arrayBuffer());
  rememberBootstrap?.(upstream.ok ? responseBody : undefined);
  if (localResponses.length > 0) {
    try {
      const upstreamResponses: unknown = JSON.parse(responseBody.toString());
      if (Array.isArray(upstreamResponses)) {
        responseBody = Buffer.from(
          JSON.stringify([...upstreamResponses, ...localResponses]),
        );
      }
    } catch {}
  }

  const responseHeaders: Record<string, string> = {};
  upstream.headers.forEach((value, name) => {
    if (!DROPPED_RESPONSE_HEADERS.has(name)) {
      responseHeaders[name] = value;
    }
  });
  res.writeHead(upstream.status, responseHeaders).end(responseBody);
}

function sendProxyError(res: ServerResponse, error: unknown) {
  // Only the error name and code: messages can contain the upstream URL.
  const { name, cause } = error instanceof Error ? error : new Error();
  const code =
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    typeof cause.code === "string"
      ? `: ${cause.code}`
      : "";
  if (!res.headersSent) {
    res.writeHead(502, { "content-type": "text/plain" });
  }
  res.end(`The fork proxy could not reach the fork RPC (${name}${code}).`);
}

function createForkRequestHandler(
  target: string,
  {
    startup,
    authorization,
  }: {
    readonly startup: ReturnType<typeof createForkStartup>;
    readonly authorization: string | undefined;
  },
) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const controller = new AbortController();
    res.once("close", () => {
      if (!res.writableFinished) {
        controller.abort();
      }
    });

    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      const payload = readPayload(body);
      const bootstrapRequest =
        req.method === "POST" ? startup.match(payload) : undefined;
      if (bootstrapRequest?.hit !== undefined) {
        res
          .writeHead(200, { "content-type": "application/json" })
          .end(bootstrapRequest.hit);
        return;
      }
      const { isBatch, localResponses, forwardedRequests } =
        partitionRequests(payload);
      if (localResponses.length > 0 && forwardedRequests.length === 0) {
        res
          .writeHead(200, { "content-type": "application/json" })
          .end(JSON.stringify(isBatch ? localResponses : localResponses[0]));
        return;
      }

      const upstream = await fetch(target, {
        method: req.method,
        headers: forwardHeaders(req, authorization),
        body:
          localResponses.length === 0
            ? body
            : JSON.stringify(forwardedRequests),
        signal: controller.signal,
      });
      await sendUpstreamResponse(res, {
        upstream,
        localResponses,
        rememberBootstrap: bootstrapRequest?.remember,
      });
    } catch (error) {
      sendProxyError(res, error);
    }
  };
}

/**
 * Starts a proxy on 127.0.0.1 that answers `anvil_nodeInfo` (alone or inside a batch) with
 * JSON-RPC error -32601 and optionally serves one pinned block during startup. It
 * forwards other requests to `upstreamUrl`: body, headers,
 * status and response body. Anvil probes the fork URL with `anvil_nodeInfo` at startup, and
 * falls back on -32601; some RPCs instead answer an HTTP error or take seconds to answer.
 * Credentials in `upstreamUrl` are sent as Basic auth, unless the request already has an
 * `Authorization` header. Failures never mention `upstreamUrl`, which can carry credentials.
 *
 * @internal
 * @param upstreamUrl The fork RPC URL.
 * @param bootstrapBlock Optional historical block cache used only before startup completes.
 * @returns The proxy URL and its cleanup.
 */
export const startForkProxy = async (
  upstreamUrl: string,
  bootstrapBlock?: ReturnType<typeof createForkBootstrapBlock>,
): Promise<ForkProxy> => {
  // `fetch` rejects URLs with credentials, so send them as Basic auth instead.
  const url = URL.parse(upstreamUrl);
  let target = upstreamUrl;
  let authorization: string | undefined;
  if (url !== null && (url.username !== "" || url.password !== "")) {
    authorization = `Basic ${Buffer.from(
      `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`,
    ).toString("base64")}`;
    url.username = "";
    url.password = "";
    target = url.href;
  }

  const startup = createForkStartup(bootstrapBlock);
  const server = createServer(
    createForkRequestHandler(target, { startup, authorization }),
  );

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      // A later server error (e.g. EMFILE on accept) closes the proxy instead of crashing the process.
      server.on("error", () => {
        server.closeAllConnections();
        server.close();
      });
      resolve();
    });
  });

  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    finishStartup: startup.finish,
    close: () => {
      server.closeAllConnections();
      server.close();
    },
  };
};
