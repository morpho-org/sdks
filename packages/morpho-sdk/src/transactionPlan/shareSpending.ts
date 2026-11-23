import type { Token } from "@morpho-org/blue-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import type { Address, Client } from "viem";
import { validateClientChainId } from "../actions/requirements/validateClientChainId.js";
import { assertRegistryTargetsHaveCode } from "../entities/requirements/assertContractCode.js";
import { getVaultBundlesSharesRequirements } from "../entities/requirements/getVaultBundlesSharesRequirements.js";
import { validateChainId } from "../helpers/validate.js";
import {
  buildApprovalStep,
  buildPermitSignatureRequest,
} from "./requirements.js";
import type { SignatureRequest, Step } from "./types.js";

/** @internal Resolves unlimited share authorization after chain validation in each read path. */
export async function getVaultShareSpendingRequirements(
  client: Client,
  params: {
    readonly type:
      | "vaultV1MigrateToV2"
      | "vaultV1Withdraw"
      | "vaultV2Withdraw"
      | "vaultV1Redeem"
      | "vaultV2Redeem";
    readonly shareToken: Token;
    readonly account: Address;
    readonly chainId: number;
    readonly requiredShareAllowance: bigint;
    readonly deadline: bigint;
    readonly supportSignature: boolean;
    readonly now: bigint;
  },
) {
  const { type, chainId, account } = params;
  // Reject a declared chain mismatch before starting concurrent reads.
  validateChainId(client.chain?.id, chainId);
  const spender = getChainAddress(chainId, "bundles.vaultBundlesV1");
  const [, , requirements] = await Promise.all([
    validateClientChainId(client, chainId),
    assertRegistryTargetsHaveCode(client, chainId, [
      { role: "bundles.vaultBundlesV1", address: spender },
    ]),
    getVaultBundlesSharesRequirements(client, {
      vaultData: params.shareToken,
      version: type.startsWith("vaultV1") ? "vaultV1" : "vaultV2",
      owner: account,
      chainId,
      requiredShareAllowance: params.requiredShareAllowance,
      deadline: params.deadline,
      supportSignature: params.supportSignature,
      now: params.now,
    }),
  ]);
  const approvals: Step[] = [];
  const signatureRequests: SignatureRequest[] = [];
  const tokenPermitRequestId = `${type}:tokenPermit`;
  const requirement = requirements[0];
  if (requirement !== undefined) {
    if ("sign" in requirement) {
      signatureRequests.push(
        buildPermitSignatureRequest(requirement, tokenPermitRequestId),
      );
    } else {
      approvals.push(
        buildApprovalStep(requirement, {
          id: `${type}:approval`,
          chainId,
          account,
          denomination: "shares",
        }),
      );
    }
  }
  return { approvals, signatureRequests, tokenPermitRequestId };
}
