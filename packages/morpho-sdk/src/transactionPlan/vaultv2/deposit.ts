import {
  type AccrualVaultV2,
  DEFAULT_SLIPPAGE_TOLERANCE,
} from "@morpho-org/blue-sdk";
import { deepFreeze, getChainAddress, Time } from "@morpho-org/morpho-ts";
import { type Address, type Client, isAddressEqual } from "viem";
import {
  getBundlesReferralFeeAssets,
  normalizeBundlesCommonParams,
  selectBundlesTokenRequirementSignature,
} from "../../actions/bundles/common.js";
import { validateClientChainId } from "../../actions/requirements/validateClientChainId.js";
import { vaultV2Deposit } from "../../actions/vaultV2/deposit.js";
import { assertRegistryTargetsHaveCode } from "../../entities/requirements/assertContractCode.js";
import { computeVaultMaxSharePrice } from "../../helpers/index.js";
import {
  validateNativeVaultAsset,
  validateSlippageTolerance,
  validateUint256Field,
} from "../../helpers/validate.js";
import {
  NonPositiveInputError,
  type Transaction,
  VaultAddressMismatchError,
  type VaultV2DepositAction,
} from "../../types/index.js";
import { InvalidTransactionPlanError } from "../error.js";
import { type Funding, type IntentParams, resolveIntent } from "../intent.js";
import { getVaultPermit } from "../permit.js";
import {
  buildApprovalStep,
  buildPermitSignatureRequest,
  getTokenRequirements,
} from "../requirements.js";
import type {
  Action,
  SignatureRequest,
  Step,
  TransactionPlan,
} from "../types.js";
import {
  validatePlanField,
  validatePlanFields,
  validateVaultPlanAction,
} from "../validation.js";

/** @internal Validates the stored Vault V2 deposit action's input shape. */
export function validateDepositPlanAction(
  action: Record<string, unknown>,
  path: string,
): void {
  const inputs = validateVaultPlanAction(action, path);
  validatePlanFields(inputs, {
    path: `${path}.inputs`,
    fields: { asset: "address", maxSharePrice: "uint256 bigint" },
  });
  if ((inputs.amount === undefined) === (inputs.nativeAmount === undefined))
    throw new InvalidTransactionPlanError({
      path: `${path}.inputs`,
      reason: "expected exactly one of amount or nativeAmount",
    });
  const field = inputs.amount === undefined ? "nativeAmount" : "amount";
  validatePlanField(inputs[field], {
    path: `${path}.inputs.${field}`,
    type: "uint256 bigint",
  });
}

/**
 * Caller intent for a Vault V2 deposit, mirroring the Actions API deposit inputs, plus the snapshot.
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export interface VaultV2DepositPlanParams extends IntentParams {
  /** WAD-scaled tolerance for the share-price bound; defaults to `DEFAULT_SLIPPAGE_TOLERANCE`. */
  readonly slippageTolerance?: bigint;
  readonly vault: Address;
  /** Gross amount the account pays, before the referral fee. */
  readonly amount: bigint;
  /** Defaults to `{ type: "erc20" }`. */
  readonly funding?: Funding;
  /**
   * Accrual snapshot of `vault`, fetched by the caller with `fetchAccrualVaultV2`. The asset and
   * the deadline-accrued `maxSharePrice` are derived from it at preparation; the snapshot itself is
   * never stored in the plan.
   */
  readonly vaultData: AccrualVaultV2;
}

