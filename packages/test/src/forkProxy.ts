import { createServer } from "node:http";
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
  /** Closes the server and its open connections. Idempotent. */
  readonly close: () => void;
}

/**
 * Starts a proxy on 127.0.0.1 that answers `anvil_nodeInfo` (alone or inside a batch) with
 * JSON-RPC error -32601 and forwards every other request to `upstreamUrl`: body, headers,
 * status and response body. Anvil probes the fork URL with `anvil_nodeInfo` at startup, and
 * falls back on -32601; some RPCs instead answer an HTTP error or take seconds to answer.
 * Credentials in `upstreamUrl` are sent as Basic auth, unless the request already has an
 * `Authorization` header. Failures never mention `upstreamUrl`, which can carry credentials.
 *
 * @internal
 * @param upstreamUrl The fork RPC URL.
 * @returns The proxy URL and its cleanup.
 */
export const startForkProxy = async (
  upstreamUrl: string,
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

  const server = createServer(async (req, res) => {
    const controller = new AbortController();
    res.once("close", () => {
      if (!res.writableFinished) controller.abort();
    });

    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);

      let payload: unknown;
      try {
        payload = JSON.parse(body.toString());
      } catch {}
      const requests: unknown[] = Array.isArray(payload) ? payload : [payload];
      const isNodeInfoRequest = (
        request: unknown,
      ): request is { readonly id?: unknown } =>
        typeof request === "object" &&
        request !== null &&
        "method" in request &&
        request.method === "anvil_nodeInfo";
      const nodeInfoRequests = requests.filter(isNodeInfoRequest);
      const localResponses = nodeInfoRequests.map(({ id }) => ({
        jsonrpc: "2.0",
        id: id ?? null,
        error: { code: -32601, message: "Method not found" },
      }));
      const forwardedRequests = requests.filter(
        (request) => !isNodeInfoRequest(request),
      );

      if (localResponses.length > 0 && forwardedRequests.length === 0) {
        res
          .writeHead(200, { "content-type": "application/json" })
          .end(
            JSON.stringify(
              Array.isArray(payload) ? localResponses : localResponses[0],
            ),
          );
        return;
      }

      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) {
        if (value === undefined || DROPPED_REQUEST_HEADERS.has(name)) continue;
        for (const item of [value].flat()) headers.append(name, item);
      }
      if (authorization !== undefined && !headers.has("authorization"))
        headers.set("authorization", authorization);
      const upstream = await fetch(target, {
        method: req.method,
        headers,
        body:
          localResponses.length === 0
            ? body
            : JSON.stringify(forwardedRequests),
        signal: controller.signal,
      });

      let responseBody = Buffer.from(await upstream.arrayBuffer());
      if (localResponses.length > 0) {
        try {
          const upstreamResponses: unknown = JSON.parse(
            responseBody.toString(),
          );
          if (Array.isArray(upstreamResponses))
            responseBody = Buffer.from(
              JSON.stringify([...upstreamResponses, ...localResponses]),
            );
        } catch {}
      }

      const responseHeaders: Record<string, string> = {};
      upstream.headers.forEach((value, name) => {
        if (!DROPPED_RESPONSE_HEADERS.has(name)) responseHeaders[name] = value;
      });
      res.writeHead(upstream.status, responseHeaders).end(responseBody);
    } catch (error) {
      // Only the error name and code: messages can contain the upstream URL.
      const { name, cause } = error instanceof Error ? error : new Error();
      const code =
        typeof cause === "object" &&
        cause !== null &&
        "code" in cause &&
        typeof cause.code === "string"
          ? `: ${cause.code}`
          : "";
      if (!res.headersSent)
        res.writeHead(502, { "content-type": "text/plain" });
      res.end(`The fork proxy could not reach the fork RPC (${name}${code}).`);
    }
  });

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
    close: () => {
      server.closeAllConnections();
      server.close();
    },
  };
};
