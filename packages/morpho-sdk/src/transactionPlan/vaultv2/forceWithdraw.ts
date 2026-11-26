import type { AccrualVaultV2 } from "@morpho-org/blue-sdk";
import { deepFreeze, getChainAddress, Time } from "@morpho-org/morpho-ts";
import { type Address, type Client, maxUint256 } from "viem";
import { selectBundlesSharesPermitSignature } from "../../actions/bundles/common.js";
import { vaultV2ForceWithdraw } from "../../actions/vaultV2/forceWithdraw.js";
import { getVaultV2ForceWithdrawRequirements } from "../../entities/requirements/getVaultV2ForceWithdrawRequirements.js";
import { computeVaultV2ForceWithdrawQuote } from "../../entities/vaultV2/forceWithdrawQuote.js";
import { validateChainId } from "../../helpers/validate.js";
import {
  isRequirementApproval,
  NonPositiveInputError,
  type ReferenceTimestampParams,
  type Transaction,
  UnsupportedRequirementSignatureError,
  type VaultV2ForceWithdrawAction,
} from "../../types/index.js";
import { InvalidTransactionPlanError } from "../error.js";
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

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * Caller intent for a Vault V2 forced exit through VaultExitBundlesV1.
 * @example
 * ```ts
 * import type { AccrualVaultV2 } from "@morpho-org/blue-sdk";
 * import type { VaultV2ForceWithdrawPlanParams } from "@morpho-org/morpho-sdk";
 * import type { Address } from "viem";
 * const intent = (vault: AccrualVaultV2, account: Address): VaultV2ForceWithdrawPlanParams => ({
 *   vault, account, chainId: 1, assets: 1_000_000n,
 * });
 * ```
 */
