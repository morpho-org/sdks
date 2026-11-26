import {
  type AccrualVaultV2,
  DEFAULT_SLIPPAGE_TOLERANCE,
  MarketParams,
} from "@morpho-org/blue-sdk";
import { fetchAccrualVaultV2 } from "@morpho-org/blue-sdk-viem";
import {
  type AddressLabel,
  getChainAddress,
  Time,
} from "@morpho-org/morpho-ts";
import { type Address, isAddressEqual } from "viem";
import {
  getBundlesReferralFeeAssets,
  normalizeBundlesCommonParams as parseBundlesCommon,
  resolveBundlesFunding,
  selectBundlesSharesPermitSignature,
  selectBundlesTokenRequirementSignature,
} from "../../actions/bundles/common.js";
import {
  type ChainCheck,
  createChainCheck,
} from "../../actions/requirements/chainCheck.js";
import {
  buildVaultV2Deposit,
  type VaultV2DepositInput,
} from "../../actions/vaultV2/deposit.js";
import {
  buildVaultV2ForceRedeem,
  parseVaultV2ForceRedeem,
} from "../../actions/vaultV2/forceRedeem.js";
import {
  buildVaultV2ForceWithdraw,
  type VaultV2ForceWithdrawInput,
} from "../../actions/vaultV2/forceWithdraw.js";
import {
  buildVaultV2InKindRedeem,
  type VaultV2InKindRedeemInput,
} from "../../actions/vaultV2/inKindRedeem.js";
import {
  buildVaultV2Redeem,
  type VaultV2RedeemInput,
} from "../../actions/vaultV2/redeem.js";
import {
  buildVaultV2Withdraw,
  type VaultV2WithdrawInput,
} from "../../actions/vaultV2/withdraw.js";
import {
  computeVaultMaxShareAllowance,
  computeVaultMaxSharePrice,
  validateChainId,
  validateSlippageTolerance,
} from "../../helpers/index.js";
import { resolveTransactionMetadata } from "../../helpers/metadata.js";
import { parseUint256 } from "../../helpers/parse.js";
import {
  validateNativeVaultAsset,
  validateReferenceTime,
  validateVaultDepositDeadline,
} from "../../helpers/validate.js";
import type { FetchParameters } from "../../types/data.js";
import {
  type ActionOutput,
  type ActionRequirement,
  type BundlesFundingArgs,
  type BundlesTokenRequirementsOptions,
  type Deallocation,
  ExpiredDeadlineError,
  type MorphoClientType,
  NonPositiveInputError,
  type ReferenceTimestampParams,
  type RequirementSignature,
  type Transaction,
  VaultAddressMismatchError,
  type VaultV2DepositAction,
  type VaultV2ForceRedeemAction,
  type VaultV2ForceWithdrawAction,
  type VaultV2InKindRedeemAction,
  type VaultV2RedeemAction,
  type VaultV2WithdrawAction,
} from "../../types/index.js";
import { assertRegistryTargetsHaveCode } from "../requirements/assertContractCode.js";
import {
  getParsedBundlesTokenRequirements,
  parseGetBundlesTokenRequirements,
} from "../requirements/getBundlesTokenRequirements.js";
import {
  getParsedVaultBundlesSharesRequirements,
  parseVaultBundlesSharesRequirements,
} from "../requirements/getVaultBundlesSharesRequirements.js";
import { getVaultV2ForceWithdrawRequirements } from "../requirements/getVaultV2ForceWithdrawRequirements.js";
import { getVaultV2InKindRedeemRequirements } from "../requirements/getVaultV2InKindRedeemRequirements.js";
import { validateNativeRequirements } from "../requirements/validateNativeRequirements.js";
import { computeVaultV2ForceWithdrawQuote } from "./forceWithdrawQuote.js";
import { computeVaultV2InKindRedeemQuote } from "./inKindRedeemQuote.js";

/**
 * Action surface for Vault V2 reads and writes; writes route through VaultBundlesV1 and
 * VaultExitBundlesV1, except `forceRedeem`, which uses the vault's native multicall.
 */
