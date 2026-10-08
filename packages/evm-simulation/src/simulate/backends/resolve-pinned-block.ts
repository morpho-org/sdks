import type { BlockTag, Client } from "viem";
import { getBlock } from "viem/actions";
import { InvalidSimulationResponseError } from "../../errors.js";
import type { StateBlock } from "../../params.js";
import { rpc } from "./eth-simulate-v1.js";

/**
 * Resolve the requested state block exactly once so `latest` cannot drift.
 *
 * Every downstream read and the `eth_simulateV1` call pin this number. Skipped
 * when the caller supplies `SimulateParams.block`.
 *
 * @param params - Resolution parameters.
 * @param params.client - Caller's simulation client.
 * @param params.blockNumber - Requested block number or tag; defaults to
 *   `latest`.
 * @param params.signal - Optional pipeline abort signal; checked around the
 *   request so an aborted pipeline never produces a pin.
 * @returns The resolved {@link StateBlock}.
 * @throws {ExternalServiceError} For transport failures, timeouts, or an
 *   aborted signal.
 * @throws {InvalidSimulationResponseError} When the node returns a block
 *   without a number or hash.
 * @internal
 */
export async function resolvePinnedBlock(params: {
  readonly client: Client;
  readonly blockNumber?: bigint | BlockTag;
  readonly signal?: AbortSignal;
}): Promise<StateBlock> {
  const { client, blockNumber, signal } = params;
  const block = await rpc("eth_getBlock", async () => {
    signal?.throwIfAborted();
    const resolved = await getBlock(
      client,
      typeof blockNumber === "bigint"
        ? { blockNumber }
        : { blockTag: blockNumber ?? "latest" },
    );
    signal?.throwIfAborted();
    return resolved;
  });
  if (block.number === null || block.hash === null) {
    throw new InvalidSimulationResponseError(
      "eth_getBlock returned a block without number or hash. Check that the endpoint resolved the requested state block.",
    );
  }
  return {
    number: block.number,
    hash: block.hash,
    timestamp: block.timestamp,
  };
}
