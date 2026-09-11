import {
  type AccrualVaultV2,
  AccrualVaultV2MorphoMarketV1AdapterV2,
  DEFAULT_SLIPPAGE_TOLERANCE,
  getChainAddresses,
  type MarketParams,
  MarketUtils,
  MathLib,
} from "@morpho-org/blue-sdk";
import { erc2612Abi, fetchAccrualVaultV2 } from "@morpho-org/blue-sdk-viem";
import { getChainAddress, Time } from "@morpho-org/morpho-ts";
import { type Address, erc20Abi, isAddressEqual, maxUint256 } from "viem";
import { multicall } from "viem/actions";
import {
  getBundlesReferralFeeAssets,
  normalizeBundlesCommonParams,
  resolveBundlesFunding,
  selectBundlesSharesRequirementSignature,
  selectBundlesTokenRequirementSignature,
} from "../../actions/bundles/common.js";
import {
  encodeErc20Approval,
  encodeVaultSharesPermit,
  vaultV2Deposit,
  vaultV2ForceRedeem,
  vaultV2ForceWithdraw,
  vaultV2InKindRedeem,
  vaultV2Redeem,
  vaultV2Withdraw,
} from "../../actions/index.js";
import {
  computeMinForceWithdrawSharePrice,
  computeVaultMaxShareAllowance,
  computeVaultMaxSharePrice,
  computeVaultV2ForceWithdrawFeeSharesMinted,
  computeVaultV2ForceWithdrawMinSharesBurnt,
  computeVaultV2ForceWithdrawPlan,
  computeVaultV2ForceWithdrawSharesBurnt,
  resolveVaultV2ForceWithdrawEligibility,
  validateChainId,
  validateSlippageTolerance,
} from "../../helpers/index.js";
import {
  validateDeadline,
  validateNativeVaultAsset,
  validateReferralFee,
  validateUint256Field,
} from "../../helpers/validate.js";
import type { FetchParameters } from "../../types/data.js";
import {
  type ActionOutput,
  type ActionRequirement,
  AdapterNotPartOfVaultError,
  type BundlesFundingArgs,
  type BundlesTokenRequirementsOptions,
  ChainIdMismatchError,
  type Deallocation,
  EmptyMarketParamsListError,
  ExpiredDeadlineError,
  InKindRedeemCoverageError,
  InKindRedeemZeroDeallocationError,
  InputExceedsMaxError,
  InsufficientBlueBalanceForInKindRedeemError,
  isRequirementSignature,
  type MorphoClientType,
  NonPositiveInputError,
  type Permit2SignatureTransferAction,
  type PermitAction,
  type RequirementSignature,
  selectRequirementSignatures,
  type Transaction,
  VaultAddressMismatchError,
  type VaultV2DepositAction,
  type VaultV2ForceRedeemAction,
  type VaultV2ForceWithdrawAction,
  VaultV2ForceWithdrawCoverageError,
  VaultV2ForceWithdrawFeeSharesExceedBurnError,
  VaultV2ForceWithdrawZeroWithdrawalError,
  type VaultV2InKindRedeemAction,
  type VaultV2RedeemAction,
  VaultV2SingleAdapterRequiredError,
  VaultV2UndecodableLiquidityDataError,
  VaultV2UnsupportedExitAdapterError,
  VaultV2UnsupportedLiquidityAdapterError,
  type VaultV2WithdrawAction,
} from "../../types/index.js";
import { getVaultBundlesSharesRequirements } from "../requirements/getVaultBundlesSharesRequirements.js";
import { getBundlesTokenRequirements } from "../requirements/index.js";

// Maximum accepted deadline horizon; the on-chain management fee is capped at 5%/yr so the
// accrual model stays well-defined inside it.
const VAULT_V2_FEE_PROJECTION_HORIZON = 365n * 24n * 60n * 60n;

