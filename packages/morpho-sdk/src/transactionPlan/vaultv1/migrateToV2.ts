import {
  type AccrualVault,
  type AccrualVaultV2,
  DEFAULT_SLIPPAGE_TOLERANCE,
  Eip5267Domain,
  Token,
} from "@morpho-org/blue-sdk";
import { deepFreeze, getChainAddress, Time } from "@morpho-org/morpho-ts";
import { type Address, type Client, isAddressEqual } from "viem";
import {
  normalizeBundlesCommonParams,
  selectBundlesSharesPermitSignature,
} from "../../actions/bundles/common.js";
import { vaultV1MigrateToV2 } from "../../actions/vaultV1/migrateToV2.js";
import { computeVaultV1MigrateToV2Quote } from "../../entities/vaultV1/migrateToV2Quote.js";
import {
  validateSlippageTolerance,
  validateUint256Field,
} from "../../helpers/validate.js";
import {
  AmountAndSharesExclusiveError,
  NonPositiveInputError,
  type ReferenceTimestampParams,
  SameVaultMigrationError,
  type Transaction,
  VaultAssetMismatchError,
  type VaultV1MigrateToV2Action,
  type VaultV1MigrateToV2AmountArgs,
} from "../../types/index.js";
import { InvalidTransactionPlanError } from "../error.js";
import { type IntentParams, resolveIntent } from "../intent.js";
import { getVaultPermit } from "../permit.js";
import { getVaultShareSpendingRequirements } from "../shareSpending.js";
import type { Action, SignatureRequest, TransactionPlan } from "../types.js";
import {
  getPlanObject,
  validatePlanField,
  validatePlanFields,
  validateVaultPlanAction,
} from "../validation.js";

/** @internal Validates the stored Vault V1 migration action's input shape. */
export function validateMigrateToV2PlanAction(
  action: Record<string, unknown>,
  path: string,
): void {
  const inputs = validateVaultPlanAction(action, path);
  validatePlanFields(inputs, {
    path: `${path}.inputs`,
    fields: {
      sourceVault: "address",
      targetVault: "address",
      asset: "address",
      maxSharePrice: "uint256 bigint",
      requiredShareAllowance: "uint256 bigint",
    },
  });
  if (!isAddressEqual(inputs.vault as Address, inputs.sourceVault as Address)) {
    throw new InvalidTransactionPlanError({
      path: `${path}.inputs.vault`,
      reason: "expected sourceVault",
    });
  }
  if ((inputs.assets === undefined) === (inputs.shares === undefined)) {
    throw new InvalidTransactionPlanError({
      path: `${path}.inputs`,
      reason: "expected exactly one of assets or shares",
    });
  }
  const field = inputs.assets === undefined ? "shares" : "assets";
  validatePlanField(inputs[field], {
    path: `${path}.inputs.${field}`,
    type: "uint256 bigint",
  });
  // Migration actions require a role map even when no permit is needed.
  getPlanObject(action.signatureRequestIds, `${path}.signatureRequestIds`);
}

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * Caller intent for a Vault V1-to-V2 migration with caller-fetched accrual snapshots.
 * Snapshots are used only at preparation and are never stored in the plan.
 * @example
 * ```ts
 * import type { VaultV1MigrateToV2PlanParams } from "@morpho-org/morpho-sdk";
 * import { fetchAccrualVault, fetchAccrualVaultV2 } from "@morpho-org/morpho-sdk/fetch";
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const sourceVault = "0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB";
 * const targetVault = "0x04422053aDDbc9bB2759b248B574e3FCA76Bc145";
 * const params: VaultV1MigrateToV2PlanParams = {
 *   chainId: 1, account: "0x0000000000000000000000000000000000000001",
 *   sourceVault: await fetchAccrualVault(sourceVault, client),
 *   targetVault: await fetchAccrualVaultV2(targetVault, client),
 *   shares: 1_000_000n, supportSignature: true,
 * };
 * ```
 */
