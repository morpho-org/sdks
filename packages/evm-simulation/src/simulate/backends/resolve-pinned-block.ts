import type { BlockTag, Client } from "viem";
import { getBlock } from "viem/actions";
import { InvalidSimulationResponseError } from "../../errors.js";
import type { StateBlock } from "../../params.js";
import { rpc } from "./eth-simulate-v1.js";

/** A resolved {@link StateBlock} with the block gas limit the node reported, if any. @internal */
export interface PinnedBlock extends StateBlock {
  /** The pinned block's gas limit; sizes the SDK's evidence-read gas budget. */
  readonly gasLimit?: bigint;
}

/**
 * Resolve the requested state block exactly once so `latest` cannot drift.
 *
 * Downstream metadata and code reads and `eth_simulateV1` select state by the
 * pinned hash with `requireCanonical: true`. A supplied block is
 * looked up by hash to verify its number and timestamp before downstream reads.
 *
 * @param params - Resolution parameters.
 * @param params.client - The caller's viem client.
 * @param params.blockNumber - Requested block number or tag; defaults to
 *   `latest`.
 * @param params.block - Caller-supplied pin to verify by hash.
 * @returns The resolved {@link PinnedBlock}.
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
  readonly block?: StateBlock;
}): Promise<PinnedBlock> {
  const { client, blockNumber, block: supplied } = params;
  const selection =
    typeof blockNumber === "bigint"
      ? { blockNumber }
      : { blockTag: blockNumber ?? "latest" };
  const block = await rpc("eth_getBlock", () =>
    getBlock(
      client,
      supplied === undefined ? selection : { blockHash: supplied.hash },
    ),
  );
  if (block.number === null || block.hash === null) {
    throw new InvalidSimulationResponseError(
      "eth_getBlock returned a block without number or hash. Check that the endpoint resolved the requested state block.",
    );
  }
  if (
    supplied !== undefined &&
    (block.number !== supplied.number ||
      block.timestamp !== supplied.timestamp ||
      block.hash.toLowerCase() !== supplied.hash.toLowerCase())
  ) {
    throw new InvalidSimulationResponseError(
      "The supplied block fields do not match the block returned for its hash. Supply the number, hash and timestamp from the same block.",
    );
  }
  return {
    number: block.number,
    hash: block.hash,
    timestamp: block.timestamp,
    ...(typeof block.gasLimit === "bigint" && { gasLimit: block.gasLimit }),
  };
}