export interface VaultV2Actions {
  /**
   * Fetches the latest vault data.
   *
   * This function fetches the latest vault data from the blockchain.
   * @param {FetchParameters} [parameters] - The parameters for the fetch operation.
   *
   * @returns {Promise<Awaited<ReturnType<typeof fetchAccrualVaultV2>>>} The latest vault data.
   */
  getData: (
    parameters?: FetchParameters,
  ) => Promise<Awaited<ReturnType<typeof fetchAccrualVaultV2>>>;
  /**
   * Prepares a Vault V2 deposit through the registered VaultBundlesV1 contract.
   *
   * Uses the supplied vault snapshot to compute the deadline-accrued `maxSharePrice`.
   * `getRequirements()` reads the asset allowance and, when enabled, the selected ERC-2612 or
   * Permit2 nonce state. Native funding is exclusive and skips token requirements. Shares are
   * always minted to the transaction sender, which must be `userAddress`.
   * Concurrent requirement reads share the first caller's options; later calls refresh on-chain
   * state using their own options. `buildTx()` accepts signatures from the latest completed read.
   *
   * @param params.userAddress - Account that funds, signs, submits, and receives the vault shares.
   * @param params.vaultData - Pre-fetched Vault V2 snapshot used for asset and share conversion.
   * @param params.amount - Optional gross ERC-20 assets; exclusive with `nativeAmount`.
   * @param params.nativeAmount - Optional gross native assets; exclusive with `amount` and valid
   *   only for a wNative vault.
   * @param params.slippageTolerance - Optional WAD-scaled tolerance; defaults to 0.03% and cannot
   *   exceed 10%.
   * @param params.referralFeePct - Optional WAD-scaled referral fee below 100%, deducted before
   *   the vault deposit.
   * @param params.referralFeeRecipient - Non-zero recipient required for a positive referral fee.
   * @param params.deadline - Optional execution and permit deadline in Unix seconds; defaults to
   *   two hours from handle creation.
   * @returns Lazy token prerequisite resolution and a synchronous deep-frozen VaultBundlesV1
   *   transaction builder.
   * @throws {ChainIdMismatchError} when the connected client targets another chain.
   * @throws {VaultAddressMismatchError} when `vaultData` belongs to another vault.
   * @throws {ExpiredDeadlineError} when the deadline is stale at creation or requirement resolution.
   * @throws {MixedBundlesFundingError} when ERC-20 and native funding are both supplied.
   * @throws {NegativeInputError} when funding, slippage, the referral fee, or a Permit2 nonce is negative.
   * @throws {NonPositiveInputError} when funding or the previewed vault shares are not positive.
   * @throws {ExcessiveSlippageToleranceError} when slippage tolerance exceeds the SDK maximum.
   * @throws {ReferralFeePctExceededError} when the referral fee is at least WAD.
   * @throws {ReferralFeeRecipientMissingError} when a positive referral fee has no recipient.
   * @throws {ChainWNativeMissingError} when native funding is requested on a chain without wNative.
   * @throws {NativeAmountOnNonWNativeVaultError} when native funding targets a non-wNative vault.
   * @throws {MissingPermit2SignatureTransferNonceError} from `getRequirements()` when Permit2 is
   *   selected without an explicit nonce.
   * @throws {Permit2SignatureTransferNonceAlreadyUsedError} from `getRequirements()` when the
   *   explicit Permit2 nonce is consumed.
   * @throws {InputExceedsMaxError} when funding or the deadline exceeds uint256, or from
   *   `getRequirements()` when the Permit2 nonce exceeds uint256.
   * @throws {AmbiguousRequirementSignaturesError} from `buildTx()` when multiple token signatures are supplied.
   * @throws {UnexpectedRequirementSignatureError} from `buildTx()` when an unsupported signature is supplied.
   * @throws {BundlesPermitMismatchError} from `buildTx()` when the signature was not produced for
   *   this prepared handle.
   * @throws {DepositOwnerMismatchError} from `buildTx()` when the signed owner differs from `userAddress`.
   * @throws {DepositAssetMismatchError} from `buildTx()` when the signed asset differs from the vault asset.
   * @throws {BundlesRequirementSignatureMismatchError} from `buildTx()` when signature metadata is malformed.
   * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
   * @throws {UnknownAddressError} when VaultBundlesV1 is not registered.
   * @throws {viem.BaseError} from `getRequirements()` when an allowance, nonce, or token metadata read fails.
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
    } & BundlesFundingArgs,
  ) => ActionOutput<
    VaultV2DepositAction,
    readonly RequirementSignature[],
    BundlesTokenRequirementsOptions
  >;
  /**
   * Prepares an exact-assets Vault V2 withdrawal through VaultBundlesV1.
   *
   * Reads the vault accrual state on the first `getRequirements()` call, then reads the live
   * vault-share allowance and, when a signature is needed, the permit nonce on each call.
   * Captures the requested amount and owner at creation, so later changes to `params` do not
   * change this handle's requirements or transaction.
   *
   * @param params.amount - Positive gross withdrawal in underlying asset base units, before fees.
   * @param params.userAddress - Share owner that must sign and submit; receives the net assets.
   * @param params.slippageTolerance - Optional WAD-scaled share-price loss tolerance applied to
   *   the share cap.
   *   Defaults to 0.03% and cannot exceed 10%.
   * @param params.referralFeePct - Optional WAD-scaled fee in [0, 1e18), defaulting to zero;
   *   rounded down and deducted from the gross withdrawn assets.
   * @param params.referralFeeRecipient - Optional nonzero recipient required for a positive fee.
   * @param params.deadline - Optional execution and share-permit deadline in Unix seconds;
   *   defaults to two hours from handle creation.
   * @returns A frozen handle with lazy `getRequirements()` and synchronous `buildTx(signatures?)`,
   *   which returns a deep-frozen `Transaction<VaultV2WithdrawAction>`. Requirements are empty
   *   when the allowance equals the cap; otherwise they contain an exact approval or, with
   *   signature support, an ERC-2612 request. The cap stays pinned to the first resolution while
   *   each call re-reads the allowance. Confirm the approval or pass its signed permit to `buildTx`.
   * @throws {ChainIdMismatchError} when the connected client targets another chain.
   * @throws {NonPositiveInputError} when `amount` or the computed share cap is not positive.
   * @throws {ExpiredDeadlineError} when `deadline` is not in the future at handle creation or
   *   at any `getRequirements()` call.
   * @throws {InputExceedsMaxError} when `amount` or `deadline` exceeds uint256 at handle creation.
   * @throws {NegativeInputError} when `referralFeePct` or `slippageTolerance` is negative.
   * @throws {ReferralFeePctExceededError} when `referralFeePct` is at least WAD.
   * @throws {ReferralFeeRecipientMissingError} when a positive referral fee has no nonzero recipient.
   * @throws {ExcessiveSlippageToleranceError} when `slippageTolerance` exceeds 10%.
   * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
   * @throws {UnknownAddressError} when VaultBundlesV1 is not registered on the target chain.
   * @throws {UnexpectedRequirementSignatureError} from `buildTx()` when an unsupported signature is supplied.
   * @throws {AmbiguousRequirementSignaturesError} from `buildTx()` when multiple permits are supplied.
   * @throws {BundlesPermitMismatchError} from `buildTx()` when the share permit is malformed,
   *   was not resolved for this handle, or has incompatible vault, owner, spender, amount,
   *   deadline, or nonce values.
   * @throws {viem.BaseError} when a vault, allowance, or nonce read or transaction encoding fails.
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
   *   const action = vault.withdraw({ amount: 1_000_000n, userAddress });
   *   const requirements = await action.getRequirements();
   *   // Send and confirm each approval before calling action.buildTx().
   *   // action.buildTx() returns Readonly<Transaction<VaultV2WithdrawAction>>.
   *   return { action, requirements }; // Prepared handle and its outstanding share approvals.
   * }
   * ```
   */
  withdraw: (params: {
    readonly amount: bigint;
    readonly userAddress: Address;
    readonly slippageTolerance?: bigint;
    readonly referralFeePct?: bigint;
    readonly referralFeeRecipient?: Address;
    readonly deadline?: bigint;
  }) => ActionOutput<
    VaultV2WithdrawAction,
    readonly RequirementSignature[],
    undefined
  >;
  /**
   * Prepares an exact-shares Vault V2 redemption through VaultBundlesV1.
   *
   * Captures `shares` and `userAddress` at handle creation for both requirements and `buildTx()`.
   * The caller must satisfy the exact vault-share allowance returned by `getRequirements()` before
   * `buildTx()`; every requirement resolution re-reads the live allowance and checks the deadline.
   * `buildTx()` accepts permits from the latest completed requirement resolution.
   *
   * @param {Object} params - The redeem parameters.
   * @param {bigint} params.shares - Exact vault shares to burn.
   * @param {Address} params.userAddress - Account that must sign and submit the transaction; VaultBundlesV1 burns `msg.sender`'s shares and pays `msg.sender`.
   * @param {bigint} [params.referralFeePct=0n] - WAD-scaled referral fee deducted from the redeemed assets; must be below WAD.
   * @param {Address} [params.referralFeeRecipient] - Non-zero recipient required when `referralFeePct` is positive.
   * @param {bigint} [params.deadline] - VaultBundlesV1 execution deadline; defaults to two hours from now.
   * @returns Lazy exact share-allowance requirements and a synchronous transaction builder.
   * @throws {ChainIdMismatchError} when the client and entity target different chains.
   * @throws {NonPositiveInputError} when `shares` is not positive.
   * @throws {ExpiredDeadlineError} when `deadline` is not in the future at handle creation or
   *   requirement resolution.
   * @throws {NegativeInputError} when `referralFeePct` is negative.
   * @throws {ReferralFeePctExceededError} when `referralFeePct` is not below WAD.
   * @throws {ReferralFeeRecipientMissingError} when a positive fee has no non-zero recipient.
   * @throws {UnsupportedChainIdError} when no address registry exists for the target chain.
   * @throws {UnknownAddressError} when VaultBundlesV1 is not registered on the target chain.
   * @throws {viem.BaseError} from `getRequirements()` when an allowance or nonce read fails.
   * @throws {AmbiguousRequirementSignaturesError} from `buildTx()` when more than one permit signature is supplied.
   * @throws {UnexpectedRequirementSignatureError} from `buildTx()` when a non-permit signature is supplied.
   * @throws {BundlesPermitMismatchError} from `buildTx()` when the supplied permit does not match the
   *   resolved share cap, spender, owner, nonce, or deadline.
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
  redeem: (params: {
    readonly shares: bigint;
    readonly userAddress: Address;
    readonly referralFeePct?: bigint;
    readonly referralFeeRecipient?: Address;
    readonly deadline?: bigint;
  }) => ActionOutput<
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
   * @param params - In-kind redemption parameters.
   * @param params.amount - Penalty-inclusive, asset-denominated amount to exit.
   * @param params.marketParamsList - Ordered adapter markets consumed greedily after idle assets;
   *   its length is also the V2 share-sufficiency rounding buffer.
   * @param params.vaultData - Pre-fetched Vault V2 accrual snapshot.
   * @param params.userAddress - Account that signs and submits the exit.
   * @param params.adapter - Optional adapter override; defaults to the vault's sole adapter.
   * @param params.deadline - Optional shared permit/bundle deadline; defaults to two hours from now.
   * @returns Lazy prerequisite resolution and a synchronous transaction builder.
   * @throws {ChainIdMismatchError} when the client and entity target different chains.
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
   * @throws {viem.BaseError} from `getRequirements()` when an RPC or multicall contract read fails.
   * @throws {InsufficientBlueBalanceForInKindRedeemError} from `getRequirements()` when Blue cannot fund the largest callback.
   * @throws {AmbiguousRequirementSignaturesError} from `buildTx()` when more than one permit signature is supplied.
   * @throws {UnexpectedRequirementSignatureError} from `buildTx()` when a non-permit signature is supplied.
   * @throws {VaultExitBundlesV1PermitMismatchError} from `buildTx()` when the requirement has the wrong permit kind, asset, or signature encoding.
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
  readonly inKindRedeem: (params: {
    readonly amount: bigint;
    readonly marketParamsList: readonly MarketParams[];
    readonly vaultData: AccrualVaultV2;
    readonly userAddress: Address;
    readonly adapter?: Address;
    readonly deadline?: bigint;
  }) => ActionOutput<
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
   * Unless `minSharePriceE27` is overridden, the SDK derives a conservative lower bound on the
   * realized exit share price from the snapshot and `slippageTolerance`. The bound rejects a share
   * price drop, a penalty increase, and liquidity shifting from the penalty-free leg to the
   * penalised leg. It does **not** cover the referral fee, which the contract deducts afterwards.
   *
   * Vault gates are enforced by the final transaction and are not preflighted: the receive-assets
   * gate must allow VaultExitBundlesV1 and may depend on its transient initiator, while a
   * send-shares gate is arbitrary code re-evaluated after each penalty burn. The SDK also does not
   * validate the user's share balance. Per-market penalties and each vault withdrawal round the
   * share burn up independently, so the exit can burn marginally more shares than `exitAssets` alone
   * implies; size `exitAssets` a small buffer below `vault.previewRedeem(sharesHeld)` — the approved
   * share allowance this handle returns is the exact upper bound on the burn — so a full-balance
   * exit does not revert for insufficient shares.
   *
   * Idle balance, penalty, adapter positions, and market liquidity can drift after the snapshot, so
   * an on-chain revert remains possible if vault state changes between preparation and inclusion.
   * A fee-recipient `userAddress` gets a floor from the net share burn after fee mints at `now`,
   * and a guard against fee mints reaching the lower burn bound by the deadline. Its allowance
   * includes the projected fee shares through that same deadline. Deadlines beyond one year after
   * handle creation are rejected, so the guard and allowance cover the whole accepted window.
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
   * @param params.minSharePriceE27 - Optional RAY-scaled override of the derived bound. Must be
   *   positive: the contract reads `0` as "no bound", so it cannot be used to opt out.
   * @param params.referralFeePct - Optional WAD-scaled share of the withdrawn assets routed to
   *   `referralFeeRecipient`. Defaults to `0n`.
   * @param params.referralFeeRecipient - Optional referral fee recipient, required when
   *   `referralFeePct` is positive.
   * @returns Lazy prerequisite resolution and a synchronous transaction builder.
   * @throws {ChainIdMismatchError} when the client and entity target different chains.
   * @throws {VaultAddressMismatchError} when `vaultData` belongs to another vault.
   * @throws {NonPositiveInputError} when `exitAssets`, `deadline`, or a supplied
   *   `minSharePriceE27` is not positive.
   * @throws {NegativeInputError} when `slippageTolerance` or `referralFeePct` is negative.
   * @throws {InputExceedsMaxError} when `exitAssets`, `deadline`, or the effective
   *   `minSharePriceE27` (supplied or derived) exceeds `uint256`, or when `referralFeePct` is not
   *   below WAD, or when `deadline` is more than one year after handle creation.
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
   * @throws {VaultV2ForceWithdrawFeeSharesExceedBurnError} when fee shares projected for a
   *   fee-recipient `userAddress` reach the lower-bound share burn at the deadline.
   * @throws {MissingReferralFeeRecipientError} when a positive `referralFeePct` has no recipient.
   * @throws {UnsupportedChainIdError} when no address registry exists for the target chain.
   * @throws {UnknownAddressError} when VaultExitBundlesV1 is not registered on the target chain.
   * @throws {viem.BaseError} from `getRequirements()` when an RPC or multicall contract read fails.
   * @throws {AmbiguousRequirementSignaturesError} from `buildTx()` when more than one permit signature is supplied.
   * @throws {UnexpectedRequirementSignatureError} from `buildTx()` when a non-permit signature is supplied.
   * @throws {BundlesPermitMismatchError} from `buildTx()` when a permit was not produced for this
   *   prepared operation.
   * @throws {VaultExitBundlesV1PermitMismatchError} from `buildTx()` when the requirement has the wrong permit kind, asset, or signature encoding.
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
  readonly forceWithdraw: (params: {
    readonly exitAssets: bigint;
    readonly vaultData: AccrualVaultV2;
    readonly userAddress: Address;
    readonly adapter?: Address;
    readonly deadline?: bigint;
    readonly slippageTolerance?: bigint;
    readonly minSharePriceE27?: bigint;
    readonly referralFeePct?: bigint;
    readonly referralFeeRecipient?: Address;
  }) => ActionOutput<
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
   * The total assets passed to forceDeallocate calls must be greater than or equal to the
   * asset-equivalent of the redeemed shares. The caller should apply a buffer on the deallocated
   * amounts to account for share-price drift between submission and execution.
   *
   * @param {Object} params - The force redeem parameters.
   * @param {readonly Deallocation[]} params.deallocations - The typed list of deallocations to perform.
   * @param {Object} params.redeem - The redeem parameters applied after deallocations.
   * @param {bigint} params.redeem.shares - The amount of shares to redeem.
   * @param {Address} params.userAddress - User address (penalty source and redeem recipient).
   * @returns {Object} The result object.
   * @returns {Readonly<Transaction<VaultV2ForceRedeemAction>>} returns.buildTx The prepared multicall transaction.
   */
  forceRedeem: (params: {
    deallocations: readonly Deallocation[];
    redeem: { shares: bigint };
    userAddress: Address;
  }) => {
    buildTx: () => Readonly<Transaction<VaultV2ForceRedeemAction>>;
  };
}

