import {
  type AccrualVault,
  type AccrualVaultV2,
  DEFAULT_SLIPPAGE_TOLERANCE,
  getChainAddresses,
  type MarketParams,
  MarketUtils,
  MathLib,
} from "@morpho-org/blue-sdk";
import {
  blueAbi,
  erc2612Abi,
  fetchAccrualVault,
  metaMorphoAbi,
} from "@morpho-org/blue-sdk-viem";
import { getChainAddress, Time } from "@morpho-org/morpho-ts";
import { type Address, erc20Abi, isAddressEqual } from "viem";
import { multicall } from "viem/actions";
import {
  getBundlesReferralFeeAssets,
  normalizeBundlesCommonParams,
  resolveBundlesFunding,
  selectBundlesSharesRequirementSignature,
  selectBundlesTokenRequirementSignature,
} from "../../actions/bundles/index.js";
import {
  encodeErc20Approval,
  encodeVaultSharesPermit,
  vaultV1Deposit,
  vaultV1InKindRedeem,
  vaultV1MigrateToV2,
  vaultV1Redeem,
  vaultV1Withdraw,
} from "../../actions/index.js";
import {
  computeVaultMaxShareAllowance,
  computeVaultMaxSharePrice,
  validateChainId,
  validateSlippageTolerance,
} from "../../helpers/index.js";
import { validateNativeVaultAsset } from "../../helpers/validate.js";
import type { FetchParameters } from "../../types/data.js";
import {
  type ActionOutput,
  type ActionRequirement,
  AmountAndSharesExclusiveError,
  type BundlesFundingArgs,
  type BundlesTokenRequirementsOptions,
  ChainIdMismatchError,
  EmptyMarketParamsListError,
  ExpiredDeadlineError,
  InKindRedeemCoverageError,
  InsufficientBlueBalanceForInKindRedeemError,
  isRequirementSignature,
  type MorphoClientType,
  NonPositiveInputError,
  type Permit2SignatureTransferAction,
  type PermitAction,
  type RequirementSignature,
  SameVaultMigrationError,
  selectRequirementSignatures,
  VaultAddressMismatchError,
  VaultAssetMismatchError,
  VaultIsBlueFeeRecipientError,
  VaultMorphoMismatchError,
  type VaultV1DepositAction,
  type VaultV1InKindRedeemAction,
  type VaultV1MigrateToV2Action,
  type VaultV1MigrateToV2AmountArgs,
  type VaultV1RedeemAction,
  type VaultV1WithdrawAction,
} from "../../types/index.js";
import { getVaultBundlesSharesRequirements } from "../requirements/getVaultBundlesSharesRequirements.js";
import { getBundlesTokenRequirements } from "../requirements/index.js";

