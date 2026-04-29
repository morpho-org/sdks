import type { Client } from "viem";
import type { Metadata } from "../types/index.js";
import { MorphoClient } from "./morphoClient.js";

/**
 * Morpho extension for viem clients.
 * Adds `morpho` namespace with `vaultV1` and `vaultV2` accessors.
 *
 * @param metadata - (Optional) Metadata appended to all transactions for analytics.
 * @param supportSignature - (Optional) Enable off-chain permit/permit2 approvals.
 * @param supportDeployless - (Optional) Enable deployless reads for on-chain data fetching.
 * @returns Extension function that adds morpho namespace to viem clients.
 *
 * @example
 * ```ts
 * import { createWalletClient, http } from 'viem';
 * import { mainnet } from 'viem/chains';
 * import { morphoViemExtension } from '@morpho-org/morpho-sdk';
 *
 * const client = createWalletClient({
 *   chain: mainnet,
 *   transport: http(),
 *   account: '0x...',
 * }).extend(morphoViemExtension());
 *
 * // VaultV1 (MetaMorpho)
 * const vaultV1 = client.morpho.vaultV1('0x...', 1);
 * const depositV1 = await vaultV1.deposit({ amount: 1000000000000000000n, userAddress: '0x...' });
 *
 * // VaultV2
 * const vaultV2 = client.morpho.vaultV2('0x...', 1);
 * ```
 */
export function morphoViemExtension(_options?: {
  readonly metadata?: Metadata;
  readonly supportSignature?: boolean;
  readonly supportDeployless?: boolean;
}) {
  return <TClient extends Client>(client: TClient) => {
    return {
      morpho: new MorphoClient(client, _options),
    };
  };
}