export type VaultV1MigrateToV2PlanParams = Omit<IntentParams, "deployless"> &
  ReferenceTimestampParams &
  VaultV1MigrateToV2AmountArgs & {
    readonly sourceVault: AccrualVault;
    readonly targetVault: AccrualVaultV2;
    readonly slippageTolerance?: bigint;
  };

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * Prepares a migration with fixed destination price and source share allowance quotes.
 * @param client - Viem client for the intended chain, used for code, allowance and nonce reads.
 * @param params.sourceVault - Caller-fetched AccrualVault source snapshot, including the source address and permit metadata.
 * @param params.targetVault - Caller-fetched AccrualVaultV2 destination snapshot, including its address and quote data.
 * @param params.chainId - Chain containing both vaults and the registered VaultBundlesV1 contract.
 * @param params.account - Non-zero account approving or permitting shares and sending the migration.
 * @param params.assets - Positive gross migration in asset base units, before referral fees; mutually exclusive with `shares`.
 * @param params.shares - Positive source share amount to migrate; mutually exclusive with `assets`.
 * @param params.referralFee.bps - Optional integer fee in basis points of the gross amount; defaults to zero and must be below 10,000.
 * @param params.referralFee.recipient - Recipient of the optional fee; must be non-zero when the fee is positive.
 * @param params.slippageTolerance - Optional WAD-scaled tolerance for the destination price and source share allowance quotes; defaults to `DEFAULT_SLIPPAGE_TOLERANCE` and must not exceed `MAX_SLIPPAGE_TOLERANCE`.
 * @param params.supportSignature - Optional unlimited ERC-2612 share-permit preference, defaulting to `false`; otherwise uses unlimited direct share approval when allowance is insufficient. Vault V1 shares support ERC-2612; no Permit2 is used.
 * @param params.now - Reference timestamp in seconds, normally the latest block's `timestamp`; uses the device clock when omitted.
 * @param params.expiresAt - Optional Unix timestamp in seconds as a safe integer, later than `now`; defaults to `now + 2h`.
 * @param params.calldataOrigin - Optional non-empty, even-length hex bytes appended to each built transaction's calldata.
 * @returns A static migration plan with any required source share approval or permit.
 * @throws {VaultAssetMismatchError} If the vault assets differ.
 * @throws {SameVaultMigrationError} If source and target are identical.
 * @throws {AmountAndSharesExclusiveError} If both or neither amount is supplied.
 * @throws {ZeroAccountError} when `account` is the zero address.
 * @throws {NonIntegerInputError} when `expiresAt` or `referralFee.bps` is not a safe integer.
 * @throws {NonPositiveInputError} when `expiresAt`, the selected amount, net migrated assets or previewed shares are not positive.
 * @throws {NegativeInputError} when `referralFee.bps` or `slippageTolerance` is negative.
 * @throws {InputExceedsMaxError} when `referralFee.bps` exceeds 10,000 or the selected amount exceeds uint256.
 * @throws {ExcessiveSlippageToleranceError} when `slippageTolerance` exceeds `MAX_SLIPPAGE_TOLERANCE`.
 * @throws {InvalidCalldataOriginError} when `calldataOrigin` is empty, malformed or has an odd number of hex digits.
 * @throws {InvalidTransactionPlanError} when `account` is malformed or `calldataOrigin` exceeds 1 MiB.
 * @throws {ReferralFeePctExceededError} when `referralFee.bps` equals 10,000; the normalized fee must be below WAD.
 * @throws {ReferralFeeRecipientMissingError} when a positive referral fee has no recipient or a zero recipient.
 * @throws {ExpiredDeadlineError} If the expiry is not in the future.
 * @throws {ChainIdMismatchError} If the client targets another chain.
 * @throws {MissingContractCodeError} If VaultBundlesV1 is absent.
 * @throws {MissingPermitDomainNameError} when share allowance is insufficient, signatures are enabled, and the snapshot has neither a permit domain nor a name.
 * @throws {InvalidPermitDomainChainIdError} when share allowance is insufficient, signatures are enabled, and the snapshot's permit domain has a different or missing chain ID.
 * @throws {InvalidPermitDomainVerifyingContractError} when share allowance is insufficient, signatures are enabled, and the snapshot's permit domain has a different or missing verifying contract.
 * @throws {UnsupportedPermitDomainExtensionsError} when share allowance is insufficient, signatures are enabled, and the snapshot's permit domain advertises extensions.
 * @see computeVaultMaxSharePrice for quote errors.
 * @example
 * ```ts
 * import { prepareVaultV1MigrateToV2 } from "@morpho-org/morpho-sdk";
 * import { fetchAccrualVault, fetchAccrualVaultV2 } from "@morpho-org/morpho-sdk/fetch";
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const sourceVault = "0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB";
 * const targetVault = "0x04422053aDDbc9bB2759b248B574e3FCA76Bc145";
 * const plan = await prepareVaultV1MigrateToV2(client, {
 *   chainId: 1, account: "0x0000000000000000000000000000000000000001",
 *   sourceVault: await fetchAccrualVault(sourceVault, client),
 *   targetVault: await fetchAccrualVaultV2(targetVault, client),
 *   assets: 1_000_000n, supportSignature: true,
 * });
 * // Sign pending requests, verify and attach with applySignatures, then buildTransactions.
 * ```
 */
