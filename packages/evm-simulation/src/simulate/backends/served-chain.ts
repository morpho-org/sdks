import type { Client } from "viem";
import { getChainId } from "viem/actions";
import {
  InvalidChainIdError,
  RpcTransportError,
  SimulationValidationError,
  SlippageCheckUnavailableError,
} from "../../errors.js";

/**
 * Relabel a boundary failure, or the contract-code check's
 * {@link SimulationValidationError}, as {@link InvalidChainIdError} when the
 * endpoint serves another chain.
 *
 * Probes `eth_chainId` only after an {@link RpcTransportError},
 * {@link SlippageCheckUnavailableError} or a {@link SimulationValidationError}
 * from the contract-code check, so a successful simulation sends no extra
 * request. An honest endpoint on another chain fails the first way when the
 * requested block is above its head ("block / header not found"), the second
 * way when a quoted market or vault does not exist there, and the third way
 * when a calldata target has no code there. A failed probe or a matching chain
 * keeps the original error.
 *
 * @param params - Probe parameters.
 * @param params.client - Shared simulation client.
 * @param params.chainId - Chain the request targets.
 * @param params.error - Error thrown by a boundary call.
 * @returns The error to throw: an {@link InvalidChainIdError} caused by the
 *   slippage-check or validation error, or by an {@link RpcTransportError}'s
 *   underlying cause, when the endpoint reports another chain; otherwise
 *   `error` unchanged.
 * @internal
 */
export async function toServedChainError(params: {
  readonly client: Client;
  readonly chainId: number;
  readonly error: unknown;
}): Promise<unknown> {
  const { client, chainId, error } = params;
  if (
    !(error instanceof RpcTransportError) &&
    !(error instanceof SlippageCheckUnavailableError) &&
    !(error instanceof SimulationValidationError)
  ) {
    return error;
  }
  const served = await getChainId(client).catch(() => undefined);
  if (served === undefined || served === chainId) return error;
  const cause = error instanceof RpcTransportError ? error.cause : error;
  return new InvalidChainIdError(
    `Simulation endpoint serves chain ${served}, not ${chainId} (${error.message}). Point SimulationConfig.chains at an RPC URL for this chain.`,
    { cause },
  );
}
