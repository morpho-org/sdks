import {
  type AccrualVault,
  type AccrualVaultV2,
  DEFAULT_SLIPPAGE_TOLERANCE,
  Eip5267Domain,
  type MarketParams,
  Token,
} from "@morpho-org/blue-sdk";
import { fetchAccrualVault } from "@morpho-org/blue-sdk-viem";
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
  buildVaultV1Deposit,
  type VaultV1DepositInput,
} from "../../actions/vaultV1/deposit.js";
import {
  buildVaultV1InKindRedeem,
  type VaultV1InKindRedeemInput,
} from "../../actions/vaultV1/inKindRedeem.js";
import {
  buildVaultV1MigrateToV2,
  type VaultV1MigrateToV2Input,
} from "../../actions/vaultV1/migrateToV2.js";
import {
  buildVaultV1Redeem,
  type VaultV1RedeemInput,
} from "../../actions/vaultV1/redeem.js";
import {
  buildVaultV1Withdraw,
  type VaultV1WithdrawInput,
} from "../../actions/vaultV1/withdraw.js";
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
  AmountAndSharesExclusiveError,
  type BundlesFundingArgs,
  type BundlesTokenRequirementsOptions,
  ExpiredDeadlineError,
  type MorphoClientType,
  NonPositiveInputError,
  type ReferenceTimestampParams,
  type RequirementSignature,
  SameVaultMigrationError,
  VaultAddressMismatchError,
  VaultAssetMismatchError,
  type VaultV1DepositAction,
  type VaultV1InKindRedeemAction,
  type VaultV1MigrateToV2Action,
  type VaultV1MigrateToV2AmountArgs,
  type VaultV1RedeemAction,
  type VaultV1WithdrawAction,
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
import { getVaultV1InKindRedeemRequirements } from "../requirements/getVaultV1InKindRedeemRequirements.js";
import { validateNativeRequirements } from "../requirements/validateNativeRequirements.js";
import { computeVaultV1InKindRedeemQuote } from "./inKindRedeemQuote.js";
import { computeVaultV1MigrateToV2Quote } from "./migrateToV2Quote.js";

