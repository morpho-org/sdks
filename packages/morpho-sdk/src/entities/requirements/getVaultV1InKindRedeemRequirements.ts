import type { AccrualVault } from "@morpho-org/blue-sdk";
import { blueAbi, erc2612Abi, metaMorphoAbi } from "@morpho-org/blue-sdk-viem";
import { getChainAddress, Time } from "@morpho-org/morpho-ts";
import type { Client } from "viem";
import { type Address, erc20Abi, isAddressEqual, maxUint256 } from "viem";
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
  VaultIsBlueFeeRecipientError,
  VaultMorphoMismatchError,
} from "../../types/index.js";
import { assertRegistryTargetsHaveCode } from "./assertContractCode.js";
/**
 * @internal Resolves exit preflight reads and share authorization without an entity handle.
 * @param client - Client serving the requested chain.
 * @param params - Snapshot and fixed quote used for authorization.
 * @param params.now - See {@link ReferenceTimestampParams.now}.
 * @returns Share approvals or permit requirements.
 */
export async function getVaultV1InKindRedeemRequirements(
  client: Client,
  params: ReferenceTimestampParams & {
    readonly vaultData: AccrualVault;
    readonly vault: Address;
    readonly userAddress: Address;
    readonly chainId: number;
    readonly deadline: bigint;
    readonly requiredShareAllowance: bigint;
    readonly supportSignature: boolean;
    readonly amount: bigint;
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
    amount,
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
  const [allowance, nonce, blueBalance, morpho, blueFeeRecipient] =
    await Promise.all([
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
      readContract(client, {
        address: vault,
        abi: metaMorphoAbi,
        functionName: "MORPHO",
      }),
      // feeRecipient() is trusted as returned by the RPC. See THREAT_MODEL.md, RPC.
      readContract(client, {
        address: blue,
        abi: blueAbi,
        functionName: "feeRecipient",
      }),
    ]);

  if (!isAddressEqual(morpho, blue)) {
    throw new VaultMorphoMismatchError({
      vault: vault,
      expected: blue,
      actual: morpho,
    });
  }
  // Reject this unsupported configuration before authorizing vault shares:
  // VaultExitBundlesV1 omits newly accrued Morpho fee shares when estimating the
  // vault position, so its callback can exhaust marketParamsList and panic on-chain.
  if (isAddressEqual(blueFeeRecipient, vault)) {
    throw new VaultIsBlueFeeRecipientError(vault, blue);
  }
  if (blueBalance < amount) {
    throw new InsufficientBlueBalanceForInKindRedeemError({
      asset: vaultData.asset,
      available: blueBalance,
      required: amount,
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
        version: "vaultV1",
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
