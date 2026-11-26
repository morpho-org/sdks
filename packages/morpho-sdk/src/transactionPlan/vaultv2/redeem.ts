import { getChainAddress } from "@morpho-org/morpho-ts";
import type { Client } from "viem";
import { selectBundlesSharesPermitSignature } from "../../actions/bundles/common.js";
import { vaultV2Redeem } from "../../actions/vaultV2/redeem.js";
import type { Transaction, VaultV2RedeemAction } from "../../types/index.js";
import { getVaultPermit } from "../permit.js";
import { prepareVaultRedeem, type RedeemPlanParams } from "../redeem.js";
import type { Action, SignatureRequest, TransactionPlan } from "../types.js";

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * Caller intent for redeeming an exact number of Vault V2 shares.
 * No minimum assets received is enforced, matching `vaultV2.redeem()`.
 * @example
 * ```ts
 * import { Token } from "@morpho-org/morpho-sdk/blue/entities";
 * import type { VaultV2RedeemPlanParams } from "@morpho-org/morpho-sdk";
 * import type { Address } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * // Supply a non-zero share owner and positive shares in share base units.
 * export function redeemParams(account: Address, shares: bigint): VaultV2RedeemPlanParams {
 *   const params: VaultV2RedeemPlanParams = {
 *     shareToken: new Token({ address: "0x04422053aDDbc9bB2759b248B574e3FCA76Bc145" }),
 *     chainId: mainnet.id, account, shares, supportSignature: false,
 *   };
 *   // params: VaultV2RedeemPlanParams = { shareToken, chainId: 1, account, shares, supportSignature: false }.
 *   return params;
 * }
 * ```
 */
export interface VaultV2RedeemPlanParams extends RedeemPlanParams {}

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * Prepares an exact-share redemption through VaultBundlesV1. Reads share allowance and, when a
 * permit is needed, the vault nonce. No quote or fetch request is needed for an exact share count.
 * @param client - Viem client targeting `params.chainId`.
 * @param params.shareToken - Vault share token; an address-only Token is sufficient, without an accrual snapshot.
 * @param params.chainId - Chain containing the vault and registered VaultBundlesV1 contract.
 * @param params.account - Non-zero share owner, permit signer and transaction sender; receives the net assets.
 * @param params.shares - Positive exact shares to burn, in share base units; use the account's balance for full redemption.
 * @param params.referralFee.bps - Optional integer fee in basis points of gross redeemed assets; defaults to zero and must be at most 1,000.
 * @param params.referralFee.recipient - Optional fee recipient; must be non-zero when the fee is positive.
 * @param params.supportSignature - Optional ERC-2612 share-permit preference; defaults to `false` for direct approval.
 * @param params.now - Reference timestamp in seconds, normally the latest block's `timestamp`; uses the device clock when omitted.
 * @param params.expiresAt - Optional Unix timestamp in seconds as a safe integer, later than `now`; defaults to `now + 2h` (device clock when `now` is omitted).
 * @param params.calldataOrigin - Optional non-empty, even-length hex bytes appended to each built transaction's calldata.
 * @returns A deep-frozen, serializable `TransactionPlan` with version, chain, account, expiry,
 * ordered approval/redeem steps and signature requests. Any required share approval or permit is unlimited.
 * @throws {ZeroAccountError} when `account` is the zero address.
 * @throws {NonIntegerInputError} when `expiresAt` or `referralFee.bps` is not a safe integer.
 * @throws {NonPositiveInputError} when `expiresAt` or `shares` is not positive.
 * @throws {ExpiredDeadlineError} when `expiresAt` is not in the future.
 * @throws {NegativeInputError} when `referralFee.bps` is negative.
 * @throws {InputExceedsMaxError} when `referralFee.bps` exceeds 1,000 or `shares` exceeds uint256.
 * @throws {InvalidCalldataOriginError} when `calldataOrigin` is empty, malformed or has an odd number of hex digits.
 * @throws {InvalidTransactionPlanError} when `account` is malformed or `calldataOrigin` exceeds 1 MiB.
 * @throws {ReferralFeeRecipientMissingError} when a positive referral fee has no non-zero recipient.
 * @throws {ChainIdMismatchError} when the declared or RPC chain differs from `chainId`.
 * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
 * @throws {UnknownAddressError} when VaultBundlesV1 is not registered on the target chain.
 * @throws {MissingContractCodeError} when VaultBundlesV1 is absent on the target chain.
 * @throws {viem.BaseError} when a chain, bytecode, allowance or permit nonce read fails.
 * @example
 * ```ts
 * import { Token } from "@morpho-org/morpho-sdk/blue/entities";
 * import { prepareVaultV2Redeem, type TransactionPlan } from "@morpho-org/morpho-sdk";
 * import { type Address, createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * // Supply a non-zero share owner and its desired redemption shares in share base units.
 * export async function prepareRedeem(account: Address, shares: bigint): Promise<TransactionPlan> {
 *   const client = createPublicClient({ chain: mainnet, transport: http() });
 *   const vault = "0x04422053aDDbc9bB2759b248B574e3FCA76Bc145";
 *   const plan = await prepareVaultV2Redeem(client, {
 *     shareToken: new Token({ address: vault }), chainId: mainnet.id, account, shares, supportSignature: false,
 *   });
 *   // plan: TransactionPlan = { version: 2, chainId: 1, account, expiresAt,
 *   //   steps: [optional unlimited approval, vaultV2Redeem], signatureRequests: [] }.
 *   return plan;
 * }
 * ```
 */
export async function prepareVaultV2Redeem(
  client: Client,
  params: VaultV2RedeemPlanParams,
): Promise<TransactionPlan> {
  return prepareVaultRedeem(client, { ...params, type: "vaultV2Redeem" });
}

/** @internal Encodes a redemption from its fixed inputs and referenced share permit. */
export function buildVaultV2Redeem(
  action: Extract<Action, { type: "vaultV2Redeem" }>,
  requests: readonly SignatureRequest[],
): Readonly<Transaction<VaultV2RedeemAction>> {
  const { chainId, account, vault, shares, ...common } = action.inputs;
  const signature = getVaultPermit(requests, {
    id: action.signatureRequestIds.tokenPermit,
    asset: vault,
    owner: account,
  });
  const permit = selectBundlesSharesPermitSignature(
    signature ? [signature] : [],
    {
      spender: getChainAddress(chainId, "bundles.vaultBundlesV1"),
      amount: shares,
      deadline: action.inputs.deadline,
    },
  );
  return vaultV2Redeem({
    vault: { chainId, address: vault },
    args: {
      ...common,
      shares,
      userAddress: account,
      requirementSignature: permit,
    },
  });
}
