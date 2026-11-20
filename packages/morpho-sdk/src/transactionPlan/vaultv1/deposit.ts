import type { AccrualVault } from "@morpho-org/blue-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import type { Client } from "viem";
import { selectBundlesTokenRequirementSignature } from "../../actions/bundles/common.js";
import { vaultV1Deposit } from "../../actions/vaultV1/deposit.js";
import type { Transaction, VaultV1DepositAction } from "../../types/index.js";
import { type DepositPlanParams, prepareVaultDeposit } from "../deposit.js";
import { getVaultPermit } from "../permit.js";
import type { Action, SignatureRequest, TransactionPlan } from "../types.js";

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * Caller intent for a Vault V1 (MetaMorpho) deposit, mirroring the Actions API deposit inputs,
 * plus the snapshot. The fields match `VaultV2DepositPlanParams` except for the snapshot type.
 * @example
 * ```ts
 * import { vaults } from "@morpho-org/morpho-test";
 * import type { VaultV1DepositPlanParams } from "@morpho-org/morpho-sdk";
 * import { fetchAccrualVault } from "@morpho-org/morpho-sdk/fetch";
 * import { type Address, createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * export async function steakUsdcDepositParams(account: Address) {
 *   const client = createPublicClient({ chain: mainnet, transport: http() });
 *   const vault = vaults[mainnet.id].steakUsdc.address;
 *   const params: VaultV1DepositPlanParams = {
 *     chainId: mainnet.id, account, assets: 1_000_000n,
 *     vault: await fetchAccrualVault(vault, client),
 *   };
 *   // params satisfies VaultV1DepositPlanParams
 *   return params;
 * }
 * ```
 */
export interface VaultV1DepositPlanParams
  extends DepositPlanParams<AccrualVault> {}

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * Prepares a Vault V1 (MetaMorpho) deposit plan through VaultBundlesV1 from caller intent and a
 * vault snapshot, reading the token prerequisites directly. The built deposit matches the
 * `vaultV1(...).deposit(...)` handle's `buildTx()` for the same inputs. The quote is fixed on the deposit step at preparation, so the returned plan is static:
 * only signatures are added before building.
 * @param client - Viem client for `params.chainId`, used for allowance and permit metadata reads only.
 * @param params.vault - Caller-fetched AccrualVault snapshot used for the quote; its address identifies the vault.
 * @param params.chainId - Chain containing the vault and registered VaultBundlesV1 contract.
 * @param params.account - Non-zero account funding, signing and sending the deposit.
 * @param params.assets - Positive gross deposit in asset base units, before referral fees.
 * @param params.funding.type - Optional funding source: `"erc20"` (default) or `"native"`; native funding requires the vault asset to be wNative.
 * @param params.referralFee.bps - Optional integer fee in basis points of the gross amount; defaults to zero and must be below 10,000.
 * @param params.referralFee.recipient - Recipient of the optional fee; must be non-zero when the fee is positive.
 * @param params.slippageTolerance - Optional WAD-scaled tolerance for the share-price bound; defaults to `DEFAULT_SLIPPAGE_TOLERANCE` and must not exceed `MAX_SLIPPAGE_TOLERANCE`.
 * @param params.supportSignature - Optional ERC-2612 preference, defaulting to `false`; when enabled, falls back to direct approval if no permit is available.
 * @param params.now - Reference timestamp in seconds, normally the latest block's `timestamp`; uses the device clock when omitted.
 * @param params.expiresAt - Optional Unix timestamp in seconds as a safe integer, later than `now`; defaults to `now + 2h`.
 * @param params.calldataOrigin - Optional non-empty, even-length hex bytes appended to each built transaction's calldata.
 * @param params.deployless - Optional permission to use deployless aggregation for token permit metadata reads.
 * @returns A plan with approvals, concrete signature requests and the deposit step.
 * @throws {ZeroAccountError} when `account` is the zero address.
 * @throws {NonIntegerInputError} when `expiresAt` or `referralFee.bps` is not a safe integer.
 * @throws {NonPositiveInputError} when `expiresAt`, `assets`, net assets or previewed shares are not positive.
 * @throws {ExpiredDeadlineError} when `expiresAt` is not in the future.
 * @throws {NegativeInputError} when `referralFee.bps` or `slippageTolerance` is negative.
 * @throws {InputExceedsMaxError} when `referralFee.bps` exceeds 10,000 or `assets` exceeds uint256.
 * @throws {ExcessiveSlippageToleranceError} when `slippageTolerance` exceeds `MAX_SLIPPAGE_TOLERANCE`.
 * @throws {InvalidCalldataOriginError} when `calldataOrigin` is empty, malformed or has an odd number of hex digits.
 * @throws {ReferralFeePctExceededError} when `referralFee.bps` equals 10,000; the normalized fee must be below WAD.
 * @throws {ReferralFeeRecipientMissingError} when a positive referral fee has no recipient or a zero recipient.
 * @throws {NativeAmountOnNonWNativeVaultError} when native funding targets a vault whose asset is not wNative.
 * @throws {ChainIdMismatchError} when the client targets another chain.
 * @throws {MissingContractCodeError} when the VaultBundlesV1 contract is absent.
 * @see computeVaultMaxSharePrice for quote errors.
 * @example
 * ```ts
 * import { vaults } from "@morpho-org/morpho-test";
 * import { prepareVaultV1Deposit } from "@morpho-org/morpho-sdk";
 * import { fetchAccrualVault } from "@morpho-org/morpho-sdk/fetch";
 * import { type Address, createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * export async function prepareSteakUsdcDeposit(account: Address) {
 *   const client = createPublicClient({ chain: mainnet, transport: http() });
 *   const vault = vaults[mainnet.id].steakUsdc.address;
 *   const plan = await prepareVaultV1Deposit(client, {
 *     chainId: mainnet.id, account, assets: 1_000_000n, supportSignature: true,
 *     vault: await fetchAccrualVault(vault, client),
 *     now: (await client.getBlock()).timestamp,
 *   });
 *   // plan satisfies TransactionPlan: approval or permit request, then the vaultV1Deposit step.
 *   // Sign the pending requests, applySignatures, then build.
 *   return plan;
 * }
 * ```
 */
export async function prepareVaultV1Deposit(
  client: Client,
  params: VaultV1DepositPlanParams,
): Promise<TransactionPlan> {
  return prepareVaultDeposit(client, { ...params, type: "vaultV1Deposit" });
}

/** @internal Encodes the deposit from its self-contained inputs and resolved signature requests. */
export function buildVaultV1Deposit(
  action: Extract<Action, { type: "vaultV1Deposit" }>,
  requests: readonly SignatureRequest[],
): Readonly<Transaction<VaultV1DepositAction>> {
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
  return vaultV1Deposit({
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
