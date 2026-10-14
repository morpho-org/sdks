/**
 * Returns the Morpho eRPC fork URL for a chain when an eRPC secret is available.
 *
 * The returned URL embeds the secret, so never log it. When `secret` is absent or empty, this
 * returns `undefined`; `createViemTest` then falls back to the chain's public RPC URL.
 *
 * @param chainId - Chain to fork.
 * @param secret - Morpho eRPC secret.
 * @returns The authenticated fork URL, or `undefined` when no secret is set.
 * @example
 * ```ts
 * import { getErpcForkUrl } from "@morpho-org/test";
 * import { mainnet } from "viem/chains";
 *
 * getErpcForkUrl(mainnet.id, "key"); // "https://rpc.morpho.dev/cache/evm/1?secret=key"
 * getErpcForkUrl(mainnet.id, undefined); // undefined
 * ```
 */
export const getErpcForkUrl = (chainId: number, secret: string | undefined) =>
  secret == null || secret === ""
    ? undefined
    : `https://rpc.morpho.dev/cache/evm/${chainId}?secret=${encodeURIComponent(secret)}`;
