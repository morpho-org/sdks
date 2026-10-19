import { VaultConfig } from "@morpho-org/blue-sdk";
import type { Address, Client } from "viem";
import { readContract } from "viem/actions";
import { metaMorphoAbi } from "../abis.js";
import type { DeploylessFetchParameters } from "../types.js";
import { fetchToken } from "./Token.js";

/**
 * Fetches immutable and token-derived MetaMorpho vault configuration.
 *
 * Reads token metadata through `fetchToken`, plus `asset()` and `DECIMALS_OFFSET()` from the vault.
 *
 * Only `name`, `symbol` and `eip712Domain` resolve to `undefined`, and only when the call
 * reverts or the contract has no code. A `name`/`symbol` that does not decode as `string` is
 * retried as `bytes32`; a malformed `bytes32` retry or `eip712Domain()` result throws
 * `MalformedTokenMetadataError`, and transport errors propagate.
 *
 * @param address - MetaMorpho vault address.
 * @param client - Viem client used for deployless reads or multicalls.
 * @param parameters.account - Optional account passed to viem calls.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.deployless - Optional deployless read mode forwarded to token metadata reads.
 * @returns The hydrated `VaultConfig` entity.
 * @throws {UnsupportedChainIdError} when the client's chain is absent from the address registry.
 * @throws {UnknownTokenError} when the vault share token's `decimals()` reverts, has no code,
 *   returns undecodable data, or is out of range.
 * @throws {MalformedTokenMetadataError} when the share token's `eip712Domain()` or
 *   `bytes32` `name`/`symbol` retry returns non-empty data that does not decode, or when the
 *   deployless query reports malformed `name()`/`symbol()`/`eip712Domain()` returndata (no fallback).
 * @throws {viem.BaseError} when an RPC transport failure occurs; its cause chain contains a
 * viem.HttpRequestError, viem.TimeoutError, viem.LimitExceededRpcError, viem.SocketClosedError, or viem.WebSocketRequestError (detect with
 * isTransportError).
 * @example
 * ```ts
 * import type { VaultConfig } from "@morpho-org/blue-sdk";
 * import { fetchVaultConfig } from "@morpho-org/blue-sdk-viem";
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const vault = "0x9a8bC3B04b7f3D87cfC09ba407dCED575f2d61D8";
 *
 * const config: VaultConfig = await fetchVaultConfig(vault, client);
 * ```
 */
// biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
export async function fetchVaultConfig(
  address: Address,
  client: Client,
  { ...parameters }: DeploylessFetchParameters = {},
) {
  const [token, asset, decimalsOffset] = await Promise.all([
    fetchToken(address, client, parameters), // TODO: avoid fetching decimals
    readContract(client, {
      ...parameters,
      address,
      abi: metaMorphoAbi,
      functionName: "asset",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: metaMorphoAbi,
      functionName: "DECIMALS_OFFSET",
    }),
  ]);

  return new VaultConfig({
    ...token,
    asset,
    decimalsOffset: BigInt(decimalsOffset),
  });
}
