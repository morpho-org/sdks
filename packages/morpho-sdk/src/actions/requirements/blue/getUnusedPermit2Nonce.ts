import { permit2Abi } from "@morpho-org/blue-sdk-viem";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, type Client, maxUint256 } from "viem";
import { readContract } from "viem/actions";
import { validateChainId } from "../../../helpers/index.js";
import { validateUint256Field } from "../../../helpers/validate.js";
import { NoUnusedPermit2NonceError } from "../../../types/index.js";

/** Parameters for {@link getUnusedPermit2Nonce}. */
export interface GetUnusedPermit2NonceParams {
  /** Account that will sign the Permit2 SignatureTransfer. */
  readonly owner: Address;
  /** Target chain id; must match the connected client chain. */
  readonly chainId: number;
  /** Lowest nonce to consider; defaults to 0. */
  readonly startNonce?: bigint;
}

/** Highest Permit2 nonce-bitmap word index; each word covers 256 unordered nonces. */
const MAX_PERMIT2_NONCE_WORD = maxUint256 >> 8n;

/**
 * Finds the lowest unused Permit2 unordered nonce for `owner`, ready to pass as `permit2Nonce` to
 * {@link getBlueBundlesV1TokenRequirements} or as `nonce` to {@link encodeErc20Permit2TransferFrom}.
 *
 * Permit2 SignatureTransfer consumes an unordered 256-bit nonce; a nonce is free when its bit in
 * `nonceBitmap(owner, word)` is unset. This scans consecutive bitmap words starting at `startNonce`
 * (one RPC read per 256 nonces) and returns the first free nonce, so integrators do not reimplement
 * the scan. Concurrent flows for the same owner should advance `startNonce` (or read once, then
 * partition locally) so two signatures never race on the same owner-global nonce.
 *
 * @param viemClient - Connected viem client used for the bitmap reads.
 * @param params - Lookup parameters.
 * @param params.owner - Account that will sign the SignatureTransfer.
 * @param params.chainId - Target chain id; must match the client chain.
 * @param params.startNonce - Lowest nonce to consider; defaults to 0.
 * @returns The lowest unused Permit2 nonce at or after `startNonce`.
 * @throws {ChainIdMismatchError} when the connected client targets another chain.
 * @throws {NegativeInputError} when `startNonce` is negative.
 * @throws {InputExceedsMaxError} when `startNonce` exceeds `uint256`.
 * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
 * @throws {UnknownAddressError} when the chain has no registered canonical Permit2 deployment.
 * @throws {NoUnusedPermit2NonceError} when every nonce at or after `startNonce` is consumed.
 * @example
 * ```ts
 * import { createPublicClient, http, zeroAddress } from "viem";
 * import { mainnet } from "viem/chains";
 * import { getUnusedPermit2Nonce } from "@morpho-org/morpho-sdk";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const permit2Nonce = await getUnusedPermit2Nonce(client, {
 *   owner: zeroAddress,
 *   chainId: mainnet.id,
 * });
 * // permit2Nonce satisfies bigint
 * ```
 */
export const getUnusedPermit2Nonce = async (
  viemClient: Client,
  params: GetUnusedPermit2NonceParams,
): Promise<bigint> => {
  validateChainId(viemClient.chain?.id, params.chainId);
  const startNonce = params.startNonce ?? 0n;
  validateUint256Field("startNonce", startNonce);
  const permit2 = getChainAddress(params.chainId, "permit2");

  const startWord = startNonce >> 8n;
  for (let word = startWord; word <= MAX_PERMIT2_NONCE_WORD; word++) {
    const bitmap = await readContract(viemClient, {
      abi: permit2Abi,
      address: permit2,
      functionName: "nonceBitmap",
      args: [params.owner, word],
    });
    const firstBit = word === startWord ? startNonce & 255n : 0n;
    for (let bit = firstBit; bit <= 255n; bit++) {
      if ((bitmap & (1n << bit)) === 0n) {
        return (word << 8n) | bit;
      }
    }
  }
  throw new NoUnusedPermit2NonceError(params.owner, startNonce);
};
