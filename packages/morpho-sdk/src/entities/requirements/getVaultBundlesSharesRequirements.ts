import type { Token } from "@morpho-org/blue-sdk";
import { erc2612Abi } from "@morpho-org/blue-sdk-viem";
import { getChainAddress, Time } from "@morpho-org/morpho-ts";
import type { Address, Client } from "viem";
import { erc20Abi, maxUint256 } from "viem";
import { readContract } from "viem/actions";
import {
  encodeErc20Approval,
  encodeVaultSharesPermit,
} from "../../actions/index.js";
import { validateClientChainId } from "../../actions/requirements/validateClientChainId.js";
import { validateChainId } from "../../helpers/index.js";
import {
  type ActionRequirement,
  ExpiredDeadlineError,
} from "../../types/index.js";

/**
 * Resolves the vault-share approval or ERC-2612 requirement for a VaultBundlesV1 exit.
 *
 * An allowance at least as large as `requiredShareAllowance` satisfies the requirement. Otherwise
 * the helper returns a maxUint256 approval or, when supported, a vault-share permit.
 *
 * @internal
 *
 * @param viemClient - Client used to read the current share allowance and permit nonce.
 * @param params - Vault snapshot, owner, minimum allowance, and deadline values.
 * @param params.now - Timestamp the deadline is validated against; defaults to the current time.
 * @returns No requirement when the allowance is sufficient, otherwise one approval or permit.
 * @throws {ChainIdMismatchError} when the client declares, or its RPC reports via `eth_chainId`,
 *   another chain than `params.chainId`.
 * @throws {ExpiredDeadlineError} when the bundles deadline has elapsed.
 * @throws {viem.BaseError} when an allowance, permit nonce, or `eth_chainId` read fails.
 */
export const getVaultBundlesSharesRequirements = async (
  viemClient: Client,
  params: {
    readonly vaultData: Token;
    readonly version: "vaultV1" | "vaultV2";
    readonly owner: Address;
    readonly chainId: number;
    readonly requiredShareAllowance: bigint;
    readonly deadline: bigint;
    readonly supportSignature: boolean;
    readonly now?: bigint;
  },
): Promise<readonly ActionRequirement[]> => {
  validateChainId(viemClient.chain?.id, params.chainId);
  const now = params.now ?? Time.timestamp();
  if (params.deadline <= now) {
    throw new ExpiredDeadlineError(params.deadline, now);
  }
  await validateClientChainId(viemClient, params.chainId);
  const spender = getChainAddress(params.chainId, "bundles.vaultBundlesV1");
  // The allowance is trusted as returned by the RPC. See THREAT_MODEL.md, RPC.
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
        deadline: params.deadline,
        now,
      }),
    ];
  }
  return [
    encodeErc20Approval({
      token: params.vaultData.address,
      spender,
      amount: maxUint256,
      chainId: params.chainId,
    }),
  ];
};
