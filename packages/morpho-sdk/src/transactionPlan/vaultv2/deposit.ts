import type { AccrualVaultV2 } from "@morpho-org/blue-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import type { Client } from "viem";
import { selectBundlesTokenRequirementSignature } from "../../actions/bundles/common.js";
import { vaultV2Deposit } from "../../actions/vaultV2/deposit.js";
import type { Transaction, VaultV2DepositAction } from "../../types/index.js";
import { type DepositPlanParams, prepareVaultDeposit } from "../deposit.js";
import { getVaultPermit } from "../permit.js";
import type { Action, SignatureRequest, TransactionPlan } from "../types.js";

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * Caller intent for a Vault V2 deposit, mirroring the Actions API deposit inputs, plus the snapshot.
 */
export interface VaultV2DepositPlanParams
  extends DepositPlanParams<AccrualVaultV2> {}

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * Prepares a deposit plan from caller intent and a vault snapshot, reading the token prerequisites
 * directly. The quote is fixed on the deposit step at preparation, so the returned plan is static:
 * only signatures are added before building.
 * @param client - Viem client for `params.chainId`, used for allowance and permit metadata reads only.
 * @param params.vault - Caller-fetched AccrualVaultV2 snapshot used for the quote; the address is vault.address.
 * @param params.chainId - Chain containing the vault and registered VaultBundlesV1 contract.
 * @param params.account - Non-zero account funding, signing and sending the deposit.
 * @param params.assets - Positive gross deposit in asset base units, before referral fees.
 * @param params.funding.type - Optional funding source: `"erc20"` (default) or `"native"`; native funding requires the vault asset to be wNative.
 * @param params.referralFee.bps - Optional integer fee in basis points of the gross assets; defaults to zero and must be at most 1,000.
 * @param params.referralFee.recipient - Recipient of the optional fee; must be non-zero when the fee is positive.
 * @param params.slippageTolerance - Optional WAD-scaled tolerance for the share-price bound; defaults to `DEFAULT_SLIPPAGE_TOLERANCE` and must not exceed `MAX_SLIPPAGE_TOLERANCE`.
 * @param params.supportSignature - Optional ERC-2612 preference, defaulting to `false`; when enabled, falls back to direct approval if no permit is available.
 * @param params.now - Reference timestamp in seconds, normally the latest block's `timestamp`; uses the device clock when omitted.
 * @param params.expiresAt - Optional Unix timestamp in seconds as a safe integer, later than `now`; defaults to `now + 2h` (device clock when `now` is omitted).
 * @param params.calldataOrigin - Optional non-empty, even-length hex bytes appended to each built transaction's calldata.
 * @param params.deployless - Optional permission to use deployless aggregation for token permit metadata reads.
 * @returns A plan with approvals, concrete signature requests and the deposit step.
 * @throws {InvalidBigIntInputError} when `now` is not a bigint.
 * @throws {ZeroAccountError} when `account` is the zero address.
 * @throws {NonIntegerInputError} when `expiresAt` or `referralFee.bps` is not a safe integer.
 * @throws {NonPositiveInputError} when `expiresAt`, `assets`, net assets or previewed shares are not positive.
 * @throws {ExpiredDeadlineError} when `expiresAt` is at or before `now` (device clock when `now` is omitted).
 * @throws {NegativeInputError} when `referralFee.bps` or `slippageTolerance` is negative.
 * @throws {InputExceedsMaxError} when `expiresAt` exceeds seven days after `now`, `referralFee.bps` exceeds 1,000 or `assets` exceeds uint256.
 * @throws {ExcessiveSlippageToleranceError} when `slippageTolerance` exceeds `MAX_SLIPPAGE_TOLERANCE`.
 * @throws {InvalidCalldataOriginError} when `calldataOrigin` is empty, malformed or has an odd number of hex digits.
 * @throws {InvalidTransactionPlanError} when `account` is malformed or `calldataOrigin` exceeds 1 MiB.
 * @throws {ReferralFeeRecipientMissingError} when a positive referral fee has no recipient or a zero recipient.
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
 *   chainId: 1, account: "0x0000000000000000000000000000000000000001", assets: 1_000_000n, supportSignature: true,
 *   vault: await fetchAccrualVaultV2(vault, client),
 *   now: (await client.getBlock()).timestamp,
 * });
 * // Sign the pending requests, verify and attach with applySignatures, then build.
 * ```
 */
export async function prepareVaultV2Deposit(
  client: Client,
  params: VaultV2DepositPlanParams,
): Promise<TransactionPlan> {
  return prepareVaultDeposit(client, { ...params, type: "vaultV2Deposit" });
}

/** @internal Encodes the deposit from its self-contained inputs and resolved signature requests. */
export function buildVaultV2Deposit(
  action: Extract<Action, { type: "vaultV2Deposit" }>,
  requests: readonly SignatureRequest[],
): Readonly<Transaction<VaultV2DepositAction>> {
  const { asset, chainId, account, assets, nativeAssets, ...args } =
    action.inputs;
  const signature = getVaultPermit(requests, {
    id: action.signatureRequestIds.tokenPermit,
    asset,
    owner: account,
  });
  const requirementSignature = selectBundlesTokenRequirementSignature(
    signature ? [signature] : [],
    {
      spender: getChainAddress(chainId, "bundles.vaultBundlesV1"),
      amount: assets ?? nativeAssets,
      deadline: action.inputs.deadline,
    },
  );
  return vaultV2Deposit({
    vault: { chainId, address: action.inputs.vault, asset },
    args: {
      ...args,
      ...(nativeAssets === undefined
        ? { amount: assets }
        : { nativeAmount: nativeAssets }),
      userAddress: account,
      requirementSignature,
    },
  });
}
