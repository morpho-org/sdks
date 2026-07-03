import type { Address, Client } from "viem";
import { encodeErc20Permit } from "../encode/index.js";

/**
 * Computes the EIP-2612 permit `Requirement` an integrator must sign so that `GeneralAdapter1`
 * can pull `amount` of `token`.
 *
 * @param viemClient - Connected viem `Client` (used by the returned `Requirement.sign()`).
 * @param params.token - ERC-20 token address (must support EIP-2612).
 * @param params.chainId - The chain the bundle targets.
 * @param params.args.amount - Required token amount.
 * @param params.nonce - The user's current EIP-2612 nonce on `token`.
 * @param params.supportDeployless - Whether to fetch token metadata via deployless multicall.
 * @returns A single-element array containing the exact-amount `Requirement` to sign.
 * @example
 * ```ts
 * import { createWalletClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 * import { getGeneralAdapterRequirementsPermit } from "@morpho-org/morpho-sdk";
 *
 * const client = createWalletClient({ chain: mainnet, transport: http() });
 * const reqs = await getGeneralAdapterRequirementsPermit(client, {
 *   token: USDC, // an ERC-2612-compatible token; DAI is excluded by getGeneralAdapterRequirements
 *   chainId: 1,
 *   args: { amount: 1_000_000n },
 *   nonce: 0n,
 * });
 * // reqs satisfies Requirement[]
 * ```
 */
export const getGeneralAdapterRequirementsPermit = async (
  viemClient: Client,
  params: {
    token: Address;
    chainId: number;
    args: { amount: bigint };
    nonce: bigint;
    supportDeployless?: boolean;
  },
) => {
  const {
    token,
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
      amount,
      chainId,
      nonce,
      supportDeployless,
    }),
  ];
};