function resolveDepositInputs(params: VaultV2DepositPlanParams, now: bigint) {
  const { vault, chainId, amount, vaultData } = params;
  const intent = resolveIntent(params, now);
  const slippageTolerance =
    params.slippageTolerance ?? DEFAULT_SLIPPAGE_TOLERANCE;
  validateSlippageTolerance(slippageTolerance);
  const native = (params.funding ?? { type: "erc20" }).type === "native";
  if (amount <= 0n) throw new NonPositiveInputError("amount", amount);
  // Reject amounts that cannot be encoded as uint256 before making RPC requests.
  validateUint256Field("amount", amount);
  const common = normalizeBundlesCommonParams({
    deadline: intent.deadline,
    referralFeePct: intent.referralFeePct,
    referralFeeRecipient: intent.referralFeeRecipient,
  });
  if (!isAddressEqual(vaultData.address, vault))
    throw new VaultAddressMismatchError(vaultData.address, vault);
  const { asset } = vaultData;
  // Native funding must target the chain's wrapped-native vault asset.
  if (native) validateNativeVaultAsset(chainId, asset);
  // The quote depends only on the snapshot and the intent, so it is fixed before any read.
  const maxSharePrice = computeVaultMaxSharePrice({
    vaultData,
    deadline: intent.deadline,
    assets: amount - getBundlesReferralFeeAssets(amount, common.referralFeePct),
    slippageTolerance,
  });
  return { intent, native, common, asset, maxSharePrice };
}

