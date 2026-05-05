import { getChainAddresses } from "@morpho-org/blue-sdk";
import type { Account, Address, Chain, PublicClient, Transport } from "viem";
import { encodeErc20Permit } from "./encode/index.js";

/**
 * Computes the EIP-2612 permit `Requirement` an integrator must sign so that `GeneralAdapter1`
 * can pull `amount` of `token`.
 *
 * Returns an empty array when the existing allowance for `GeneralAdapter1` already covers
 * `amount`.
 *
 * @param viemClient - viem `Client` (used by `encodeErc20Permit` for `fetchToken`). Signing happens via the returned `Requirement.sign(walletClient, userAddress)`.
 * @param params.token - ERC-20 token address (must support EIP-2612).
 * @param params.chainId - The chain the bundle targets.
 * @param params.args.amount - Required token amount.
 * @param params.allowancesGeneralAdapter - The user's current allowance of `token` for
 *   `GeneralAdapter1`.
 * @param params.nonce - The user's current EIP-2612 nonce on `token`.
 * @param params.supportDeployless - Whether to fetch token metadata via deployless multicall.
 * @returns A single-element array containing the `Requirement` to sign, or an empty array when
 *   the existing allowance already covers `amount`.
 * @example
 * ```ts
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 * import { getRequirementsPermit } from "@morpho-org/morpho-sdk";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const reqs = await getRequirementsPermit(client, {
 *   token: USDC, // an ERC-2612-compatible token; DAI is excluded by getRequirements
 *   chainId: 1,
 *   args: { amount: 1_000_000n },
 *   allowancesGeneralAdapter: 0n,
 *   nonce: 0n,
 * });
 * // reqs satisfies Requirement[]
 * ```
 */
export const getRequirementsPermit = async (
  viemClient: PublicClient<Transport, Chain | undefined, Account | undefined>,
  params: {
    token: Address;
    chainId: number;
    args: { amount: bigint };
    allowancesGeneralAdapter: bigint;
    nonce: bigint;
    supportDeployless?: boolean;
  },
) => {
  const {
    token,
    chainId,
    args: { amount },
    allowancesGeneralAdapter,
    nonce,
    supportDeployless,
  } = params;

  const {
    bundler3: { generalAdapter1 },
  } = getChainAddresses(chainId);

  if (allowancesGeneralAdapter < amount) {
    return [
      await encodeErc20Permit(viemClient, {
        token,
        spender: generalAdapter1,
        amount,
        chainId,
        nonce,
        supportDeployless,
      }),
    ];
  }

  return [];
};
