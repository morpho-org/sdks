import type { Address, Client } from "viem";
import { encodeErc20Permit } from "../encode/index.js";

interface GeneralAdapterPermitErc20Allowances {
  readonly generalAdapter1: bigint;
}

/**
 * Computes the EIP-2612 permit `Requirement` an integrator must sign so that `GeneralAdapter1`
 * can pull `amount` of `token`.
 *
 * Returns an empty array when the existing allowance for `GeneralAdapter1` already covers
 * `amount`.
 *
 * @param viemClient - Connected viem `Client` (used by the returned `Requirement.sign()`).
 * @param params.token - ERC-20 token address (must support EIP-2612).
 * @param params.chainId - The chain the bundle targets.
 * @param params.args.amount - Required token amount.
 * @param params.erc20Allowances - Current ERC-20 allowances keyed by spender contract name.
 * @param params.nonce - The user's current EIP-2612 nonce on `token`.
 * @param params.supportDeployless - Whether to fetch token metadata via deployless multicall.
 * @returns A single-element array containing the `Requirement` to sign, or an empty array when
 *   the existing allowance already covers `amount`.
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
 *   erc20Allowances: { generalAdapter1: 0n },
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
    erc20Allowances: GeneralAdapterPermitErc20Allowances;
    nonce: bigint;
    supportDeployless?: boolean;
  },
) => {
  const {
    token,
    chainId,
    args: { amount },
    erc20Allowances,
    nonce,
    supportDeployless,
  } = params;

  if (erc20Allowances.generalAdapter1 < amount) {
    return [
      await encodeErc20Permit(viemClient, {
        token,
        amount,
        chainId,
        nonce,
        supportDeployless,
      }),
    ];
  }

  return [];
};
