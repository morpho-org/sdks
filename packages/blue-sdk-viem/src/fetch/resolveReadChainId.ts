import { ChainMismatchError, type Client } from "viem";
import { getChainId } from "viem/actions";

/** @internal */
export async function resolveReadChainId(
  client: Client,
  chainId: number | undefined,
): Promise<number> {
  if (
    chainId !== undefined &&
    client.chain !== undefined &&
    chainId !== client.chain.id
  ) {
    throw new ChainMismatchError({
      chain: { ...client.chain, id: chainId, name: `Chain ${chainId}` },
      currentChainId: client.chain.id,
    });
  }

  return chainId ?? (await getChainId(client));
}
