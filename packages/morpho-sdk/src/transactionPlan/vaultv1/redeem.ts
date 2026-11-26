import { getChainAddress } from "@morpho-org/morpho-ts";
import type { Client } from "viem";
import { selectBundlesSharesPermitSignature } from "../../actions/bundles/common.js";
import { vaultV1Redeem } from "../../actions/vaultV1/redeem.js";
import type { Transaction, VaultV1RedeemAction } from "../../types/index.js";
import { getVaultPermit } from "../permit.js";
import { prepareVaultRedeem, type RedeemPlanParams } from "../redeem.js";
import type { Action, SignatureRequest, TransactionPlan } from "../types.js";

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * Caller intent for an exact-share Vault V1 redemption through VaultBundlesV1.
 * Redemption sets no on-chain minimum assets received.
 * @example
 * ```ts
 * import type { VaultV1RedeemPlanParams } from "@morpho-org/morpho-sdk";
 * import type { Token } from "@morpho-org/blue-sdk";
 * import type { Address } from "viem";
 * const intent = (shareToken: Token, account: Address): VaultV1RedeemPlanParams => ({
 *   shareToken, chainId: 1, account, shares: 1_000_000n,
 * });
 * ```
 */
export interface VaultV1RedeemPlanParams extends RedeemPlanParams {}

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * Prepares an exact-share Vault V1 redemption with a direct unlimited share approval or ERC-2612
 * permit when needed. Reads the share allowance and, for permits, the account's nonce. The returned
 * plan contains only fixed inputs and signature requests; it never uses Permit2 or fetch requests.
 * Redemption sets no on-chain minimum assets received and accepts no slippage tolerance input.
 * @param client - Viem client connected to the target chain.
 * @param params - Vault share metadata and caller intent; inherited fields follow IntentParams.
 * @param params.shareToken - Required share Token carrying the vault address and V1 permit-domain metadata; no accrual snapshot is required.
 * @param params.shares - Positive exact share amount, not underlying assets.
 * @param params.supportSignature - Defaults to false for direct approval; true selects an unlimited ERC-2612 share permit when allowance is insufficient.
 * @param params.now - Reference timestamp in seconds, normally the latest block's `timestamp`; uses the device clock when omitted.
 * @param params.expiresAt - Optional Unix timestamp in seconds as a safe integer, later than `now`; defaults to `now + 2h`.
 * @returns A static plan containing any share approval followed by the redemption step.
 * @throws {ZeroAccountError} when `account` is the zero address.
 * @throws {NonIntegerInputError} when `expiresAt` or `referralFee.bps` is not a safe integer.
 * @throws {NonPositiveInputError} when `expiresAt` or `shares` is not positive.
 * @throws {ExpiredDeadlineError} when `expiresAt` is not in the future.
 * @throws {NegativeInputError} when `referralFee.bps` is negative.
 * @throws {InputExceedsMaxError} when `referralFee.bps` exceeds 1,000 or `shares` exceeds uint256.
 * @throws {InvalidCalldataOriginError} when `calldataOrigin` is empty, malformed or has an odd number of hex digits.
 * @throws {InvalidTransactionPlanError} when `account` is malformed or `calldataOrigin` exceeds 1 MiB.
 * @throws {ReferralFeeRecipientMissingError} when a positive referral fee has no recipient or a zero recipient.
 * @throws {ChainIdMismatchError} when the client targets another chain.
 * @throws {MissingContractCodeError} when VaultBundlesV1 is absent.
 * @throws {viem.BaseError} when an allowance, nonce, chain or contract-code read fails.
 * @see resolveIntent for shared expiry, fee and calldata origin validation.
 * @see getVaultBundlesSharesRequirements for share-permit domain errors.
 * @example
 * ```ts
 * import { prepareVaultV1Redeem } from "@morpho-org/morpho-sdk";
 * import { fetchToken } from "@morpho-org/morpho-sdk/fetch";
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 * import type { Address } from "viem";
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const prepare = async (vault: Address, account: Address, shares: bigint) =>
 *   prepareVaultV1Redeem(client, {
 *     account, chainId: mainnet.id, shares, supportSignature: true,
 *     shareToken: await fetchToken(vault, client),
 *   });
 * // Sign the pending requests, verify and attach with applySignatures, then build.
 * ```
 */
export async function prepareVaultV1Redeem(
  client: Client,
  params: VaultV1RedeemPlanParams,
): Promise<TransactionPlan> {
  return prepareVaultRedeem(client, { ...params, type: "vaultV1Redeem" });
}

/** @internal Encodes a redemption from fixed inputs and the referenced share permit. */
export function buildVaultV1Redeem(
  action: Extract<Action, { type: "vaultV1Redeem" }>,
  requests: readonly SignatureRequest[],
): Readonly<Transaction<VaultV1RedeemAction>> {
  const { chainId, account, ...args } = action.inputs;
  const signature = getVaultPermit(requests, {
    id: action.signatureRequestIds.tokenPermit,
    asset: action.inputs.vault,
    owner: account,
  });
  const permit = selectBundlesSharesPermitSignature(
    signature ? [signature] : [],
    {
      spender: getChainAddress(chainId, "bundles.vaultBundlesV1"),
      amount: action.inputs.shares,
      deadline: action.inputs.deadline,
    },
  );
  return vaultV1Redeem({
    vault: { chainId, address: action.inputs.vault },
    args: {
      ...args,
      userAddress: account,
      requirementSignature: permit,
    },
  });
}