export class MorphoVaultV2 implements VaultV2Actions {
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  constructor(
    private readonly client: MorphoClientType,
    private readonly vault: Address,
    private readonly chainId: number,
  ) {}

  async getData(parameters?: FetchParameters) {
    if (
      this.client.viemClient.chain?.id &&
      this.client.viemClient.chain?.id !== this.chainId
    ) {
      throw new ChainIdMismatchError(
        this.client.viemClient.chain?.id,
        this.chainId,
      );
    }

    return fetchAccrualVaultV2(this.vault, this.client.viemClient, {
      ...parameters,
      chainId: this.chainId,
      deployless: this.client.options.supportDeployless,
    });
  }

  /** {@inheritDoc VaultV2Actions.deposit} */
  deposit(
    params: {
      readonly userAddress: Address;
      readonly vaultData: AccrualVaultV2;
      readonly slippageTolerance?: bigint;
      readonly referralFeePct?: bigint;
      readonly referralFeeRecipient?: Address;
      readonly deadline?: bigint;
    } & BundlesFundingArgs,
  ) {
    const { userAddress, vaultData } = params;
    const { asset: vaultAsset } = vaultData;
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    if (!isAddressEqual(vaultData.address, this.vault)) {
      throw new VaultAddressMismatchError(this.vault, vaultData.address);
    }
    const createdAt = Time.timestamp();
    const deadline = params.deadline ?? createdAt + Time.s.from.h(2n);
    if (deadline <= createdAt)
      throw new ExpiredDeadlineError(deadline, createdAt);
    const common = normalizeBundlesCommonParams({
      deadline,
      referralFeePct: params.referralFeePct,
      referralFeeRecipient: params.referralFeeRecipient,
    });
    const funding = resolveBundlesFunding(params);
    // Reject overflow before share-price math or native-only prerequisite resolution.
    validateUint256Field(
      funding.value > 0n ? "nativeAmount" : "amount",
      funding.assets,
    );
    if (funding.value > 0n) {
      // The native path must target the chain's registered wrapped-native asset.
      validateNativeVaultAsset(this.chainId, vaultAsset);
    }
    const referralFeeAssets = getBundlesReferralFeeAssets(
      funding.assets,
      common.referralFeePct,
    );
    const maxSharePrice = computeVaultMaxSharePrice({
      vaultData,
      deadline,
      assets: funding.assets - referralFeeAssets,
      slippageTolerance: params.slippageTolerance ?? DEFAULT_SLIPPAGE_TOLERANCE,
    });
    const spender = getChainAddress(this.chainId, "bundles.vaultBundlesV1");
    let pendingRequirements: Promise<readonly ActionRequirement[]> | undefined;
    let expectedRequirement:
      | PermitAction
      | Permit2SignatureTransferAction
      | undefined;
    return Object.freeze({
      getRequirements: async (
        requirementOptions?: BundlesTokenRequirementsOptions,
      ) => {
        const now = Time.timestamp();
        if (deadline <= now) throw new ExpiredDeadlineError(deadline, now);
        if (pendingRequirements != null) return await pendingRequirements;
        // Memoize the in-flight promise, not just its result: concurrent callers
        // requesting different routes would otherwise both resolve requirements and
        // the slower one would overwrite `expectedRequirement`, making `buildTx()`
        // reject the signature returned by the other call.
        const pending = (async () => {
          const requirements =
            funding.value > 0n
              ? []
              : await getBundlesTokenRequirements(this.client.viemClient, {
                  token: vaultAsset,
                  spender,
                  amount: funding.assets,
                  owner: userAddress,
                  chainId: this.chainId,
                  deadline,
                  supportSignature: this.client.options.supportSignature,
                  supportDeployless: this.client.options.supportDeployless,
                  useSimplePermit: requirementOptions?.useSimplePermit,
                  permit2Nonce: requirementOptions?.permit2Nonce,
                });
          const signatureRequirement = requirements.find(
            isRequirementSignature,
          );
          expectedRequirement =
            signatureRequirement?.action.type === "permit" ||
            signatureRequirement?.action.type === "permit2SignatureTransfer"
              ? signatureRequirement.action
              : undefined;
          return requirements;
        })();
        pendingRequirements = pending;
        try {
          return await pending;
        } finally {
          // Later calls must re-read live allowances/nonces and honor their own options.
          if (pendingRequirements === pending) pendingRequirements = undefined;
        }
      },
      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const requirementSignature = selectBundlesTokenRequirementSignature(
          signatures,
          expectedRequirement,
        );
        return vaultV2Deposit({
          vault: {
            chainId: this.chainId,
            address: this.vault,
            asset: vaultAsset,
          },
          args: {
            ...(funding.value > 0n
              ? { nativeAmount: funding.assets }
              : { amount: funding.assets }),
            maxSharePrice,
            userAddress,
            requirementSignature,
            referralFeePct: common.referralFeePct,
            referralFeeRecipient: common.referralFeeRecipient,
            deadline,
          },
          metadata: this.client.options.metadata,
        });
      },
    });
  }

  withdraw(params: {
    readonly amount: bigint;
    readonly userAddress: Address;
    readonly slippageTolerance?: bigint;
    readonly referralFeePct?: bigint;
    readonly referralFeeRecipient?: Address;
    readonly deadline?: bigint;
  }) {
    const { amount, userAddress } = params;
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    if (amount <= 0n) throw new NonPositiveInputError("amount", amount);
    // Reject values outside the ABI range before resolving any requirements.
    validateUint256Field("amount", amount);
    const createdAt = Time.timestamp();
    const deadline = params.deadline ?? createdAt + Time.s.from.h(2n);
    if (deadline <= createdAt)
      throw new ExpiredDeadlineError(deadline, createdAt);
    const common = normalizeBundlesCommonParams({
      deadline,
      referralFeePct: params.referralFeePct,
      referralFeeRecipient: params.referralFeeRecipient,
    });
    const slippageTolerance =
      params.slippageTolerance ?? DEFAULT_SLIPPAGE_TOLERANCE;
    validateSlippageTolerance(slippageTolerance);
    // Fail eagerly if VaultBundlesV1 is unavailable; only validation is needed here.
    getChainAddress(this.chainId, "bundles.vaultBundlesV1");
    let requiredShareAllowance: bigint | undefined;
    let vaultSnapshot: AccrualVaultV2 | undefined;
    let expectedRequirement: PermitAction | undefined;
    return Object.freeze({
      getRequirements: async () => {
        const now = Time.timestamp();
        if (deadline <= now) throw new ExpiredDeadlineError(deadline, now);
        // Re-read the live share allowance on every call instead of caching the resolved
        // requirements: the allowance is the sole cap on the burn, so a caller that executed the
        // returned approval must see it satisfied on the next call, and an allowance revoked or
        // raised afterwards must resurface as an outstanding requirement. Only the vault snapshot
        // and the cap derived from it are pinned, so re-reading cannot move the cap this handle
        // already committed to; the snapshot is used for immutable identity and permit-domain
        // fields only.
        const vaultData = (vaultSnapshot ??= await this.getData());
        requiredShareAllowance ??= computeVaultMaxShareAllowance({
          vaultData,
          deadline,
          assets: amount,
          slippageTolerance,
        });
        const requirements = await getVaultBundlesSharesRequirements(
          this.client.viemClient,
          {
            vaultData,
            version: "vaultV2",
            owner: userAddress,
            chainId: this.chainId,
            requiredShareAllowance,
            deadline,
            supportSignature: this.client.options.supportSignature,
          },
        );
        const signatureRequirement = requirements.find(isRequirementSignature);
        if (signatureRequirement?.action.type === "permit") {
          expectedRequirement = signatureRequirement.action;
        }
        return requirements;
      },
      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const permit = selectBundlesSharesRequirementSignature(signatures, {
          requiredShareAllowance,
          expectedRequirement,
        });
        return vaultV2Withdraw({
          vault: { chainId: this.chainId, address: this.vault },
          args: {
            amount,
            userAddress,
            requirementSignature: permit,
            referralFeePct: common.referralFeePct,
            referralFeeRecipient: common.referralFeeRecipient,
            deadline,
          },
          metadata: this.client.options.metadata,
        });
      },
    });
  }

  /** {@inheritDoc VaultV2Actions.redeem} */
  redeem(params: {
    readonly shares: bigint;
    readonly userAddress: Address;
    readonly referralFeePct?: bigint;
    readonly referralFeeRecipient?: Address;
    readonly deadline?: bigint;
  }) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    const { shares, userAddress } = params;
    if (shares <= 0n) throw new NonPositiveInputError("shares", shares);
    const createdAt = Time.timestamp();
    const deadline = params.deadline ?? createdAt + Time.s.from.h(2n);
    if (deadline <= createdAt)
      throw new ExpiredDeadlineError(deadline, createdAt);
    const common = normalizeBundlesCommonParams({
      deadline,
      referralFeePct: params.referralFeePct,
      referralFeeRecipient: params.referralFeeRecipient,
    });
    getChainAddress(this.chainId, "bundles.vaultBundlesV1");
    let expectedRequirement: PermitAction | undefined;
    return Object.freeze({
      getRequirements: async () => {
        const now = Time.timestamp();
        if (deadline <= now) throw new ExpiredDeadlineError(deadline, now);
        const requirements = await getVaultBundlesSharesRequirements(
          this.client.viemClient,
          {
            vaultData: await this.getData(),
            version: "vaultV2",
            owner: userAddress,
            chainId: this.chainId,
            requiredShareAllowance: shares,
            deadline,
            supportSignature: this.client.options.supportSignature,
          },
        );
        const signatureRequirement = requirements.find(isRequirementSignature);
        expectedRequirement =
          signatureRequirement?.action.type === "permit"
            ? signatureRequirement.action
            : undefined;
        return requirements;
      },
      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const permit = selectBundlesSharesRequirementSignature(signatures, {
          requiredShareAllowance: shares,
          expectedRequirement,
        });
        return vaultV2Redeem({
          vault: { chainId: this.chainId, address: this.vault },
          args: {
            shares,
            userAddress,
            requirementSignature: permit,
            referralFeePct: common.referralFeePct,
            referralFeeRecipient: common.referralFeeRecipient,
            deadline,
          },
          metadata: this.client.options.metadata,
        });
      },
    });
  }

  /** {@inheritDoc VaultV2Actions.inKindRedeem} */
  inKindRedeem({
    amount,
    marketParamsList,
    vaultData,
    userAddress,
    adapter: adapterOverride,
    deadline: deadlineOverride,
  }: {
    readonly amount: bigint;
    readonly marketParamsList: readonly MarketParams[];
    readonly vaultData: AccrualVaultV2;
    readonly userAddress: Address;
    readonly adapter?: Address;
    readonly deadline?: bigint;
  }): ActionOutput<
    VaultV2InKindRedeemAction,
    readonly RequirementSignature[],
    undefined
  > {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    if (!isAddressEqual(vaultData.address, this.vault)) {
      throw new VaultAddressMismatchError(this.vault, vaultData.address);
    }
    if (amount <= 0n) throw new NonPositiveInputError("amount", amount);
    const marketParamsListSnapshot = marketParamsList.map(
      ({ loanToken, collateralToken, oracle, irm, lltv }) => ({
        loanToken,
        collateralToken,
        oracle,
        irm,
        lltv,
      }),
    );
    const marketIdListSnapshot = marketParamsListSnapshot.map((marketParams) =>
      MarketUtils.getMarketId(marketParams),
    );

    const now = Time.timestamp();
    const deadline = deadlineOverride ?? now + Time.s.from.h(2n);
    // Reject the same bounds the action enforces, before `getRequirements()` can walk the caller
    // through a vault-share approval or an EIP-712 permit for a deadline `buildTx()` cannot encode.
    validateDeadline(deadline);
    if (deadline <= now) throw new ExpiredDeadlineError(deadline, now);
    if (vaultData.accrualAdapters.length !== 1) {
      throw new VaultV2SingleAdapterRequiredError(
        this.vault,
        vaultData.accrualAdapters.length,
      );
    }

    const soleAdapter = vaultData.accrualAdapters[0];
    if (soleAdapter == null) {
      throw new VaultV2SingleAdapterRequiredError(this.vault, 0);
    }
    const adapter = adapterOverride ?? soleAdapter.address;
    if (!isAddressEqual(adapter, soleAdapter.address)) {
      throw new AdapterNotPartOfVaultError(this.vault, adapter);
    }
    if (!(soleAdapter instanceof AccrualVaultV2MorphoMarketV1AdapterV2)) {
      throw new VaultV2UnsupportedExitAdapterError(adapter);
    }

    const penalty =
      vaultData.forceDeallocatePenalties[soleAdapter.address] ?? 0n;
    const idleAssets = MathLib.min(vaultData.assetBalance, amount);
    const assetsToDeallocate = MathLib.wDivDown(
      amount - idleAssets,
      MathLib.WAD + penalty,
    );
    if (idleAssets === 0n && assetsToDeallocate === 0n) {
      throw new InKindRedeemZeroDeallocationError({
        vault: this.vault,
        amount,
        penalty,
      });
    }
    if (assetsToDeallocate > 0n && marketParamsListSnapshot.length === 0) {
      throw new EmptyMarketParamsListError();
    }

    const assetsByMarket = new Map(
      soleAdapter.markets.map((market) => [
        market.id,
        market
          .accrueInterest(now)
          .toSupplyAssets(soleAdapter.supplyShares[market.id] ?? 0n),
      ]),
    );
    const uniqueMarketIds = new Set(marketIdListSnapshot);
    let covered = 0n;
    for (const id of uniqueMarketIds) covered += assetsByMarket.get(id) ?? 0n;
    if (covered < assetsToDeallocate) {
      const maxExitAssets =
        covered === 0n
          ? idleAssets
          : idleAssets +
            MathLib.wMulUp(covered + 1n, MathLib.WAD + penalty) -
            1n;
      throw new InKindRedeemCoverageError({
        required: assetsToDeallocate,
        covered,
        maxExitAssets,
      });
    }

    let remaining = assetsToDeallocate;
    let peak = 0n;
    const consumedMarketIds = new Set<string>();
    const { vault: allowanceVault } = vaultData.accrueInterest(deadline);
    // Interest can lower the burn, while management fees can raise it; bound both endpoints.
    const previewAllowance = (assets: bigint) =>
      MathLib.max(
        vaultData.toShares(assets, "Up"),
        allowanceVault.toShares(assets, "Up"),
      );

    let requiredShareAllowance = previewAllowance(
      BigInt(marketParamsListSnapshot.length),
    );
    // Pre-burn previews upper-bound each separately rounded idle, penalty, and main burn.
    requiredShareAllowance += previewAllowance(idleAssets);
    for (const id of marketIdListSnapshot) {
      const available = consumedMarketIds.has(id)
        ? 0n
        : (assetsByMarket.get(id) ?? 0n);
      consumedMarketIds.add(id);
      const chunk = MathLib.min(available, remaining);
      peak = MathLib.max(peak, chunk);
      requiredShareAllowance += previewAllowance(
        MathLib.wMulUp(chunk, penalty),
      );
      requiredShareAllowance += previewAllowance(chunk);
      remaining -= chunk;
    }

    const vaultExitBundlesV1 = getChainAddress(
      this.chainId,
      "bundles.vaultExitBundlesV1",
    );
    const addresses = getChainAddresses(this.chainId);
    const blue = addresses.blue ?? addresses.morpho;

    return {
      getRequirements: async (): Promise<readonly ActionRequirement[]> => {
        const requirementsTimestamp = Time.timestamp();
        if (deadline <= requirementsTimestamp) {
          throw new ExpiredDeadlineError(deadline, requirementsTimestamp);
        }
        // Vault gates are intentionally left to the final transaction. A receive gate may inspect
        // VaultExitBundlesV1's transient `initiator`, which is populated only during the actual
        // periphery call. A send-share gate is arbitrary external code and is evaluated repeatedly
        // after intermediate penalty share burns, so one standalone read is not execution-equivalent
        // either. Simulate the finalized transaction after authorization when gate compatibility
        // must be checked before submission.
        const [allowance, nonce, blueBalance] = await multicall(
          this.client.viemClient,
          {
            allowFailure: false,
            contracts: [
              {
                address: this.vault,
                abi: erc20Abi,
                functionName: "allowance",
                args: [userAddress, vaultExitBundlesV1],
              },
              {
                address: this.vault,
                abi: erc2612Abi,
                functionName: "nonces",
                args: [userAddress],
              },
              {
                address: vaultData.asset,
                abi: erc20Abi,
                functionName: "balanceOf",
                args: [blue],
              },
            ],
          },
        );

        if (blueBalance < peak) {
          throw new InsufficientBlueBalanceForInKindRedeemError({
            asset: vaultData.asset,
            available: blueBalance,
            required: peak,
          });
        }
        if (allowance >= requiredShareAllowance) return [];
        if (this.client.options.supportSignature) {
          return [
            encodeVaultSharesPermit({
              vault: vaultData,
              version: "vaultV2",
              spender: vaultExitBundlesV1,
              owner: userAddress,
              chainId: this.chainId,
              nonce,
              amount: requiredShareAllowance,
              deadline,
            }),
          ];
        }
        return [
          encodeErc20Approval({
            token: this.vault,
            spender: vaultExitBundlesV1,
            amount: requiredShareAllowance,
            chainId: this.chainId,
          }),
        ];
      },
      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const { permit } = selectRequirementSignatures(signatures, {
          permit: true,
        });
        return vaultV2InKindRedeem({
          vault: { chainId: this.chainId, address: this.vault },
          args: {
            adapter,
            amount,
            marketParamsList: marketParamsListSnapshot,
            userAddress,
            deadline,
            requirementSignature: permit,
          },
          metadata: this.client.options.metadata,
        });
      },
    };
  }

  /** {@inheritDoc VaultV2Actions.forceWithdraw} */
  forceWithdraw({
    exitAssets,
    vaultData,
    userAddress,
    adapter: adapterOverride,
    deadline: deadlineOverride,
    slippageTolerance = DEFAULT_SLIPPAGE_TOLERANCE,
    minSharePriceE27: minSharePriceE27Override,
    referralFeePct = 0n,
    referralFeeRecipient,
  }: {
    readonly exitAssets: bigint;
    readonly vaultData: AccrualVaultV2;
    readonly userAddress: Address;
    readonly adapter?: Address;
    readonly deadline?: bigint;
    readonly slippageTolerance?: bigint;
    readonly minSharePriceE27?: bigint;
    readonly referralFeePct?: bigint;
    readonly referralFeeRecipient?: Address;
  }): ActionOutput<
    VaultV2ForceWithdrawAction,
    readonly RequirementSignature[],
    undefined
  > {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    if (!isAddressEqual(vaultData.address, this.vault)) {
      throw new VaultAddressMismatchError(this.vault, vaultData.address);
    }
    if (exitAssets <= 0n)
      throw new NonPositiveInputError("exitAssets", exitAssets);
    validateUint256Field("exitAssets", exitAssets);
    validateSlippageTolerance(slippageTolerance);
    // Called for its throws only: the raw pair is forwarded to the action, which normalizes it
    // again on the encode path so a direct action caller gets the same guarantees.
    validateReferralFee({ referralFeePct, referralFeeRecipient });
    if (minSharePriceE27Override != null) {
      // An unbounded override reopens the exact hole this path closes: the contract reads
      // `minSharePriceE27 == 0` as "no bound".
      if (minSharePriceE27Override <= 0n) {
        throw new NonPositiveInputError(
          "minSharePriceE27",
          minSharePriceE27Override,
        );
      }
      // And an override the uint256 slot cannot hold must fail here rather than after
      // `getRequirements()` has already asked for an approval or a permit signature.
      validateUint256Field("minSharePriceE27", minSharePriceE27Override);
    }

    const now = Time.timestamp();
    const deadline = deadlineOverride ?? now + Time.s.from.h(2n);
    // Reject the same bounds the action enforces, before `getRequirements()` can walk the caller
    // through a vault-share approval or an EIP-712 permit for a deadline `buildTx()` cannot encode.
    validateDeadline(deadline);
    if (deadline <= now) throw new ExpiredDeadlineError(deadline, now);
    const maxDeadline = now + VAULT_V2_FEE_PROJECTION_HORIZON;
    if (deadline > maxDeadline) {
      throw new InputExceedsMaxError({
        field: "deadline",
        value: deadline,
        max: maxDeadline,
      });
    }

    const eligibility = resolveVaultV2ForceWithdrawEligibility(
      vaultData,
      adapterOverride,
    );
    switch (eligibility.type) {
      case "eligible":
        break;
      case "adapterCount":
        throw new VaultV2SingleAdapterRequiredError(
          this.vault,
          eligibility.adapters,
        );
      case "adapterMismatch":
        throw new AdapterNotPartOfVaultError(this.vault, eligibility.adapter);
      case "unsupportedAdapter":
        throw new VaultV2UnsupportedExitAdapterError(eligibility.adapter);
      case "unsupportedLiquidityAdapter":
        throw new VaultV2UnsupportedLiquidityAdapterError({
          vault: this.vault,
          liquidityAdapter: eligibility.liquidityAdapter,
          adapter: eligibility.adapter,
        });
      case "undecodableLiquidityData":
        throw new VaultV2UndecodableLiquidityDataError({
          vault: this.vault,
          liquidityAdapter: eligibility.liquidityAdapter,
          liquidityData: eligibility.liquidityData,
          cause: eligibility.cause,
        });
    }

    const { adapter: accrualAdapter, liquidityMarketId } = eligibility;
    const adapter = accrualAdapter.address;
    const plan = computeVaultV2ForceWithdrawPlan({
      vaultData,
      adapter: accrualAdapter,
      liquidityMarketId,
      exitAssets,
      timestamp: now,
    });

    if (plan.withdrawnAssets <= 0n) {
      throw new VaultV2ForceWithdrawZeroWithdrawalError({
        vault: this.vault,
        exitAssets,
        penalty: plan.penalty,
      });
    }
    // The contract's force-deallocation loop is unbounded: under-coverage panics on-chain.
    if (plan.coveredAssets < plan.assetsToDeallocate) {
      throw new VaultV2ForceWithdrawCoverageError({
        required: plan.assetsToDeallocate,
        covered: plan.coveredAssets,
        maxExitAssets: plan.maxExitAssets,
      });
    }

    const projectionTimestamp = deadline;
    // VaultExitBundlesV1 measures shares as `sharesBefore - balanceAfter`; its first withdrawal
    // accrues the vault before burning. Use the `now` accrual for the floor and the projected
    // deadline accrual for the fee-mint guard.
    const { vault: nowVaultData } = vaultData.accrueInterest(
      MathLib.max(now, vaultData.lastUpdate),
    );
    const { vault: projectedVaultData } = vaultData.accrueInterest(
      MathLib.max(projectionTimestamp, vaultData.lastUpdate),
    );
    const sharesBurntNow = computeVaultV2ForceWithdrawSharesBurnt({
      vaultData: nowVaultData,
      deadlineVaultData: nowVaultData,
      plan,
    });
    const feeSharesNow = computeVaultV2ForceWithdrawFeeSharesMinted({
      vaultData,
      owner: userAddress,
      timestamp: now,
    });
    const feeSharesProjected = computeVaultV2ForceWithdrawFeeSharesMinted({
      vaultData,
      owner: userAddress,
      timestamp: projectionTimestamp,
    });
    const minSharesBurntProjected = computeVaultV2ForceWithdrawMinSharesBurnt({
      vaultData: projectedVaultData,
      plan,
    });
    // Mints only grow and the burn only shrinks until inclusion, so the projected pair bounds
    // every execution time in the window.
    if (feeSharesProjected >= minSharesBurntProjected) {
      throw new VaultV2ForceWithdrawFeeSharesExceedBurnError({
        vault: this.vault,
        userAddress,
        sharesBurnt: minSharesBurntProjected,
        feeShares: feeSharesProjected,
      });
    }
    // sharesBurntNow ≥ minSharesBurntNow ≥ minSharesBurntProjected > feeSharesProjected ≥ feeSharesNow
    const netSharesBurntNow = sharesBurntNow - feeSharesNow;
    const minSharePriceE27 =
      minSharePriceE27Override ??
      computeMinForceWithdrawSharePrice({
        withdrawnAssets: plan.withdrawnAssets,
        sharesBurnt: netSharesBurntNow,
        slippageTolerance,
      });
    // The floor is deliberately *not* capped at `MAX_ABSOLUTE_SHARE_PRICE` (100 assets/share):
    // lowering a lower bound weakens it, so any vault whose share price grew past that would be left
    // with no real protection. Its two sibling `computeMin*SharePrice` helpers cap nothing either —
    // only the `computeMax*` ones do, where capping relaxes an upper bound and is safe.
    //
    // It still has to fit the ABI slot though. Defense-in-depth rather than a reachable input error:
    // with `exitAssets` bounded above, the derived floor only exceeds `uint256` on a vault whose
    // share price passed ~1e50 assets/share, which no fixture here can construct.
    validateUint256Field("minSharePriceE27", minSharePriceE27);
    // VaultExitBundlesV1's burn bound includes fee shares minted by the first withdrawal. Add the
    // projected fee shares to the price-floor ceiling so the approval covers that mint.
    // Saturated at `maxUint256`: a tiny accepted floor scales this above the ABI slot, and the
    // approval encoder clamps what it emits — so an uncapped requirement would sit permanently above
    // any allowance the user can actually grant and `getRequirements()` would return the same
    // approval forever. No account can hold or burn more shares than that anyway.
    const requiredShareAllowance = MathLib.min(
      MathLib.mulDivUp(exitAssets, MathLib.RAY, minSharePriceE27) +
        feeSharesProjected,
      maxUint256,
    );

    const vaultExitBundlesV1 = getChainAddress(
      this.chainId,
      "bundles.vaultExitBundlesV1",
    );
    let expectedRequirement: PermitAction | undefined;

    return {
      getRequirements: async (): Promise<readonly ActionRequirement[]> => {
        const requirementsTimestamp = Time.timestamp();
        if (deadline <= requirementsTimestamp) {
          throw new ExpiredDeadlineError(deadline, requirementsTimestamp);
        }
        // Vault gates are intentionally left to the final transaction: the receive-assets gate may
        // inspect VaultExitBundlesV1's transient `initiator`, and a send-shares gate is arbitrary
        // external code re-evaluated after each intermediate penalty burn, so neither is
        // execution-equivalent from a standalone read. Unlike in-kind redemption, this exit never
        // supplies into Morpho Blue, so no Blue token-balance check is needed.
        const [allowance, nonce] = await multicall(this.client.viemClient, {
          allowFailure: false,
          contracts: [
            {
              address: this.vault,
              abi: erc20Abi,
              functionName: "allowance",
              args: [userAddress, vaultExitBundlesV1],
            },
            {
              address: this.vault,
              abi: erc2612Abi,
              functionName: "nonces",
              args: [userAddress],
            },
          ],
        });

        if (allowance >= requiredShareAllowance) return [];
        if (this.client.options.supportSignature) {
          const requirement = encodeVaultSharesPermit({
            vault: vaultData,
            version: "vaultV2",
            spender: vaultExitBundlesV1,
            owner: userAddress,
            chainId: this.chainId,
            nonce,
            amount: requiredShareAllowance,
            deadline,
          });
          if (
            isRequirementSignature(requirement) &&
            requirement.action.type === "permit"
          ) {
            expectedRequirement = requirement.action;
          }
          return [requirement];
        }
        return [
          encodeErc20Approval({
            token: this.vault,
            spender: vaultExitBundlesV1,
            amount: requiredShareAllowance,
            chainId: this.chainId,
          }),
        ];
      },
      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const permit = selectBundlesSharesRequirementSignature(signatures, {
          requiredShareAllowance,
          expectedRequirement,
        });
        return vaultV2ForceWithdraw({
          vault: { chainId: this.chainId, address: this.vault },
          args: {
            adapter,
            exitAssets,
            minSharePriceE27,
            userAddress,
            deadline,
            referralFeePct,
            referralFeeRecipient,
            requirementSignature: permit,
          },
          metadata: this.client.options.metadata,
        });
      },
    };
  }

  forceRedeem({
    deallocations,
    redeem,
    userAddress,
  }: {
    deallocations: readonly Deallocation[];
    redeem: { shares: bigint };
    userAddress: Address;
  }) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);

    return {
      buildTx: () =>
        vaultV2ForceRedeem({
          vault: { address: this.vault },
          args: {
            deallocations,
            redeem: {
              shares: redeem.shares,
              recipient: userAddress,
            },
            onBehalf: userAddress,
          },
          metadata: this.client.options.metadata,
        }),
    };
  }
}