export interface VaultV2Actions {
  /**
   * Fetches the latest accrual snapshot of the vault.
   *
   * Reads the Vault V2 state through `fetchAccrualVaultV2` on the entity's client.
   *
   * @param parameters - Optional viem fetch parameters (block number, block tag, state override).
   * @returns The hydrated `AccrualVaultV2` snapshot.
   * @throws {ChainIdMismatchError} when the connected client declares another chain or none, or its RPC reports another chain via `eth_chainId`.
   * @throws {viem.BaseError} when the `eth_chainId` request or a state read fails.
   * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
   * @throws {UnknownBlueFactory} when the configured chain has no VaultV2 factory.
   * @throws {UnknownBlueOfFactory} when the vault is not a VaultV2 from the configured factory.
   * @throws {UnsupportedBlueVaultV2AdapterError} when the vault or one of its adapters uses an
   *   unsupported adapter class.
   * @throws {UnknownTokenError} when the vault's share token has unusable decimals.
   * @throws {MalformedTokenMetadataError} when the share token's `eip712Domain()` or
   *   `bytes32` `name`/`symbol` retry returns non-empty data that does not decode, or when the
   *   deployless query reports malformed `name()`/`symbol()`/`eip712Domain()` returndata (no fallback).
   */
  getData: (
    parameters?: FetchParameters,
  ) => Promise<Awaited<ReturnType<typeof fetchAccrualVaultV2>>>;
  /**
   * Prepares a Vault V2 deposit through the registered VaultBundlesV1 contract.
   *
   * Uses the supplied vault snapshot to compute the deadline-accrued `maxSharePrice`.
   * `getRequirements()` reads the asset allowance and, when enabled, the selected ERC-2612
   * nonce state. Native funding is exclusive and skips token requirements. Shares are
   * always minted to the transaction sender, which must be `userAddress`.
   * Concurrent requirement reads share the first caller's options; later calls refresh on-chain
   * state using their own options.
   *
   * @param params.userAddress - Account that funds, signs, submits, and receives the vault shares.
   * @param params.vaultData - Pre-fetched Vault V2 snapshot used for asset and share conversion.
   * @param params.amount - Optional gross ERC-20 assets; exclusive with `nativeAmount`.
   * @param params.nativeAmount - Optional gross native assets; exclusive with `amount` and valid
   *   only for a wNative vault.
   * @param params.slippageTolerance - Optional WAD-scaled tolerance; defaults to 0.03% and cannot
   *   exceed 10%.
   * @param params.referralFeePct - Optional WAD-scaled referral fee at most 10%, deducted before
   *   the vault deposit.
   * @param params.referralFeeRecipient - Non-zero recipient required for a positive referral fee.
   * @param params.deadline - Optional execution and permit deadline in Unix seconds; defaults to
   *   two hours from handle creation.
   * @returns Lazy token prerequisite resolution and a synchronous deep-frozen VaultBundlesV1
   *   transaction builder.
   * @throws {ChainIdMismatchError} when the connected client targets another chain, or from
   *   `getRequirements()` when the RPC reports another chain via `eth_chainId`.
   * @throws {UnsupportedBlueMarketIrmError} when an underlying market with positive debt uses an unsupported IRM.
   * @throws {VaultAddressMismatchError} when `vaultData` belongs to another vault.
   * @throws {InvalidBigIntInputError} when `now` is not a bigint.
   * @throws {ExpiredDeadlineError} when the deadline is stale at creation or requirement resolution.
   * @throws {MixedBundlesFundingError} when ERC-20 and native funding are both supplied.
   * @throws {NegativeInputError} when funding, slippage, or the referral fee is negative.
   * @throws {NonPositiveInputError} when funding or the previewed vault shares are not positive.
   * @throws {ExcessiveSlippageToleranceError} when slippage tolerance exceeds the SDK maximum.
   * @throws {ReferralFeePctExceededError} when the referral fee is at least WAD.
   * @throws {MidnightReferralFeePctExceededError} when the referral fee is above 10% but below WAD.
   * @throws {ReferralFeeRecipientMissingError} when a positive referral fee has no recipient.
   * @throws {ChainWNativeMissingError} when native funding is requested on a chain without wNative.
   * @throws {NativeAmountOnNonWNativeVaultError} when native funding targets a non-wNative vault.
   * @throws {InputExceedsMaxError} when the deadline exceeds seven days after creation or funding or the deadline exceeds uint256.
   * @throws {AmbiguousRequirementSignaturesError} from `buildTx()` when multiple token signatures are supplied.
   * @throws {UnexpectedRequirementSignatureError} from `buildTx()` when an unsupported signature is supplied.
   * @throws {BundlesPermitMismatchError} from `buildTx()` when the signature's spender, amount or
   *   deadline differ from this operation's, or when the signature's carried action nonce is
   *   inconsistent with its signed nonce.
   * @throws {DepositOwnerMismatchError} from `buildTx()` when the signed owner differs from `userAddress`.
   * @throws {DepositAssetMismatchError} from `buildTx()` when the signed asset differs from the vault asset.
   * @throws {BundlesRequirementSignatureMismatchError} from `buildTx()` when signature metadata is malformed.
   * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
   * @throws {UnknownAddressError} when VaultBundlesV1 is not registered.
   * @throws {UnknownTokenError} from `getRequirements()` when the token's `decimals()` is unusable.
   * @throws {MalformedTokenMetadataError} when the token's `eip712Domain()` or
   *   `bytes32` `name`/`symbol` retry returns non-empty data that does not decode, or when the
   *   deployless query reports malformed `name()`/`symbol()`/`eip712Domain()` returndata (no fallback).
   * @throws {MissingContractCodeError} from `getRequirements()` when a fixed bundles or protocol
   *   contract has no code at its registered address.
   * @throws {viem.BaseError} from `getRequirements()` when an allowance, nonce, token metadata
   *   read, or `eth_chainId` request fails.
   * @example
   * ```ts
   * import { morphoViemExtension } from "@morpho-org/morpho-sdk";
   * import { createPublicClient, http, type Address, zeroAddress } from "viem";
   * import { mainnet } from "viem/chains";
   *
   * const keyrockUsdcVaultV2 =
   *   "0x04422053aDDbc9bB2759b248B574e3FCA76Bc145" satisfies Address;
   * const client = createPublicClient({ chain: mainnet, transport: http() })
   *   .extend(morphoViemExtension());
   * const vault = client.morpho.vaultV2(keyrockUsdcVaultV2, mainnet.id);
   * const vaultData = await vault.getData();
   * const action = vault.deposit({
   *   amount: 1_000_000n,
   *   userAddress: zeroAddress,
   *   vaultData,
   * });
   * const requirements = await action.getRequirements(); // Satisfy these first.
   * const tx = action.buildTx(); // For a client configured with supportSignature: false.
   * // tx satisfies Readonly<Transaction<VaultV2DepositAction>>
   * ```
   */
  deposit: (
    params: {
      readonly userAddress: Address;
      readonly vaultData: AccrualVaultV2;
      readonly slippageTolerance?: bigint;
      readonly referralFeePct?: bigint;
      readonly referralFeeRecipient?: Address;
      readonly deadline?: bigint;
    } & ReferenceTimestampParams &
      BundlesFundingArgs,
  ) => ActionOutput<
    VaultV2DepositAction,
    readonly RequirementSignature[],
    BundlesTokenRequirementsOptions
  >;
  /**
   * Prepares an exact-assets Vault V2 withdrawal through VaultBundlesV1.
   *
   * Derives the minimum required share allowance from the supplied `vaultData` snapshot at handle
   * creation, then reads the live vault-share allowance and, when a signature is needed, the permit
   * nonce on each `getRequirements()` call. Captures the requested amount and owner at creation, so
   * later changes to `params` do not change this handle's requirements or transaction.
   *
   * @param params.amount - Positive gross withdrawal in underlying asset base units, before fees.
   * @param params.userAddress - Share owner that must sign and submit; receives the net assets.
   * @param params.vaultData - Pre-fetched Vault V2 snapshot used to derive the minimum share allowance.
   * @param params.slippageTolerance - Optional WAD-scaled tolerance used only to size the minimum
   *   share allowance. It does not impose an on-chain share-burn bound.
   *   Defaults to 0.03% and cannot exceed 10%.
   * @param params.referralFeePct - Optional WAD-scaled fee from 0% to 10%, inclusive, defaulting to zero;
   *   rounded down and deducted from the gross withdrawn assets.
   * @param params.referralFeeRecipient - Optional nonzero recipient required for a positive fee.
   * @param params.deadline - Optional execution and share-permit deadline in Unix seconds;
   *   defaults to two hours from handle creation.
   * @returns A frozen handle with lazy `getRequirements()` and synchronous `buildTx(signatures?)`,
   *   which returns a deep-frozen `Transaction<VaultV2WithdrawAction>`. Requirements are empty
   *   when the allowance meets or exceeds the required share amount. An insufficient allowance is
   *   raised by an unlimited approval or, with signature support, an ERC-2612 request. The minimum
   *   is fixed at handle creation while each call re-reads the allowance. Confirm the approval or
   *   pass its signed permit to `buildTx`.
   * @remarks VaultBundlesV1 skips a share permit whose nonce was already consumed and proceeds
   *   under the live allowance, so execute every requirement returned by the latest
   *   `getRequirements()` before submitting.
   * @throws {ChainIdMismatchError} when the connected client targets another chain, or from
   *   `getRequirements()` when the RPC reports another chain via `eth_chainId`.
   * @throws {NonPositiveInputError} when `amount` or the computed required share amount is not positive.
   * @throws {ExpiredDeadlineError} when `deadline` is not in the future at handle creation or
   *   at any `getRequirements()` call.
   * @throws {InputExceedsMaxError} when `amount` or `deadline` exceeds uint256 at handle creation.
   * @throws {NegativeInputError} when `referralFeePct` or `slippageTolerance` is negative.
   * @throws {ReferralFeePctExceededError} when `referralFeePct` is at least WAD.
   * @throws {MidnightReferralFeePctExceededError} when the referral fee is above 10% but below WAD.
   * @throws {ReferralFeeRecipientMissingError} when a positive referral fee has no nonzero recipient.
   * @throws {ExcessiveSlippageToleranceError} when `slippageTolerance` exceeds 10%.
   * @throws {VaultAddressMismatchError} when `vaultData` belongs to another vault.
   * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
   * @throws {UnknownAddressError} when VaultBundlesV1 is not registered on the target chain.
   * @throws {UnexpectedRequirementSignatureError} from `buildTx()` when an unsupported signature is supplied.
   * @throws {AmbiguousRequirementSignaturesError} from `buildTx()` when multiple permits are supplied.
   * @throws {BundlesPermitMismatchError} from `buildTx()` when the share permit is malformed or
   *   its spender or deadline differ from this operation's, or its amount is below the required
   *   share allowance.
   * @throws {MissingContractCodeError} from `getRequirements()` when a fixed bundles or protocol
   *   contract has no code at its registered address.
   * @throws {viem.BaseError} from `getRequirements()` when an allowance, nonce, or `eth_chainId`
   *   read fails, or transaction encoding fails.
   * @example
   * ```ts
   * import { morphoViemExtension } from "@morpho-org/morpho-sdk";
   * import { createPublicClient, http, type Address } from "viem";
   * import { mainnet } from "viem/chains";
   *
   * export async function prepareUsdcWithdrawal(userAddress: Address) {
   *   const vaultAddress = "0x04422053aDDbc9bB2759b248B574e3FCA76Bc145";
   *   const client = createPublicClient({ chain: mainnet, transport: http() })
   *     .extend(morphoViemExtension({ supportSignature: false }));
   *   const vault = client.morpho.vaultV2(vaultAddress, mainnet.id);
   *   const vaultData = await vault.getData();
   *   const action = vault.withdraw({ amount: 1_000_000n, userAddress, vaultData });
   *   const requirements = await action.getRequirements();
   *   // Send and confirm each approval before calling action.buildTx().
   *   // action.buildTx() returns Readonly<Transaction<VaultV2WithdrawAction>>.
   *   return { action, requirements }; // Prepared handle and its outstanding share approvals.
   * }
   * ```
   */
  withdraw: (
    params: {
      readonly amount: bigint;
      readonly userAddress: Address;
      readonly vaultData: AccrualVaultV2;
      readonly slippageTolerance?: bigint;
      readonly referralFeePct?: bigint;
      readonly referralFeeRecipient?: Address;
      readonly deadline?: bigint;
    } & ReferenceTimestampParams,
  ) => ActionOutput<
    VaultV2WithdrawAction,
    readonly RequirementSignature[],
    undefined
  >;
  /**
   * Prepares an exact-shares Vault V2 redemption through VaultBundlesV1.
   *
   * Captures `shares` and `userAddress` at handle creation for both requirements and `buildTx()`.
   * The caller must satisfy the minimum share allowance returned by `getRequirements()` before
   * `buildTx()`; larger allowances also suffice, and each requirement resolution re-reads the live
   * allowance and checks the deadline.
   *
   * @param params - The redeem parameters.
   * @param params.shares - Exact vault shares to burn.
   * @param params.userAddress - Account that must sign and submit the transaction; VaultBundlesV1 burns `msg.sender`'s shares and pays `msg.sender`.
   * @param [params.referralFeePct=0n] - WAD-scaled referral fee deducted from the redeemed assets; must be at most 10%.
   * @param [params.referralFeeRecipient] - Non-zero recipient required when `referralFeePct` is positive.
   * @param [params.deadline] - VaultBundlesV1 execution deadline; defaults to two hours from now.
   * @returns Lazy share-allowance requirements and a synchronous transaction builder.
   * @throws {ChainIdMismatchError} when the client and entity target different chains, or from
   *   `getRequirements()` when the RPC reports another chain via `eth_chainId`.
   * @throws {NonPositiveInputError} when `shares` is not positive.
   * @throws {ExpiredDeadlineError} when `deadline` is not in the future at handle creation or
   *   requirement resolution.
   * @throws {InputExceedsMaxError} when `shares` or `deadline` exceeds uint256.
   * @throws {NegativeInputError} when `referralFeePct` is negative.
   * @throws {ReferralFeePctExceededError} when `referralFeePct` is not below WAD.
   * @throws {MidnightReferralFeePctExceededError} when the referral fee is above 10% but below WAD.
   * @throws {ReferralFeeRecipientMissingError} when a positive fee has no non-zero recipient.
   * @throws {UnsupportedChainIdError} when no address registry exists for the target chain.
   * @throws {UnknownAddressError} when VaultBundlesV1 is not registered on the target chain.
   * @throws {MissingContractCodeError} from `getRequirements()` when a fixed bundles or protocol
   *   contract has no code at its registered address.
   * @throws {viem.BaseError} from `getRequirements()` when an allowance, nonce, `eth_chainId`, or
   *   `eth_getCode` read fails.
   * @throws {UnknownTokenError} from `getRequirements()` when the share token fetched by
   *   `getData()` has unusable decimals.
   * @throws {MalformedTokenMetadataError} when the share token's `eip712Domain()` or
   *   `bytes32` `name`/`symbol` retry returns non-empty data that does not decode, or when the
   *   deployless query reports malformed `name()`/`symbol()`/`eip712Domain()` returndata (no fallback).
   * @throws {AmbiguousRequirementSignaturesError} from `buildTx()` when more than one permit signature is supplied.
   * @throws {UnexpectedRequirementSignatureError} from `buildTx()` when a non-permit signature is supplied.
   * @throws {BundlesPermitMismatchError} from `buildTx()` when the signature's spender or
   *   deadline differs from this operation's, or its amount is below the required share allowance.
   * @example
   * ```ts
   * import { isRequirementSignature } from "@morpho-org/morpho-sdk";
   *
   * const vault = client.morpho.vaultV2(vaultAddress, 1);
   * const redemption = vault.redeem({ shares: 1_000_000n, userAddress });
   * const signatures = [];
   * for (const requirement of await redemption.getRequirements()) {
   *   if (isRequirementSignature(requirement)) {
   *     signatures.push(await requirement.sign(walletClient, userAddress));
   *   } else {
   *     const hash = await walletClient.sendTransaction(requirement);
   *     await client.waitForTransactionReceipt({ hash });
   *   }
   * }
   * const tx = redemption.buildTx(signatures);
   * // tx satisfies Readonly<Transaction<VaultV2RedeemAction>>
   * ```
   */
  redeem: (
    params: {
      readonly shares: bigint;
      readonly userAddress: Address;
      readonly referralFeePct?: bigint;
      readonly referralFeeRecipient?: Address;
      readonly deadline?: bigint;
    } & ReferenceTimestampParams,
  ) => ActionOutput<
    VaultV2RedeemAction,
    readonly RequirementSignature[],
    undefined
  >;
  /**
   * Prepares an illiquid Vault V2 exit into idle assets and Morpho Blue supply positions.
   *
   * The vault must have exactly one `MorphoMarketV1AdapterV2`. `amount` is penalty-inclusive and
   * the caller controls market order. Call `getRequirements()` before `buildTx()` so Blue balance,
   * allowance, and nonce are checked on-chain. Vault gates are enforced by the final transaction
   * and are not preflighted: receive gates may depend on VaultExitBundlesV1's transient initiator,
   * while arbitrary send-share gates may depend on intermediate state changed by the exit's
   * multiple share burns. The SDK intentionally does not validate the user's share balance; size
   * it so `amount + BigInt(marketParamsList.length) <= vault.previewRedeem(sharesHeld)`. The
   * per-market term covers V2 withdrawal rounding and is not needed for V1. The share allowance
   * includes that buffer, the penalty burns, and accrual through the bundle deadline.
   *
   * Idle balance, penalty, and adapter positions can drift after the snapshot, so an on-chain
   * under-coverage panic remains possible if vault state changes between preparation and inclusion.
   *
   * In-kind exits have no on-chain share-price or max-shares bound. A share-price drop before
   * inclusion can burn more shares than quoted when the allowance is unlimited. The SDK requires
   * the computed minimum allowance, and an insufficient allowance is raised by an unlimited
   * approval or ERC-2612 permit.
   *
   * @param params - In-kind redemption parameters.
   * @param params.amount - Penalty-inclusive, asset-denominated amount to exit.
   * @param params.marketParamsList - Ordered adapter markets consumed greedily after idle assets;
   *   its length is also the V2 share-sufficiency rounding buffer.
   * @param params.vaultData - Pre-fetched Vault V2 accrual snapshot.
   * @param params.userAddress - Account that signs and submits the exit.
   * @param params.adapter - Optional adapter override; defaults to the vault's sole adapter.
   * @param params.deadline - Optional shared permit/bundle deadline; defaults to two hours from now.
   * @returns Lazy prerequisite resolution and a synchronous transaction builder.
   * @throws {ChainIdMismatchError} when the client and entity target different chains, or from
   *   `getRequirements()` when the RPC reports another chain via `eth_chainId`.
   * @throws {UnsupportedBlueMarketIrmError} when an adapter-listed market with positive debt uses an unsupported IRM.
   * @throws {VaultAddressMismatchError} when `vaultData` belongs to another vault.
   * @throws {NonPositiveInputError} when `amount` or `deadline` is not positive.
   * @throws {InKindRedeemZeroDeallocationError} when the vault has no idle assets and the
   *   penalty-adjusted amount rounds to zero deallocated assets.
   * @throws {EmptyMarketParamsListError} when assets must be deallocated and the market list is empty.
   * @throws {InputExceedsMaxError} when `deadline` exceeds `uint256`.
   * @throws {ExpiredDeadlineError} when `deadline` is not in the future at handle creation or
   *   requirement resolution.
   * @throws {VaultV2SingleAdapterRequiredError} when the vault does not have one adapter.
   * @throws {AdapterNotPartOfVaultError} when `adapter` is not the vault's adapter.
   * @throws {VaultV2UnsupportedExitAdapterError} when the adapter is not a MorphoMarketV1AdapterV2.
   * @throws {InKindRedeemCoverageError} when the deduplicated list cannot cover the exit.
   * @throws {UnsupportedChainIdError} when no address registry exists for the target chain.
   * @throws {UnknownAddressError} when VaultExitBundlesV1 is not registered on the target chain.
   * @throws {viem.BaseError} from `getRequirements()` when the `eth_chainId` request or an
   *   RPC contract read fails.
   * @throws {MissingContractCodeError} from `getRequirements()` when a fixed bundles or protocol contract has no code at its registered address.
   * @throws {InsufficientBlueBalanceForInKindRedeemError} from `getRequirements()` when Blue cannot fund the largest callback.
   * @throws {AmbiguousRequirementSignaturesError} from `buildTx()` when more than one permit signature is supplied.
   * @throws {UnexpectedRequirementSignatureError} from `buildTx()` when a non-permit signature is supplied.
   * @throws {BundlesPermitMismatchError} from `buildTx()` when the supplied permit is not ERC-2612, has
   *   the wrong asset, owner, or signature encoding, names another spender or deadline, or
   *   signs an amount below the required share allowance.
   * @example
   * ```ts
   * import { isRequirementSignature } from "@morpho-org/morpho-sdk";
   *
   * const vault = client.morpho.vaultV2(vaultAddress, 1);
   * const vaultData = await vault.getData();
   * const exit = vault.inKindRedeem({
   *   amount: 1_000_000n,
   *   marketParamsList,
   *   vaultData,
   *   userAddress,
   * });
   * const signatures = [];
   * for (const requirement of await exit.getRequirements()) {
   *   if (isRequirementSignature(requirement)) {
   *     signatures.push(await requirement.sign(walletClient, userAddress));
   *   } else {
   *     const hash = await walletClient.sendTransaction(requirement);
   *     await client.waitForTransactionReceipt({ hash });
   *   }
   * }
   * const tx = exit.buildTx(signatures);
   * // tx satisfies Readonly<Transaction<VaultV2InKindRedeemAction>>
   * ```
   */
  readonly inKindRedeem: (
    params: {
      readonly amount: bigint;
      readonly marketParamsList: readonly MarketParams[];
      readonly vaultData: AccrualVaultV2;
      readonly userAddress: Address;
      readonly adapter?: Address;
      readonly deadline?: bigint;
    } & ReferenceTimestampParams,
  ) => ActionOutput<
    VaultV2InKindRedeemAction,
    readonly RequirementSignature[],
    undefined
  >;
  /**
   * Prepares a Vault V2 force withdrawal through VaultExitBundlesV1.
   *
   * The contract withdraws everything the vault can pay without a penalty — its idle assets plus
   * the liquidity available through its liquidity adapter — then force-deallocates the remainder by
   * looping over the adapter's markets. It computes the deallocations itself: the caller supplies
   * neither a market list nor an order.
   *
   * `exitAssets` is **penalty-inclusive**, matching `inKindRedeem`. The contract debits it from the
   * user's position but pays out only
   * `assetsToWithdraw + floor((exitAssets - assetsToWithdraw) * WAD / (WAD + penalty))`, minus the
   * referral fee. Quote the split with `previewVaultV2ForceWithdraw`.
   *
   * The vault must have exactly one `MorphoMarketV1AdapterV2` and route liquidity through that same
   * adapter or none at all. Call `getRequirements()` before `buildTx()` so the vault-share allowance
   * and permit nonce are read on-chain.
   *
   * The SDK derives a conservative lower bound on the realized exit share price from the snapshot
   * and `slippageTolerance`: the floor is priced off whichever of the raw snapshot or its accrual
   * to `now` burns more shares, so neither pending fee mints nor interest the chain has not yet
   * accrued can lift it above the realized price. A supplied `minSharePriceE27` replaces the
   * tolerance-derived bound (it may be tighter or looser) but must be at least the floor derived
   * at `MAX_SLIPPAGE_TOLERANCE`, so an override can never disable meaningful protection.
   * The bound rejects a share price drop, a penalty increase, and liquidity shifting from the
   * penalty-free leg to the penalised leg. It does **not** cover the referral fee, which the
   * contract deducts afterwards.
   *
   * Vault gates are enforced by the final transaction and are not preflighted: the receive-assets
   * gate must allow VaultExitBundlesV1 and may depend on its transient initiator, while a
   * send-shares gate is arbitrary code re-evaluated after each penalty burn. The SDK also does not
   * validate the user's share balance. Per-market penalties and each vault withdrawal round the
   * share burn up independently, so the exit can burn marginally more shares than `exitAssets` alone
   * implies; size `exitAssets` a small buffer below `vault.previewRedeem(sharesHeld)` so a
   * full-balance exit does not revert for insufficient shares. Any approval or permit this handle
   * returns is unlimited. The computed share amount is only the smallest existing allowance the
   * SDK accepts without a new requirement: it covers a burn at least one `slippageTolerance` step
   * below the price floor whenever the floor exceeds one RAY unit and, in any case, at least one
   * share above the burn at the floor. A reused allowance just above that minimum can still
   * surface a deeper price drop as an ERC-20 allowance underflow rather than the contract's
   * `minSharePriceE27` check.
   *
   * Idle balance, penalty, adapter positions, and market liquidity can drift after the snapshot, so
   * an on-chain revert remains possible if vault state changes between preparation and inclusion.
   * A fee-recipient `userAddress` gets a floor from the larger of the raw snapshot burn and the
   * `now` burn net of its own fee mints, and a guard against fee mints reaching the lower burn
   * bound by the deadline. Its allowance includes the projected fee shares through that same
   * deadline. Deadlines beyond one year after handle creation are rejected, so the guard and
   * allowance cover the whole accepted window.
   *
   * @param params - Force withdrawal parameters.
   * @param params.exitAssets - Penalty-inclusive, asset-denominated amount to exit.
   * @param params.vaultData - Pre-fetched Vault V2 accrual snapshot.
   * @param params.userAddress - Account that signs and submits the exit, and receives the assets.
   * @param params.adapter - Optional adapter override; defaults to the vault's sole adapter.
   * @param params.deadline - Optional shared permit/bundle deadline; defaults to two hours from now.
   *   Deadlines more than one year after handle creation are rejected.
   * @param params.slippageTolerance - Optional WAD-scaled tolerance applied to the derived share
   *   price bound. Defaults to `DEFAULT_SLIPPAGE_TOLERANCE`, capped at `MAX_SLIPPAGE_TOLERANCE`.
   * @param params.minSharePriceE27 - Optional RAY-scaled override of the derived bound. It replaces
   *   the tolerance-derived bound and may be tighter or looser, but must be at least the floor
   *   derived at `MAX_SLIPPAGE_TOLERANCE`. When that floor rounds down to zero (dust exits) it is
   *   clamped to `1`, so any positive override is accepted.
   * @param params.referralFeePct - Optional WAD-scaled share of the withdrawn assets routed to
   *   `referralFeeRecipient`, at most 10%. Defaults to `0n`.
   * @param params.referralFeeRecipient - Optional referral fee recipient, required when
   *   `referralFeePct` is positive.
   * @returns Lazy prerequisite resolution and a synchronous transaction builder.
   * @throws {ChainIdMismatchError} when the client and entity target different chains, or from
   *   `getRequirements()` when the RPC reports another chain via `eth_chainId`.
   * @throws {VaultAddressMismatchError} when `vaultData` belongs to another vault.
   * @throws {NonPositiveInputError} when `exitAssets`, `deadline`, or a supplied
   *   `minSharePriceE27` is not positive.
   * @throws {NegativeInputError} when `slippageTolerance` or `referralFeePct` is negative.
   * @throws {InputExceedsMaxError} when `exitAssets`, `deadline`, or the effective
   *   `minSharePriceE27` (supplied or derived) exceeds `uint256`, or when `deadline` is more than one year after handle creation.
   * @throws {ReferralFeePctExceededError} when the referral fee is at least WAD.
   * @throws {MidnightReferralFeePctExceededError} when the referral fee is above 10% but below WAD.
   * @throws {ExpiredDeadlineError} when `deadline` is not in the future at handle creation or
   *   requirement resolution.
   * @throws {ExcessiveSlippageToleranceError} when `slippageTolerance` exceeds the SDK maximum.
   * @throws {VaultV2SingleAdapterRequiredError} when the vault does not have exactly one adapter.
   * @throws {AdapterNotPartOfVaultError} when `adapter` is not the vault's adapter.
   * @throws {VaultV2UnsupportedExitAdapterError} when the adapter is not a MorphoMarketV1AdapterV2.
   * @throws {VaultV2UnsupportedLiquidityAdapterError} when the vault routes liquidity through
   *   another adapter.
   * @throws {VaultV2UndecodableLiquidityDataError} when the vault's `liquidityData` does not decode
   *   as `MarketParams`.
   * @throws {VaultV2ForceWithdrawZeroWithdrawalError} when the exit would withdraw nothing.
   * @throws {VaultV2ForceWithdrawCoverageError} when the adapter's markets cannot cover the exit,
   *   which would overrun the contract's unbounded loop.
   * @throws {VaultV2ForceWithdrawZeroSharePriceError} when the derived share-price floor rounds down
   *   to zero, which the contract would read as no bound at all.
   * @throws {VaultV2ForceWithdrawSharePriceBelowFloorError} when a supplied `minSharePriceE27`
   *   is below the floor derived at `MAX_SLIPPAGE_TOLERANCE`.
   * @throws {VaultV2ForceWithdrawFeeSharesExceedBurnError} when fee shares are minted to a
   *   fee-recipient `userAddress` and reach the lower-bound share burn at the deadline.
   * @throws {ReferralFeeRecipientMissingError} when a positive `referralFeePct` has no recipient.
   * @throws {UnsupportedChainIdError} when no address registry exists for the target chain.
   * @throws {UnknownAddressError} when VaultExitBundlesV1 is not registered on the target chain.
   * @throws {viem.BaseError} from `getRequirements()` when the `eth_chainId` request or an
   *   RPC contract read fails.
   * @throws {MissingContractCodeError} from `getRequirements()` when a fixed bundles or protocol contract has no code at its registered address.
   * @throws {AmbiguousRequirementSignaturesError} from `buildTx()` when more than one permit signature is supplied.
   * @throws {UnexpectedRequirementSignatureError} from `buildTx()` when a non-permit signature is supplied.
   * @throws {BundlesPermitMismatchError} from `buildTx()` when the permit's spender or deadline
   *   differs from this operation, or its amount is below the required share allowance. Any handle built from the same inputs accepts the
   *   permit; a permit whose nonce was consumed is skipped onchain and the live allowance applies.
   * @throws {BundlesPermitMismatchError} from `buildTx()` when the requirement has the wrong permit kind, asset, or signature encoding.
   * @example
   * ```ts
   * import { isRequirementSignature } from "@morpho-org/morpho-sdk";
   *
   * const vault = client.morpho.vaultV2(vaultAddress, 1);
   * const vaultData = await vault.getData();
   * const exit = vault.forceWithdraw({
   *   exitAssets: 1_000_000n,
   *   vaultData,
   *   userAddress,
   * });
   * const signatures = [];
   * for (const requirement of await exit.getRequirements()) {
   *   if (isRequirementSignature(requirement)) {
   *     signatures.push(await requirement.sign(walletClient, userAddress));
   *   } else {
   *     const hash = await walletClient.sendTransaction(requirement);
   *     await client.waitForTransactionReceipt({ hash });
   *   }
   * }
   * const tx = exit.buildTx(signatures);
   * // tx satisfies Readonly<Transaction<VaultV2ForceWithdrawAction>>
   * ```
   */
  readonly forceWithdraw: (
    params: {
      readonly exitAssets: bigint;
      readonly vaultData: AccrualVaultV2;
      readonly userAddress: Address;
      readonly adapter?: Address;
      readonly deadline?: bigint;
      readonly slippageTolerance?: bigint;
      readonly minSharePriceE27?: bigint;
      readonly referralFeePct?: bigint;
      readonly referralFeeRecipient?: Address;
    } & ReferenceTimestampParams,
  ) => ActionOutput<
    VaultV2ForceWithdrawAction,
    readonly RequirementSignature[],
    undefined
  >;
  /**
   * Prepares a force redeem transaction for the VaultV2 contract using the vault's native multicall.
   *
   * This function encodes one or more on-chain forceDeallocate calls followed by a single redeem,
   * executed atomically via VaultV2's multicall. This allows a user to free liquidity from multiple
   * illiquid markets and redeem all their shares in one transaction.
   *
   * This is the share-based counterpart to forceWithdraw, useful for maximum withdrawal scenarios
   * where specifying an exact asset amount is impractical.
   *
   * Inputs are copied when the handle is created, so later changes to them are not encoded.
   *
   * The total assets passed to forceDeallocate calls must be greater than or equal to the
   * asset-equivalent of the redeemed shares. The caller should apply a buffer on the deallocated
   * amounts to account for share-price drift between submission and execution.
   *
   * @param params.deallocations - Typed list of `forceDeallocate` calls to perform before the redeem.
   * @param params.redeem.shares - Amount of vault shares to redeem after the deallocations.
   * @param params.userAddress - Account that pays the deallocation penalties and receives the redeemed assets.
   * @returns An object whose `buildTx()` returns a deep-frozen `Transaction<VaultV2ForceRedeemAction>`
   *   encoding the vault `multicall`.
   * @throws {ChainIdMismatchError} when the connected client declares another chain or none.
   * @throws {EmptyDeallocationsError} when creating the handle if `deallocations` is empty.
   * @throws {NonPositiveInputError} when creating the handle if `redeem.shares <= 0n` or any deallocation
   *   amount is non-positive.
   * @example
   * ```ts
   * const vault = client.morpho.vaultV2(vaultAddress, 1);
   * const tx = vault
   *   .forceRedeem({
   *     deallocations: [{ adapter, marketParams, amount: 1_000_000n }],
   *     redeem: { shares: 500_000n },
   *     userAddress,
   *   })
   *   .buildTx();
   * // tx satisfies Readonly<Transaction<VaultV2ForceRedeemAction>>
   * ```
   */
  forceRedeem: (
    params: {
      deallocations: readonly Deallocation[];
      redeem: { shares: bigint };
      userAddress: Address;
    } & ReferenceTimestampParams,
  ) => {
    buildTx: () => Readonly<Transaction<VaultV2ForceRedeemAction>>;
  };
}

