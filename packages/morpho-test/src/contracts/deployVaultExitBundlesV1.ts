import { getChainAddress } from "@morpho-org/blue-sdk";
import type { AnvilTestClient } from "@morpho-org/test";
import type { Address } from "viem";
import { abi, code } from "./VaultExitBundlesV1.js";

/**
 * Deploys `VaultExitBundlesV1` onto a fork from the client's test account.
 *
 * Lets tests exercise vault-exit flows before the contract is deployed on any live chain. Each call
 * deploys a fresh instance, so the address follows the test account's nonce — read it from the
 * return value rather than assuming it.
 *
 * @param client - Anvil test client connected to the fork to deploy onto.
 * @param blue - Morpho Blue core address baked into the contract's immutable `BLUE`. Defaults to the
 *               `blue` address registered for the client's chain.
 * @returns The address the contract is deployed at.
 * @throws UnsupportedChainIdError when `blue` is omitted and the client's chain has no address registry.
 * @throws UnknownAddressError when `blue` is omitted and the client's chain has no registered `blue` address.
 * @example
 * ```ts
 * import { deployVaultExitBundlesV1, vaultExitBundlesV1Abi } from "@morpho-org/morpho-test";
 * import { createViemTest } from "@morpho-org/test/vitest";
 * import { mainnet } from "viem/chains";
 *
 * const test = createViemTest(mainnet, { forkBlockNumber: 19_530_000 });
 *
 * test("exits a vault", async ({ client }) => {
 *   const vaultExitBundles = await deployVaultExitBundlesV1(client);
 *   // vaultExitBundles satisfies `0x${string}`
 *
 *   await client.readContract({
 *     address: vaultExitBundles,
 *     abi: vaultExitBundlesV1Abi,
 *     functionName: "BLUE",
 *   });
 * });
 * ```
 */
export const deployVaultExitBundlesV1 = async (
  client: AnvilTestClient,
  blue: Address = getChainAddress(client.chain.id, "blue"),
): Promise<Address> =>
  (await client.deployContractWait({ abi, bytecode: code, args: [blue] }))
    .contractAddress;
