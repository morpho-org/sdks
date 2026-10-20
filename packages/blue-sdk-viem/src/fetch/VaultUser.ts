import { VaultUser } from "@morpho-org/blue-sdk";
import { type Address, type Client, erc20Abi } from "viem";

import { readContract } from "viem/actions";
import { metaMorphoAbi } from "../abis.js";
import { abi, code } from "../queries/GetVaultUser.js";
import type { DeploylessFetchParameters } from "../types.js";
import { isTransportError } from "../utils.js";
import { fetchVaultConfig } from "./VaultConfig.js";

/**
 * Fetches a user's MetaMorpho vault allowance and allocator status.
 *
 * Uses the deployless `GetVaultUser` query by default and falls back to the vault asset allowance
 * and `isAllocator(user)` reads when allowed.
 *
 * Only `name`, `symbol` and `eip712Domain` resolve to `undefined`, and only when the call
 * reverts or the contract has no code. A `name`/`symbol` that does not decode as `string` is
 * retried as `bytes32`; a malformed `bytes32` retry or `eip712Domain()` result throws
 * `MalformedTokenMetadataError`, and transport errors propagate.
 *
 * @param vault - MetaMorpho vault address.
 * @param user - User address whose vault state is fetched.
 * @param client - Viem client used for deployless reads or multicalls.
 * @param parameters.account - Optional account passed to viem calls.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.deployless - Optional deployless read mode; defaults to `true`.
 * @returns The hydrated `VaultUser` entity.
 * @throws {UnsupportedChainIdError} when the client's chain is absent from the address registry
 * (multicall fallback only; the default deployless read skips the registry lookup).
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
 * import type { VaultUser } from "@morpho-org/blue-sdk";
 * import { fetchVaultUser } from "@morpho-org/blue-sdk-viem";
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const vault = "0x9a8bC3B04b7f3D87cfC09ba407dCED575f2d61D8";
 * const user = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";
 *
 * const vaultUser: VaultUser = await fetchVaultUser(vault, user, client);
 * ```
 */
// biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
export async function fetchVaultUser(
  vault: Address,
  user: Address,
  client: Client,
  { deployless = true, ...parameters }: DeploylessFetchParameters = {},
) {
  /* v8 ignore next: V8 reports a negative false-branch count here; deployless=false is tested. */
  if (deployless) {
    try {
      const { isAllocator, allowance } = await readContract(client, {
        ...parameters,
        abi,
        code,
        functionName: "query",
        args: [vault, user],
      });

      return new VaultUser({
        vault,
        user,
        isAllocator,
        allowance,
      });
    } catch (error) {
      if (deployless === "force" || isTransportError(error)) throw error;
      // Fallback to multicall if deployless call fails.
    }
  }

  const config = await fetchVaultConfig(vault, client, {
    ...parameters,
    deployless,
  });

  const [allowance, isAllocator] = await Promise.all([
    readContract(client, {
      ...parameters,
      address: config.asset,
      abi: erc20Abi,
      functionName: "allowance",
      args: [user, vault],
    }),
    readContract(client, {
      ...parameters,
      address: vault,
      abi: metaMorphoAbi,
      functionName: "isAllocator",
      args: [user],
    }),
  ]);

  return new VaultUser({
    vault,
    user,
    isAllocator,
    allowance,
  });
}
