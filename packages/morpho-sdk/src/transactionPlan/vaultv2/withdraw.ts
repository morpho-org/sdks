import {
  type AccrualVaultV2,
  DEFAULT_SLIPPAGE_TOLERANCE,
  Token,
} from "@morpho-org/blue-sdk";
import { deepFreeze, getChainAddress, Time } from "@morpho-org/morpho-ts";
import { type Address, type Client, isAddressEqual } from "viem";
import {
  normalizeBundlesCommonParams,
  selectBundlesSharesPermitSignature,
} from "../../actions/bundles/common.js";
import { validateClientChainId } from "../../actions/requirements/validateClientChainId.js";
import { vaultV2Withdraw } from "../../actions/vaultV2/withdraw.js";
import { assertRegistryTargetsHaveCode } from "../../entities/requirements/assertContractCode.js";
import { getVaultBundlesSharesRequirements } from "../../entities/requirements/getVaultBundlesSharesRequirements.js";
import { computeVaultMaxShareAllowance } from "../../helpers/index.js";
import { validateUint256Field } from "../../helpers/validate.js";
import {
  NonPositiveInputError,
  type ReferenceTimestampParams,
  type Transaction,
  VaultAddressMismatchError,
  type VaultV2WithdrawAction,
} from "../../types/index.js";
import { type IntentParams, resolveIntent } from "../intent.js";
import { getVaultPermit } from "../permit.js";
import {
  buildApprovalStep,
  buildPermitSignatureRequest,
} from "../requirements.js";
import type {
  Action,
  SignatureRequest,
  Step,
  TransactionPlan,
} from "../types.js";
import { validatePlanFields, validateVaultPlanAction } from "../validation.js";

/** @internal Validates the stored Vault V2 withdrawal action's input shape. */
export function validateWithdrawPlanAction(
  action: Record<string, unknown>,
  path: string,
): void {
  const inputs = validateVaultPlanAction(action, path);
  validatePlanFields(inputs, {
    path: `${path}.inputs`,
    fields: {
      amount: "uint256 bigint",
      requiredShareAllowance: "uint256 bigint",
    },
  });
}

/**
 * Caller intent for a Vault V2 asset withdrawal, mirroring the Actions API withdraw inputs, plus the snapshot.
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export interface VaultV2WithdrawPlanParams
  extends IntentParams,
    ReferenceTimestampParams {
  readonly vault: Address;
  /** Gross assets withdrawn, before the referral fee. */
  readonly amount: bigint;
  /**
   * Accrual snapshot of `vault`, fetched by the caller with `fetchAccrualVaultV2`. The required
   * share allowance is derived from it at preparation; the snapshot itself is never stored.
   */
  readonly vaultData: AccrualVaultV2;
}

function resolveWithdrawInputs(params: VaultV2WithdrawPlanParams, now: bigint) {
  const { vault, amount, vaultData } = params;
  const intent = resolveIntent(params, now);
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
  // The quote depends only on the snapshot and the intent, so it is fixed before any read.
  const requiredShareAllowance = computeVaultMaxShareAllowance({
    vaultData,
    deadline: intent.deadline,
    assets: amount,
    slippageTolerance: DEFAULT_SLIPPAGE_TOLERANCE,
  });
  return { intent, common, requiredShareAllowance };
}

