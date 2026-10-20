import type { Client } from "viem";
import { getChainId } from "viem/actions";
import { validateChainId } from "../../helpers/validate.js";

/**
 * Validates both the chain the viem client declares and the chain its transport serves.
 *
 * Sends one `eth_chainId` request per call; the result is never cached, so every flow observes the
 * endpoint it actually reads from. An honest RPC connected to another chain fails here, before any
 * state read. A provider that lies about `eth_chainId` is not detected (see THREAT_MODEL.md, RPC).
 *
 * @param client - Viem client whose declared chain and transport are checked.
 * @param expectedChainId - Chain ID expected by the entity or action.
 * @returns Resolves only when both the declared and the observed chain IDs equal
 *   `expectedChainId`.
 * @throws {ChainIdMismatchError} when the declared or the observed chain ID differs from
 *   `expectedChainId`.
 * @throws {viem.BaseError} when the `eth_chainId` request fails.
 * @example
 * ```ts
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 * import { validateClientChainId } from "@morpho-org/morpho-sdk";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * await validateClientChainId(client, mainnet.id);
 * ```
 */
export const validateClientChainId = async (
  client: Client,
  expectedChainId: number,
): Promise<void> => {
  validateChainId(client.chain?.id, expectedChainId);
  validateChainId(await getChainId(client), expectedChainId);
};