/** Binds a viem client to a Vault V2 vault's action builders. */
export class MorphoVaultV2 implements VaultV2Actions {
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  constructor(
    private readonly client: MorphoClientType,
    private readonly vault: Address,
    private readonly chainId: number,
  ) {}

  async getData(parameters?: FetchParameters) {
    return this.getDataWithChainCheck(
      createChainCheck(this.client.viemClient, this.chainId),
      parameters,
    );
  }

  private async getDataWithChainCheck(
    chainCheck: ChainCheck,
    parameters?: FetchParameters,
  ) {
    await chainCheck();

    return fetchAccrualVaultV2(this.vault, this.client.viemClient, {
      ...parameters,
      deployless: this.client.options.supportDeployless,
    });
  }

  /**
   * Asserts that every registry contract this flow's transaction targets or names as
   * spender/authorized operator holds code, with one `eth_getCode` per distinct address
   * before any other requirement read. The `inKindRedeem` and `forceWithdraw` paths validate the
   * client chain before this code check.
   *
   * @param roles - Registry labels to resolve and check.
   */
  private async assertWriteTargets(
    roles: readonly [
      "bundles.vaultBundlesV1" | "bundles.vaultExitBundlesV1" | "blue",
      ...("bundles.vaultBundlesV1" | "bundles.vaultExitBundlesV1" | "blue")[],
    ],
    chainCheck?: ChainCheck,
  ): Promise<void> {
    const targets: { role: AddressLabel; address: Address }[] = [];
    for (const role of roles) {
      const address = getChainAddress(this.chainId, role);
      targets.push({ role, address });
    }
    await assertRegistryTargetsHaveCode(
      this.client.viemClient,
      this.chainId,
      targets,
      chainCheck,
    );
  }

