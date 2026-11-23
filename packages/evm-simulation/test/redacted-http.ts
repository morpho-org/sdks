import { custom, http, type Transport } from "viem";

/** Test-only HTTP transport that never exposes authenticated endpoints in RPC errors. @internal */
export function redactedHttp(url: string | undefined): Transport {
  return (options) => {
    const transport = http(url, { retryCount: 0 })(options);
    return custom(
      {
        request: async (args) => {
          try {
            return await transport.request(args);
          } catch {
            throw new Error(
              "Paired-emitter RPC failed (endpoint details withheld).",
            );
          }
        },
      },
      { retryCount: 0 },
    )(options);
  };
}
