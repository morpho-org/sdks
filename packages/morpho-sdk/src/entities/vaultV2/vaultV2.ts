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
  encodeErc20Approval,
  encodeVaultSharesPermit,
  getGeneralAdapterRequirements,
  vaultV2Deposit,
  vaultV2ForceRedeem,
  vaultV2ForceWithdraw,
  vaultV2InKindRedeem,
  vaultV2Redeem,
  vaultV2Withdraw,
} from "../../actions/index.js";
import {
  computeMinForceWithdrawSharePrice,
  computeVaultV2ForceWithdrawPlan,
  computeVaultV2ForceWithdrawSharesBurnt,
  resolveVaultV2ForceWithdrawEligibility,
  validateChainId,
  validateSlippageTolerance,
} from "../../helpers/index.js";
import {
  validateDeadline,
  validateReferralFee,
  validateUint256Field,
} from "../../helpers/validate.js";
import type { FetchParameters } from "../../types/data.js";
import {
  type ActionOutput,
  type ActionRequirement,
  AdapterNotPartOfVaultError,
  ChainIdMismatchError,
  ChainWNativeMissingError,
  type Deallocation,
  type DepositAmountArgs,
  EmptyMarketParamsListError,
  type ERC20ApprovalAction,
  ExpiredDeadlineError,
  InKindRedeemCoverageError,
  InKindRedeemZeroDeallocationError,
  InsufficientBlueBalanceForInKindRedeemError,
  type MorphoClientType,
  NativeAmountOnNonWNativeVaultError,
  NegativeInputError,
  NonPositiveInputError,
  type PermitRequirementSignature,
  type Requirement,
  type RequirementSignature,
  selectRequirementSignatures,
  type Transaction,
  VaultAddressMismatchError,
  type VaultV2DepositAction,
  type VaultV2ForceRedeemAction,
  type VaultV2ForceWithdrawAction,
  VaultV2ForceWithdrawCoverageError,
  VaultV2ForceWithdrawZeroWithdrawalError,
  type VaultV2InKindRedeemAction,
  type VaultV2RedeemAction,
  VaultV2SingleAdapterRequiredError,
  VaultV2UndecodableLiquidityDataError,
  VaultV2UnsupportedExitAdapterError,
  VaultV2UnsupportedLiquidityAdapterError,
  type VaultV2WithdrawAction,
} from "../../types/index.js";

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
   * Prepares a deposit transaction for the VaultV2 contract.
   *
   * This function constructs the transaction data required to deposit a specified amount of assets into the vault.
   * Uses pre-fetched vault data for accurate calculations of slippage and asset address,
   * then returns the prepared deposit transaction and a function for retrieving all required approval transactions.
   * Bundler Integration: This flow uses the bundler to atomically execute the user's asset transfer and vault deposit in a single transaction for slippage protection.
   *
   * @param {Object} params - The deposit parameters.
   * @param {bigint} [params.amount=0n] - Amount of ERC-20 assets to deposit. At least one of amount or nativeAmount must be provided.
   * @param {Address} params.userAddress - User address initiating the deposit.
   * @param {AccrualVaultV2} params.vaultData - Pre-fetched vault data with asset address and share conversion.
   * @param {bigint} [params.slippageTolerance=DEFAULT_SLIPPAGE_TOLERANCE] - Optional slippage tolerance value. Default is 0.03%. Slippage tolerance must be less than 10%.
   * @param {bigint} [params.nativeAmount] - Amount of native token to wrap into wNative. Vault asset must be wNative.
   * @returns {Object} The result object.
   * @returns {Readonly<Transaction<VaultV2DepositAction>>} returns.tx The prepared deposit transaction.
   * @returns {Promise<(Readonly<Transaction<ERC20ApprovalAction>> | Requirement<PermitRequirementSignature>)[]>} returns.getRequirements The function for retrieving all required approval transactions.
   */
  deposit: (
    params: {
      userAddress: Address;
      vaultData: AccrualVaultV2;
      slippageTolerance?: bigint;
    } & DepositAmountArgs,
  ) => {
    buildTx: (
      signatures?: readonly RequirementSignature[],
    ) => Readonly<Transaction<VaultV2DepositAction>>;
    getRequirements: (params?: {
      useSimplePermit?: boolean;
    }) => Promise<
      (
        | Readonly<Transaction<ERC20ApprovalAction>>
        | Requirement<PermitRequirementSignature>
      )[]
    >;
  };
  /**
   * Prepares a withdraw transaction for the VaultV2 contract.
   *
   * This function constructs the transaction data required to withdraw a specified amount of assets from the vault.
   *
   * @param {Object} params - The withdraw parameters.
   * @param {bigint} params.amount - The amount of assets to withdraw.
   * @param {Address} params.userAddress - User address initiating the withdraw.
   * @returns {Object} The result object.
   * @returns {Readonly<Transaction<VaultV2WithdrawAction>>} returns.tx The prepared withdraw transaction.
   */
  withdraw: (params: { amount: bigint; userAddress: Address }) => {
    buildTx: () => Readonly<Transaction<VaultV2WithdrawAction>>;
  };
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
   *
   * @param params - Force withdrawal parameters.
   * @param params.exitAssets - Penalty-inclusive, asset-denominated amount to exit.
   * @param params.vaultData - Pre-fetched Vault V2 accrual snapshot.
   * @param params.userAddress - Account that signs and submits the exit, and receives the assets.
   * @param params.adapter - Optional adapter override; defaults to the vault's sole adapter.
   * @param params.deadline - Optional shared permit/bundle deadline; defaults to two hours from now.
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
   *   below WAD.
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
   * @throws {MissingReferralFeeRecipientError} when a positive `referralFeePct` has no recipient.
   * @throws {UnsupportedChainIdError} when no address registry exists for the target chain.
   * @throws {UnknownAddressError} when VaultExitBundlesV1 is not registered on the target chain.
   * @throws {viem.BaseError} from `getRequirements()` when an RPC or multicall contract read fails.
   * @throws {AmbiguousRequirementSignaturesError} from `buildTx()` when more than one permit signature is supplied.
   * @throws {UnexpectedRequirementSignatureError} from `buildTx()` when a non-permit signature is supplied.
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

  deposit({
    amount = 0n,
    userAddress,
    vaultData,
    slippageTolerance = DEFAULT_SLIPPAGE_TOLERANCE,
    nativeAmount,
  }: {
    userAddress: Address;
    vaultData: AccrualVaultV2;
    slippageTolerance?: bigint;
  } & DepositAmountArgs) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);

    if (!isAddressEqual(vaultData.address, this.vault)) {
      throw new VaultAddressMismatchError(this.vault, vaultData.address);
    }

    if (amount < 0n) {
      throw new NegativeInputError("amount", amount);
    }

    if (nativeAmount && nativeAmount < 0n) {
      throw new NegativeInputError("nativeAmount", nativeAmount);
    }

    let wNative: Address | undefined;
    if (nativeAmount) {
      ({ wNative } = getChainAddresses(this.chainId));
      if (!wNative) {
        throw new ChainWNativeMissingError(this.chainId);
      }
    }

    validateSlippageTolerance(slippageTolerance);

    if (nativeAmount && wNative) {
      if (!isAddressEqual(vaultData.asset, wNative)) {
        throw new NativeAmountOnNonWNativeVaultError(vaultData.asset, wNative);
      }
    }

    const totalAssets = amount + (nativeAmount ?? 0n);
    if (totalAssets === 0n) {
      throw new NonPositiveInputError("totalAssets", totalAssets);
    }

    // Accrue interest forward to bound the on-chain share price at execution.
    // Mirrors blue repay's 2h forward-accrual buffer.
    const accrualTimestamp =
      MathLib.max(Time.timestamp(), vaultData.lastUpdate) + Time.s.from.h(2n);
    const { vault: accruedVault } = vaultData.accrueInterest(accrualTimestamp);

    const shares = accruedVault.toShares(totalAssets);
    if (shares <= 0n) {
      throw new NonPositiveInputError("shares", shares);
    }

    const maxSharePrice = MathLib.min(
      MathLib.mulDivUp(
        totalAssets,
        MathLib.wToRay(MathLib.WAD + slippageTolerance),
        shares,
      ),
      MathLib.RAY * 100n,
    );
    return {
      getRequirements: (params?: { useSimplePermit?: boolean }) =>
        getGeneralAdapterRequirements(this.client.viemClient, {
          address: vaultData.asset,
          chainId: this.chainId,
          supportSignature: this.client.options.supportSignature,
          supportDeployless: this.client.options.supportDeployless,
          useSimplePermit: params?.useSimplePermit,
          args: {
            amount,
            from: userAddress,
          },
        }),

      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const { permit } = selectRequirementSignatures(signatures, {
          permit: true,
        });

        return vaultV2Deposit({
          vault: {
            chainId: this.chainId,
            address: this.vault,
            asset: vaultData.asset,
          },
          args: {
            amount,
            maxSharePrice,
            recipient: userAddress,
            requirementSignature: permit,
            nativeAmount,
          },
          metadata: this.client.options.metadata,
        });
      },
    };
  }

  withdraw({ amount, userAddress }: { amount: bigint; userAddress: Address }) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);

    return {
      buildTx: () =>
        vaultV2Withdraw({
          vault: { address: this.vault },
          args: {
            amount,
            recipient: userAddress,
            onBehalf: userAddress,
          },
          metadata: this.client.options.metadata,
        }),
    };
  }

  redeem({ shares, userAddress }: { shares: bigint; userAddress: Address }) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);

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

    // The price floor's denominator takes the `now`-accrued burn: it must track execution-time
    // state, not the possibly stale snapshot (the first on-chain withdrawal accrues pending
    // management fees before burning shares, which would otherwise lift the floor above the faithful
    // price and trip `SlippageExceeded`). Accrue to `now`, not the caller-chosen `deadline`, so a
    // long deadline cannot weaken the guard; `slippageTolerance` absorbs the residual drift.
    const { vault: nowVaultData } = vaultData.accrueInterest(
      MathLib.max(now, vaultData.lastUpdate),
    );
    const sharesBurntNow = computeVaultV2ForceWithdrawSharesBurnt({
      vaultData: nowVaultData,
      deadlineVaultData: nowVaultData,
      plan,
    });
    const minSharePriceE27 =
      minSharePriceE27Override ??
      computeMinForceWithdrawSharePrice({
        withdrawnAssets: plan.withdrawnAssets,
        sharesBurnt: sharesBurntNow,
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
    // Size the allowance to the price floor, not to the snapshot burn. The on-chain check accepts
    // any exit whose realized price stays at or above `minSharePriceE27`, so it can burn up to
    // `mulDivUp(exitAssets, RAY, minSharePriceE27)` shares — `withdrawn <= exitAssets` and
    // `withdrawn / burnt >= minSharePriceE27`. A snapshot-tight approval would instead revert on
    // allowance for exactly the within-tolerance price drop the floor is meant to permit (clearest
    // on a no-fee vault, where every accrual endpoint collapses to the snapshot burn), nullifying
    // `slippageTolerance`. This ceiling covers every accepted burn, including fee-share accrual.
    // Saturated at `maxUint256`: a tiny accepted floor scales this above the ABI slot, and the
    // approval encoder clamps what it emits — so an uncapped requirement would sit permanently above
    // any allowance the user can actually grant and `getRequirements()` would return the same
    // approval forever. No account can hold or burn more shares than that anyway.
    const requiredShareAllowance = MathLib.min(
      MathLib.mulDivUp(exitAssets, MathLib.RAY, minSharePriceE27),
      maxUint256,
    );

    const vaultExitBundlesV1 = getChainAddress(
      this.chainId,
      "bundles.vaultExitBundlesV1",
    );

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
