import { getChainAddress } from "@morpho-org/blue-sdk";
import type { AnvilTestClient } from "@morpho-org/test";
import {
  type Address,
  concatHex,
  encodeDeployData,
  getCreate2Address,
  zeroHash,
} from "viem";
import { abi, code } from "./VaultExitBundlesV1.js";

/**
 * Canonical CREATE2 deterministic deployment proxy, live at this address on Ethereum mainnet and
 * every major EVM chain.
 *
 * @see https://github.com/Arachnid/deterministic-deployment-proxy
 */
export const DETERMINISTIC_DEPLOYER_ADDRESS =
  "0x4e59b44847b379578588920cA78FbF26c0B4956C";

/**
 * Thrown when the fork has no CREATE2 deterministic deployment proxy to deploy through.
 *
 * @example
 * ```ts
 * import { MissingDeterministicDeployerError } from "@morpho-org/morpho-test";
 *
 * throw new MissingDeterministicDeployerError(1);
 * ```
 */
export class MissingDeterministicDeployerError extends Error {
  public constructor(public readonly chainId: number) {
    super(
      `No CREATE2 deterministic deployment proxy at "${DETERMINISTIC_DEPLOYER_ADDRESS}" on chain "${chainId}". Fork a block mined after the proxy was deployed, or set its code on the fork before deploying.`,
    );
    this.name = "MissingDeterministicDeployerError";
  }
}

/**
 * Thrown when a `VaultExitBundlesV1` deployment transaction left no code behind.
 *
 * @example
 * ```ts
 * import { VaultExitBundlesV1DeploymentError } from "@morpho-org/morpho-test";
 *
 * throw new VaultExitBundlesV1DeploymentError("0x…");
 * ```
 */
export class VaultExitBundlesV1DeploymentError extends Error {
  public constructor(public readonly address: Address) {
    super(
      `Deploying VaultExitBundlesV1 left no code at "${address}". Check that the fork has automine enabled, and that its block gas limit and code size limit fit the contract.`,
    );
    this.name = "VaultExitBundlesV1DeploymentError";
  }
}

/**
 * Computes the address a `VaultExitBundlesV1` deployment lands on, without deploying it.
 *
 * The address depends only on `blue`, so it is stable across forks and test runs — which is what
 * makes registering it with `registerCustomAddresses` idempotent.
 *
 * @param blue - Morpho Blue core address baked into the contract's immutable `BLUE`.
 * @returns The address a matching deployment lands on.
 * @example
 * ```ts
 * import { getChainAddress } from "@morpho-org/blue-sdk";
 * import { getVaultExitBundlesV1Address } from "@morpho-org/morpho-test";
 * import { mainnet } from "viem/chains";
 *
 * const address = getVaultExitBundlesV1Address(getChainAddress(mainnet.id, "blue"));
 * // address satisfies `0x${string}`
 * ```
 */
export const getVaultExitBundlesV1Address = (blue: Address): Address =>
  getCreate2Address({
    from: DETERMINISTIC_DEPLOYER_ADDRESS,
    salt: zeroHash,
    bytecode: encodeDeployData({ abi, bytecode: code, args: [blue] }),
  });

/**
 * Deploys `VaultExitBundlesV1` onto a fork through the CREATE2 deterministic deployment proxy.
 *
 * Lets tests exercise vault-exit flows before the contract is deployed on any live chain. Deploying
 * again with the same `blue` returns the existing address instead of reverting.
 *
 * Requires the fork to have automine enabled, which is the default for `createViemTest`. Under
 * `noMining: true` the deployment transaction stays pending, so the deployed code is never
 * observable and this throws {@link VaultExitBundlesV1DeploymentError}; mine the block yourself and
 * call again, or drop `noMining`.
 *
 * @param client - Anvil test client connected to the fork to deploy onto.
 * @param blue - Morpho Blue core address baked into the contract's immutable `BLUE`. Defaults to the
 *               `blue` address registered for the client's chain.
 * @returns The address the contract is deployed at.
 * @throws UnsupportedChainIdError when `blue` is omitted and the client's chain has no address registry.
 * @throws UnknownAddressError when `blue` is omitted and the client's chain has no registered `blue` address.
 * @throws MissingDeterministicDeployerError when the fork has no CREATE2 deterministic deployment proxy.
 * @throws VaultExitBundlesV1DeploymentError when the deployment transaction leaves no code behind.
 * @example
 * ```ts
 * import { registerCustomAddresses } from "@morpho-org/blue-sdk";
 * import { deployVaultExitBundlesV1 } from "@morpho-org/morpho-test";
 * import { createViemTest } from "@morpho-org/test/vitest";
 * import { mainnet } from "viem/chains";
 *
 * const test = createViemTest(mainnet, { forkBlockNumber: 19_530_000 });
 *
 * test("exits a vault", async ({ client }) => {
 *   const vaultExitBundles = await deployVaultExitBundlesV1(client);
 *   // vaultExitBundles satisfies `0x${string}`
 *
 *   registerCustomAddresses({ addresses: { [mainnet.id]: { vaultExitBundles } } });
 * });
 * ```
 */
export const deployVaultExitBundlesV1 = async (
  client: AnvilTestClient,
  blue: Address = getChainAddress(client.chain.id, "blue"),
): Promise<Address> => {
  const address = getVaultExitBundlesV1Address(blue);
  if ((await client.getCode({ address })) != null) return address;

  if (
    (await client.getCode({ address: DETERMINISTIC_DEPLOYER_ADDRESS })) == null
  )
    throw new MissingDeterministicDeployerError(client.chain.id);

  await client.sendTransaction({
    to: DETERMINISTIC_DEPLOYER_ADDRESS,
    data: concatHex([
      zeroHash,
      encodeDeployData({ abi, bytecode: code, args: [blue] }),
    ]),
  });

  // `sendTransaction` waits for the receipt but does not throw on a reverted status.
  if ((await client.getCode({ address })) == null)
    throw new VaultExitBundlesV1DeploymentError(address);

  return address;
};