  /** {@inheritDoc VaultV2Actions.deposit} */
  deposit(params: Parameters<VaultV2Actions["deposit"]>[0]) {
    return this.buildDeposit(this.parseDeposit(params));
  }

  private parseDeposit(params: Parameters<VaultV2Actions["deposit"]>[0]) {
    const suppliedNow = params.now;
    const metadata = resolveTransactionMetadata(
      this.client.options.metadata,
      suppliedNow,
    );

    const { userAddress, vaultData } = params;
    const { asset: vaultAsset } = vaultData;
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    if (!isAddressEqual(vaultData.address, this.vault)) {
      throw new VaultAddressMismatchError(this.vault, vaultData.address);
    }
    const createdAt = suppliedNow ?? Time.timestamp();
    // Reject a non-bigint clock before deriving the default deadline.
    validateReferenceTime(createdAt);
    const deadline = params.deadline ?? createdAt + Time.s.from.h(2n);
    if (deadline <= createdAt) {
      throw new ExpiredDeadlineError(deadline, createdAt);
    }
    const common = parseBundlesCommon({
      deadline,
      referralFeePct: params.referralFeePct,
      referralFeeRecipient: params.referralFeeRecipient,
    });
    const funding = resolveBundlesFunding(params);
    // Reject invalid funding before preparing a lazy handle.
    parseUint256(
      funding.value > 0n ? "nativeAmount" : "amount",
      funding.assets,
    );
    if (funding.value > 0n) {
      validateNativeVaultAsset(this.chainId, vaultAsset);
    }
    const referralFeeAssets = getBundlesReferralFeeAssets(
      funding.assets,
      common.referralFeePct,
    );
    // Bound forward accrual before deriving the deposit price protection.
    validateVaultDepositDeadline(deadline, { now: createdAt });
    const maxSharePrice = computeVaultMaxSharePrice({
      vaultData,
      deadline,
      assets: funding.assets - referralFeeAssets,
      slippageTolerance: params.slippageTolerance ?? DEFAULT_SLIPPAGE_TOLERANCE,
    });
    const spender = getChainAddress(this.chainId, "bundles.vaultBundlesV1");
    if (maxSharePrice <= 0n) {
      throw new NonPositiveInputError("maxSharePrice", maxSharePrice);
    }
    // Computed bounds also have to fit uint256.
    parseUint256("maxSharePrice", maxSharePrice);
    const parsed = {
      vault: { chainId: this.chainId, address: this.vault, asset: vaultAsset },
      userAddress,
      funding,
      maxSharePrice,
      common,
      metadata,
    } as VaultV2DepositInput;
    return {
      suppliedNow,
      parsed,
      spender,
      vaultAsset,
      userAddress,
      funding,
      deadline,
    };
  }

