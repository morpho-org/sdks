import type { AnvilTestClient } from "@morpho-org/test";
import { type Chain, custom } from "viem";
import { MorphoClient, type MorphoConfig } from "../../src/index.js";

/**
 * Test helper: build a `MorphoClient` from an Anvil test client by wrapping the test client's
 * EIP-1193 `request` into a viem `custom` transport. The test client itself is bound to a
 * single chain via the fork harness; the returned `MorphoClient` exposes that chain through
 * its config.
 */
export function morphoFromTestClient(
  client: AnvilTestClient<Chain>,
  options?: Omit<MorphoConfig, "transports">,
): MorphoClient {
  return new MorphoClient({
    transports: {
      [client.chain.id]: custom({ request: client.request }),
    },
    ...options,
  });
}
