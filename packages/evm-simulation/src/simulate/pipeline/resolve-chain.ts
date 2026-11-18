import type { Client } from "viem";
import {
  InvalidChainIdError,
  SimulationValidationError,
  UnsupportedChainError,
} from "../../errors.js";
import type {
  ChainSimulationClientConfig,
  ChainSimulationConfigEntry,
  SimulationConfig,
} from "../../types.js";
import { createSimulationClient } from "../backends/client.js";

/**
 * Stage 2 of the simulate() pipeline.
 *
 * Looks up the per-chain `ChainSimulationConfigEntry`. Throws `UnsupportedChainError`
 * when the chain is absent from the map or has neither a `client` nor a valid
 * deprecated `simulateV1Url`. Supplying both throws `SimulationValidationError`. Throws
 * `SimulationValidationError` when `blockOverrides.gasLimit` or
 * `callGasLimit` is set but is not a positive bigint, or `parentHashCheck` is
 * set but is not a boolean, so configuration failures are reported before
 * attempting RPC execution. Requires disabled CCIP-Read, zero transport retries,
 * no fallback transport, and a matching client chain when specified.
 */
export function resolveChain(
  config: SimulationConfig,
  {
    chainId,
    signal,
  }: { readonly chainId: number; readonly signal?: AbortSignal },
): Omit<ChainSimulationConfigEntry, "client" | "simulateV1Url"> & {
  readonly client: Client;
} {
  const entry:
    | (ChainSimulationConfigEntry & { readonly client?: Client })
    | undefined = config.chains.get(chainId);
  if (entry?.client !== undefined && entry.simulateV1Url !== undefined)
    throw new SimulationValidationError(
      `Chain ${chainId} supplies both client and simulateV1Url. Supply only client or the deprecated simulateV1Url.`,
      ["client, simulateV1Url: mutually exclusive"],
    );
  if (!entry) throw new UnsupportedChainError(chainId);
  let client = entry.client;
  if (!client) {
    if (typeof entry.simulateV1Url !== "string" || !entry.simulateV1Url)
      throw new UnsupportedChainError(chainId);
    client = createSimulationClient(entry.simulateV1Url, signal);
  }
  const resolved = entry.client
    ? (entry as ChainSimulationClientConfig)
    : { ...entry, client };
  if (client.ccipRead !== false)
    throw new SimulationValidationError(
      `Chain ${chainId} client.ccipRead must be false. Create the client with ccipRead: false to prevent offchain URL fetches.`,
      ["client.ccipRead: must be false"],
    );
  if (client.transport.type === "fallback")
    throw new SimulationValidationError(
      `Chain ${chainId} client transport must not use fallback. Supply a single-provider transport.`,
      ["client.transport.type: fallback is forbidden"],
    );
  if (client.transport.retryCount !== 0)
    throw new SimulationValidationError(
      `Chain ${chainId} client transport retryCount must be 0, got "${String(client.transport.retryCount)}". Set retryCount: 0 on the transport.`,
      ["client.transport.retryCount: must be 0"],
    );
  if (client.chain !== undefined && client.chain.id !== chainId)
    throw new InvalidChainIdError(
      `Client chainId "${client.chain.id}" does not match configured chain "${chainId}". Supply a client for this chain.`,
    );
  const gasLimit: unknown = entry.blockOverrides?.gasLimit;
  if (
    gasLimit !== undefined &&
    (typeof gasLimit !== "bigint" || gasLimit <= 0n)
  )
    throw new SimulationValidationError(
      `Chain ${chainId} blockOverrides.gasLimit must be a positive bigint, got "${String(gasLimit)}" (${typeof gasLimit}). Pass a bigint greater than 0n or omit gasLimit.`,
      ["blockOverrides.gasLimit: must be a positive bigint"],
    );
  const callGasLimit: unknown = entry.callGasLimit;
  if (
    callGasLimit !== undefined &&
    (typeof callGasLimit !== "bigint" || callGasLimit <= 0n)
  )
    throw new SimulationValidationError(
      `Chain ${chainId} callGasLimit must be a positive bigint, got "${String(callGasLimit)}" (${typeof callGasLimit}). Pass a bigint greater than 0n or omit callGasLimit.`,
      ["callGasLimit: must be a positive bigint"],
    );
  const parentHashCheck: unknown = entry.parentHashCheck;
  if (parentHashCheck !== undefined && typeof parentHashCheck !== "boolean")
    throw new SimulationValidationError(
      `Chain ${chainId} parentHashCheck must be a boolean, got "${String(parentHashCheck)}" (${typeof parentHashCheck}). Pass true or false, or omit parentHashCheck.`,
      ["parentHashCheck: must be a boolean"],
    );
  return resolved;
}