  private buildDeposit(input: ReturnType<MorphoVaultV2["parseDeposit"]>) {
    const { parsed, spender, vaultAsset, userAddress, funding, deadline } =
      input;
    let pendingRequirements: Promise<readonly ActionRequirement[]> | undefined;
    return Object.freeze({
      getRequirements: async (
        requirementOptions?: BundlesTokenRequirementsOptions,
      ) => {
        const now = input.suppliedNow ?? Time.timestamp();
        if (deadline <= now) {
          throw new ExpiredDeadlineError(deadline, now);
        }
        const chainCheck = createChainCheck(
          this.client.viemClient,
          this.chainId,
        );
        if (funding.value > 0n) {
          // Native funding skips the token resolver's chain validation.
          await validateNativeRequirements(this.client.viemClient, {
            chainId: this.chainId,
            chainCheck,
            assertWriteTargets: () =>
              this.assertWriteTargets(["bundles.vaultBundlesV1"], chainCheck),
          });
          return [];
        }
        await this.assertWriteTargets(["bundles.vaultBundlesV1"], chainCheck);
        const tokenInput = parseGetBundlesTokenRequirements(
          this.client.viemClient,
          {
            token: vaultAsset,
            spender,
            amount: funding.assets,
            owner: userAddress,
            chainId: this.chainId,
            deadline,
            supportSignature: this.client.options.supportSignature,
            supportDeployless: this.client.options.supportDeployless,
            useSimplePermit: requirementOptions?.useSimplePermit,
            now,
          },
        );
        // Check each non-no-op invocation before sharing an in-flight state read.
        if (tokenInput.amount > 0n) {
          await chainCheck();
        }
        if (pendingRequirements != null) {
          return await pendingRequirements;
        }
        const pending = getParsedBundlesTokenRequirements(
          { viemClient: this.client.viemClient, chainCheck },
          tokenInput,
        );
        pendingRequirements = pending;
        try {
          return await pending;
        } finally {
          // Later calls must re-read live allowances/nonces and honor their own options.
          if (pendingRequirements === pending) {
            pendingRequirements = undefined;
          }
        }
      },
      buildTx: (signatures?: readonly RequirementSignature[]) => {
        // The pure deposit action rejects a token signature supplied alongside native funding.
        const requirementSignature = selectBundlesTokenRequirementSignature(
          signatures,
          { spender, amount: funding.assets, deadline },
        );
        return buildVaultV2Deposit(parsed, { requirementSignature });
      },
    });
  }