/**
 * Prepares a withdrawal plan from caller intent and a vault snapshot. The share quote is fixed on
 * the withdrawal step at preparation, because the required share allowance decides the approval or
 * permit prerequisite, so the returned plan is static: only signatures are added before building.
 * When allowance is insufficient, both direct share approvals and ERC-2612 share permits authorize
 * `maxUint256`, not the quote. Later withdrawals reuse that allowance without another signature.
 * The share-allowance quote uses `DEFAULT_SLIPPAGE_TOLERANCE` internally. The withdrawal has no
 * on-chain share-price or max-shares bound and accepts no slippage tolerance input.
 * @param client - Viem client for `params.chainId`, used for allowance and nonce reads only.
 * @param params.vault - Vault V2 contract whose shares are burned for the withdrawal.
 * @param params.vaultData - Caller-fetched `AccrualVaultV2` snapshot of `vault`, used to derive the required share allowance.
 * @param params.chainId - Chain containing the vault and registered VaultBundlesV1 contract.
 * @param params.account - Non-zero account approving or permitting shares and sending the withdrawal.
 * @param params.amount - Positive gross withdrawal in asset base units, before referral fees.
 * @param params.referralFee.bps - Optional integer fee in basis points of the gross amount; defaults to zero and must be below 10,000.
 * @param params.referralFee.recipient - Recipient of the optional fee; must be non-zero when the fee is positive.
 * @param params.supportSignature - Optional unlimited share-permit preference, defaulting to `false`; otherwise uses unlimited direct share approval when allowance is insufficient.
 * @param params.now - Reference timestamp in seconds, normally the latest block's `timestamp`; uses the device clock when omitted.
 * @param params.expiresAt - Optional Unix timestamp in seconds as a safe integer, later than `now`; defaults to `now + 2h` (device clock when `now` is omitted).
 * @param params.calldataOrigin - Optional non-empty, even-length hex bytes appended to each built transaction's calldata.
 * @param params.deployless - Optional shared intent field; unused by withdrawal share-permit reads.
 * @returns A plan with the withdrawal step and any required share approval or signature request.
 * @throws {ZeroAccountError} when `account` is the zero address.
 * @throws {NonIntegerInputError} when `expiresAt` or `referralFee.bps` is not a safe integer.
 * @throws {NonPositiveInputError} when `expiresAt`, `amount` or the computed required shares are not positive.
 * @throws {ExpiredDeadlineError} when `expiresAt` is at or before `now` (device clock when `now` is omitted).
 * @throws {NegativeInputError} when `referralFee.bps` is negative.
 * @throws {InputExceedsMaxError} when `referralFee.bps` exceeds 10,000 or `amount` exceeds uint256.
 * @throws {InvalidCalldataOriginError} when `calldataOrigin` is empty, malformed or has an odd number of hex digits.
 * @throws {ReferralFeePctExceededError} when `referralFee.bps` equals 10,000; the normalized fee must be below WAD.
 * @throws {ReferralFeeRecipientMissingError} when a positive referral fee has no recipient or a zero recipient.
 * @throws {VaultAddressMismatchError} when `vaultData` describes another vault.
 * @throws {ChainIdMismatchError} when the client targets another chain.
 * @throws {MissingContractCodeError} when the VaultBundlesV1 contract is absent.
 * @see computeVaultMaxShareAllowance for quote errors.
 * @see getVaultBundlesSharesRequirements for allowance and nonce reads.
 * @example
 * ```ts
 * import { prepareVaultV2Withdraw } from "@morpho-org/morpho-sdk";
 * import { fetchAccrualVaultV2 } from "@morpho-org/morpho-sdk/fetch";
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const vault = "0x04422053aDDbc9bB2759b248B574e3FCA76Bc145";
 * const plan = await prepareVaultV2Withdraw(client, {
 *   vault, chainId: 1, account: "0x0000000000000000000000000000000000000001", amount: 1_000_000n, supportSignature: true,
 *   vaultData: await fetchAccrualVaultV2(vault, client),
 *   now: (await client.getBlock()).timestamp,
 * });
 * // Sign the pending requests, verify and attach with applySignatures, then build.
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export async function prepareVaultV2Withdraw(
  client: Client,
  params: VaultV2WithdrawPlanParams,
): Promise<TransactionPlan> {
  const { vault, chainId, account, amount } = params;
  const now = params.now ?? Time.timestamp();
  const { intent, common, requiredShareAllowance } = resolveWithdrawInputs(
    params,
    now,
  );
  const spender = getChainAddress(chainId, "bundles.vaultBundlesV1");
  const [, , requirements] = await Promise.all([
    validateClientChainId(client, chainId),
    assertRegistryTargetsHaveCode(client, chainId, [
      { role: "bundles.vaultBundlesV1", address: spender },
    ]),
    getVaultBundlesSharesRequirements(client, {
      vaultData: new Token({ address: vault }),
      version: "vaultV2",
      owner: account,
      chainId,
      requiredShareAllowance,
      deadline: intent.deadline,
      supportSignature: intent.supportSignature,
      now,
    }),
  ]);
  const approvals: Step[] = [];
  const signatureRequests: SignatureRequest[] = [];
  const tokenPermitRequestId = "vaultV2Withdraw:tokenPermit";
  const requirement = requirements[0];
  if (requirement !== undefined) {
    if ("sign" in requirement) {
      signatureRequests.push(
        buildPermitSignatureRequest(requirement, tokenPermitRequestId),
      );
    } else {
      approvals.push(
        buildApprovalStep(requirement, {
          id: "vaultV2Withdraw:approval",
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
          id: "vaultV2Withdraw",
          label: "Withdraw from vault",
          action: {
            type: "vaultV2Withdraw",
            inputs: {
              chainId,
              account,
              vault,
              amount,
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

/** @internal Encodes the withdrawal from its self-contained inputs and resolved signature requests. */
export function buildVaultV2Withdraw(
  action: Extract<Action, { type: "vaultV2Withdraw" }>,
  requests: readonly SignatureRequest[],
): Readonly<Transaction<VaultV2WithdrawAction>> {
  const { requiredShareAllowance, chainId, account, ...args } = action.inputs;
  const signature = getVaultPermit(requests, {
    id: action.signatureRequestIds.tokenPermit,
    asset: action.inputs.vault,
    owner: account,
  });
  const permit = selectBundlesSharesPermitSignature(
    signature ? [signature] : [],
    {
      spender: getChainAddress(chainId, "bundles.vaultBundlesV1"),
      amount: requiredShareAllowance,
      deadline: action.inputs.deadline,
    },
  );
  return vaultV2Withdraw({
    vault: { chainId, address: action.inputs.vault },
    args: { ...args, userAddress: account, requirementSignature: permit },
  });
}
