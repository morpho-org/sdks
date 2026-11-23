import type { AccrualVaultV2 } from "@morpho-org/blue-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import type { Client } from "viem";
import { selectBundlesSharesPermitSignature } from "../../actions/bundles/common.js";
import { vaultV2Withdraw } from "../../actions/vaultV2/withdraw.js";
import type { Transaction, VaultV2WithdrawAction } from "../../types/index.js";
import { getVaultPermit } from "../permit.js";
import type { Action, SignatureRequest, TransactionPlan } from "../types.js";
import { prepareVaultWithdraw, type WithdrawPlanParams } from "../withdraw.js";

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * Caller intent for a Vault V2 asset withdrawal, mirroring the Actions API withdraw inputs, plus the snapshot.
 */
export interface VaultV2WithdrawPlanParams
  extends WithdrawPlanParams<AccrualVaultV2> {}

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
 * @param params.vault - Caller-fetched AccrualVaultV2 snapshot used for the quote; the address is vault.address.
 * @param params.chainId - Chain containing the vault and registered VaultBundlesV1 contract.
 * @param params.account - Non-zero account approving or permitting shares and sending the withdrawal.
 * @param params.assets - Positive gross withdrawal in asset base units, before referral fees.
 * @param params.referralFee.bps - Optional integer fee in basis points of the gross assets; defaults to zero and must be below 10,000.
 * @param params.referralFee.recipient - Recipient of the optional fee; must be non-zero when the fee is positive.
 * @param params.supportSignature - Optional unlimited share-permit preference, defaulting to `false`; otherwise uses unlimited direct share approval when allowance is insufficient.
 * @param params.now - Reference timestamp in seconds, normally the latest block's `timestamp`; uses the device clock when omitted.
 * @param params.expiresAt - Optional Unix timestamp in seconds as a safe integer, later than `now`; defaults to `now + 2h` (device clock when `now` is omitted).
 * @param params.calldataOrigin - Optional non-empty, even-length hex bytes appended to each built transaction's calldata.
 * @returns A plan with the withdrawal step and any required share approval or signature request.
 * @throws {ZeroAccountError} when `account` is the zero address.
 * @throws {NonIntegerInputError} when `expiresAt` or `referralFee.bps` is not a safe integer.
 * @throws {NonPositiveInputError} when `expiresAt`, `assets` or the computed required shares are not positive.
 * @throws {ExpiredDeadlineError} when `expiresAt` is at or before `now` (device clock when `now` is omitted).
 * @throws {NegativeInputError} when `referralFee.bps` is negative.
 * @throws {InputExceedsMaxError} when `referralFee.bps` exceeds 10,000 or `assets` exceeds uint256.
 * @throws {InvalidCalldataOriginError} when `calldataOrigin` is empty, malformed or has an odd number of hex digits.
 * @throws {InvalidTransactionPlanError} when `account` is malformed or `calldataOrigin` exceeds 1 MiB.
 * @throws {ReferralFeePctExceededError} when `referralFee.bps` equals 10,000; the normalized fee must be below WAD.
 * @throws {ReferralFeeRecipientMissingError} when a positive referral fee has no recipient or a zero recipient.
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
 *   chainId: 1, account: "0x0000000000000000000000000000000000000001", assets: 1_000_000n, supportSignature: true,
 *   vault: await fetchAccrualVaultV2(vault, client),
 *   now: (await client.getBlock()).timestamp,
 * });
 * // Sign the pending requests, verify and attach with applySignatures, then build.
 * ```
 */
export async function prepareVaultV2Withdraw(
  client: Client,
  params: VaultV2WithdrawPlanParams,
): Promise<TransactionPlan> {
  return prepareVaultWithdraw(client, { ...params, type: "vaultV2Withdraw" });
}

/** @internal Encodes the withdrawal from its self-contained inputs and resolved signature requests. */
export function buildVaultV2Withdraw(
  action: Extract<Action, { type: "vaultV2Withdraw" }>,
  requests: readonly SignatureRequest[],
): Readonly<Transaction<VaultV2WithdrawAction>> {
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
  return vaultV2Withdraw({
    vault: { chainId, address: action.inputs.vault },
    args: {
      ...args,
      amount: assets,
      userAddress: account,
      requirementSignature: permit,
    },
  });
}
