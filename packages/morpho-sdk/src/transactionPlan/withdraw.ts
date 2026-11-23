import {
  type AccrualVault,
  type AccrualVaultV2,
  DEFAULT_SLIPPAGE_TOLERANCE,
  Token,
} from "@morpho-org/blue-sdk";
import { deepFreeze, Time } from "@morpho-org/morpho-ts";
import type { Client } from "viem";
import { normalizeBundlesCommonParams } from "../actions/bundles/common.js";
import { computeVaultMaxShareAllowance } from "../helpers/index.js";
import { validateUint256Field } from "../helpers/validate.js";
import {
  NonPositiveInputError,
  type ReferenceTimestampParams,
} from "../types/index.js";
import { type IntentParams, resolveIntent } from "./intent.js";
import { getVaultShareSpendingRequirements } from "./shareSpending.js";
import type { TransactionPlan } from "./types.js";
import { validatePlanFields, validateVaultPlanAction } from "./validation.js";

/** @internal Validates the stored vault withdrawal action's input shape. */
export function validateWithdrawPlanAction(
  action: Record<string, unknown>,
  path: string,
): void {
  const inputs = validateVaultPlanAction(action, path);
  validatePlanFields(inputs, {
    path: `${path}.inputs`,
    fields: {
      assets: "uint256 bigint",
      requiredShareAllowance: "uint256 bigint",
    },
  });
}

/** @internal Snapshot-based asset withdrawal intent shared by V1 and V2. */
export interface WithdrawPlanParams<
  TSnapshot extends AccrualVault | AccrualVaultV2,
> extends Omit<IntentParams, "deployless">,
    ReferenceTimestampParams {
  /** Caller-fetched accrual snapshot used to quote the required share allowance. */
  readonly vault: TSnapshot;
  /** Gross assets withdrawn, before the referral fee. */
  readonly assets: bigint;
}

function resolveWithdrawInputs(
  params: WithdrawPlanParams<AccrualVault | AccrualVaultV2>,
  now: bigint,
) {
  const { vault, assets } = params;
  const intent = resolveIntent(params, now);
  if (assets <= 0n) {
    throw new NonPositiveInputError("assets", assets);
  }
  // Reject amounts that cannot be encoded as uint256 before making RPC requests.
  validateUint256Field("assets", assets);
  const common = normalizeBundlesCommonParams({
    deadline: intent.deadline,
    referralFeePct: intent.referralFeePct,
    referralFeeRecipient: intent.referralFeeRecipient,
  });
  // The quote depends only on the snapshot and the intent, so it is fixed before any read.
  const requiredShareAllowance = computeVaultMaxShareAllowance({
    vaultData: vault,
    deadline: intent.deadline,
    assets,
    slippageTolerance: DEFAULT_SLIPPAGE_TOLERANCE,
  });
  return { intent, common, requiredShareAllowance };
}

/** @internal Fixes a withdrawal quote and resolves the vault-share prerequisites. */
export async function prepareVaultWithdraw<
  TSnapshot extends AccrualVault | AccrualVaultV2,
>(
  client: Client,
  params: WithdrawPlanParams<TSnapshot> & {
    readonly type: "vaultV1Withdraw" | "vaultV2Withdraw";
  },
): Promise<TransactionPlan> {
  const { chainId, account, assets } = params;
  const vault = params.vault.address;
  const now = params.now ?? Time.timestamp();
  const { intent, common, requiredShareAllowance } = resolveWithdrawInputs(
    params,
    now,
  );
  const { approvals, signatureRequests, tokenPermitRequestId } =
    await getVaultShareSpendingRequirements(client, {
      type: params.type,
      shareToken:
        params.type === "vaultV1Withdraw"
          ? params.vault
          : new Token({ address: vault }),
      chainId,
      account,
      requiredShareAllowance,
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
          id: params.type,
          label: "Withdraw from vault",
          action: {
            type: params.type,
            inputs: {
              chainId,
              account,
              vault,
              assets,
              requiredShareAllowance,
              ...common,
            },
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
