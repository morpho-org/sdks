import type { Address, Client } from "viem";
import type {
  PermitRequirementSignature,
  Requirement,
} from "../../../types/index.js";
import { encodeErc20Permit } from "../encode/index.js";

/**
 * Computes the EIP-2612 permit `Requirement` that lets MidnightBundles pull `amount` of `token`.
 *
 * @param viemClient - Connected viem `Client` (used by the returned `Requirement.sign()`).
 * @param params.token - ERC-20 token address (must support EIP-2612).
 * @param params.spender - MidnightBundles address that will spend the permit.
 * @param params.chainId - The chain the bundle targets.
 * @param params.args.amount - Required token amount.
 * @param params.nonce - The user's current EIP-2612 nonce on `token`.
 * @param params.supportDeployless - Whether to fetch token metadata via deployless multicall.
 * @returns A single-element array containing the exact-amount `Requirement` to sign.
 * @example
 * ```ts
 * import { getMidnightBundlesRequirementsPermit } from "@morpho-org/morpho-sdk";
 *
 * const reqs = await getMidnightBundlesRequirementsPermit(client, {
 *   token: USDC,
 *   spender: midnightBundles,
 *   chainId: 1,
 *   args: { amount: 1_000_000n },
 *   nonce: 0n,
 * });
 * ```
 */
export const getMidnightBundlesRequirementsPermit = async (
  viemClient: Client,
  params: {
    readonly token: Address;
    readonly spender: Address;
    readonly chainId: number;
    readonly args: { readonly amount: bigint };
    readonly nonce: bigint;
    readonly supportDeployless?: boolean;
  },
): Promise<readonly Requirement<PermitRequirementSignature>[]> => {
  const {
    token,
    spender,
    chainId,
    args: { amount },
    nonce,
    supportDeployless,
  } = params;

  // Existing direct ERC-20 allowance is intentionally not an input here. ERC-2612 overwrites the
  // allowance with the signed amount, and the bundle spends exactly `amount`, leaving no residual
  // allowance after inclusion.
  return [
    await encodeErc20Permit(viemClient, {
      token,
      spender,
      amount,
      chainId,
      nonce,
      supportDeployless,
    }),
  ];
};
