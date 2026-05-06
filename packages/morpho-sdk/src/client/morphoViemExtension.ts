import type { PublicClient } from "viem";
import type { Metadata } from "../types/index.js";
import { MorphoClient } from "./morphoClient.js";

/**
 * Returns a viem `extend(...)` function that adds a `morpho` namespace to a viem client. The
 * namespace exposes a `MorphoClient` instance built from the same client and the supplied
 * options.
 *
 * @param _options - Optional SDK-wide options forwarded to the inner `MorphoClient`.
 * @param _options.metadata - Optional analytics metadata applied to every transaction the
 *   resulting `MorphoClient` builds.
 * @param _options.supportSignature - Whether the integrator can collect EIP-712 signatures for
 *   permit / permit2.
 * @param _options.supportDeployless - Whether entity fetchers may use deployless multicall.
 * @returns A viem extension function — `client.extend(morphoViemExtension(...))` adds
 *   `client.morpho`.
 * @example
 * ```ts
 * import { createWalletClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 * import { morphoViemExtension } from "@morpho-org/morpho-sdk";
 *
 * const client = createWalletClient({
 *   chain: mainnet,
 *   transport: http(),
 *   account: user,
 * }).extend(morphoViemExtension({ supportSignature: true }));
 *
 * const vault = client.morpho.vaultV1(vaultAddress, 1);
 * const accrualVault = await vault.getData();
 * const { buildTx } = vault.deposit({
 *   amount: 1_000_000n,
 *   userAddress: user,
 *   accrualVault,
 * });
 * const tx = buildTx();
 * ```
 */
export function morphoViemExtension(_options?: {
  readonly metadata?: Metadata;
  readonly supportSignature?: boolean;
  readonly supportDeployless?: boolean;
}) {
  return <TClient extends PublicClient>(client: TClient) => {
    return {
      morpho: new MorphoClient(client, _options),
    };
  };
}
