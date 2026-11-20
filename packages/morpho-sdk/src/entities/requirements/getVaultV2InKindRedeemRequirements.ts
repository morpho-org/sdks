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
import { validateClientChainId } from "../../actions/requirements/validateClientChainId.js";
import {
  type ActionRequirement,
  ExpiredDeadlineError,
  InsufficientBlueBalanceForInKindRedeemError,
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
export async function getVaultV2InKindRedeemRequirements(
  client: Client,
  params: ReferenceTimestampParams & {
    readonly vaultData: AccrualVaultV2;
    readonly vault: Address;
    readonly userAddress: Address;
    readonly chainId: number;
    readonly deadline: bigint;
    readonly requiredShareAllowance: bigint;
    readonly supportSignature: boolean;
    readonly peak: bigint;
  },
): Promise<readonly ActionRequirement[]> {
  const {
    vaultData,
    vault,
    userAddress,
    chainId,
    deadline,
    requiredShareAllowance,
    supportSignature,
    peak,
  } = params;
  const vaultExitBundlesV1 = getChainAddress(
    chainId,
    "bundles.vaultExitBundlesV1",
  );
  const blue = getChainAddress(chainId, "blue");
  const requirementsTimestamp = params.now ?? Time.timestamp();
  if (deadline <= requirementsTimestamp) {
    throw new ExpiredDeadlineError(deadline, requirementsTimestamp);
  }
  await validateClientChainId(client, chainId);
  await assertRegistryTargetsHaveCode(client, chainId, [
    {
      role: "bundles.vaultExitBundlesV1",
      address: getChainAddress(chainId, "bundles.vaultExitBundlesV1"),
    },
    { role: "blue", address: getChainAddress(chainId, "blue") },
  ]);
  // Vault gates are intentionally left to the final transaction. A receive gate may inspect
  // VaultExitBundlesV1's transient `initiator`, which is populated only during the actual
  // periphery call. A send-share gate is arbitrary external code and is evaluated repeatedly
  // after intermediate penalty share burns, so one standalone read is not execution-equivalent
  // either. Simulate the finalized transaction after authorization when gate compatibility
  // must be checked before submission.
  const [allowance, nonce, blueBalance] = await Promise.all([
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
    readContract(client, {
      address: vaultData.asset,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [blue],
    }),
  ]);

  if (blueBalance < peak) {
    throw new InsufficientBlueBalanceForInKindRedeemError({
      asset: vaultData.asset,
      available: blueBalance,
      required: peak,
    });
  }
  if (allowance >= requiredShareAllowance) {
    return [];
  }
  if (supportSignature) {
    return [
      encodeVaultSharesPermit({
        now: params.now,
        vault: vaultData,
        version: "vaultV2",
        spender: vaultExitBundlesV1,
        owner: userAddress,
        chainId: chainId,
        nonce,
        deadline,
      }),
    ];
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
