import { createPublicClient, http, type PublicClient } from "viem";
import { SimulationValidationError } from "../../errors.js";

/**
 * Create the viem public client shared by every simulation backend stage
 * (pinned block resolution, binding/pinned reads, `eth_simulateV1`).
 * CCIP-Read is disabled so contract reverts cannot trigger arbitrary URL fetches.
 *
 * A supplied abort signal is bound into the transport: a failed or aborted
 * request must not consume another attempt or a fresh budget, and the pipeline
 * abort signal owns the overall execution deadline, so the client sends zero
 * retries and disables viem's own timeout when a signal is present. An HTTP
 * error status reaches the boundary as that status unless its body is a
 * well-formed JSON-RPC error, which is classified like any JSON-RPC error.
 *
 * @param rpcUrl - Endpoint URL; each caller supplies the transport it trusts.
 * @param signal - Optional pipeline abort signal shared by every request.
 * @returns A viem {@link PublicClient} honoring the shared abort/timeout budget.
 * @throws {SimulationValidationError} if viem does not disable CCIP-Read.
 * @internal
 */
export function createSimulationClient(
  rpcUrl: string,
  signal?: AbortSignal,
): PublicClient {
  const client = createPublicClient({
    ccipRead: false,
    transport: http(rpcUrl, {
      // viem parses a JSON-typed body before checking `response.ok`, so an
      // error status with an unparseable JSON-typed body would lose its
      // status. Dropping the header on error statuses keeps the status, and a
      // JSON-RPC error body still parses.
      fetchFn: async (input, init) => {
        const response = await fetch(input, init);
        if (response.ok) return response;
        const headers = new Headers(response.headers);
        headers.delete("content-type");
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      },
      fetchOptions: signal ? { signal } : undefined,
      retryCount: 0,
      timeout: signal ? 0 : undefined,
    }),
  });
  if (client.ccipRead !== false)
    throw new SimulationValidationError(
      "Simulation client did not disable CCIP-Read. Upgrade viem to >=2.9.2 to prevent offchain URL fetches.",
      ["client.ccipRead: must be false"],
    );
  return client;
}
