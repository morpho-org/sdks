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
 * @param params.client - The caller's viem client.
 * @param params.blockNumber - Requested block number or tag; defaults to
 *   `latest`.
 * @returns The resolved {@link StateBlock}.
 * @throws {RpcTransportError} For transport failures and timeouts.
 * @throws {InvalidSimulationResponseError} When the node returns a 2xx body
 *   that is not JSON or is the JSON value `null`, or a block without a number
 *   or hash. Other JSON bodies without an RPC result are interpreted as a
 *   missing block and remain an {@link RpcTransportError}.
 * @internal
 */
export async function resolvePinnedBlock(params: {
  readonly client: Client;
  readonly blockNumber?: bigint | BlockTag;
}): Promise<StateBlock> {
  const { client, blockNumber } = params;
  const block = await rpc("eth_getBlock", () =>
    getBlock(
      client,
      typeof blockNumber === "bigint"
        ? { blockNumber }
        : { blockTag: blockNumber ?? "latest" },
    ),
  );
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
