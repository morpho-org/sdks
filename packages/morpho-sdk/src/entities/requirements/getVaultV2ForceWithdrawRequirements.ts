import type { AccrualVaultV2 } from "@morpho-org/blue-sdk";
import { erc2612Abi } from "@morpho-org/blue-sdk-viem";
import { getChainAddress, Time } from "@morpho-org/morpho-ts";
import type { Client } from "viem";
import { type Address, erc20Abi, maxUint256 } from "viem";
import { readContract } from "viem/actions";
import {
  encodeErc20Approval,
  encodeVaultSharesPermit,
} from "../../actions/index.js";
import { createChainCheck } from "../../actions/requirements/chainCheck.js";
import {
  type ActionRequirement,
  ExpiredDeadlineError,
  type ReferenceTimestampParams,
} from "../../types/index.js";
import { assertRegistryTargetsHaveCode } from "./assertContractCode.js";
/**
 * @internal Resolves exit preflight reads and share authorization without an entity handle.
 * @param client - Client serving the requested chain.
 * @param params - Snapshot and fixed quote used for authorization.
 * @param params.now - See {@link ReferenceTimestampParams.now}.
 * @returns Share approvals or permit requirements.
 */
export async function getVaultV2ForceWithdrawRequirements(
  client: Client,
  params: {
    readonly vaultData: AccrualVaultV2;
    readonly vault: Address;
    readonly userAddress: Address;
    readonly chainId: number;
    readonly deadline: bigint;
    readonly requiredShareAllowance: bigint;
    readonly supportSignature: boolean;
  } & ReferenceTimestampParams,
): Promise<readonly ActionRequirement[]> {
  const {
    vaultData,
    vault,
    userAddress,
    chainId,
    deadline,
    requiredShareAllowance,
    supportSignature,
  } = params;
  const vaultExitBundlesV1 = getChainAddress(
    chainId,
    "bundles.vaultExitBundlesV1",
  );
  const requirementsTimestamp = params.now ?? Time.timestamp();
  if (deadline <= requirementsTimestamp) {
    throw new ExpiredDeadlineError(deadline, requirementsTimestamp);
  }
  const chainCheck = createChainCheck(client, chainId);
  await chainCheck();
  await assertRegistryTargetsHaveCode(
    client,
    chainId,
    [
      {
        role: "bundles.vaultExitBundlesV1",
        address: getChainAddress(chainId, "bundles.vaultExitBundlesV1"),
      },
    ],
    chainCheck,
  );
  // Vault gates are intentionally left to the final transaction: the receive-assets gate may
  // inspect VaultExitBundlesV1's transient `initiator`, and a send-shares gate is arbitrary
  // external code re-evaluated after each intermediate penalty burn, so neither is
  // execution-equivalent from a standalone read. Unlike in-kind redemption, this exit never
  // supplies into Morpho Blue, so no Blue token-balance check is needed.
  const [allowance, nonce] = await Promise.all([
    readContract(client, {
      address: vault,
      abi: erc20Abi,
      functionName: "allowance",
      args: [userAddress, vaultExitBundlesV1],
    }),
    readContract(client, {
      address: vault,
      abi: erc2612Abi,
      functionName: "nonces",
      args: [userAddress],
    }),
  ]);

  if (allowance >= requiredShareAllowance) {
    return [];
  }
  if (supportSignature) {
    const requirement = encodeVaultSharesPermit({
      now: params.now,
      vault: vaultData,
      version: "vaultV2",
      spender: vaultExitBundlesV1,
      owner: userAddress,
      chainId: chainId,
      nonce,
      deadline,
    });
    return [requirement];
  }
  return [
    encodeErc20Approval({
      token: vault,
      spender: vaultExitBundlesV1,
      amount: maxUint256,
      chainId: chainId,
    }),
  ];
}
