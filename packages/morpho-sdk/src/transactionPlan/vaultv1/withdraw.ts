import type { AccrualVault } from "@morpho-org/blue-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import type { Client } from "viem";
import { selectBundlesSharesPermitSignature } from "../../actions/bundles/common.js";
import { vaultV1Withdraw } from "../../actions/vaultV1/withdraw.js";
import type { Transaction, VaultV1WithdrawAction } from "../../types/index.js";
import { getVaultPermit } from "../permit.js";
import type { Action, SignatureRequest, TransactionPlan } from "../types.js";
import { prepareVaultWithdraw, type WithdrawPlanParams } from "../withdraw.js";

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * Caller intent for a Vault V1 asset withdrawal plus its accrual snapshot.
 * @example
 * ```ts
 * import type { VaultV1WithdrawPlanParams } from "@morpho-org/morpho-sdk";
 * const params: VaultV1WithdrawPlanParams = {
 *   vault, chainId: 1, account, assets: 1_000_000n,
 *   supportSignature: true,
 * };
 * ```
 */
export interface VaultV1WithdrawPlanParams
  extends WithdrawPlanParams<AccrualVault> {}

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * Prepares a withdrawal plan from caller intent and a vault snapshot. The share quote is fixed on
 * the withdrawal step at preparation, because the required share allowance decides the approval or
 * permit prerequisite, so the returned plan is static: only signatures are added before building.
 * When allowance is insufficient, both direct share approvals and ERC-2612 share permits authorize
 * `maxUint256`, not the quote. Later withdrawals reuse that allowance without another signature.
 * The share-allowance quote uses `DEFAULT_SLIPPAGE_TOLERANCE` internally. The withdrawal has no
 * on-chain share-price or max-shares bound and accepts no slippage tolerance input.
 * @param client - Viem client for `params.chainId`, used for allowance and nonce reads only.
 * @param params.vault - Caller-fetched AccrualVault snapshot used for the share quote; its address identifies the vault.
 * @param params.chainId - Chain containing the vault and registered VaultBundlesV1 contract.
 * @param params.account - Non-zero account approving or permitting shares and sending the withdrawal.
 * @param params.assets - Positive gross withdrawal in asset base units, before referral fees.
 * @param params.referralFee.bps - Optional integer fee in basis points of the gross amount; defaults to zero and must be at most 1,000.
 * @param params.referralFee.recipient - Recipient of the optional fee; must be non-zero when the fee is positive.
 * @param params.supportSignature - Optional unlimited share-permit preference, defaulting to `false`; otherwise uses unlimited direct share approval when allowance is insufficient.
 * @param params.now - Reference timestamp in seconds, normally the latest block's `timestamp`; uses the device clock when omitted.
 * @param params.expiresAt - Optional Unix timestamp in seconds as a safe integer, later than `now`; defaults to `now + 2h`.
 * @param params.calldataOrigin - Optional non-empty, even-length hex bytes appended to each built transaction's calldata.
 * @returns A plan with the withdrawal step and any required share approval or signature request.
 * @throws {ZeroAccountError} when `account` is the zero address.
 * @throws {NonIntegerInputError} when `expiresAt` or `referralFee.bps` is not a safe integer.
 * @throws {NonPositiveInputError} when `expiresAt`, `assets` or the computed required shares are not positive.
 * @throws {ExpiredDeadlineError} when `expiresAt` is not in the future.
 * @throws {NegativeInputError} when `referralFee.bps` is negative.
 * @throws {InputExceedsMaxError} when `referralFee.bps` exceeds 1,000 or `assets` exceeds uint256.
 * @throws {InvalidCalldataOriginError} when `calldataOrigin` is empty, malformed or has an odd number of hex digits.
 * @throws {InvalidTransactionPlanError} when `account` is malformed or `calldataOrigin` exceeds 1 MiB.
 * @throws {ReferralFeeRecipientMissingError} when a positive referral fee has no recipient or a zero recipient.
 * @throws {ChainIdMismatchError} when the client targets another chain.
 * @throws {MissingContractCodeError} when the VaultBundlesV1 contract is absent.
 * @throws {MissingPermitDomainNameError} when share allowance is insufficient, signatures are enabled, and the snapshot has neither a permit domain nor a name.
 * @throws {InvalidPermitDomainChainIdError} when share allowance is insufficient, signatures are enabled, and the snapshot's permit domain has a different or missing chain ID.
 * @throws {InvalidPermitDomainVerifyingContractError} when share allowance is insufficient, signatures are enabled, and the snapshot's permit domain has a different or missing verifying contract.
 * @throws {UnsupportedPermitDomainExtensionsError} when share allowance is insufficient, signatures are enabled, and the snapshot's permit domain advertises extensions.
 * @see computeVaultMaxShareAllowance for quote errors.
 * @see getVaultBundlesSharesRequirements for allowance and nonce reads.
 * @example
 * ```ts
 * import { prepareVaultV1Withdraw } from "@morpho-org/morpho-sdk";
 * import { fetchAccrualVault } from "@morpho-org/morpho-sdk/fetch";
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const vault = "0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB";
 * const plan = await prepareVaultV1Withdraw(client, {
 *   chainId: 1, account: "0x0000000000000000000000000000000000000001", assets: 1_000_000n, supportSignature: true,
 *   vault: await fetchAccrualVault(vault, client),
 * });
 * // Sign the pending requests, applySignatures to verify and attach them, then build.
 * ```
 */
export async function prepareVaultV1Withdraw(
  client: Client,
  params: VaultV1WithdrawPlanParams,
): Promise<TransactionPlan> {
  return prepareVaultWithdraw(client, { ...params, type: "vaultV1Withdraw" });
}

/** @internal Encodes the withdrawal from its self-contained inputs and resolved signature requests. */
export function buildVaultV1Withdraw(
  action: Extract<Action, { type: "vaultV1Withdraw" }>,
  requests: readonly SignatureRequest[],
): Readonly<Transaction<VaultV1WithdrawAction>> {
  const { requiredShareAllowance, chainId, account, assets, ...args } =
    action.inputs;
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
  return vaultV1Withdraw({
    vault: { chainId, address: action.inputs.vault },
    args: {
      ...args,
      amount: assets,
      userAddress: account,
      requirementSignature: permit,
    },
  });
}