/** Action surface for Vault V1 reads and writes; writes route through VaultBundlesV1 and VaultExitBundlesV1. */
export interface VaultV1Actions {
  /**
   * Fetches direct onchain vault and allocation state without applying virtual interest.
   *
   * Reads the Vault V1 state through `fetchAccrualVault` on the entity's client.
   *
   * @param parameters - Optional viem fetch parameters (block number, block tag, state override).
   * @returns The hydrated `AccrualVault` snapshot.
   * @throws {ChainIdMismatchError} when the connected client declares another chain or none, or its RPC reports another chain via `eth_chainId`.
   * @throws {viem.BaseError} when the `eth_chainId` request or a state read fails.
   * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
   * @throws {UnknownBlueFactory} when the configured chain has no MetaMorpho factory.
   * @throws {UnknownBlueOfFactory} when the vault is not a MetaMorpho vault from the configured factory.
   * @throws {UnknownTokenError} when the vault's share token has unusable decimals.
   * @throws {MalformedTokenMetadataError} when the share token's `eip712Domain()` or
   *   `bytes32` `name`/`symbol` retry returns non-empty data that does not decode, or when the
   *   deployless query reports malformed `name()`/`symbol()`/`eip712Domain()` returndata (no fallback).
   */
  getData: (
    parameters?: FetchParameters,
  ) => Promise<Awaited<ReturnType<typeof fetchAccrualVault>>>;
  /**
   * Prepares a Vault V1 deposit through the registered VaultBundlesV1 contract.
   *
   * Uses the supplied vault snapshot to compute the deadline-accrued `maxSharePrice`.
   * `getRequirements()` reads the asset allowance and, when enabled, the selected ERC-2612
   * nonce state. Native funding is exclusive and skips token requirements. Shares are
   * always minted to the transaction sender, which must be `userAddress`.
   * Concurrent requirement reads share the first caller's options; later calls refresh on-chain
   * state using their own options.
   *
   * @param params.userAddress - Account that funds, signs, submits, and receives the vault shares.
   * @param params.vaultData - Pre-fetched Vault V1 snapshot used for asset and share conversion.
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
   * @throws {UnsupportedBlueMarketIrmError} when an allocated market with positive debt uses an unsupported IRM.
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
   * import { vaults } from "@morpho-org/morpho-test";
   * import { morphoViemExtension } from "@morpho-org/morpho-sdk";
   * import { createPublicClient, http, zeroAddress } from "viem";
   * import { mainnet } from "viem/chains";
   *
   * const client = createPublicClient({ chain: mainnet, transport: http() })
   *   .extend(morphoViemExtension());
   * const vault = client.morpho.vaultV1(vaults[mainnet.id].steakUsdc.address, mainnet.id);
   * const vaultData = await vault.getData();
   * const action = vault.deposit({
   *   amount: 1_000_000n,
   *   userAddress: zeroAddress,
   *   vaultData,
   * });
   * const requirements = await action.getRequirements(); // Satisfy these first.
   * const tx = action.buildTx(); // For a client configured with supportSignature: false.
   * // tx satisfies Readonly<Transaction<VaultV1DepositAction>>
   * ```
   */
  deposit: (
    params: {
      readonly userAddress: Address;
      readonly vaultData: AccrualVault;
      readonly slippageTolerance?: bigint;
      readonly referralFeePct?: bigint;
      readonly referralFeeRecipient?: Address;
      readonly deadline?: bigint;
    } & ReferenceTimestampParams &
      BundlesFundingArgs,
  ) => ActionOutput<
    VaultV1DepositAction,
    readonly RequirementSignature[],
    BundlesTokenRequirementsOptions
  >;
  /**
   * Prepares an exact-assets Vault V1 withdrawal through VaultBundlesV1.
   *
   * Derives the minimum required share allowance from the supplied `vaultData` snapshot at handle
   * creation, then reads the live vault-share allowance and, when a signature is needed, the permit
   * nonce on each `getRequirements()` call. Captures the requested amount and owner at creation, so
   * later changes to `params` do not change this handle's requirements or transaction.
   *
   * @param params.amount - Positive gross withdrawal in underlying asset base units, before fees.
   * @param params.userAddress - Share owner that must sign and submit; receives the net assets.
   * @param params.vaultData - Pre-fetched Vault V1 snapshot used to derive the minimum share allowance.
   * @param params.slippageTolerance - Optional WAD-scaled tolerance used only to size the minimum
   *   share allowance. It does not impose an on-chain share-burn bound.
   *   Defaults to 0.03% and cannot exceed 10%.
   * @param params.referralFeePct - Optional WAD-scaled fee from 0% to 10%, inclusive, defaulting to zero;
   *   rounded down and deducted from the gross withdrawn assets.
   * @param params.referralFeeRecipient - Optional nonzero recipient required for a positive fee.
   * @param params.deadline - Optional execution and share-permit deadline in Unix seconds;
   *   defaults to two hours from handle creation.
   * @returns A frozen handle with lazy `getRequirements()` and synchronous `buildTx(signatures?)`,
   *   which returns a deep-frozen `Transaction<VaultV1WithdrawAction>`. Requirements are empty
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
   * @throws {MissingPermitDomainNameError} from `getRequirements()` when signatures are enabled,
   *   the share allowance is insufficient, and the supplied `vaultData` share token exposes
   *   neither `name()` nor an EIP-5267 domain.
   * @throws {MissingContractCodeError} from `getRequirements()` when a fixed bundles or protocol
   *   contract has no code at its registered address.
   * @throws {viem.BaseError} from `getRequirements()` when an allowance, permit-nonce, or
   *   `eth_chainId` read fails, or transaction encoding fails.
   * @example
   * ```ts
   * import { morphoViemExtension } from "@morpho-org/morpho-sdk";
   * import { createPublicClient, http, type Address } from "viem";
   * import { mainnet } from "viem/chains";
   *
   * export async function prepareUsdcWithdrawal(userAddress: Address) {
   *   const vaultAddress = "0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB";
   *   const client = createPublicClient({ chain: mainnet, transport: http() })
   *     .extend(morphoViemExtension({ supportSignature: false }));
   *   const vault = client.morpho.vaultV1(vaultAddress, mainnet.id);
   *   const vaultData = await vault.getData();
   *   const action = vault.withdraw({ amount: 1_000_000n, userAddress, vaultData });
   *   const requirements = await action.getRequirements();
   *   // Send and confirm each approval before calling action.buildTx().
   *   // action.buildTx() returns Readonly<Transaction<VaultV1WithdrawAction>>.
   *   return { action, requirements }; // Prepared handle and its outstanding share approvals.
   * }
   * ```
   */
  withdraw: (
    params: {
      readonly amount: bigint;
      readonly userAddress: Address;
      readonly vaultData: AccrualVault;
      readonly slippageTolerance?: bigint;
      readonly referralFeePct?: bigint;
      readonly referralFeeRecipient?: Address;
      readonly deadline?: bigint;
    } & ReferenceTimestampParams,
  ) => ActionOutput<
    VaultV1WithdrawAction,
    readonly RequirementSignature[],
    undefined
  >;
  /**
   * Prepares an exact-shares Vault V1 redemption through VaultBundlesV1.
   *
   * Captures `shares` and `userAddress` at handle creation for both requirements and `buildTx()`.
   * The caller must satisfy the minimum share allowance returned by `getRequirements()` before
   * `buildTx()`; larger allowances also suffice, and each requirement resolution re-reads the live
   * allowance and checks the deadline.
   *
   * @param params.shares - Exact vault shares to burn.
   * @param params.userAddress - Account that signs and submits the transaction; VaultBundlesV1
   *   burns and pays `msg.sender`.
   * @param params.referralFeePct - Optional WAD-scaled referral fee at most 10%, deducted from the
   *   redeemed assets.
   * @param params.referralFeeRecipient - Optional non-zero recipient required for a positive fee.
   * @param params.deadline - Optional execution and share-permit deadline in Unix seconds; defaults
   *   to two hours from handle creation.
   * @returns Lazy share-allowance requirements and a synchronous transaction builder.
   * @throws {ChainIdMismatchError} when the connected client targets another chain, or from
   *   `getRequirements()` when the RPC reports another chain via `eth_chainId`.
   * @throws {NonPositiveInputError} when `shares` is not positive.
   * @throws {ExpiredDeadlineError} when the deadline is stale at creation or requirement resolution.
   * @throws {InputExceedsMaxError} when `shares` or `deadline` exceeds uint256.
   * @throws {NegativeInputError} when `referralFeePct` is negative.
   * @throws {ReferralFeePctExceededError} when `referralFeePct` is at least WAD.
   * @throws {MidnightReferralFeePctExceededError} when the referral fee is above 10% but below WAD.
   * @throws {ReferralFeeRecipientMissingError} when a positive fee has no non-zero recipient.
   * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
   * @throws {UnknownAddressError} when VaultBundlesV1 is not registered.
   * @throws {UnknownTokenError} from `getRequirements()` when the vault share token's `decimals()` is unusable.
   * @throws {MalformedTokenMetadataError} when the share token's `eip712Domain()` or
   *   `bytes32` `name`/`symbol` retry returns non-empty data that does not decode, or when the
   *   deployless query reports malformed `name()`/`symbol()`/`eip712Domain()` returndata (no fallback).
   * @throws {MissingPermitDomainNameError} from `getRequirements()` when signatures are enabled,
   *   the share allowance is insufficient, and the share token fetched by `getData()` exposes
   *   neither `name()` nor an EIP-5267 domain.
   * @throws {MissingContractCodeError} from `getRequirements()` when a fixed bundles or protocol
   *   contract has no code at its registered address.
   * @throws {viem.BaseError} from `getRequirements()` when an allowance, permit-nonce, or
   *   `eth_chainId` read fails.
   * @throws {AmbiguousRequirementSignaturesError} from `buildTx()` when multiple permit signatures are supplied.
   * @throws {UnexpectedRequirementSignatureError} from `buildTx()` when a non-permit signature is supplied.
   * @throws {BundlesPermitMismatchError} from `buildTx()` when the signature's spender or
   *   deadline differs from this operation's, or its amount is below the required share allowance.
   * @example
   * ```ts
   * import { vaults } from "@morpho-org/morpho-test";
   * import { isRequirementSignature, morphoViemExtension } from "@morpho-org/morpho-sdk";
   * import { createWalletClient, http, publicActions, zeroAddress } from "viem";
   * import { mainnet } from "viem/chains";
   *
   * const client = createWalletClient({
   *   account: zeroAddress,
   *   chain: mainnet,
   *   transport: http(),
   * })
   *   .extend(publicActions)
   *   .extend(morphoViemExtension({ supportSignature: true }));
   * const vault = client.morpho.vaultV1(
   *   vaults[mainnet.id].steakUsdc.address,
   *   mainnet.id,
   * );
   * const redemption = vault.redeem({ shares: 1_000_000n, userAddress: zeroAddress });
   * const signatures = [];
   * for (const requirement of await redemption.getRequirements()) {
   *   if (isRequirementSignature(requirement)) {
   *     signatures.push(await requirement.sign(client, zeroAddress));
   *   } else {
   *     const hash = await client.sendTransaction(requirement);
   *     await client.waitForTransactionReceipt({ hash });
   *   }
   * }
   * const tx = redemption.buildTx(signatures);
   * // tx satisfies Readonly<Transaction<VaultV1RedeemAction>>
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
    VaultV1RedeemAction,
    readonly RequirementSignature[],
    undefined
  >;
  /**
   * Prepares an illiquid Vault V1 exit into the vault's Morpho Blue supply positions.
   *
   * The caller controls market order and must call `getRequirements()` before `buildTx()` so the
   * RPC-backed Blue-balance and Morpho-deployment checks run. The SDK validates market coverage but
   * intentionally does not validate the user's share balance; size `amount` in asset terms against
   * `previewRedeem(sharesHeld)`. The share allowance uses the greater rounded-up share preview
   * before and after accruing pending performance-fee shares. MetaMorpho 1.0 adds the default
   * 0.03% loss buffer; MetaMorpho 1.1 retains its lost-assets clamp without that buffer.
   *
   * Snapshot state can drift before inclusion, so a later reallocation may still make the on-chain
   * loop under-cover even after pre-flight succeeds.
   *
   * In-kind exits have no on-chain share-price or max-shares bound. A share-price drop before
   * inclusion can burn more shares than quoted when the allowance is unlimited. The SDK requires
   * the computed minimum allowance, and an insufficient allowance is raised by an unlimited
   * approval or ERC-2612 permit.
   *
   * @param params - In-kind redemption parameters.
   * @param params.amount - Asset-denominated amount to exit.
   * @param params.marketParamsList - Ordered vault markets consumed greedily by the contract;
   *   repeated entries cannot draw from the same vault position twice.
   * @param params.vaultData - Pre-fetched Vault V1 accrual snapshot.
   * @param params.userAddress - Account that signs and submits the exit.
   * @param params.deadline - Optional shared permit/bundle deadline; defaults to two hours from now.
   * @returns Lazy prerequisite resolution and a synchronous transaction builder.
   * @throws {ChainIdMismatchError} when the client and entity target different chains, or from
   *   `getRequirements()` when the RPC reports another chain via `eth_chainId`.
   * @throws {UnsupportedBlueMarketIrmError} when an allocated market with positive debt uses an unsupported IRM.
   * @throws {VaultAddressMismatchError} when `vaultData` belongs to another vault.
   * @throws {NonPositiveInputError} when `amount` or `deadline` is not positive.
   * @throws {EmptyMarketParamsListError} when the market list is empty.
   * @throws {InputExceedsMaxError} when `deadline` exceeds `uint256`.
   * @throws {ExpiredDeadlineError} when `deadline` is not in the future at handle creation or
   *   requirement resolution.
   * @throws {InKindRedeemCoverageError} when the ordered list cannot cover `amount` without
   *   assigning more than the vault owns in a repeated market.
   * @throws {UnsupportedChainIdError} when no address registry exists for the target chain.
   * @throws {UnknownAddressError} when VaultExitBundlesV1 is not registered on the target chain.
   * @throws {MissingPermitDomainNameError} from `getRequirements()` when signatures are enabled,
   *   the share allowance is insufficient, and the supplied `vaultData` share token exposes
   *   neither `name()` nor an EIP-5267 domain.
   * @throws {viem.BaseError} from `getRequirements()` when the `eth_chainId` request or an
   *   RPC contract read fails.
   * @throws {MissingContractCodeError} from `getRequirements()` when a fixed bundles or protocol contract has no code at its registered address.
   * @throws {VaultMorphoMismatchError} from `getRequirements()` when the vault uses another Morpho deployment.
   * @throws {VaultIsBlueFeeRecipientError} from `getRequirements()` when Morpho Blue accrues protocol fees to the vault.
   * @throws {InsufficientBlueBalanceForInKindRedeemError} from `getRequirements()` when Blue cannot fund the flash loan.
   * @throws {AmbiguousRequirementSignaturesError} from `buildTx()` when more than one permit signature is supplied.
   * @throws {UnexpectedRequirementSignatureError} from `buildTx()` when a non-permit signature is supplied.
   * @throws {BundlesPermitMismatchError} from `buildTx()` when the supplied permit is not ERC-2612, has
   *   the wrong asset, owner, or signature encoding, names another spender or deadline, or
   *   signs an amount below the required share allowance.
   * @example
   * ```ts
   * import { isRequirementSignature } from "@morpho-org/morpho-sdk";
   *
   * const vault = client.morpho.vaultV1(vaultAddress, 1);
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
   * // tx satisfies Readonly<Transaction<VaultV1InKindRedeemAction>>
   * ```
   */
  readonly inKindRedeem: (
    params: {
      readonly amount: bigint;
      readonly marketParamsList: readonly MarketParams[];
      readonly vaultData: AccrualVault;
      readonly userAddress: Address;
      readonly deadline?: bigint;
    } & ReferenceTimestampParams,
  ) => ActionOutput<
    VaultV1InKindRedeemAction,
    readonly RequirementSignature[],
    undefined
  >;
  /**
   * Prepares a Vault V1-to-Vault V2 migration through VaultBundlesV1.
   *
   * Exits V1 by assets or shares and atomically deposits the resulting assets into V2 through
   * VaultBundlesV1. The asset-mode source exit has no on-chain share-price or max-shares bound, so
   * a share-price drop before inclusion can burn more shares than quoted when the allowance is
   * unlimited. The shares-mode source amount is fixed, and the destination deposit enforces
   * `maxSharePrice`.
   * Captures vault identities, permit-domain metadata, and the owner at handle creation.
   *
   * @param params.userAddress - Account that signs and submits the transaction; VaultBundlesV1
   *   burns and mints shares for `msg.sender`.
   * @param params.sourceVault - Pre-fetched Vault V1 snapshot used for source conversion and the
   *   minimum share allowance.
   * @param params.targetVault - Pre-fetched Vault V2 snapshot used for the destination share-price
   *   bound.
   * @param params.shares - Optional exact Vault V1 shares to migrate; exclusive with `assets`.
   * @param params.assets - Optional exact Vault V1 assets to withdraw and migrate; exclusive with
   *   `shares`.
   * @param params.slippageTolerance - Optional WAD-scaled tolerance used to size the minimum
   *   assets-mode source share allowance and the destination `maxSharePrice`; it does not impose
   *   an on-chain source share-burn bound. Defaults to 0.03% and cannot exceed 10%.
   * @param params.referralFeePct - Optional WAD-scaled referral fee at most 10%, deducted from the
   *   source-vault proceeds.
   * @param params.referralFeeRecipient - Optional non-zero recipient required for a positive fee.
   * @param params.deadline - Optional execution and share-permit deadline in Unix seconds; defaults
   *   to two hours from handle creation.
   * @returns Lazy source-share requirements and a synchronous transaction builder. Requirements
   *   are empty when the allowance meets or exceeds the required share amount. `getRequirements()` re-reads the live share allowance on every call, so a requirement
   *   satisfied between calls stops being reported, while the derived source share amount stays
   *   pinned to the supplied snapshot.
   * @throws {UnknownBlueMarketAllocationError} when a source withdraw-queue market has no allocation snapshot.
   * @throws {ChainIdMismatchError} when the connected client targets another chain, or from
   *   `getRequirements()` when the RPC reports another chain via `eth_chainId`.
   * @throws {UnsupportedBlueMarketIrmError} when an allocated source or target market with positive debt uses an unsupported IRM.
   * @throws {VaultAddressMismatchError} when `sourceVault` belongs to another vault.
   * @throws {VaultAssetMismatchError} when the source and destination vault assets differ.
   * @throws {SameVaultMigrationError} when the source and destination vault addresses are equal.
   * @throws {AmountAndSharesExclusiveError} when both amount modes or neither are supplied.
   * @throws {NonPositiveInputError} when the selected amount or a computed share value is not positive.
   * @throws {NegativeInputError} when slippage tolerance or `referralFeePct` is negative.
   * @throws {ExcessiveSlippageToleranceError} when slippage tolerance exceeds the SDK maximum.
   * @throws {InvalidBigIntInputError} when `now` is not a bigint.
   * @throws {ExpiredDeadlineError} when the deadline is stale at creation or requirement resolution.
   * @throws {InputExceedsMaxError} when the deadline exceeds seven days after creation or the selected amount, `maxSharePriceVaultV2`, or `deadline` exceeds uint256.
   * @throws {ReferralFeePctExceededError} when `referralFeePct` is at least WAD.
   * @throws {MidnightReferralFeePctExceededError} when the referral fee is above 10% but below WAD.
   * @throws {ReferralFeeRecipientMissingError} when a positive fee has no non-zero recipient.
   * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
   * @throws {UnknownAddressError} when VaultBundlesV1 is not registered.
   * @throws {MissingPermitDomainNameError} from `getRequirements()` when a Vault V1 share permit needs a domain name but the supplied vault data has neither one nor an EIP-5267 domain.
   * @throws {MissingContractCodeError} from `getRequirements()` when a fixed bundles or protocol
   *   contract has no code at its registered address.
   * @throws {viem.BaseError} from `getRequirements()` when an allowance, permit-nonce, or
   *   `eth_chainId` read fails.
   * @throws {AmbiguousRequirementSignaturesError} from `buildTx()` when multiple permit signatures are supplied.
   * @throws {UnexpectedRequirementSignatureError} from `buildTx()` when a non-permit signature is supplied.
   * @throws {BundlesPermitMismatchError} from `buildTx()` when the signature's spender or
   *   deadline differs from this operation's, or its amount is below the required share allowance.
   * @example
   * ```ts
   * import { vaults } from "@morpho-org/morpho-test";
   * import { isRequirementSignature, morphoViemExtension } from "@morpho-org/morpho-sdk";
   * import { createWalletClient, http, publicActions, type Address, zeroAddress } from "viem";
   * import { mainnet } from "viem/chains";
   *
   * const keyrockUsdcVaultV2 =
   *   "0x04422053aDDbc9bB2759b248B574e3FCA76Bc145" satisfies Address;
   * const client = createWalletClient({
   *   account: zeroAddress,
   *   chain: mainnet,
   *   transport: http(),
   * })
   *   .extend(publicActions)
   *   .extend(morphoViemExtension({ supportSignature: true }));
   * const source = client.morpho.vaultV1(
   *   vaults[mainnet.id].steakUsdc.address,
   *   mainnet.id,
   * );
   * const target = client.morpho.vaultV2(keyrockUsdcVaultV2, mainnet.id);
   * const migration = source.migrateToV2({
   *   assets: 1_000_000n,
   *   userAddress: zeroAddress,
   *   sourceVault: await source.getData(),
   *   targetVault: await target.getData(),
   * });
   * const signatures = [];
   * for (const requirement of await migration.getRequirements()) {
   *   if (isRequirementSignature(requirement)) {
   *     signatures.push(await requirement.sign(client, zeroAddress));
   *   } else {
   *     const hash = await client.sendTransaction(requirement);
   *     await client.waitForTransactionReceipt({ hash });
   *   }
   * }
   * const tx = migration.buildTx(signatures);
   * // tx satisfies Readonly<Transaction<VaultV1MigrateToV2Action>>
   * ```
   */
  migrateToV2: (
    params: {
      readonly userAddress: Address;
      readonly sourceVault: AccrualVault;
      readonly targetVault: AccrualVaultV2;
      readonly slippageTolerance?: bigint;
      readonly referralFeePct?: bigint;
      readonly referralFeeRecipient?: Address;
      readonly deadline?: bigint;
    } & ReferenceTimestampParams &
      VaultV1MigrateToV2AmountArgs,
  ) => ActionOutput<
    VaultV1MigrateToV2Action,
    readonly RequirementSignature[],
    undefined
  >;
}

