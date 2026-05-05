import type { AnvilTestClient } from "@morpho-org/test";
import {
  type Chain,
  createPublicClient,
  custom,
  type PublicClient,
  type Transport,
} from "viem";
import { MorphoClient, type MorphoConfig } from "../../src/index.js";

const transportFromTestClient = (client: AnvilTestClient<Chain>): Transport =>
  custom({ request: client.request });

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
    transports: { [client.chain.id]: transportFromTestClient(client) },
    ...options,
  });
}

/**
 * Test helper: build a viem `PublicClient` from an Anvil test client. Use this whenever a
 * test calls one of the SDK's public action helpers (`getRequirements`, `encodeErc20Permit`,
 * etc.) directly — those expect a `PublicClient` and refuse the account-bound test client.
 */
export function publicFromTestClient(
  client: AnvilTestClient<Chain>,
): PublicClient {
  return createPublicClient({ transport: transportFromTestClient(client) });
}
