import type { BlockTag, Client, Hex } from "viem";
import { getBlock } from "viem/actions";
import {
  ExternalServiceError,
  InvalidSimulationResponseError,
} from "../../errors.js";

/** One concrete canonical block: the state anchor for every pinned read. @internal */
export interface PinnedBlock {
  readonly number: bigint;
  readonly hash: Hex;
  readonly timestamp: bigint;
}

/**
 * Resolve the requested state block exactly once so `latest` cannot drift.
 *
 * Every downstream read and the `eth_simulateV1` call pin this number; the
 * execution boundary re-fetches the hash afterwards to detect a reorg that
 * swapped the block mid-flight.
 *
 * @param params - Resolution parameters.
 * @param params.client - Shared simulation client (created by
 *   {@link createSimulationClient}).
 * @param params.blockNumber - Requested block number or tag; defaults to
 *   `latest`.
 * @param params.signal - Optional pipeline abort signal; checked around the
 *   request so an aborted pipeline never produces a pin.
 * @returns The resolved {@link PinnedBlock}.
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
}): Promise<PinnedBlock> {
  const { client, blockNumber, signal } = params;
  try {
    signal?.throwIfAborted();
    const block = await getBlock(
      client,
      typeof blockNumber === "bigint"
        ? { blockNumber }
        : { blockTag: blockNumber ?? "latest" },
    );
    signal?.throwIfAborted();
    if (block.number === null || block.hash === null) {
      throw new InvalidSimulationResponseError(
        "eth_getBlock returned a block without number or hash. Check that the endpoint resolved the requested state block.",
        { stage: "pinnedReads" },
      );
    }
    return {
      number: block.number,
      hash: block.hash,
      timestamp: block.timestamp,
    };
  } catch (error) {
    if (
      error instanceof InvalidSimulationResponseError ||
      error instanceof ExternalServiceError
    ) {
      throw error;
    }
    throw new ExternalServiceError(
      `eth_getBlock error: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}
