import type { Token } from "@morpho-org/blue-sdk";
import { deepFreeze, Time } from "@morpho-org/morpho-ts";
import type { Client } from "viem";
import { normalizeBundlesCommonParams } from "../actions/bundles/common.js";
import { validateUint256Field } from "../helpers/validate.js";
import {
  NonPositiveInputError,
  type ReferenceTimestampParams,
} from "../types/index.js";
import { type IntentParams, resolveIntent } from "./intent.js";
import { getVaultShareSpendingRequirements } from "./shareSpending.js";
import type { TransactionPlan } from "./types.js";
import { validatePlanFields, validateVaultPlanAction } from "./validation.js";

/** @internal Shared exact-share intent; V1 callers must supply permit-domain metadata. */
export interface RedeemPlanParams
  extends Omit<IntentParams, "deployless">,
    ReferenceTimestampParams {
  /** Vault share token; V1 permits also use its caller-supplied domain metadata. */
  readonly shareToken: Token;
  /** Exact shares burned, in share base units. */
  readonly shares: bigint;
}

/** @internal Prepares an exact-share redemption without fetching a snapshot or asset quote. */
export async function prepareVaultRedeem(
  client: Client,
  params: RedeemPlanParams & {
    readonly type: "vaultV1Redeem" | "vaultV2Redeem";
  },
): Promise<TransactionPlan> {
  const { type, shareToken, chainId, account, shares } = params;
  const vault = shareToken.address;
  const now = params.now ?? Time.timestamp();
  const intent = resolveIntent(params, now);
  if (shares <= 0n) {
    throw new NonPositiveInputError("shares", shares);
  }
  validateUint256Field("shares", shares);
  const common = normalizeBundlesCommonParams(intent);
  const { approvals, signatureRequests, tokenPermitRequestId } =
    await getVaultShareSpendingRequirements(client, {
      type,
      shareToken,
      chainId,
      account,
      requiredShareAllowance: shares,
      deadline: intent.deadline,
      supportSignature: intent.supportSignature,
      now,
    });
  return deepFreeze(
    structuredClone({
      version: 2,
      account,
      chainId,
      expiresAt: intent.expiresAt,
      ...(intent.calldataOrigin && { calldataOrigin: intent.calldataOrigin }),
      steps: [
        ...approvals,
        {
          id: type,
          label: "Redeem vault shares",
          action: {
            type,
            inputs: { chainId, account, vault, shares, ...common },
            signatureRequestIds:
              signatureRequests.length > 0
                ? { tokenPermit: tokenPermitRequestId }
                : {},
          },
        },
      ],
      signatureRequests,
    }),
  );
}

/** @internal Validates stored V1 and V2 exact-share redemption inputs. */
export function validateRedeemPlanAction(
  action: Record<string, unknown>,
  path: string,
): void {
  const inputs = validateVaultPlanAction(action, path);
  validatePlanFields(inputs, {
    path: `${path}.inputs`,
    fields: { shares: "uint256 bigint" },
  });
}
