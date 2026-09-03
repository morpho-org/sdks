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
  vaultV2Deposit,
  vaultV2ForceRedeem,
  vaultV2ForceWithdraw,
  vaultV2InKindRedeem,
  vaultV2Redeem,
  vaultV2Withdraw,
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
  AdapterNotPartOfVaultError,
  type BundlesFundingArgs,
  type BundlesTokenRequirementsOptions,
  ChainIdMismatchError,
  type Deallocation,
  EmptyMarketParamsListError,
  ExpiredDeadlineError,
  InKindRedeemCoverageError,
  InKindRedeemRequiresSingleAdapterError,
  InKindRedeemZeroDeallocationError,
  InsufficientBlueBalanceForInKindRedeemError,
  isRequirementSignature,
  type MorphoClientType,
  NonPositiveInputError,
  type Permit2SignatureTransferAction,
  type PermitAction,
  type RequirementSignature,
  selectRequirementSignatures,
  type Transaction,
  UnsupportedInKindAdapterError,
  VaultAddressMismatchError,
  type VaultV2DepositAction,
  type VaultV2ForceRedeemAction,
  type VaultV2ForceWithdrawAction,
  type VaultV2InKindRedeemAction,
  type VaultV2RedeemAction,
  type VaultV2WithdrawAction,
} from "../../types/index.js";
import { getVaultBundlesSharesRequirements } from "../requirements/getVaultBundlesSharesRequirements.js";
import { getBundlesTokenRequirements } from "../requirements/index.js";

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
   * Prepares a withdraw transaction for the VaultV2 contract.
   *
   * This function constructs the transaction data required to withdraw a specified amount of assets from the vault.
   *
   * @param {Object} params - The withdraw parameters.
   * @param {bigint} params.amount - The amount of assets to withdraw.
   * @param {Address} params.userAddress - Account that must sign and submit the transaction; VaultBundlesV1 burns `msg.sender`'s shares and pays `msg.sender`.
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
    VaultV2WithdrawAction,
    readonly RequirementSignature[],
    undefined
  >;
  /**
   * Prepares a redeem transaction for the VaultV2 contract.
   *
   * This function constructs the transaction data required to redeem a specified amount of shares from the vault.
   *
   * @param {Object} params - The redeem parameters.
   * @param {bigint} params.shares - The amount of shares to redeem.
   * @param {Address} params.userAddress - User address initiating the redeem.
   * @returns {Object} The result object.
   * @returns {Readonly<Transaction<VaultV2RedeemAction>>} returns.tx The prepared redeem transaction.
   */
  redeem: (params: { shares: bigint; userAddress: Address }) => {
    buildTx: () => Readonly<Transaction<VaultV2RedeemAction>>;
  };
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
   * @throws {NonPositiveInputError} when `amount` is not positive.
   * @throws {InKindRedeemZeroDeallocationError} when the vault has no idle assets and the
   *   penalty-adjusted amount rounds to zero deallocated assets.
   * @throws {EmptyMarketParamsListError} when assets must be deallocated and the market list is empty.
   * @throws {ExpiredDeadlineError} when `deadline` is not in the future at handle creation or
   *   requirement resolution.
   * @throws {InKindRedeemRequiresSingleAdapterError} when the vault does not have one adapter.
   * @throws {AdapterNotPartOfVaultError} when `adapter` is not the vault's adapter.
   * @throws {UnsupportedInKindAdapterError} when the adapter is not a MorphoMarketV1AdapterV2.
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
   * Prepares a force withdraw transaction for the VaultV2 contract using the vault's native multicall.
   *
   * This function encodes one or more on-chain forceDeallocate calls followed by a single withdraw,
   * executed atomically via VaultV2's multicall. This allows a user to free liquidity from multiple
   * illiquid markets and withdraw the resulting assets in one transaction.
   *
   * @param {Object} params - The force withdraw parameters.
   * @param {readonly Deallocation[]} params.deallocations - The typed list of deallocations to perform.
   * @param {Object} params.withdraw - The withdraw parameters applied after deallocations.
   * @param {bigint} params.withdraw.amount - The amount of assets to withdraw.
   * @param {Address} params.userAddress - User address (penalty source and withdraw recipient).
   * @returns {Object} The result object.
   * @returns {Readonly<Transaction<VaultV2ForceWithdrawAction>>} returns.buildTx The prepared multicall transaction.
   */
  forceWithdraw: (params: {
    deallocations: readonly Deallocation[];
    withdraw: { amount: bigint };
    userAddress: Address;
  }) => {
    buildTx: () => Readonly<Transaction<VaultV2ForceWithdrawAction>>;
  };
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
            version: "vaultV2",
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
        return vaultV2Withdraw({
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

  redeem({ shares, userAddress }: { shares: bigint; userAddress: Address }) {
    if (this.client.viemClient.chain?.id !== this.chainId) {
      throw new ChainIdMismatchError(
        this.client.viemClient.chain?.id,
        this.chainId,
      );
    }

    return {
      buildTx: () =>
        vaultV2Redeem({
          vault: { address: this.vault },
          args: {
            shares,
            recipient: userAddress,
            onBehalf: userAddress,
          },
          metadata: this.client.options.metadata,
        }),
    };
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
    if (deadline <= now) throw new ExpiredDeadlineError(deadline, now);
    if (vaultData.accrualAdapters.length !== 1) {
      throw new InKindRedeemRequiresSingleAdapterError(
        this.vault,
        vaultData.accrualAdapters.length,
      );
    }

    const soleAdapter = vaultData.accrualAdapters[0];
    if (soleAdapter == null) {
      throw new InKindRedeemRequiresSingleAdapterError(this.vault, 0);
    }
    const adapter = adapterOverride ?? soleAdapter.address;
    if (!isAddressEqual(adapter, soleAdapter.address)) {
      throw new AdapterNotPartOfVaultError(this.vault, adapter);
    }
    if (!(soleAdapter instanceof AccrualVaultV2MorphoMarketV1AdapterV2)) {
      throw new UnsupportedInKindAdapterError(adapter);
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

  forceWithdraw({
    deallocations,
    withdraw,
    userAddress,
  }: {
    deallocations: readonly Deallocation[];
    withdraw: { amount: bigint };
    userAddress: Address;
  }) {
    if (this.client.viemClient.chain?.id !== this.chainId) {
      throw new ChainIdMismatchError(
        this.client.viemClient.chain?.id,
        this.chainId,
      );
    }

    return {
      buildTx: () =>
        vaultV2ForceWithdraw({
          vault: { address: this.vault },
          args: {
            deallocations,
            withdraw: {
              amount: withdraw.amount,
              recipient: userAddress,
            },
            onBehalf: userAddress,
          },
          metadata: this.client.options.metadata,
        }),
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
    if (this.client.viemClient.chain?.id !== this.chainId) {
      throw new ChainIdMismatchError(
        this.client.viemClient.chain?.id,
        this.chainId,
      );
    }

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