export interface VaultV2ForceWithdrawPlanParams
  extends Omit<IntentParams, "deployless">,
    ReferenceTimestampParams {
  /** Snapshot fetched by the caller; never stored in the plan. */
  readonly vault: AccrualVaultV2;
  /** Penalty-inclusive assets debited; received assets exclude penalties and referral fees. */
  readonly assets: bigint;
  /** Optional assertion that this is the vault's sole supported adapter. */
  readonly adapter?: Address;
  /** WAD-scaled tolerance for the derived floor; omitted values use the entity default. */
  readonly slippageTolerance?: bigint;
}

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * Prepares a static forced-exit plan using shared snapshot quoting and requirement helpers.
 * The adapter and realized share-price floor are fixed at preparation. VaultExitBundlesV1
 * withdraws penalty-free liquidity first, then force-deallocates the remaining assets onchain.
 * No fetch requests or Permit2 prerequisites are needed.
 * @param client - Plain viem client for `params.chainId`, used for allowance, nonce and code reads.
 * @param params.vault - Caller-fetched accrual snapshot used for the exit quote; its address identifies the vault.
 * @param params.chainId - Chain containing the vault and registered VaultExitBundlesV1 contract.
 * @param params.account - Non-zero account signing and sending the exit and receiving its assets.
 * @param params.assets - Positive penalty-inclusive exit assets in asset base units; received assets exclude penalties and referral fees.
 * @param params.adapter - Optional assertion that this address is the vault's sole supported adapter.
 * @param params.slippageTolerance - Optional WAD-scaled tolerance used to derive the realized share-price floor; defaults to `DEFAULT_SLIPPAGE_TOLERANCE` and must not exceed `MAX_SLIPPAGE_TOLERANCE`.
 * @param params.referralFee.bps - Optional integer fee in basis points of withdrawn assets, after penalties; defaults to zero and must be at most 1,000. The fee is deducted after the share-price check.
 * @param params.referralFee.recipient - Optional fee recipient; must be non-zero when the fee is positive.
 * @param params.supportSignature - Optional ERC-2612 preference, defaulting to `false`; insufficient allowance produces an unlimited direct share approval, or an unlimited share permit when `true`.
 * @param params.now - Reference timestamp in seconds, normally the latest block's `timestamp`; uses the device clock when omitted.
 * @param params.expiresAt - Optional Unix timestamp in seconds as a safe integer, later than `now` and within the fee-projection horizon; defaults to `now + 2h`.
 * @param params.calldataOrigin - Optional non-empty, even-length hex bytes appended to each built transaction's calldata.
 * @returns A deep-frozen plan containing ordered share approvals, if needed, followed by the forced exit and its concrete permit request, if needed.
 * @throws {ZeroAccountError} when `account` is the zero address.
 * @throws {NonIntegerInputError} when `expiresAt` or `referralFee.bps` is not a safe integer.
 * @throws {NonPositiveInputError} when `expiresAt` or `assets` is not positive.
 * @throws {ExpiredDeadlineError} when the expiry has elapsed, including during requirement resolution.
 * @throws {NegativeInputError} when `referralFee.bps` or `slippageTolerance` is negative.
 * @throws {ExcessiveSlippageToleranceError} when `slippageTolerance` exceeds `MAX_SLIPPAGE_TOLERANCE`.
 * @throws {InputExceedsMaxError} when an input exceeds uint256 or the expiry exceeds the fee-projection horizon.
 * @throws {InvalidCalldataOriginError} when `calldataOrigin` is empty, malformed or has an odd number of hex digits.
 * @throws {InvalidTransactionPlanError} when `account` is malformed or `calldataOrigin` exceeds 1 MiB.
 * @throws {ChainIdMismatchError} when the client declares or serves another chain.
 * @throws {InputExceedsMaxError} when `referralFee.bps` exceeds 1,000.
 * @throws {ReferralFeeRecipientMissingError} when a positive referral fee has no recipient or a zero recipient.
 * @throws {VaultV2SingleAdapterRequiredError} when the snapshot does not have exactly one adapter.
 * @throws {AdapterNotPartOfVaultError} when the adapter assertion does not match the vault's adapter.
 * @throws {VaultV2UnsupportedExitAdapterError} when the sole adapter is not a MorphoMarketV1AdapterV2.
 * @throws {VaultV2UnsupportedLiquidityAdapterError} when the liquidity adapter is neither unset nor the sole supported adapter.
 * @throws {VaultV2UndecodableLiquidityDataError} when the configured liquidity data cannot be decoded as market parameters.
 * @throws {VaultV2ForceWithdrawZeroWithdrawalError} when the exit produces no assets after penalties.
 * @throws {VaultV2ForceWithdrawCoverageError} when the adapter's markets cannot cover the required deallocation.
 * @throws {VaultV2ForceWithdrawFeeSharesExceedBurnError} when projected fee mints erase the net share burn.
 * @throws {VaultV2ForceWithdrawZeroSharePriceError} when the derived share-price floor rounds to zero.
 * @throws {UnsupportedChainIdError} when the chain has no address registry.
 * @throws {UnknownAddressError} when VaultExitBundlesV1 is not registered on the chain.
 * @throws {MissingContractCodeError} when the registered exit bundle has no code.
 * @throws {viem.BaseError} when a chain, code, allowance or nonce read fails.
 * @throws {UnexpectedRequirementSignatureError} when a permit requirement omits its nonce.
 * @throws {UnsupportedRequirementSignatureError} when a requirement is neither an approval nor an ERC-2612 permit.
 * @example
 * ```ts
 * import { prepareVaultV2ForceWithdraw, buildTransactions } from "@morpho-org/morpho-sdk";
 * import { fetchAccrualVaultV2 } from "@morpho-org/morpho-sdk/fetch";
 * import { createPublicClient, http, type Address } from "viem";
 * import { mainnet } from "viem/chains";
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * export async function forceWithdraw(vault: Address, account: Address) {
 *   const plan = await prepareVaultV2ForceWithdraw(client, {
 *     account, chainId: 1, assets: 1_000_000n,
 *     vault: await fetchAccrualVaultV2(vault, client),
 *     now: (await client.getBlock()).timestamp,
 *   });
 *   return buildTransactions(plan); // Submit approvals before the exit, from account.
 * }
 * ```
 */
