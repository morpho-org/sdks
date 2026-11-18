import { createPublicClient, http, type PublicClient } from "viem";

/** Consumer-side transport configuration shared by simulation tests. */
export function createTestSimulationClient(url: string): PublicClient {
  return createPublicClient({
    ccipRead: false,
    transport: http(url, {
      retryCount: 0,
      timeout: 30_000,
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
    }),
  });
}