  withdraw(params: Parameters<VaultV2Actions["withdraw"]>[0]) {
    return this.buildWithdraw(this.parseWithdraw(params));
  }

  private parseWithdraw(params: Parameters<VaultV2Actions["withdraw"]>[0]) {
    const suppliedNow = params.now;
    const metadata = resolveTransactionMetadata(
      this.client.options.metadata,
      suppliedNow,
    );

    const { amount, userAddress, vaultData } = params;
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    if (!isAddressEqual(vaultData.address, this.vault)) {
      throw new VaultAddressMismatchError(this.vault, vaultData.address);
    }
    if (amount <= 0n) {
      throw new NonPositiveInputError("amount", amount);
    }
    // Reject values outside the ABI range before resolving any requirements.
    const parsedAmount = parseUint256("amount", amount);
    const createdAt = suppliedNow ?? Time.timestamp();
    const deadline = params.deadline ?? createdAt + Time.s.from.h(2n);
    if (deadline <= createdAt) {
      throw new ExpiredDeadlineError(deadline, createdAt);
    }
    const common = parseBundlesCommon({
      deadline,
      referralFeePct: params.referralFeePct,
      referralFeeRecipient: params.referralFeeRecipient,
    });
    const slippageTolerance =
      params.slippageTolerance ?? DEFAULT_SLIPPAGE_TOLERANCE;
    validateSlippageTolerance(slippageTolerance);
    // Resolve the spender eagerly so an unregistered VaultBundlesV1 fails at handle creation.
    const spender = getChainAddress(this.chainId, "bundles.vaultBundlesV1");
    const requiredShareAllowance = computeVaultMaxShareAllowance({
      vaultData,
      deadline,
      assets: amount,
      slippageTolerance,
    });
    const parsed = {
      vault: { chainId: this.chainId, address: this.vault },
      args: { amount: parsedAmount, userAddress, ...common },
      common,
      metadata,
    } as VaultV2WithdrawInput;
    return {
      suppliedNow,
      parsed,
      spender,
      vaultData,
      userAddress,
      requiredShareAllowance,
      deadline,
    };
  }

