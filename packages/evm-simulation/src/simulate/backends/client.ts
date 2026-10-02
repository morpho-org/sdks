import { createPublicClient, http, type PublicClient } from "viem";

/**
 * Create the viem public client shared by every simulation backend stage
 * (pinned block resolution, binding/pinned reads, `eth_simulateV1`).
 *
 * A supplied abort signal is bound into the transport: a failed or aborted
 * request must not consume another attempt or a fresh budget, and the pipeline
 * abort signal owns the overall execution deadline, so the client sends zero
 * retries and disables viem's own timeout when a signal is present.
 *
 * @param rpcUrl - Endpoint URL; each caller supplies the transport it trusts.
 * @param signal - Optional pipeline abort signal shared by every request.
 * @returns A viem {@link PublicClient} honoring the shared abort/timeout budget.
 * @internal
 */
export function createSimulationClient(
  rpcUrl: string,
  signal?: AbortSignal,
): PublicClient {
  return createPublicClient({
    transport: http(rpcUrl, {
      fetchOptions: signal ? { signal } : undefined,
      retryCount: 0,
      timeout: signal ? 0 : undefined,
    }),
  });
}
