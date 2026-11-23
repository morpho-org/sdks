import {
  type AccrualVault,
  type AccrualVaultV2,
  DEFAULT_SLIPPAGE_TOLERANCE,
} from "@morpho-org/blue-sdk";
import { deepFreeze, getChainAddress, Time } from "@morpho-org/morpho-ts";
import type { Client } from "viem";
import {
  getBundlesReferralFeeAssets,
  normalizeBundlesCommonParams,
} from "../actions/bundles/common.js";
import { validateClientChainId } from "../actions/requirements/validateClientChainId.js";
import { assertRegistryTargetsHaveCode } from "../entities/requirements/assertContractCode.js";
import { computeVaultMaxSharePrice } from "../helpers/index.js";
import {
  validateNativeVaultAsset,
  validateSlippageTolerance,
  validateUint256Field,
} from "../helpers/validate.js";
import {
  NonPositiveInputError,
  type ReferenceTimestampParams,
} from "../types/index.js";
import { InvalidTransactionPlanError } from "./error.js";
import { type Funding, type IntentParams, resolveIntent } from "./intent.js";
import { getTokenRequirements } from "./requirements.js";
import type { TransactionPlan } from "./types.js";
import {
  validatePlanField,
  validatePlanFields,
  validateVaultPlanAction,
} from "./validation.js";

/** @internal Validates the stored Vault V1 or V2 deposit action's input shape. */
export function validateDepositPlanAction(
  action: Record<string, unknown>,
  path: string,
): void {
  const inputs = validateVaultPlanAction(action, path);
  validatePlanFields(inputs, {
    path: `${path}.inputs`,
    fields: { asset: "address", maxSharePrice: "uint256 bigint" },
  });
  if ((inputs.assets === undefined) === (inputs.nativeAssets === undefined)) {
    throw new InvalidTransactionPlanError({
      path: `${path}.inputs`,
      reason: "expected exactly one of assets or nativeAssets",
    });
  }
  const field = inputs.assets === undefined ? "nativeAssets" : "assets";
  validatePlanField(inputs[field], {
    path: `${path}.inputs.${field}`,
    type: "uint256 bigint",
  });
}

/** @internal Shared caller intent for a snapshot-quoted vault deposit. */
export interface DepositPlanParams<
  TSnapshot extends AccrualVault | AccrualVaultV2,
> extends IntentParams,
    ReferenceTimestampParams {
  /** WAD-scaled tolerance for the share-price bound; defaults to `DEFAULT_SLIPPAGE_TOLERANCE`. */
  readonly slippageTolerance?: bigint;
  /** Caller-fetched accrual snapshot; only derived inputs are stored in the plan. */
  readonly vault: TSnapshot;
  /** Gross assets the account pays, before the referral fee. */
  readonly assets: bigint;
  /** Defaults to `{ type: "erc20" }`. */
  readonly funding?: Funding;
}

function resolveDepositInputs(
  params: DepositPlanParams<AccrualVault | AccrualVaultV2>,
  now: bigint,
) {
  const { vault, chainId, assets } = params;
  const intent = resolveIntent(params, now);
  const slippageTolerance =
    params.slippageTolerance ?? DEFAULT_SLIPPAGE_TOLERANCE;
  validateSlippageTolerance(slippageTolerance);
  const native = (params.funding ?? { type: "erc20" }).type === "native";
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
  const { asset } = vault;
  // Native funding must target the chain's wrapped-native vault asset.
  if (native) {
    validateNativeVaultAsset(chainId, asset);
  }
  // The quote depends only on the snapshot and the intent, so it is fixed before any read.
  const maxSharePrice = computeVaultMaxSharePrice({
    vaultData: vault,
    deadline: intent.deadline,
    assets: assets - getBundlesReferralFeeAssets(assets, common.referralFeePct),
    slippageTolerance,
  });
  return { intent, native, common, asset, maxSharePrice };
}

/** @internal Prepares a deposit using its vault action and caller-supplied snapshot type. */
export async function prepareVaultDeposit<
  TSnapshot extends AccrualVault | AccrualVaultV2,
>(
  client: Client,
  params: DepositPlanParams<TSnapshot> & {
    readonly type: "vaultV1Deposit" | "vaultV2Deposit";
  },
): Promise<TransactionPlan> {
  const { chainId, account, assets } = params;
  const vault = params.vault.address;
  const now = params.now ?? Time.timestamp();
  const { intent, native, common, asset, maxSharePrice } = resolveDepositInputs(
    params,
    now,
  );
  const spender = getChainAddress(chainId, "bundles.vaultBundlesV1");
  const tokenPermitRequestId = `${params.type}:tokenPermit`;
  const [requirements] = await Promise.all([
    validateClientChainId(client, chainId).then(() =>
      native
        ? undefined
        : getTokenRequirements(client, {
            token: asset,
            spender,
            amount: assets,
            owner: account,
            chainId,
            deadline: intent.deadline,
            now,
            supportSignature: intent.supportSignature,
            deployless: intent.deployless,
            permitId: tokenPermitRequestId,
            approvalId: (index) =>
              index === 0
                ? `${params.type}:approval`
                : `${params.type}:approval:${index + 1}`,
          }),
    ),
    assertRegistryTargetsHaveCode(client, chainId, [
      { role: "bundles.vaultBundlesV1", address: spender },
    ]),
  ]);
  const approvals = requirements?.approvals ?? [];
  const signatureRequests =
    requirements?.permit === undefined ? [] : [requirements.permit];
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
          label: "Deposit into vault",
          action: {
            type: params.type,
            inputs: {
              chainId,
              account,
              vault,
              asset,
              maxSharePrice,
              ...(native ? { nativeAssets: assets } : { assets }),
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
