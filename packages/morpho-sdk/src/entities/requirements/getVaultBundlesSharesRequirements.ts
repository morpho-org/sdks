import type { AccrualVault, AccrualVaultV2 } from "@morpho-org/blue-sdk";
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
 * @returns No requirement when allowance is sufficient, otherwise one permit or approval.
 * @throws {ExpiredDeadlineError} when the bundles deadline has elapsed.
 * @throws {viem.BaseError} when an allowance or nonce read fails.
 */
export const getVaultBundlesSharesRequirements = async (
  viemClient: Client,
  params: {
    readonly vaultData: AccrualVault | AccrualVaultV2;
    readonly version: "vaultV1" | "vaultV2";
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
        version: params.version,
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