  private buildWithdraw(input: ReturnType<MorphoVaultV2["parseWithdraw"]>) {
    const {
      parsed,
      spender,
      vaultData,
      userAddress,
      requiredShareAllowance,
      deadline,
    } = input;
    return Object.freeze({
      getRequirements: async () => {
        const now = input.suppliedNow ?? Time.timestamp();
        if (deadline <= now) {
          throw new ExpiredDeadlineError(deadline, now);
        }
        const chainCheck = createChainCheck(
          this.client.viemClient,
          this.chainId,
        );
        await this.assertWriteTargets(["bundles.vaultBundlesV1"], chainCheck);
        // Re-read the live share allowance on every call instead of caching the resolved requirements.
        return getParsedVaultBundlesSharesRequirements(
          { viemClient: this.client.viemClient, chainCheck },
          parseVaultBundlesSharesRequirements(this.client.viemClient, {
            vaultData,
            version: "vaultV2",
            owner: userAddress,
            chainId: this.chainId,
            requiredShareAllowance,
            deadline,
            supportSignature: this.client.options.supportSignature,
            now,
          }),
        );
      },
      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const permit = selectBundlesSharesPermitSignature(signatures, {
          spender,
          amount: requiredShareAllowance,
          deadline,
        });
        return buildVaultV2Withdraw(parsed, { requirementSignature: permit });
      },
    });
  }

  /** {@inheritDoc VaultV2Actions.redeem} */
  redeem(params: Parameters<VaultV2Actions["redeem"]>[0]) {
    return this.buildRedeem(this.parseRedeem(params));
  }

  private parseRedeem(params: Parameters<VaultV2Actions["redeem"]>[0]) {
    const suppliedNow = params.now;
    const metadata = resolveTransactionMetadata(
      this.client.options.metadata,
      suppliedNow,
    );

    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    const { shares, userAddress } = params;
    if (shares <= 0n) {
      throw new NonPositiveInputError("shares", shares);
    }
    const createdAt = suppliedNow ?? Time.timestamp();
    const deadline = params.deadline ?? createdAt + Time.s.from.h(2n);
    if (deadline <= createdAt) {
      throw new ExpiredDeadlineError(deadline, createdAt);
    }
    const common = parseBundlesCommon({
      deadline,
      referralFeePct: params.referralFeePct,
      referralFeeRecipient: params.referralFeeRecipient,
    });
    const spender = getChainAddress(this.chainId, "bundles.vaultBundlesV1");
    const parsed = {
      vault: { chainId: this.chainId, address: this.vault },
      args: { shares: parseUint256("shares", shares), userAddress, ...common },
      common,
      metadata,
    } as VaultV2RedeemInput;
    return { suppliedNow, parsed, spender, shares, userAddress, deadline };
  }

  private buildRedeem(input: ReturnType<MorphoVaultV2["parseRedeem"]>) {
    const { parsed, spender, shares, userAddress, deadline } = input;
    return Object.freeze({
      getRequirements: async () => {
        const now = input.suppliedNow ?? Time.timestamp();
        if (deadline <= now) {
          throw new ExpiredDeadlineError(deadline, now);
        }
        const chainCheck = createChainCheck(
          this.client.viemClient,
          this.chainId,
        );
        await this.assertWriteTargets(["bundles.vaultBundlesV1"], chainCheck);
        return getParsedVaultBundlesSharesRequirements(
          { viemClient: this.client.viemClient, chainCheck },
          parseVaultBundlesSharesRequirements(this.client.viemClient, {
            vaultData: await this.getDataWithChainCheck(chainCheck),
            version: "vaultV2",
            owner: userAddress,
            chainId: this.chainId,
            requiredShareAllowance: shares,
            deadline,
            supportSignature: this.client.options.supportSignature,
            now,
          }),
        );
      },
      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const permit = selectBundlesSharesPermitSignature(signatures, {
          spender,
          amount: shares,
          deadline,
        });
        return buildVaultV2Redeem(parsed, { requirementSignature: permit });
      },
    });
  }

  /** {@inheritDoc VaultV2Actions.inKindRedeem} */
  inKindRedeem(
    params: Parameters<VaultV2Actions["inKindRedeem"]>[0],
  ): ActionOutput<
    VaultV2InKindRedeemAction,
    readonly RequirementSignature[],
    undefined
  > {
    return this.buildInKindRedeem(this.parseInKindRedeem(params));
  }

  private parseInKindRedeem({
    now: suppliedNow,
    amount,
    marketParamsList,
    vaultData,
    userAddress,
    adapter: adapterOverride,
    deadline: deadlineOverride,
  }: Parameters<VaultV2Actions["inKindRedeem"]>[0]) {
    const metadata = resolveTransactionMetadata(
      this.client.options.metadata,
      suppliedNow,
    );

    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    if (!isAddressEqual(vaultData.address, this.vault)) {
      throw new VaultAddressMismatchError(this.vault, vaultData.address);
    }
    const {
      deadline,
      adapter,
      marketParamsListSnapshot,
      requiredShareAllowance,
      peak,
    } = computeVaultV2InKindRedeemQuote({
      amount,
      marketParamsList,
      vaultData,
      adapter: adapterOverride,
      deadline: deadlineOverride,
      now: suppliedNow ?? Time.timestamp(),
      vault: this.vault,
    });

    const vaultExitBundlesV1 = getChainAddress(
      this.chainId,
      "bundles.vaultExitBundlesV1",
    );
    const parsed = {
      vault: { chainId: this.chainId, address: this.vault },
      args: {
        adapter,
        amount,
        marketParamsList: marketParamsListSnapshot,
        userAddress,
        deadline,
      },
      metadata,
    } as VaultV2InKindRedeemInput;
    return {
      suppliedNow,
      parsed,
      deadline,
      userAddress,
      vaultData,
      vaultExitBundlesV1,
      peak,
      requiredShareAllowance,
    };
  }

  private buildInKindRedeem(
    input: ReturnType<MorphoVaultV2["parseInKindRedeem"]>,
  ) {
    const {
      parsed,
      deadline,
      userAddress,
      vaultData,
      vaultExitBundlesV1,
      peak,
      requiredShareAllowance,
    } = input;
    return {
      getRequirements: () =>
        getVaultV2InKindRedeemRequirements(this.client.viemClient, {
          vaultData,
          vault: this.vault,
          userAddress,
          chainId: this.chainId,
          deadline,
          requiredShareAllowance,
          supportSignature: this.client.options.supportSignature,
          peak,
          now: input.suppliedNow,
        }),
      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const permit = selectBundlesSharesPermitSignature(signatures, {
          spender: vaultExitBundlesV1,
          amount: requiredShareAllowance,
          deadline,
        });
        return buildVaultV2InKindRedeem(parsed, {
          requirementSignature: permit,
        });
      },
    };
  }

  /** {@inheritDoc VaultV2Actions.forceWithdraw} */
  forceWithdraw(
    params: Parameters<VaultV2Actions["forceWithdraw"]>[0],
  ): ActionOutput<
    VaultV2ForceWithdrawAction,
    readonly RequirementSignature[],
    undefined
  > {
    return this.buildForceWithdraw(this.parseForceWithdraw(params));
  }

  private parseForceWithdraw({
    now: suppliedNow,
    exitAssets,
    vaultData,
    userAddress,
    adapter: adapterOverride,
    deadline: deadlineOverride,
    slippageTolerance = DEFAULT_SLIPPAGE_TOLERANCE,
    minSharePriceE27: minSharePriceE27Override,
    referralFeePct = 0n,
    referralFeeRecipient,
  }: Parameters<VaultV2Actions["forceWithdraw"]>[0]) {
    const metadata = resolveTransactionMetadata(
      this.client.options.metadata,
      suppliedNow,
    );

    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    if (!isAddressEqual(vaultData.address, this.vault)) {
      throw new VaultAddressMismatchError(this.vault, vaultData.address);
    }
    const {
      deadline,
      adapter,
      minSharePriceE27,
      requiredShareAllowance,
      referral,
    } = computeVaultV2ForceWithdrawQuote({
      exitAssets,
      vaultData,
      userAddress,
      adapter: adapterOverride,
      deadline: deadlineOverride,
      slippageTolerance,
      minSharePriceE27: minSharePriceE27Override,
      referralFeePct,
      referralFeeRecipient,
      now: suppliedNow ?? Time.timestamp(),
      vault: this.vault,
    });

    const vaultExitBundlesV1 = getChainAddress(
      this.chainId,
      "bundles.vaultExitBundlesV1",
    );

    const parsed = {
      vault: { chainId: this.chainId, address: this.vault },
      args: {
        adapter,
        exitAssets,
        minSharePriceE27,
        userAddress,
        deadline,
      },
      referral,
      metadata,
    } as VaultV2ForceWithdrawInput;
    return {
      suppliedNow,
      parsed,
      deadline,
      userAddress,
      vaultData,
      vaultExitBundlesV1,
      requiredShareAllowance,
    };
  }

  private buildForceWithdraw(
    input: ReturnType<MorphoVaultV2["parseForceWithdraw"]>,
  ) {
    const {
      parsed,
      deadline,
      userAddress,
      vaultData,
      vaultExitBundlesV1,
      requiredShareAllowance,
    } = input;
    return {
      getRequirements: () =>
        getVaultV2ForceWithdrawRequirements(this.client.viemClient, {
          vaultData,
          vault: this.vault,
          userAddress,
          chainId: this.chainId,
          deadline,
          requiredShareAllowance,
          supportSignature: this.client.options.supportSignature,
          now: input.suppliedNow,
        }),
      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const permit = selectBundlesSharesPermitSignature(signatures, {
          spender: vaultExitBundlesV1,
          amount: requiredShareAllowance,
          deadline,
        });
        return buildVaultV2ForceWithdraw(parsed, {
          requirementSignature: permit,
        });
      },
    };
  }

  forceRedeem(params: Parameters<VaultV2Actions["forceRedeem"]>[0]) {
    return this.buildForceRedeem(this.parseForceRedeem(params));
  }

  private parseForceRedeem({
    now: suppliedNow,
    deallocations,
    redeem,
    userAddress,
  }: Parameters<VaultV2Actions["forceRedeem"]>[0]) {
    const metadata = resolveTransactionMetadata(
      this.client.options.metadata,
      suppliedNow,
    );

    validateChainId(this.client.viemClient.chain?.id, this.chainId);

    const shares = redeem.shares;
    const deallocationsSnapshot: Deallocation[] = deallocations.map(
      ({ adapter, marketParams, amount }) => ({
        adapter,
        amount,
        ...(marketParams && { marketParams: new MarketParams(marketParams) }),
      }),
    );

    const parsed = parseVaultV2ForceRedeem({
      vault: { address: this.vault },
      args: {
        deallocations: deallocationsSnapshot,
        redeem: { shares, recipient: userAddress },
        onBehalf: userAddress,
      },
      metadata,
    });
    return parsed;
  }

  private buildForceRedeem(
    parsed: ReturnType<MorphoVaultV2["parseForceRedeem"]>,
  ) {
    return { buildTx: () => buildVaultV2ForceRedeem(parsed) };
  }
}