export interface VaultV1Actions {
  /**
   * Fetches the latest vault data with accrued interest.
   *
   * @param {FetchParameters} [parameters] - Optional fetch parameters (block number, state overrides, etc.).
   * @returns {Promise<Awaited<ReturnType<typeof fetchAccrualVault>>>} The latest vault data.
   */
  getData: (
    parameters?: FetchParameters,
  ) => Promise<Awaited<ReturnType<typeof fetchAccrualVault>>>;
  /**
   * Prepares a Vault V1 deposit through the registered VaultBundlesV1 contract.
   *
   * Uses the supplied vault snapshot to compute the deadline-accrued `maxSharePrice`.
   * `getRequirements()` reads the asset allowance and, when enabled, the selected ERC-2612 or
   * Permit2 nonce state. Native funding is exclusive and skips token requirements. Shares are
   * always minted to the transaction sender, which must be `userAddress`.
   *
   * @param params.userAddress - Account that funds, signs, submits, and receives the vault shares.
   * @param params.vaultData - Pre-fetched Vault V1 snapshot used for asset and share conversion.
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
   * @throws {InputExceedsMaxError} from `getRequirements()` when the Permit2 nonce exceeds uint256.
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
    } & BundlesFundingArgs,
  ) => ActionOutput<
    VaultV1DepositAction,
    readonly RequirementSignature[],
    BundlesTokenRequirementsOptions
  >;
  /**
   * Prepares a withdraw from a VaultV1 (MetaMorpho) contract.
   *
   * @param {Object} params - The withdraw parameters.
   * @param {bigint} params.amount - Amount of assets to withdraw.
   * @param {Address} params.userAddress - Account that must sign and submit the transaction; VaultBundlesV1 burns `msg.sender`'s shares and pays `msg.sender`.
   * @param {bigint} [params.slippageTolerance=DEFAULT_SLIPPAGE_TOLERANCE] - Headroom applied to the computed share-burn allowance cap (default 0.03%, max 10%).
   * @param {bigint} [params.referralFeePct=0n] - WAD-scaled referral fee deducted from the withdrawn assets.
   * @param {Address} [params.referralFeeRecipient] - Non-zero recipient required when `referralFeePct` is positive.
   * @param {bigint} [params.deadline] - VaultBundlesV1 execution deadline; defaults to two hours from now.
   * @returns Lazy exact share-allowance requirements and a synchronous transaction builder.
   * @throws {ExpiredDeadlineError} when `deadline` is not in the future at handle creation or
   *   at any `getRequirements()` call, including calls served from the cached requirement set.
   */
  withdraw: (params: {
    readonly amount: bigint;
    readonly userAddress: Address;
    readonly slippageTolerance?: bigint;
    readonly referralFeePct?: bigint;
    readonly referralFeeRecipient?: Address;
    readonly deadline?: bigint;
  }) => ActionOutput<
    VaultV1WithdrawAction,
    readonly RequirementSignature[],
    undefined
  >;
  /**
   * Prepares an exact-shares Vault V1 redemption through VaultBundlesV1.
   *
   * The caller must satisfy the exact vault-share allowance returned by `getRequirements()` before
   * `buildTx()`; the requirement is resolved once and re-checked against the deadline on every call.
   *
   * @param params.shares - Exact vault shares to burn.
   * @param params.userAddress - Account that signs and submits the transaction; VaultBundlesV1
   *   burns and pays `msg.sender`.
   * @param params.referralFeePct - Optional WAD-scaled referral fee below 100%, deducted from the
   *   redeemed assets.
   * @param params.referralFeeRecipient - Optional non-zero recipient required for a positive fee.
   * @param params.deadline - Optional execution and share-permit deadline in Unix seconds; defaults
   *   to two hours from handle creation.
   * @returns Lazy exact share-allowance requirements and a synchronous transaction builder.
   * @throws {ChainIdMismatchError} when the connected client targets another chain.
   * @throws {NonPositiveInputError} when `shares` is not positive.
   * @throws {ExpiredDeadlineError} when the deadline is stale at creation or requirement resolution.
   * @throws {NegativeInputError} when `referralFeePct` is negative.
   * @throws {ReferralFeePctExceededError} when `referralFeePct` is at least WAD.
   * @throws {ReferralFeeRecipientMissingError} when a positive fee has no non-zero recipient.
   * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
   * @throws {UnknownAddressError} when VaultBundlesV1 is not registered.
   * @throws {viem.BaseError} from `getRequirements()` when an allowance or permit-nonce read fails.
   * @throws {AmbiguousRequirementSignaturesError} from `buildTx()` when multiple permit signatures are supplied.
   * @throws {UnexpectedRequirementSignatureError} from `buildTx()` when a non-permit signature is supplied.
   * @throws {BundlesPermitMismatchError} from `buildTx()` when the supplied permit does not match
   *   the resolved share amount, spender, owner, nonce, or deadline.
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
  redeem: (params: {
    readonly shares: bigint;
    readonly userAddress: Address;
    readonly referralFeePct?: bigint;
    readonly referralFeeRecipient?: Address;
    readonly deadline?: bigint;
  }) => ActionOutput<
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
   * `previewRedeem(sharesHeld)`. The share allowance first accrues pending performance-fee shares,
   * then uses the current rounded-up share preview; future interest can only reduce the required
   * burn.
   *
   * Snapshot state can drift before inclusion, so a later reallocation may still make the on-chain
   * loop under-cover even after pre-flight succeeds.
   *
   * @param params - In-kind redemption parameters.
   * @param params.amount - Asset-denominated amount to exit.
   * @param params.marketParamsList - Ordered vault markets consumed greedily by the contract;
   *   repeated entries cannot draw from the same vault position twice.
   * @param params.vaultData - Pre-fetched Vault V1 accrual snapshot.
   * @param params.userAddress - Account that signs and submits the exit.
   * @param params.deadline - Optional shared permit/bundle deadline; defaults to two hours from now.
   * @returns Lazy prerequisite resolution and a synchronous transaction builder.
   * @throws {ChainIdMismatchError} when the client and entity target different chains.
   * @throws {VaultAddressMismatchError} when `vaultData` belongs to another vault.
   * @throws {NonPositiveInputError} when `amount` is not positive.
   * @throws {EmptyMarketParamsListError} when the market list is empty.
   * @throws {ExpiredDeadlineError} when `deadline` is not in the future at handle creation or
   *   requirement resolution.
   * @throws {InKindRedeemCoverageError} when the ordered list cannot cover `amount` without
   *   assigning more than the vault owns in a repeated market.
   * @throws {UnsupportedChainIdError} when no address registry exists for the target chain.
   * @throws {UnknownAddressError} when VaultExitBundlesV1 is not registered on the target chain.
   * @throws {viem.BaseError} from `getRequirements()` when an RPC or multicall contract read fails.
   * @throws {VaultMorphoMismatchError} from `getRequirements()` when the vault uses another Morpho deployment.
   * @throws {VaultIsBlueFeeRecipientError} from `getRequirements()` when Morpho Blue accrues protocol fees to the vault.
   * @throws {InsufficientBlueBalanceForInKindRedeemError} from `getRequirements()` when Blue cannot fund the flash loan.
   * @throws {AmbiguousRequirementSignaturesError} from `buildTx()` when more than one permit signature is supplied.
   * @throws {UnexpectedRequirementSignatureError} from `buildTx()` when a non-permit signature is supplied.
   * @throws {VaultExitBundlesV1PermitMismatchError} from `buildTx()` when the requirement has the wrong permit kind, asset, or signature encoding.
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
  readonly inKindRedeem: (params: {
    readonly amount: bigint;
    readonly marketParamsList: readonly MarketParams[];
    readonly vaultData: AccrualVault;
    readonly userAddress: Address;
    readonly deadline?: bigint;
  }) => ActionOutput<
    VaultV1InKindRedeemAction,
    readonly RequirementSignature[],
    undefined
  >;
  /**
   * Prepares a Vault V1-to-Vault V2 migration through VaultBundlesV1.
   *
   * Exits V1 by assets or shares and atomically deposits the resulting assets into V2 through
   * VaultBundlesV1. Only the destination deposit has an onchain share-price bound. The caller must
   * satisfy the exact source-vault share requirement before building the transaction.
   *
   * @param params.userAddress - Account that signs and submits the transaction; VaultBundlesV1
   *   burns and mints shares for `msg.sender`.
   * @param params.sourceVault - Pre-fetched Vault V1 snapshot used for source conversion and the
   *   share-authorization cap.
   * @param params.targetVault - Pre-fetched Vault V2 snapshot used for the destination share-price
   *   bound.
   * @param params.shares - Optional exact Vault V1 shares to migrate; exclusive with `assets`.
   * @param params.assets - Optional exact Vault V1 assets to withdraw and migrate; exclusive with
   *   `shares`.
   * @param params.slippageTolerance - Optional WAD-scaled tolerance applied to an assets-mode share
   *   cap and the destination bound; defaults to 0.03% and cannot exceed 10%.
   * @param params.referralFeePct - Optional WAD-scaled referral fee below 100%, deducted from the
   *   source-vault proceeds.
   * @param params.referralFeeRecipient - Optional non-zero recipient required for a positive fee.
   * @param params.deadline - Optional execution and share-permit deadline in Unix seconds; defaults
   *   to two hours from handle creation.
   * @returns Lazy exact source-share requirements and a synchronous transaction builder.
   * @throws {ChainIdMismatchError} when the connected client targets another chain.
   * @throws {VaultAddressMismatchError} when `sourceVault` belongs to another vault.
   * @throws {VaultAssetMismatchError} when the source and destination vault assets differ.
   * @throws {SameVaultMigrationError} when the source and destination vault addresses are equal.
   * @throws {AmountAndSharesExclusiveError} when both amount modes or neither are supplied.
   * @throws {NonPositiveInputError} when the selected amount or a computed share value is not positive.
   * @throws {NegativeInputError} when slippage tolerance or `referralFeePct` is negative.
   * @throws {ExcessiveSlippageToleranceError} when slippage tolerance exceeds the SDK maximum.
   * @throws {ExpiredDeadlineError} when the deadline is stale at creation or requirement resolution.
   * @throws {ReferralFeePctExceededError} when `referralFeePct` is at least WAD.
   * @throws {ReferralFeeRecipientMissingError} when a positive fee has no non-zero recipient.
   * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
   * @throws {UnknownAddressError} when VaultBundlesV1 is not registered.
   * @throws {viem.BaseError} from `getRequirements()` when an allowance or permit-nonce read fails.
   * @throws {AmbiguousRequirementSignaturesError} from `buildTx()` when multiple permit signatures are supplied.
   * @throws {UnexpectedRequirementSignatureError} from `buildTx()` when a non-permit signature is supplied.
   * @throws {BundlesPermitMismatchError} from `buildTx()` when the supplied permit does not match
   *   the prepared source share cap, spender, owner, nonce, or deadline.
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
    } & VaultV1MigrateToV2AmountArgs,
  ) => ActionOutput<
    VaultV1MigrateToV2Action,
    readonly RequirementSignature[],
    undefined
  >;
}

export class MorphoVaultV1 implements VaultV1Actions {
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  constructor(
    private readonly client: MorphoClientType,
    private readonly vault: Address,
    private readonly chainId: number,
  ) {}

  private getBundlesDeadline(deadlineOverride?: bigint): bigint {
    const now = Time.timestamp();
    const deadline = deadlineOverride ?? now + Time.s.from.h(2n);
    if (deadline <= now) throw new ExpiredDeadlineError(deadline, now);
    return deadline;
  }

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

    return fetchAccrualVault(this.vault, this.client.viemClient, {
      ...parameters,
      chainId: this.chainId,
      deployless: this.client.options.supportDeployless,
    });
  }

  /** {@inheritDoc VaultV1Actions.deposit} */
  deposit(
    params: {
      readonly userAddress: Address;
      readonly vaultData: AccrualVault;
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
    const deadline = this.getBundlesDeadline(params.deadline);
    const common = normalizeBundlesCommonParams({
      deadline,
      referralFeePct: params.referralFeePct,
      referralFeeRecipient: params.referralFeeRecipient,
    });
    const funding = resolveBundlesFunding(params);
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
    let resolvedRequirements: Promise<readonly ActionRequirement[]> | undefined;
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
        if (resolvedRequirements != null) return await resolvedRequirements;
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
          if (
            signatureRequirement?.action.type === "permit" ||
            signatureRequirement?.action.type === "permit2SignatureTransfer"
          ) {
            expectedRequirement = signatureRequirement.action;
          }
          return requirements;
        })();
        resolvedRequirements = pending;
        try {
          return await pending;
        } catch (error) {
          // Drop the failed attempt so a caller can retry resolution.
          if (resolvedRequirements === pending)
            resolvedRequirements = undefined;
          throw error;
        }
      },
      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const requirementSignature = selectBundlesTokenRequirementSignature(
          signatures,
          expectedRequirement,
        );
        return vaultV1Deposit({
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
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    if (params.amount <= 0n)
      throw new NonPositiveInputError("amount", params.amount);
    const deadline = this.getBundlesDeadline(params.deadline);
    const common = normalizeBundlesCommonParams({
      deadline,
      referralFeePct: params.referralFeePct,
      referralFeeRecipient: params.referralFeeRecipient,
    });
    const slippageTolerance =
      params.slippageTolerance ?? DEFAULT_SLIPPAGE_TOLERANCE;
    validateSlippageTolerance(slippageTolerance);
    getChainAddress(this.chainId, "bundles.vaultBundlesV1");
    let requiredShareAllowance: bigint | undefined;
    let resolvedRequirements: readonly ActionRequirement[] | undefined;
    let expectedRequirement: PermitAction | undefined;
    return Object.freeze({
      getRequirements: async () => {
        const now = Time.timestamp();
        if (deadline <= now) throw new ExpiredDeadlineError(deadline, now);
        if (resolvedRequirements != null) return resolvedRequirements;
        const vaultData = await this.getData();
        requiredShareAllowance ??= computeVaultMaxShareAllowance({
          vaultData,
          deadline,
          assets: params.amount,
          slippageTolerance,
        });
        const requirements = await getVaultBundlesSharesRequirements(
          this.client.viemClient,
          {
            vaultData,
            version: "vaultV1",
            owner: params.userAddress,
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
        resolvedRequirements = requirements;
        return resolvedRequirements;
      },
      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const permit = selectBundlesSharesRequirementSignature(signatures, {
          requiredShareAllowance,
          expectedRequirement,
        });
        return vaultV1Withdraw({
          vault: { chainId: this.chainId, address: this.vault },
          args: {
            amount: params.amount,
            userAddress: params.userAddress,
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

  redeem(params: {
    readonly shares: bigint;
    readonly userAddress: Address;
    readonly referralFeePct?: bigint;
    readonly referralFeeRecipient?: Address;
    readonly deadline?: bigint;
  }) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    if (params.shares <= 0n)
      throw new NonPositiveInputError("shares", params.shares);
    const deadline = this.getBundlesDeadline(params.deadline);
    const common = normalizeBundlesCommonParams({
      deadline,
      referralFeePct: params.referralFeePct,
      referralFeeRecipient: params.referralFeeRecipient,
    });
    getChainAddress(this.chainId, "bundles.vaultBundlesV1");
    let resolvedRequirements: readonly ActionRequirement[] | undefined;
    let expectedRequirement: PermitAction | undefined;
    return Object.freeze({
      getRequirements: async () => {
        const now = Time.timestamp();
        if (deadline <= now) throw new ExpiredDeadlineError(deadline, now);
        if (resolvedRequirements != null) return resolvedRequirements;
        const requirements = await getVaultBundlesSharesRequirements(
          this.client.viemClient,
          {
            vaultData: await this.getData(),
            version: "vaultV1",
            owner: params.userAddress,
            chainId: this.chainId,
            requiredShareAllowance: params.shares,
            deadline,
            supportSignature: this.client.options.supportSignature,
          },
        );
        const signatureRequirement = requirements.find(isRequirementSignature);
        if (signatureRequirement?.action.type === "permit") {
          expectedRequirement = signatureRequirement.action;
        }
        resolvedRequirements = requirements;
        return resolvedRequirements;
      },
      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const permit = selectBundlesSharesRequirementSignature(signatures, {
          requiredShareAllowance: params.shares,
          expectedRequirement,
        });
        return vaultV1Redeem({
          vault: { chainId: this.chainId, address: this.vault },
          args: {
            shares: params.shares,
            userAddress: params.userAddress,
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

  /** {@inheritDoc VaultV1Actions.inKindRedeem} */
  inKindRedeem({
    amount,
    marketParamsList,
    vaultData,
    userAddress,
    deadline: deadlineOverride,
  }: {
    readonly amount: bigint;
    readonly marketParamsList: readonly MarketParams[];
    readonly vaultData: AccrualVault;
    readonly userAddress: Address;
    readonly deadline?: bigint;
  }): ActionOutput<
    VaultV1InKindRedeemAction,
    readonly RequirementSignature[],
    undefined
  > {
    if (this.client.viemClient.chain?.id !== this.chainId) {
      throw new ChainIdMismatchError(
        this.client.viemClient.chain?.id,
        this.chainId,
      );
    }
    if (!isAddressEqual(vaultData.address, this.vault)) {
      throw new VaultAddressMismatchError(this.vault, vaultData.address);
    }
    if (amount <= 0n) throw new NonPositiveInputError("amount", amount);
    if (marketParamsList.length === 0) throw new EmptyMarketParamsListError();
    const marketParamsListSnapshot = marketParamsList.map(
      ({ loanToken, collateralToken, oracle, irm, lltv }) => ({
        loanToken,
        collateralToken,
        oracle,
        irm,
        lltv,
      }),
    );

    const now = Time.timestamp();
    const deadline = deadlineOverride ?? now + Time.s.from.h(2n);
    if (deadline <= now) throw new ExpiredDeadlineError(deadline, now);

    const vaultExitBundlesV1 = getChainAddress(
      this.chainId,
      "bundles.vaultExitBundlesV1",
    );
    const addresses = getChainAddresses(this.chainId);
    const blue = addresses.blue ?? addresses.morpho;
    let covered = 0n;
    const assignedByMarket = new Map<string, bigint>();
    for (const marketParams of marketParamsListSnapshot) {
      if (covered === amount) break;
      const marketId = MarketUtils.getMarketId(marketParams);
      const allocation = vaultData.allocations.get(marketId);
      if (allocation?.config.enabled !== true) continue;

      const market = allocation.position.market.accrueInterest(now);
      const available = market.toSupplyAssets(allocation.position.supplyShares);
      const assigned = assignedByMarket.get(marketId) ?? 0n;
      const chunk = MathLib.min(available, amount - covered);
      if (assigned + chunk > available) {
        throw new InKindRedeemCoverageError({
          required: amount,
          covered,
          maxExitAssets: covered,
        });
      }
      assignedByMarket.set(marketId, assigned + chunk);
      covered += chunk;
    }
    if (covered < amount) {
      throw new InKindRedeemCoverageError({
        required: amount,
        covered,
        maxExitAssets: covered,
      });
    }

    const requiredShareAllowance = computeVaultMaxShareAllowance({
      vaultData,
      deadline: now,
      assets: amount,
      slippageTolerance: DEFAULT_SLIPPAGE_TOLERANCE,
    });

    return {
      getRequirements: async (): Promise<readonly ActionRequirement[]> => {
        const requirementsTimestamp = Time.timestamp();
        if (deadline <= requirementsTimestamp) {
          throw new ExpiredDeadlineError(deadline, requirementsTimestamp);
        }
        const [allowance, nonce, blueBalance, morpho, blueFeeRecipient] =
          await multicall(this.client.viemClient, {
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
              {
                address: this.vault,
                abi: metaMorphoAbi,
                functionName: "MORPHO",
              },
              {
                address: blue,
                abi: blueAbi,
                functionName: "feeRecipient",
              },
            ],
          });

        if (!isAddressEqual(morpho, blue)) {
          throw new VaultMorphoMismatchError({
            vault: this.vault,
            expected: blue,
            actual: morpho,
          });
        }
        // Reject this unsupported configuration before authorizing vault shares:
        // VaultExitBundlesV1 omits newly accrued Morpho fee shares when estimating the
        // vault position, so its callback can exhaust marketParamsList and panic on-chain.
        if (isAddressEqual(blueFeeRecipient, this.vault)) {
          throw new VaultIsBlueFeeRecipientError(this.vault, blue);
        }
        if (blueBalance < amount) {
          throw new InsufficientBlueBalanceForInKindRedeemError({
            asset: vaultData.asset,
            available: blueBalance,
            required: amount,
          });
        }
        if (allowance >= requiredShareAllowance) return [];
        if (this.client.options.supportSignature) {
          return [
            encodeVaultSharesPermit({
              vault: vaultData,
              version: "vaultV1",
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
        return vaultV1InKindRedeem({
          vault: { chainId: this.chainId, address: this.vault },
          args: {
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

  migrateToV2(
    params: {
      readonly userAddress: Address;
      readonly sourceVault: AccrualVault;
      readonly targetVault: AccrualVaultV2;
      readonly slippageTolerance?: bigint;
      readonly referralFeePct?: bigint;
      readonly referralFeeRecipient?: Address;
      readonly deadline?: bigint;
    } & VaultV1MigrateToV2AmountArgs,
  ) {
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
    const selectedAmount = assets ?? shares ?? 0n;
    if (selectedAmount <= 0n) {
      throw new NonPositiveInputError(
        assets != null ? "assets" : "shares",
        selectedAmount,
      );
    }
    const slippageTolerance =
      params.slippageTolerance ?? DEFAULT_SLIPPAGE_TOLERANCE;
    validateSlippageTolerance(slippageTolerance);
    const deadline = this.getBundlesDeadline(params.deadline);
    const common = normalizeBundlesCommonParams({
      deadline,
      referralFeePct: params.referralFeePct,
      referralFeeRecipient: params.referralFeeRecipient,
    });
    const grossAssets =
      assets ?? params.sourceVault.toAssets(shares ?? 0n, "Down");
    const referralFeeAssets = getBundlesReferralFeeAssets(
      grossAssets,
      common.referralFeePct,
    );
    const maxSharePriceVaultV2 = computeVaultMaxSharePrice({
      vaultData: params.targetVault,
      deadline,
      assets: grossAssets - referralFeeAssets,
      slippageTolerance,
    });
    const requiredShareAllowance =
      shares ??
      computeVaultMaxShareAllowance({
        vaultData: params.sourceVault,
        deadline,
        assets: assets ?? 0n,
        slippageTolerance,
      });
    getChainAddress(this.chainId, "bundles.vaultBundlesV1");
    let resolvedRequirements: readonly ActionRequirement[] | undefined;
    let expectedRequirement: PermitAction | undefined;
    return Object.freeze({
      getRequirements: async () => {
        const now = Time.timestamp();
        if (deadline <= now) throw new ExpiredDeadlineError(deadline, now);
        if (resolvedRequirements != null) return resolvedRequirements;
        const requirements = await getVaultBundlesSharesRequirements(
          this.client.viemClient,
          {
            vaultData: params.sourceVault,
            version: "vaultV1",
            owner: params.userAddress,
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
        resolvedRequirements = requirements;
        return resolvedRequirements;
      },
      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const permit = selectBundlesSharesRequirementSignature(signatures, {
          requiredShareAllowance,
          expectedRequirement,
        });
        return vaultV1MigrateToV2({
          vault: {
            chainId: this.chainId,
            address: this.vault,
            asset: params.sourceVault.asset,
          },
          args: {
            targetVault: params.targetVault.address,
            targetAsset: params.targetVault.asset,
            ...(assets != null ? { assets } : { shares: shares ?? 0n }),
            maxSharePriceVaultV2,
            userAddress: params.userAddress,
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
}
