import { type Chain, createPublicClient, defineChain, http } from "viem";
import type { SimulationClient } from "../types.js";

/**
 * Test adapter: the README's opt-in `fetchFn`, which keeps the HTTP status on an
 * error reply whose body is not JSON. Without it, viem reports a non-JSON error
 * body labeled `application/json` as a status-less parse failure.
 */
export const keepErrorStatus = async (
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> => {
  const response = await fetch(input, init);
  if (response.ok) return response;
  const headers = new Headers(response.headers);
  headers.delete("content-type");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

/** Test adapter: a chain with only an ID, for clients of chains viem does not need to know. */
const testChain = (id: number): Chain =>
  defineChain({
    id,
    name: `Chain ${id}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [] } },
  });

/**
 * Test adapter: a caller-owned simulation client on `url`, with the transport
 * settings the README recommends, viem's default CCIP-Read setting, and no
 * custom `fetchFn` unless one is passed.
 */
// biome-ignore lint/complexity/useMaxParams: Test adapter mirroring the old per-chain URL config.
export function simulationClientFor(
  url: string | undefined,
  chain: Chain | number,
  timeout = 30_000,
  fetchFn?: typeof fetch,
): SimulationClient {
  return createPublicClient({
    chain: typeof chain === "number" ? testChain(chain) : chain,
    transport: http(url, {
      ...(fetchFn && { fetchFn }),
      retryCount: 0,
      timeout,
    }),
  });
}