export async function prepareVaultV1MigrateToV2(
  client: Client,
  params: VaultV1MigrateToV2PlanParams,
): Promise<TransactionPlan> {
  const { sourceVault, targetVault, chainId, account } = params;
  const now = params.now ?? Time.timestamp();
  const intent = resolveIntent(params, now);
  const slippageTolerance =
    params.slippageTolerance ?? DEFAULT_SLIPPAGE_TOLERANCE;
  validateSlippageTolerance(slippageTolerance);
  if (!isAddressEqual(sourceVault.asset, targetVault.asset)) {
    throw new VaultAssetMismatchError(sourceVault.asset, targetVault.asset);
  }
  if (isAddressEqual(sourceVault.address, targetVault.address)) {
    throw new SameVaultMigrationError(sourceVault.address);
  }
  const { assets, shares } = params;
  if ((assets == null) === (shares == null)) {
    throw new AmountAndSharesExclusiveError();
  }
  const selectedAmount = assets ?? shares ?? 0n;
  if (selectedAmount <= 0n) {
    throw new NonPositiveInputError(
      assets == null ? "shares" : "assets",
      selectedAmount,
    );
  }
  // Reject ABI overflow before any RPC request.
  validateUint256Field(assets == null ? "shares" : "assets", selectedAmount);
  const common = normalizeBundlesCommonParams(intent);
  const { maxSharePriceVaultV2, requiredShareAllowance } =
    computeVaultV1MigrateToV2Quote({
      sourceVault,
      targetVault,
      ...(assets == null ? { shares: shares ?? 0n } : { assets }),
      referralFeePct: common.referralFeePct,
      deadline: intent.deadline,
      slippageTolerance,
      now,
    });
  const domain = sourceVault.eip5267Domain;
  const { approvals, signatureRequests, tokenPermitRequestId } =
    await getVaultShareSpendingRequirements(client, {
      type: "vaultV1MigrateToV2",
      shareToken: new Token({
        address: sourceVault.address,
        name: sourceVault.name,
        eip5267Domain:
          domain == null
            ? undefined
            : new Eip5267Domain({
                ...domain,
                extensions: [...domain.extensions],
              }),
      }),
      account,
      chainId,
      requiredShareAllowance,
      deadline: intent.deadline,
      supportSignature: intent.supportSignature,
      now,
    });
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
          id: "vaultV1MigrateToV2",
          label: "Migrate to Vault V2",
          action: {
            type: "vaultV1MigrateToV2",
            inputs: {
              chainId,
              account,
              vault: sourceVault.address,
              sourceVault: sourceVault.address,
              targetVault: targetVault.address,
              asset: sourceVault.asset,
              ...(assets == null ? { shares: shares ?? 0n } : { assets }),
              maxSharePrice: maxSharePriceVaultV2,
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

/** @internal Maps stored maxSharePrice to the ABI maxSharePriceVaultV2 and encodes the source permit. */
export function buildVaultV1MigrateToV2(
  action: Extract<Action, { type: "vaultV1MigrateToV2" }>,
  requests: readonly SignatureRequest[],
): Readonly<Transaction<VaultV1MigrateToV2Action>> {
  const {
    vault: _vault,
    sourceVault,
    maxSharePrice,
    asset,
    requiredShareAllowance,
    chainId,
    account,
    ...args
  } = action.inputs;
  const signature = getVaultPermit(requests, {
    id: action.signatureRequestIds.tokenPermit,
    asset: sourceVault,
    owner: account,
  });
  const permit = selectBundlesSharesPermitSignature(
    signature ? [signature] : [],
    {
      spender: getChainAddress(chainId, "bundles.vaultBundlesV1"),
      amount: requiredShareAllowance,
      deadline: args.deadline,
    },
  );
  return vaultV1MigrateToV2({
    vault: { chainId, address: sourceVault, asset },
    args: {
      ...args,
      targetAsset: asset,
      maxSharePriceVaultV2: maxSharePrice,
      userAddress: account,
      requirementSignature: permit,
    },
  });
}