export async function prepareVaultV2ForceWithdraw(
  client: Client,
  params: VaultV2ForceWithdrawPlanParams,
): Promise<TransactionPlan> {
  const { chainId, account } = params;
  const now = params.now ?? Time.timestamp();
  const intent = resolveIntent(params, now);
  validateChainId(client.chain?.id, chainId);
  const quote = computeVaultV2ForceWithdrawQuote({
    vaultData: params.vault,
    vault: params.vault.address,
    userAddress: account,
    deadline: intent.deadline,
    now,
    exitAssets: params.assets,
    adapter: params.adapter,
    slippageTolerance: params.slippageTolerance,
    referralFeePct: intent.referralFeePct,
    referralFeeRecipient: intent.referralFeeRecipient,
  });
  const {
    onBehalf: _onBehalf,
    exitAssets: assets,
    ...inputs
  } = vaultV2ForceWithdraw({
    vault: { chainId, address: params.vault.address },
    args: {
      exitAssets: params.assets,
      adapter: quote.adapter,
      minSharePriceE27: quote.minSharePriceE27,
      userAddress: account,
      deadline: quote.deadline,
      referralFeePct: intent.referralFeePct,
      referralFeeRecipient: intent.referralFeeRecipient,
    },
  }).action.args;
  const requirements = await getVaultV2ForceWithdrawRequirements(client, {
    vaultData: params.vault,
    vault: params.vault.address,
    userAddress: account,
    chainId,
    deadline: quote.deadline,
    requiredShareAllowance: quote.requiredShareAllowance,
    supportSignature: intent.supportSignature,
    now,
  });
  const approvals: Step[] = [];
  const signatureRequests: SignatureRequest[] = [];
  const tokenPermitRequestId = "vaultV2ForceWithdraw:tokenPermit";
  for (const requirement of requirements) {
    if (isRequirementApproval(requirement)) {
      approvals.push(
        buildApprovalStep(requirement, {
          id: "vaultV2ForceWithdraw:approval",
          chainId,
          account,
          denomination: "shares",
        }),
      );
    } else if (requirement.action.type === "permit") {
      signatureRequests.push(
        buildPermitSignatureRequest(
          { action: requirement.action },
          tokenPermitRequestId,
        ),
      );
    } else {
      throw new UnsupportedRequirementSignatureError(requirement.action.type);
    }
  }
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
          id: "vaultV2ForceWithdraw",
          label: "Force withdraw from vault",
          action: {
            type: "vaultV2ForceWithdraw",
            inputs: { ...inputs, assets, chainId, account },
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

/** @internal Encodes the forced exit from fixed inputs and its referenced vault-share permit. */
export function buildVaultV2ForceWithdraw(
  action: Extract<Action, { type: "vaultV2ForceWithdraw" }>,
  requests: readonly SignatureRequest[],
): Readonly<Transaction<VaultV2ForceWithdrawAction>> {
  const { chainId, account, assets, ...args } = action.inputs;
  if (args.minSharePriceE27 <= 0n) {
    throw new NonPositiveInputError("minSharePriceE27", args.minSharePriceE27);
  }
  const signature = getVaultPermit(requests, {
    id: action.signatureRequestIds.tokenPermit,
    asset: action.inputs.vault,
    owner: account,
  });
  const permit = selectBundlesSharesPermitSignature(
    signature ? [signature] : [],
    {
      spender: getChainAddress(chainId, "bundles.vaultExitBundlesV1"),
      amount: maxUint256,
      deadline: action.inputs.deadline,
    },
  );
  return vaultV2ForceWithdraw({
    vault: { chainId, address: action.inputs.vault },
    args: {
      ...args,
      exitAssets: assets,
      userAddress: account,
      requirementSignature: permit,
    },
  });
}

/** @internal Validates the stored forced withdrawal inputs. */
export function validateForceWithdrawPlanAction(
  action: Record<string, unknown>,
  path: string,
): void {
  const inputs = validateVaultPlanAction(action, path);
  validatePlanFields(inputs, {
    path: `${path}.inputs`,
    fields: {
      adapter: "address",
      assets: "uint256 bigint",
      minSharePriceE27: "uint256 bigint",
    },
  });
  if (inputs.minSharePriceE27 === 0n) {
    throw new InvalidTransactionPlanError({
      path: `${path}.inputs.minSharePriceE27`,
      reason: "expected a positive share-price floor",
    });
  }
}