/** Binds a viem client to a Vault V1 (MetaMorpho) vault's action builders. */
export class MorphoVaultV1 implements VaultV1Actions {
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

    return fetchAccrualVault(this.vault, this.client.viemClient, {
      ...parameters,
      deployless: this.client.options.supportDeployless,
    });
  }

  /**
   * Asserts that every registry contract this flow's transaction targets or names as
   * spender/authorized operator holds code, with one `eth_getCode` per distinct address
   * before any other requirement read. This VaultV1 `inKindRedeem` path validates the client chain
   * before this code check.
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

  /** {@inheritDoc VaultV1Actions.deposit} */
  deposit(params: Parameters<VaultV1Actions["deposit"]>[0]) {
    return this.buildDeposit(this.parseDeposit(params));
  }

  /** Owns the complete raw deposit boundary, including snapshot-derived price protection. */
  private parseDeposit(params: Parameters<VaultV1Actions["deposit"]>[0]) {
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
    // Enforce ABI and native-asset bounds at the constructor, before lazy requirements.
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
    // A computed price must still fit the contract's ABI.
    parseUint256("maxSharePrice", maxSharePrice);
    const parsed = {
      vault: { chainId: this.chainId, address: this.vault, asset: vaultAsset },
      userAddress,
      funding,
      maxSharePrice,
      common,
      metadata,
    } as VaultV1DepositInput;
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

  private buildDeposit(input: ReturnType<MorphoVaultV1["parseDeposit"]>) {
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
        return buildVaultV1Deposit(parsed, { requirementSignature });
      },
    });
  }

  withdraw(params: Parameters<VaultV1Actions["withdraw"]>[0]) {
    return this.buildWithdraw(this.parseWithdraw(params));
  }

  private parseWithdraw(params: Parameters<VaultV1Actions["withdraw"]>[0]) {
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
    } as VaultV1WithdrawInput;
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

  private buildWithdraw(input: ReturnType<MorphoVaultV1["parseWithdraw"]>) {
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
            version: "vaultV1",
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
        return buildVaultV1Withdraw(parsed, { requirementSignature: permit });
      },
    });
  }

  /** {@inheritDoc VaultV1Actions.redeem} */
  redeem(params: Parameters<VaultV1Actions["redeem"]>[0]) {
    return this.buildRedeem(this.parseRedeem(params));
  }

  private parseRedeem(params: Parameters<VaultV1Actions["redeem"]>[0]) {
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
    } as VaultV1RedeemInput;
    return { suppliedNow, parsed, spender, shares, userAddress, deadline };
  }

  private buildRedeem(input: ReturnType<MorphoVaultV1["parseRedeem"]>) {
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
            version: "vaultV1",
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
        return buildVaultV1Redeem(parsed, { requirementSignature: permit });
      },
    });
  }

  /** {@inheritDoc VaultV1Actions.inKindRedeem} */
  inKindRedeem(
    params: Parameters<VaultV1Actions["inKindRedeem"]>[0],
  ): ActionOutput<
    VaultV1InKindRedeemAction,
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
    deadline: deadlineOverride,
  }: Parameters<VaultV1Actions["inKindRedeem"]>[0]) {
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
      marketParamsListSnapshot,
      requiredShareAllowance,
      vaultExitBundlesV1,
    } = computeVaultV1InKindRedeemQuote({
      amount,
      marketParamsList,
      vaultData,
      deadline: deadlineOverride,
      now: suppliedNow ?? Time.timestamp(),
      chainId: this.chainId,
    });

    const parsed = {
      vault: { chainId: this.chainId, address: this.vault },
      args: {
        amount,
        marketParamsList: marketParamsListSnapshot,
        userAddress,
        deadline,
      },
      metadata,
    } as VaultV1InKindRedeemInput;
    return {
      suppliedNow,
      parsed,
      deadline,
      userAddress,
      vaultData,
      vaultExitBundlesV1,
      amount,
      requiredShareAllowance,
    };
  }

  private buildInKindRedeem(
    input: ReturnType<MorphoVaultV1["parseInKindRedeem"]>,
  ) {
    const {
      parsed,
      deadline,
      userAddress,
      vaultData,
      vaultExitBundlesV1,
      amount,
      requiredShareAllowance,
    } = input;
    return {
      getRequirements: () =>
        getVaultV1InKindRedeemRequirements(this.client.viemClient, {
          vaultData,
          vault: this.vault,
          userAddress,
          chainId: this.chainId,
          deadline,
          requiredShareAllowance,
          supportSignature: this.client.options.supportSignature,
          amount,
          now: input.suppliedNow,
        }),
      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const permit = selectBundlesSharesPermitSignature(signatures, {
          spender: vaultExitBundlesV1,
          amount: requiredShareAllowance,
          deadline,
        });
        return buildVaultV1InKindRedeem(parsed, {
          requirementSignature: permit,
        });
      },
    };
  }

  /** {@inheritDoc VaultV1Actions.migrateToV2} */
  migrateToV2(params: Parameters<VaultV1Actions["migrateToV2"]>[0]) {
    return this.buildMigrateToV2(this.parseMigrateToV2(params));
  }

  private parseMigrateToV2(
    params: Parameters<VaultV1Actions["migrateToV2"]>[0],
  ) {
    const suppliedNow = params.now;
    const metadata = resolveTransactionMetadata(
      this.client.options.metadata,
      suppliedNow,
    );

    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    if (!isAddressEqual(params.sourceVault.address, this.vault)) {
      throw new VaultAddressMismatchError(
        this.vault,
        params.sourceVault.address,
      );
    }
    if (!isAddressEqual(params.sourceVault.asset, params.targetVault.asset)) {
      throw new VaultAssetMismatchError(
        params.sourceVault.asset,
        params.targetVault.asset,
      );
    }
    if (isAddressEqual(this.vault, params.targetVault.address)) {
      throw new SameVaultMigrationError(this.vault);
    }
    const assets = "assets" in params ? params.assets : undefined;
    const shares = "shares" in params ? params.shares : undefined;
    if ((assets == null) === (shares == null)) {
      throw new AmountAndSharesExclusiveError();
    }
    const selected = assets ?? shares ?? 0n;
    if (selected <= 0n) {
      throw new NonPositiveInputError(
        assets == null ? "shares" : "assets",
        selected,
      );
    }
    const slippageTolerance =
      params.slippageTolerance ?? DEFAULT_SLIPPAGE_TOLERANCE;
    validateSlippageTolerance(slippageTolerance);
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
    // Only the destination receives a deposit; the source vault is an exit.
    // V1 redeem accrues market interest and performance fees before converting shares.
    const { maxSharePriceVaultV2, requiredShareAllowance } =
      computeVaultV1MigrateToV2Quote({
        sourceVault: params.sourceVault,
        targetVault: params.targetVault,
        ...(assets == null ? { shares: selected } : { assets: selected }),
        referralFeePct: common.referralFeePct,
        slippageTolerance,
        deadline,
        now: createdAt,
      });
    const spender = getChainAddress(this.chainId, "bundles.vaultBundlesV1");
    const { userAddress } = params;
    const sourceAsset = params.sourceVault.asset;
    const targetAddress = params.targetVault.address;
    const targetAsset = params.targetVault.asset;
    const domain = params.sourceVault.eip5267Domain;
    const sourceToken = new Token({
      address: params.sourceVault.address,
      name: params.sourceVault.name,
      eip5267Domain:
        domain == null
          ? undefined
          : new Eip5267Domain({
              ...domain,
              extensions: [...domain.extensions],
            }),
    });
    if (maxSharePriceVaultV2 <= 0n) {
      throw new NonPositiveInputError(
        "maxSharePriceVaultV2",
        maxSharePriceVaultV2,
      );
    }
    // Preserve destination positivity before the source and destination ABI bounds.
    parseUint256(assets == null ? "shares" : "assets", selected);
    parseUint256("maxSharePriceVaultV2", maxSharePriceVaultV2);
    const parsed = {
      vault: { chainId: this.chainId, address: this.vault, asset: sourceAsset },
      args: { targetVault: targetAddress, targetAsset, userAddress, ...common },
      bounds: { assets, shares, maxSharePriceVaultV2 },
      common,
      metadata,
    } as VaultV1MigrateToV2Input;
    return {
      suppliedNow,
      parsed,
      deadline,
      sourceToken,
      userAddress,
      requiredShareAllowance,
      spender,
    };
  }

  private buildMigrateToV2(
    input: ReturnType<MorphoVaultV1["parseMigrateToV2"]>,
  ) {
    const {
      parsed,
      deadline,
      sourceToken,
      userAddress,
      requiredShareAllowance,
      spender,
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
            vaultData: sourceToken,
            version: "vaultV1",
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
        return buildVaultV1MigrateToV2(parsed, {
          requirementSignature: permit,
        });
      },
    });
  }
}
