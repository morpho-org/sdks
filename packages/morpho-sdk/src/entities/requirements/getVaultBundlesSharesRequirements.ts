import { type AccrualVault, AccrualVaultV2 } from "@morpho-org/blue-sdk";
import { erc2612Abi } from "@morpho-org/blue-sdk-viem";
import { getChainAddress, Time } from "@morpho-org/morpho-ts";
import type { Address, Client } from "viem";
import { erc20Abi } from "viem";
import { readContract } from "viem/actions";
import {
  encodeErc20Approval,
  encodeVaultSharesPermit,
} from "../../actions/index.js";
import { validateChainId } from "../../helpers/index.js";
import {
  type ActionRequirement,
  ExpiredDeadlineError,
} from "../../types/index.js";

/**
 * Resolves the exact vault-share approval or ERC-2612 requirement for a VaultBundlesV1 exit.
 *
 * @param viemClient - Client used to read the current share allowance and permit nonce.
 * @param params - Vault snapshot, owner, exact allowance, and deadline values.
 * @param params.vaultData - Accrued Vault V1 or Vault V2 snapshot whose runtime type selects the permit domain.
 * @param params.owner - Account whose vault shares VaultBundlesV1 will pull.
 * @param params.chainId - Target chain id; must match the client chain.
 * @param params.requiredShareAllowance - Exact share allowance required for the exit.
 * @param params.deadline - Final-call and permit deadline.
 * @param params.supportSignature - Whether an ERC-2612 permit may replace an approval transaction.
 * @returns No requirement when allowance is sufficient, otherwise one permit or approval.
 * @throws {ChainIdMismatchError} when the connected client targets another chain.
 * @throws {ExpiredDeadlineError} when the bundles deadline has elapsed.
 * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
 * @throws {UnknownAddressError} when VaultBundlesV1 is not registered for the chain.
 * @throws {viem.BaseError} when an allowance or nonce read fails.
 * @example
 * ```ts
 * import { fetchAccrualVault } from "@morpho-org/blue-sdk-viem";
 * import { getVaultBundlesSharesRequirements } from "@morpho-org/morpho-sdk";
 * import { Time } from "@morpho-org/morpho-ts";
 * import { createPublicClient, http, zeroAddress } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const vaultData = await fetchAccrualVault(
 *   "0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB",
 *   client,
 * );
 * const requirements = await getVaultBundlesSharesRequirements(client, {
 *   vaultData,
 *   owner: zeroAddress,
 *   chainId: mainnet.id,
 *   requiredShareAllowance: 1_000_000_000_000_000_000n,
 *   deadline: Time.timestamp() + Time.s.from.h(2n),
 *   supportSignature: true,
 * });
 * // requirements contains an approval, an ERC-2612 permit, or is empty.
 * ```
 */
export const getVaultBundlesSharesRequirements = async (
  viemClient: Client,
  params: {
    readonly vaultData: AccrualVault | AccrualVaultV2;
    readonly owner: Address;
    readonly chainId: number;
    readonly requiredShareAllowance: bigint;
    readonly deadline: bigint;
    readonly supportSignature: boolean;
  },
): Promise<readonly ActionRequirement[]> => {
  validateChainId(viemClient.chain?.id, params.chainId);
  const now = Time.timestamp();
  if (params.deadline <= now) {
    throw new ExpiredDeadlineError(params.deadline, now);
  }
  const spender = getChainAddress(params.chainId, "bundles.vaultBundlesV1");
  const allowance = await readContract(viemClient, {
    address: params.vaultData.address,
    abi: erc20Abi,
    functionName: "allowance",
    args: [params.owner, spender],
  });
  if (allowance >= params.requiredShareAllowance) return [];
  if (params.supportSignature) {
    const nonce = await readContract(viemClient, {
      address: params.vaultData.address,
      abi: erc2612Abi,
      functionName: "nonces",
      args: [params.owner],
    });
    return [
      encodeVaultSharesPermit({
        vault: params.vaultData,
        version:
          params.vaultData instanceof AccrualVaultV2 ? "vaultV2" : "vaultV1",
        spender,
        owner: params.owner,
        chainId: params.chainId,
        nonce,
        amount: params.requiredShareAllowance,
        deadline: params.deadline,
      }),
    ];
  }
  return [
    encodeErc20Approval({
      token: params.vaultData.address,
      spender,
      amount: params.requiredShareAllowance,
      chainId: params.chainId,
    }),
  ];
};