/**
 * Prepares a deposit plan from caller intent and a vault snapshot, reading the token prerequisites
 * directly. The quote is fixed on the deposit step at preparation, so the returned plan is static:
 * only signatures are added before building.
 * @param client - Viem client for `params.chainId`, used for allowance and permit metadata reads only.
 * @param params.vault - Vault V2 contract receiving the net deposit.
 * @param params.vaultData - Caller-fetched `AccrualVaultV2` snapshot of `vault`, used to derive the asset and deadline-accrued share-price bound.
 * @param params.chainId - Chain containing the vault and registered VaultBundlesV1 contract.
 * @param params.account - Non-zero account funding, signing and sending the deposit.
 * @param params.amount - Positive gross deposit in asset base units, before referral fees.
 * @param params.funding.type - Optional funding source: `"erc20"` (default) or `"native"`; native funding requires the vault asset to be wNative.
 * @param params.referralFee.bps - Optional integer fee in basis points of the gross amount; defaults to zero and must be below 10,000.
 * @param params.referralFee.recipient - Recipient of the optional fee; must be non-zero when the fee is positive.
 * @param params.slippageTolerance - Optional WAD-scaled tolerance for the share-price bound; defaults to `DEFAULT_SLIPPAGE_TOLERANCE` and must not exceed `MAX_SLIPPAGE_TOLERANCE`.
 * @param params.supportSignature - Optional ERC-2612 preference, defaulting to `false`; when enabled, falls back to direct approval if no permit is available.
 * @param params.expiresAt - Optional future Unix timestamp in seconds as a safe integer; defaults to two hours from preparation.
 * @param params.calldataOrigin - Optional non-empty, even-length hex bytes appended to each built transaction's calldata.
 * @param params.deployless - Optional permission to use deployless aggregation for token permit metadata reads.
 * @returns A plan with approvals, concrete signature requests and the deposit step.
 * @throws {ZeroAccountError} when `account` is the zero address.
 * @throws {NonIntegerInputError} when `expiresAt` or `referralFee.bps` is not a safe integer.
 * @throws {NonPositiveInputError} when `expiresAt`, `amount`, net assets or previewed shares are not positive.
 * @throws {ExpiredDeadlineError} when `expiresAt` is not in the future.
 * @throws {NegativeInputError} when `referralFee.bps` or `slippageTolerance` is negative.
 * @throws {InputExceedsMaxError} when `referralFee.bps` exceeds 10,000 or `amount` exceeds uint256.
 * @throws {ExcessiveSlippageToleranceError} when `slippageTolerance` exceeds `MAX_SLIPPAGE_TOLERANCE`.
 * @throws {InvalidCalldataOriginError} when `calldataOrigin` is empty, malformed or has an odd number of hex digits.
 * @throws {ReferralFeePctExceededError} when `referralFee.bps` equals 10,000; the normalized fee must be below WAD.
 * @throws {ReferralFeeRecipientMissingError} when a positive referral fee has no recipient or a zero recipient.
 * @throws {VaultAddressMismatchError} when `vaultData` describes another vault.
 * @throws {NativeAmountOnNonWNativeVaultError} when native funding targets a vault whose asset is not wNative.
 * @throws {ChainIdMismatchError} when the client targets another chain.
 * @throws {MissingContractCodeError} when the VaultBundlesV1 contract is absent.
 * @see computeVaultMaxSharePrice for quote errors.
 * @example
 * ```ts
 * import { prepareVaultV2Deposit } from "@morpho-org/morpho-sdk";
 * import { fetchAccrualVaultV2 } from "@morpho-org/morpho-sdk/fetch";
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const vault = "0x04422053aDDbc9bB2759b248B574e3FCA76Bc145";
 * const plan = await prepareVaultV2Deposit(client, {
 *   vault, chainId: 1, account: "0x0000000000000000000000000000000000000001", amount: 1_000_000n, supportSignature: true,
 *   vaultData: await fetchAccrualVaultV2(vault, client),
 * });
 * // Sign the pending requests, verify and attach with applySignatures, then build.
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export async function prepareVaultV2Deposit(
  client: Client,
  params: VaultV2DepositPlanParams,
): Promise<TransactionPlan> {
  const { vault, chainId, account, amount } = params;
  const now = Time.timestamp();
  const { intent, native, common, asset, maxSharePrice } = resolveDepositInputs(
    params,
    now,
  );
  const spender = getChainAddress(chainId, "bundles.vaultBundlesV1");
  const [requirements] = await Promise.all([
    validateClientChainId(client, chainId).then(() =>
      native
        ? []
        : getTokenRequirements(client, {
            token: asset,
            spender,
            amount,
            owner: account,
            chainId,
            deadline: intent.deadline,
            now,
            supportSignature: intent.supportSignature,
            deployless: intent.deployless,
          }),
    ),
    assertRegistryTargetsHaveCode(client, chainId, [
      { role: "bundles.vaultBundlesV1", address: spender },
    ]),
  ]);
  const approvals: Step[] = [];
  const signatureRequests: SignatureRequest[] = [];
  const tokenPermitRequestId = "vaultV2Deposit:tokenPermit";
  for (const requirement of requirements) {
    if ("sign" in requirement) {
      signatureRequests.push(
        buildPermitSignatureRequest(requirement, tokenPermitRequestId),
      );
    } else {
      approvals.push(
        buildApprovalStep(requirement, {
          id:
            approvals.length === 0
              ? "vaultV2Deposit:approval"
              : `vaultV2Deposit:approval:${approvals.length + 1}`,
          chainId,
          account,
        }),
      );
    }
  }
  return deepFreeze(
    structuredClone({
      version: 1,
      account,
      chainId,
      expiresAt: intent.expiresAt,
      ...(intent.calldataOrigin && { calldataOrigin: intent.calldataOrigin }),
      steps: [
        ...approvals,
        {
          id: "vaultV2Deposit",
          label: "Deposit into vault",
          action: {
            type: "vaultV2Deposit",
            inputs: {
              chainId,
              account,
              vault,
              asset,
              maxSharePrice,
              ...(native ? { nativeAmount: amount } : { amount }),
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

/** @internal Encodes the deposit from its self-contained inputs and resolved signature requests. */
export function buildVaultV2Deposit(
  action: Extract<Action, { type: "vaultV2Deposit" }>,
  requests: readonly SignatureRequest[],
): Readonly<Transaction<VaultV2DepositAction>> {
  const { asset, chainId, account, ...args } = action.inputs;
  const signature = getVaultPermit(requests, {
    id: action.signatureRequestIds.tokenPermit,
    asset,
    owner: account,
  });
  const requirementSignature = selectBundlesTokenRequirementSignature(
    signature ? [signature] : [],
    {
      spender: getChainAddress(chainId, "bundles.vaultBundlesV1"),
      amount: action.inputs.amount ?? action.inputs.nativeAmount,
      deadline: action.inputs.deadline,
    },
  );
  return vaultV2Deposit({
    vault: { chainId, address: action.inputs.vault, asset },
    args: {
      ...args,
      userAddress: account,
      requirementSignature,
    },
  });
}
